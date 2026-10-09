"""
Lokal STT model sinovi.

Ishlatish:
    python tools/gigaam-local.py audio.wav --engine gigaam --out transkript.txt

Kerakli paketlar:
    pip install -r tools/requirements-gigaam.txt
"""

import argparse
import os
import subprocess
import shutil
import sys
import tempfile
import time
import wave
from pathlib import Path


def load_backend_env() -> None:
    env_path = Path(__file__).resolve().parents[1] / "backend" / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg"):
        return
    try:
        import imageio_ffmpeg
    except ImportError:
        return

    source = Path(imageio_ffmpeg.get_ffmpeg_exe())
    target_dir = Path(tempfile.gettempdir()) / "sotuv-gigaam-ffmpeg"
    target_dir.mkdir(exist_ok=True)
    target = target_dir / "ffmpeg.exe"
    if not target.exists():
        shutil.copyfile(source, target)
    os.environ["PATH"] = f"{target_dir}{os.pathsep}{os.environ.get('PATH', '')}"


def format_time(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    return f"{total // 60:02d}:{total % 60:02d}"


def to_wav_16k_mono(audio_path: Path) -> Path:
    """GigaAM ichki loaderi ham ffmpeg ishlatadi, lekin longform uchun WAV aniqroq."""
    if audio_path.suffix.lower() == ".wav":
        return audio_path

    wav_path = Path(tempfile.mkdtemp(prefix="gigaam-input-")) / f"{audio_path.stem}.wav"
    cmd = [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-i",
        str(audio_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-sample_fmt",
        "s16",
        str(wav_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return wav_path


def cyrillic_to_latin(text: str) -> str:
    pairs = {
        "ё": "yo",
        "ю": "yu",
        "я": "ya",
        "ў": "o'",
        "ғ": "g'",
        "қ": "q",
        "ҳ": "h",
        "ш": "sh",
        "ч": "ch",
        "нг": "ng",
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "g",
        "д": "d",
        "е": "e",
        "ж": "j",
        "з": "z",
        "и": "i",
        "й": "y",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "х": "x",
        "ц": "s",
        "ъ": "",
        "ь": "",
        "э": "e",
        "ы": "i",
    }
    out = text.lower()
    for src, dst in pairs.items():
        out = out.replace(src, dst)
    return out


def transcribe_chunks(model, wav_path: Path, chunk_seconds: int, words: bool) -> list[str]:
    wav = wave.open(str(wav_path), "rb")
    sample_rate = wav.getframerate()
    chunk_frames = chunk_seconds * sample_rate
    params = wav.getparams()

    tmpdir = Path(tempfile.mkdtemp(prefix="gigaam-chunks-"))
    chunks: list[tuple[float, Path]] = []
    index = 0
    while True:
        frames = wav.readframes(chunk_frames)
        if not frames:
            break
        chunk_path = tmpdir / f"chunk_{index}.wav"
        with wave.open(str(chunk_path), "wb") as chunk:
            chunk.setparams(params)
            chunk.writeframes(frames)
        chunks.append((index * float(chunk_seconds), chunk_path))
        index += 1

    lines: list[str] = []
    for offset, chunk_path in chunks:
        t0 = time.time()
        result = model.transcribe(str(chunk_path), word_timestamps=True)
        print(f"{format_time(offset)} bo'lagi tayyor: {time.time() - t0:.1f}s", file=sys.stderr)
        lines.append(f"[{format_time(offset)}] {result.text}")
        if words:
            for word in result.words:
                lines.append(f"  {offset + word.start:7.2f}-{offset + word.end:7.2f} {word.text}")
    return lines


def gpu_ga_otkaz(model):
    """GPU bo'lsa modelni unga o'tkazadi — `from_pretrained` uni CPU'da yuklaydi.

    `STT_DEVICE=cpu` majburan CPU qoldiradi. O'tkazishda xato bo'lsa (masalan
    xotira yetmasa) CPU'da davom etadi: sekinroq, lekin qo'ng'iroq yo'qolmaydi.
    """
    import torch

    if os.getenv("STT_DEVICE", "auto").lower() == "cpu" or not torch.cuda.is_available():
        print("Qurilma: CPU", file=sys.stderr)
        return model
    try:
        model = model.to("cuda")
        print(f"Qurilma: {torch.cuda.get_device_name(0)}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001 — har qanday GPU xatosida CPU zaxira
        print(f"GPU'ga o'tkazib bo'lmadi ({exc}) — CPU'da davom etiladi", file=sys.stderr)
        model = model.to("cpu")
    return model


def transcribe_longform(model, wav_path: Path, words: bool) -> list[str]:
    patch_pyannote_file_loader(model)
    t0 = time.time()
    result = model.transcribe_longform(str(wav_path), word_timestamps=words)
    print(f"Longform tayyor: {time.time() - t0:.1f}s", file=sys.stderr)

    lines: list[str] = []
    for segment in result.segments:
        lines.append(f"[{format_time(segment.start)}] {segment.text}")
        if words:
            for word in segment.words or []:
                lines.append(f"  {word.start:7.2f}-{word.end:7.2f} {word.text}")
    return lines


def patch_pyannote_file_loader(model) -> None:
    """Avoid pyannote's Windows torchcodec file reader by passing waveform data."""
    import sys
    import torch

    module = sys.modules.get(model.model.__class__.__module__)
    if module is None or getattr(module, "_SOTUV_WAVEFORM_PATCHED", False):
        return

    def segment_audio_file(
        wav_file: str,
        sr: int,
        max_duration: float = 22.0,
        min_duration: float = 15.0,
        strict_limit_duration: float = 30.0,
        new_chunk_threshold: float = 0.2,
        device: torch.device = torch.device("cpu"),
    ):
        audio = module.load_audio(wav_file)
        pipeline = module.get_pipeline(device)
        sad_segments = pipeline({"waveform": audio.unsqueeze(0), "sample_rate": sr})

        segments = []
        curr_duration = 0.0
        curr_start = 0.0
        curr_end = 0.0
        boundaries = []

        def update_segments(start: float, end: float, duration: float) -> None:
            if duration > strict_limit_duration:
                max_segments = int(duration / strict_limit_duration) + 1
                segment_duration = duration / max_segments
                end = start + segment_duration
                for _ in range(max_segments - 1):
                    segments.append(audio[int(start * sr) : int(end * sr)])
                    boundaries.append((start, end))
                    start = end
                    end += segment_duration
            segments.append(audio[int(start * sr) : int(end * sr)])
            boundaries.append((start, end))

        for segment in sad_segments.get_timeline().support():
            start = max(0, segment.start)
            end = min(audio.shape[0] / sr, segment.end)
            if curr_duration == 0.0:
                curr_start = start
            elif curr_duration > new_chunk_threshold and (
                curr_duration + (end - curr_end) > max_duration
                or curr_duration > min_duration
            ):
                update_segments(curr_start, curr_end, curr_duration)
                curr_start = start
            curr_end = end
            curr_duration = curr_end - curr_start

        if curr_duration > new_chunk_threshold:
            update_segments(curr_start, curr_end, curr_duration)

        return segments, boundaries

    module.segment_audio_file = segment_audio_file
    module._SOTUV_WAVEFORM_PATCHED = True


def read_wav_array(wav_path: Path) -> tuple["np.ndarray", int]:
    import numpy as np

    with wave.open(str(wav_path), "rb") as wav:
        sample_rate = wav.getframerate()
        sample_width = wav.getsampwidth()
        channels = wav.getnchannels()
        frames = wav.readframes(wav.getnframes())

    if sample_width != 2:
        raise RuntimeError(f"Kotib uchun 16-bit WAV kerak, lekin sample width={sample_width}")

    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, sample_rate


def transcribe_hf_pipeline(model_id: str, wav_path: Path, chunk_seconds: int = 25) -> list[str]:
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

    audio, sample_rate = read_wav_array(wav_path)
    processor = AutoProcessor.from_pretrained(model_id)
    model = AutoModelForSpeechSeq2Seq.from_pretrained(model_id)
    model.eval()

    chunk_size = chunk_seconds * sample_rate
    lines: list[str] = []
    for index, start in enumerate(range(0, len(audio), chunk_size)):
        chunk = audio[start : start + chunk_size]
        if len(chunk) < sample_rate:
            continue
        offset = index * float(chunk_seconds)
        inputs = processor(chunk, sampling_rate=sample_rate, return_tensors="pt")
        with torch.inference_mode():
            generated_ids = model.generate(inputs.input_features)
        text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        if text.strip():
            lines.append(f"[{format_time(offset)}] {text.strip()}")
    return lines


def transcribe_qwen(wav_path: Path) -> list[str]:
    try:
        import torch
        from qwen_asr import Qwen3ASRModel
    except ImportError as exc:
        raise RuntimeError(
            "Qwen3-ASR uchun `pip install -U qwen-asr` kerak. "
            "Bu model og'ir va odatda CUDA/GPU bilan ishlatiladi."
        ) from exc

    model = Qwen3ASRModel.from_pretrained(
        "Gearnode/qwen3-asr-uzbek",
        dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        max_new_tokens=448,
    )
    result = model.transcribe(audio=[str(wav_path)], language=["Uzbek"])
    return [f"[00:00] {result[0].text}"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Audio faylni tanlangan lokal STT model bilan transkript qiladi")
    parser.add_argument("audio", help="Audio fayl yo'li")
    parser.add_argument("--out", help="Natijani faylga yozish")
    parser.add_argument(
        "--engine",
        choices=["gigaam", "kotib", "qwen3-uzbek"],
        default=os.getenv("STT_MODEL", "gigaam"),
    )
    parser.add_argument("--chunk-seconds", type=int, default=15)
    parser.add_argument("--mode", choices=["longform", "chunks"], default="longform")
    parser.add_argument("--latin", action="store_true", help="Kirill natijani lotinga oddiy transliteratsiya qiladi")
    parser.add_argument("--words", action="store_true", help="So'z vaqtlarini ham chiqarish")
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.exists():
      print(f"Fayl topilmadi: {audio_path}", file=sys.stderr)
      return 1

    load_backend_env()
    ensure_ffmpeg()
    wav_path = to_wav_16k_mono(audio_path)

    print(f"STT model yuklanmoqda: {args.engine}", file=sys.stderr)
    started = time.time()
    if args.engine == "gigaam":
        from transformers import AutoModel

        model = AutoModel.from_pretrained(
            "ai-sage/GigaAM-Multilingual",
            revision="large_ctc",
            trust_remote_code=True,
        )
        model = gpu_ga_otkaz(model)
        print(f"Model tayyor: {time.time() - started:.1f}s", file=sys.stderr)
        if args.mode == "longform":
            try:
                lines = transcribe_longform(model, wav_path, args.words)
            except Exception as exc:
                print(f"Longform xatosi: {exc}", file=sys.stderr)
                print("Fallback: oddiy bo'laklash rejimi ishlatiladi.", file=sys.stderr)
                lines = transcribe_chunks(model, wav_path, args.chunk_seconds, args.words)
        else:
            lines = transcribe_chunks(model, wav_path, args.chunk_seconds, args.words)
    elif args.engine == "kotib":
        lines = transcribe_hf_pipeline("Kotib/uzbek_stt_v1", wav_path, args.chunk_seconds)
    else:
        lines = transcribe_qwen(wav_path)

    output = "\n".join(lines)
    if args.latin:
        output = cyrillic_to_latin(output)
    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
        print(f"Yozildi: {args.out}", file=sys.stderr)
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
