export type SttModelKey = 'gigaam' | 'kotib' | 'qwen3-uzbek';

export const STT_MODEL_STORAGE_KEY = 'sotuvai-stt-model';

export const STT_MODELLAR: { key: SttModelKey; name: string; note: string }[] = [
  {
    key: 'gigaam',
    name: 'GigaAM Multilingual large_ctc',
    note: 'Hozirgi eng tez lokal variant; longform uchun pyannote access kerak.',
  },
  {
    key: 'kotib',
    name: 'Kotib Uzbek STT v1',
    note: 'Uzbek Whisper fine-tune; birinchi ishga tushishda model yuklanadi.',
  },
  {
    key: 'qwen3-uzbek',
    name: 'Qwen3-ASR Uzbek',
    note: 'Gearnode/qwen3-asr-uzbek; og‘ir model, odatda GPU va qwen-asr paketi kerak.',
  },
];

export function getSttModel(): SttModelKey {
  const v = localStorage.getItem(STT_MODEL_STORAGE_KEY);
  return STT_MODELLAR.some((m) => m.key === v) ? (v as SttModelKey) : 'gigaam';
}

export function setSttModel(v: SttModelKey): void {
  localStorage.setItem(STT_MODEL_STORAGE_KEY, v);
  window.dispatchEvent(new CustomEvent('sotuvai-stt-model-change', { detail: v }));
}
