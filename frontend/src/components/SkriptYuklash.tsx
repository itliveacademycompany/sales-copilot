import { FileText, Upload, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { api, ApiError, type PlaybookBody } from '../api';
import { tarjima, useT } from '../i18n';
import {
  SKRIPT_ACCEPT,
  SKRIPT_MAX,
  SKRIPT_MIN,
  SkriptFaylXato,
  skriptFaylniOqi,
  skriptniTozala,
} from './skriptFayl';

/**
 * Onboarding 2-qadam: AI qoralamasi yoqmasa, kompaniya o'z sotuv skriptini
 * beradi (fayl yoki matn) → AI uni baholash mezonlariga aylantiradi →
 * natija xuddi AI qoralamasi kabi formada ko'rib chiqiladi va qabul qilinadi.
 *
 * Hech narsa saqlanmaydi: server faqat qoralama qaytaradi. Xato bo'lsa
 * kiritilgan matn ham, oldingi qoralama ham joyida qoladi.
 */
export function SkriptYuklash({
  base,
  onTayyor,
  onYop,
}: {
  base: string;
  onTayyor: (draft: PlaybookBody, nom: string | null) => void;
  onYop: () => void;
}) {
  const t = useT();
  const id = useId();
  const faylRef = useRef<HTMLInputElement>(null);
  const [matn, setMatn] = useState('');
  const [faylNomi, setFaylNomi] = useState<string | null>(null);
  const [oqilmoqda, setOqilmoqda] = useState(false);
  const [ishlanmoqda, setIshlanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [ustida, setUstida] = useState(false);

  const toza = skriptniTozala(matn);
  const uzunlik = toza.length;
  const yaroqli = uzunlik >= SKRIPT_MIN && uzunlik <= SKRIPT_MAX;
  const band = oqilmoqda || ishlanmoqda;

  async function faylTanlandi(fayl: File | undefined) {
    if (!fayl) return;
    setXato('');
    setOqilmoqda(true);
    try {
      const oqildi = await skriptFaylniOqi(fayl);
      setMatn(oqildi);
      setFaylNomi(fayl.name);
    } catch (e) {
      setXato(e instanceof SkriptFaylXato ? t(e.message) : t("Faylni o'qib bo'lmadi."));
    } finally {
      setOqilmoqda(false);
      // Xuddi shu faylni qayta tanlash ham `change` hodisasini bersin
      if (faylRef.current) faylRef.current.value = '';
    }
  }

  async function yubor() {
    if (!yaroqli || band) return;
    setXato('');
    setIshlanmoqda(true);
    try {
      const res = await api.post<{ draft: PlaybookBody }>(`${base}/playbook/from-script`, { skript: toza });
      onTayyor(res.draft, faylNomi);
    } catch (e) {
      setXato(e instanceof ApiError ? tarjima(e.message) : t("Skriptni qayta ishlab bo'lmadi. Qayta urinib ko'ring."));
    } finally {
      setIshlanmoqda(false);
    }
  }

  return (
    <section className="card skript-panel" aria-labelledby={`${id}-sar`} style={{ marginBottom: 14 }}>
      <div className="skript-bosh">
        <div>
          <h3 id={`${id}-sar`}>{t("O'z sotuv skriptingizni yuklang")}</h3>
          <p className="yordam">
            {t(
              "AI skriptingiz bosqichlarini baholash mezonlariga aylantiradi — keyin har bir suhbat aynan shu skript bo'yicha baholanadi. Natijani qabul qilishdan oldin ko'rib chiqasiz.",
            )}
          </p>
        </div>
        <button type="button" className="bm-yop" onClick={onYop} disabled={ishlanmoqda} aria-label={t('Yopish')}>
          <X size={18} />
        </button>
      </div>

      <div
        className={`skript-zona${ustida ? ' ustida' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!band) setUstida(true);
        }}
        onDragLeave={() => setUstida(false)}
        onDrop={(e) => {
          e.preventDefault();
          setUstida(false);
          if (!band) void faylTanlandi(e.dataTransfer.files?.[0]);
        }}
      >
        <FileText aria-hidden="true" />
        <div className="skript-zona-matn">
          {faylNomi ? (
            <b>{faylNomi}</b>
          ) : (
            <b>{t('Faylni shu yerga tashlang yoki tanlang')}</b>
          )}
          <span>{t('Word (.docx), .txt yoki .md — 5 MB gacha')}</span>
        </div>
        <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => faylRef.current?.click()}>
          <Upload size={16} /> {oqilmoqda ? t("O'qilmoqda…") : faylNomi ? t('Boshqa fayl') : t('Fayl tanlash')}
        </button>
        <input
          ref={faylRef}
          id={`${id}-fayl`}
          type="file"
          accept={SKRIPT_ACCEPT}
          hidden
          onChange={(e) => void faylTanlandi(e.target.files?.[0])}
        />
      </div>

      <label htmlFor={`${id}-matn`} className="skript-yorliq">
        {t("Yoki skript matnini shu yerga qo'ying")}
      </label>
      <textarea
        id={`${id}-matn`}
        rows={9}
        value={matn}
        disabled={ishlanmoqda}
        placeholder={t("Masalan: 1. Salomlashing, o'zingizni va kompaniyani tanishtiring. 2. Mijozning ehtiyojini aniqlang…")}
        onChange={(e) => {
          setMatn(e.target.value);
          setXato('');
        }}
      />
      <div className={`skript-hisob${uzunlik > SKRIPT_MAX ? ' xato' : ''}`} aria-live="polite">
        {uzunlik > 0 && uzunlik < SKRIPT_MIN
          ? t('Kamida {n} belgi kerak', { n: SKRIPT_MIN })
          : uzunlik > SKRIPT_MAX
            ? t('Juda uzun — {n} belgigacha', { n: SKRIPT_MAX.toLocaleString() })
            : t('{n} belgi', { n: uzunlik.toLocaleString() })}
      </div>

      {xato && (
        <div className="xato-banner" role="alert" style={{ marginTop: 12 }}>
          {xato}
        </div>
      )}

      <div className="skript-tugmalar">
        <button type="button" className="btn ikkinchi" onClick={onYop} disabled={ishlanmoqda}>
          {t('Bekor qilish')}
        </button>
        <button type="button" className="btn" disabled={!yaroqli || band} onClick={() => void yubor()}>
          {ishlanmoqda ? t('AI skriptni tahlil qilmoqda… 20-40 soniya') : t('Skript asosida mezonlar tuzish')}
        </button>
      </div>
    </section>
  );
}
