"""
═══════════════════════════════════════════════════════════════════════════
LOKAL NUTQNI MATNGA AYLANTIRISH — kalitsiz, kartasiz, internetsiz
═══════════════════════════════════════════════════════════════════════════

Audio faylni transkriptga aylantirib, platformaning "Suhbat yuklash"
oynasiga tayyor shaklda chiqaradi.

Nega lokal:
  • Google Cloud bepul tarif uchun ham karta so'raydi
  • Ma'lumot kompyuterdan chiqmaydi — TZ dagi "Ma'lumot O'zbekistonda"
    ustunligiga to'g'ri keladi
  • Bir marta o'rnatiladi, keyin cheksiz ishlatiladi

O'RNATISH (bir marta):
    pip install faster-whisper

ISHLATISH:
    npm run stt:local -- "C:\\yozuvlar\\qongiroq.mp3"
    npm run stt:local -- qongiroq.mp3 --model medium
    npm run stt:local -- qongiroq.mp3 --out transkript.txt

Model tanlash (birinchi ishlatishda avtomatik yuklanadi):
    tiny    ~75 MB    eng tez, sifati past
    base    ~145 MB   sinov uchun yetarli
    small   ~490 MB   STANDART — sifat/tezlik muvozanati
    medium  ~1.5 GB   sezilarli yaxshiroq, sekinroq
    large-v3 ~3 GB    eng yaxshi, kuchli kompyuter kerak

⚠️ SO'ZLOVCHILARNI AJRATISH — TAXMIN
Whisper "kim gapirdi" degan savolga javob bermaydi. Bu skript
SO'ZLAR ORASIDAGI jimlik bo'yicha taxmin qiladi: uzoq pauzadan
keyin so'zlovchi almashgan deb hisoblaydi.

Nega aynan so'zlar orasidagi: Whisper segmentlari uzluksiz — har
birining boshi oldingisining oxiriga teng, ya'ni segment darajasida
pauza umuman ko'rinmaydi. Faqat so'z vaqtlari haqiqiy jimlikni
ko'rsatadi (o'lchovda: gap ichidagi pauza 0.4-1.0s, so'zlovchi
almashuvi 1.8-2.3s).

Bu baribir TAXMIN. Natijani yuklashdan oldin O'QIB CHIQING va kerak
bo'lsa "Mijoz:" / "Menejer:" yorliqlarini to'g'irlang. Rol noto'g'ri
bo'lsa butun tahlil teskari chiqadi (TZ FR-84).
"""

import argparse
import sys
from pathlib import Path

# So'zlar orasidagi shu qiymatdan uzun jimlik — so'zlovchi almashuvi.
# 1.5s o'lchovga asoslangan: bir odam gap ichida 0.4-1.0s to'xtaydi,
# navbat almashganda esa 1.8s dan oshadi.
SPEAKER_GAP_SECONDS = 1.5


def format_time(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    return f"{total // 60:02d}:{total % 60:02d}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audio faylni suhbat transkriptiga aylantiradi",
    )
    parser.add_argument("audio", help="Audio fayl yo'li (mp3, wav, ogg, m4a...)")
    parser.add_argument("--model", default="small", help="Model nomi (standart: small)")
    parser.add_argument("--language", default="uz", help="Til kodi (standart: uz)")
    parser.add_argument("--out", help="Natijani faylga yozish")
    parser.add_argument(
        "--first",
        choices=["mijoz", "menejer"],
        default="mijoz",
        help="Birinchi gapirgan kim (standart: mijoz — odatda u murojaat qiladi)",
    )
    parser.add_argument(
        "--gap",
        type=float,
        default=SPEAKER_GAP_SECONDS,
        help=f"So'zlovchi almashuvi uchun pauza, soniya (standart: {SPEAKER_GAP_SECONDS})",
    )
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.exists():
        print(f"Fayl topilmadi: {audio_path}", file=sys.stderr)
        return 1

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper o'rnatilmagan.\n\n"
            "  pip install faster-whisper\n\n"
            "Birinchi ishga tushirishda model ham yuklanadi (small ~490 MB).",
            file=sys.stderr,
        )
        return 1

    print(f"Model yuklanmoqda: {args.model} …", file=sys.stderr)
    # int8 — CPU'da sezilarli tez va sifatga deyarli ta'sir qilmaydi.
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    print(f"Tahlil qilinmoqda: {audio_path.name} …", file=sys.stderr)
    segments, info = model.transcribe(
        str(audio_path),
        language=args.language,
        # So'z vaqtlari SHART: navbat almashuvi faqat shular orqali
        # ko'rinadi (yuqoridagi izohga qarang).
        word_timestamps=True,
    )

    print(
        f"Til: {info.language} (ishonch {info.language_probability:.0%}), "
        f"davomiylik: {format_time(info.duration)}",
        file=sys.stderr,
    )

    words = [w for seg in segments for w in (seg.words or []) if w.word.strip()]
    if not words:
        print(
            "\nNutq aniqlanmadi. Sabablari: fayl bo'sh, juda shovqinli, "
            "yoki til noto'g'ri (--language bilan o'zgartiring).",
            file=sys.stderr,
        )
        return 1

    roles = ("Mijoz", "Menejer")
    current = 0 if args.first == "mijoz" else 1

    lines: list[str] = []
    bolaklar: list[str] = []
    boshlanish = words[0].start
    previous_end: float | None = None
    almashuvlar = 0
    eng_uzun_pauza = 0.0

    def yakunla() -> None:
        if bolaklar:
            # Whisper `word` maydonida bo'shliqni O'ZI beradi (" Hello,",
            # "-month"). Shuning uchun bo'shliq bilan birlashtirilmaydi —
            # aks holda "six -month" va "1 ,200" chiqadi.
            matn = "".join(bolaklar).strip()
            lines.append(f"[{format_time(boshlanish)}] {roles[current]}: {matn}")
            print(lines[-1], file=sys.stderr)

    for w in words:
        pauza = 0.0 if previous_end is None else w.start - previous_end
        eng_uzun_pauza = max(eng_uzun_pauza, pauza)

        if pauza >= args.gap:
            yakunla()
            bolaklar = []
            boshlanish = w.start
            current = 1 - current
            almashuvlar += 1

        bolaklar.append(w.word)
        previous_end = w.end

    yakunla()

    result = "\n".join(lines)

    if args.out:
        Path(args.out).write_text(result, encoding="utf-8")
        print(f"\nYozildi: {args.out}", file=sys.stderr)
    else:
        # stdout — faqat transkript, ya'ni quvurga uzatsa bo'ladi.
        print(result)

    print(
        f"\n─────────────────────────────────────────────\n"
        f"{len(lines)} qator, {almashuvlar} ta so'zlovchi almashuvi taxmin qilindi.\n"
        f"Eng uzun pauza: {eng_uzun_pauza:.1f}s (joriy chegara: {args.gap}s)\n"
        f"\n"
        f"⚠️  Yuklashdan OLDIN rollarni tekshiring — bu taxmin, kafolat emas.\n"
        f"    Almashuv juda KO'P bo'lsa  → --gap {args.gap + 0.5:.1f}\n"
        f"    Almashuv juda KAM bo'lsa   → --gap {max(0.3, args.gap - 0.5):.1f}\n"
        f"    Birinchi gapirgan menejer  → --first menejer\n",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
