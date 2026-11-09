import { MicOff, PhoneOff, Send, Target } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../../api';
import { boshHarf, mmss, YAKUN_SEK, type Mashq, type MatnQator } from '../../crm/simulyator';
import { tarjima, useT } from '../../i18n';

/** Ulanish animatsiyasi — telefon "jiringlaydi", keyin mijoz ko'taradi. */
const ULANISH_MS = 1800;

/**
 * Mashq qo'ng'irog'i ekrani (to'liq ekran).
 *
 * Hozir yozma rejim: menejer yozadi, AI mijoz javob beradi. Ovozli rejim
 * ulanganda faqat kiritish/chiqarish o'zgaradi (nutq → matn → shu `javob`
 * so'rovi → ovoz) — taymer, matn va yakunlash mantiqi shu yerda qoladi.
 */
export function QongiroqEkran({
  base,
  mashq,
  onTugadi,
}: {
  base: string;
  mashq: Mashq;
  /** id — natija sahifasiga; null — qo'ng'iroq bekor qilindi. */
  onTugadi: (id: string | null) => void;
}) {
  const t = useT();
  const s = mashq.ssenariy;
  const jami = s.davomiylikDaq * 60;
  const [bosqich, setBosqich] = useState<'ulanmoqda' | 'suhbat' | 'yopilmoqda'>('ulanmoqda');
  const [matn, setMatn] = useState<MatnQator[]>([]);
  const [yozuv, setYozuv] = useState('');
  const [kutish, setKutish] = useState(false);
  const [xato, setXato] = useState('');
  const [mijozTugatdi, setMijozTugatdi] = useState(false);
  const [sek, setSek] = useState(0);
  const boshlanish = useRef<number>(0);
  const yopildi = useRef(false);
  const royxatRef = useRef<HTMLOListElement>(null);
  const kiritishRef = useRef<HTMLTextAreaElement>(null);

  const yakunla = useCallback(
    async (bekor = false) => {
      if (yopildi.current) return;
      yopildi.current = true;
      setBosqich('yopilmoqda');
      try {
        await api.post(`${base}/simulyator/mashqlar/${mashq.id}/tugat`, { bekor });
      } catch {
        // Tarmoq xatosi bo'lsa ham foydalanuvchi ekranda qolib ketmasin —
        // natija sahifasi mashq holatini qayta o'qiydi.
      }
      onTugadi(bekor ? null : mashq.id);
    },
    [base, mashq.id, onTugadi],
  );

  // Ulanish → suhbat: mijozning birinchi gapi (serverda yozilgan salom)
  useEffect(() => {
    const id = window.setTimeout(() => {
      boshlanish.current = Date.now();
      setMatn(mashq.matn);
      setBosqich('suhbat');
    }, ULANISH_MS);
    return () => window.clearTimeout(id);
  }, [mashq.matn]);

  // Taymer va vaqt tugashi
  useEffect(() => {
    if (bosqich !== 'suhbat') return;
    const id = window.setInterval(() => {
      const o = Math.floor((Date.now() - boshlanish.current) / 1000);
      setSek(o);
      if (o >= jami) void yakunla();
    }, 250);
    return () => window.clearInterval(id);
  }, [bosqich, jami, yakunla]);

  // Qo'ng'iroq paytida sahifani tasodifan yopishdan ogohlantirish
  useEffect(() => {
    const ogoh = (e: BeforeUnloadEvent) => {
      if (!yopildi.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', ogoh);
    return () => window.removeEventListener('beforeunload', ogoh);
  }, []);

  useEffect(() => {
    royxatRef.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [matn, kutish]);

  useEffect(() => {
    if (bosqich === 'suhbat') kiritishRef.current?.focus();
  }, [bosqich]);

  async function yubor() {
    const gap = yozuv.trim();
    if (!gap || kutish || bosqich !== 'suhbat' || mijozTugatdi) return;
    setXato('');
    setYozuv('');
    setKutish(true);
    const vaqt = Math.floor((Date.now() - boshlanish.current) / 1000);
    setMatn((m) => [...m, { kim: 'menejer', matn: gap, sek: vaqt }]);
    try {
      const r = await api.post<{ mijoz: MatnQator; tugatish: boolean }>(`${base}/simulyator/mashqlar/${mashq.id}/javob`, { matn: gap });
      if (yopildi.current) return;
      setMatn((m) => [...m, { ...r.mijoz, sek: Math.floor((Date.now() - boshlanish.current) / 1000) }]);
      if (r.tugatish) {
        setMijozTugatdi(true);
        window.setTimeout(() => void yakunla(), 2200);
      }
    } catch (e) {
      // Server menejer gapini qaytarib oldi — ekranda ham olib tashlaymiz, matn kiritishga qaytadi
      setMatn((m) => (m[m.length - 1]?.kim === 'menejer' && m[m.length - 1]?.matn === gap ? m.slice(0, -1) : m));
      setYozuv(gap);
      setXato(e instanceof ApiError ? tarjima(e.message) : t('Mijoz javob bera olmadi — gapingizni qayta yuboring'));
    } finally {
      setKutish(false);
      kiritishRef.current?.focus();
    }
  }

  const qolgan = Math.max(0, jami - sek);
  const foiz = Math.min(100, (sek / jami) * 100);
  const yakunFoiz = ((jami - YAKUN_SEK) / jami) * 100;
  const yakunlanmoqda = bosqich === 'suhbat' && qolgan <= YAKUN_SEK;

  return createPortal(
    <div className="sim-qongiroq" role="dialog" aria-modal="true" aria-label={t("Mashq qo'ng'irog'i: {ism}", { ism: s.mijozIsmi })}>
      <div className="sim-q-ogoh">
        {t('{ism} — AI mijoz, haqiqiy odam emas. Mashq tarixingizni faqat siz ko\'rasiz.', { ism: s.mijozIsmi })}
      </div>

      <div className="sim-q-tana">
        <section className="sim-q-chap">
          <div className="sim-q-maqsad">
            <Target size={15} aria-hidden="true" />
            <span>{s.maqsad}</span>
          </div>

          <div className={`sim-q-mijoz${bosqich === 'ulanmoqda' ? ' jiringlaydi' : ''}${kutish ? ' gapiryapti' : ''}`}>
            <span className="sim-avatar katta" aria-hidden="true">
              {boshHarf(s.mijozIsmi)}
            </span>
            <h2>{s.mijozIsmi}</h2>
            <p aria-live="polite">
              {bosqich === 'ulanmoqda'
                ? t("Qo'ng'iroq qilinmoqda… · Ulanmoqda")
                : bosqich === 'yopilmoqda'
                  ? t("Qo'ng'iroq tugadi")
                  : mijozTugatdi
                    ? t("Mijoz qo'ng'iroqni tugatdi")
                    : kutish
                      ? t('{ism} javob bermoqda…', { ism: s.mijozIsmi })
                      : mmss(sek)}
            </p>
          </div>

          {bosqich !== 'ulanmoqda' && (
            <div className="sim-q-vaqt">
              <div className="sim-q-chiziq" aria-hidden="true">
                <div className="sim-q-toldi" style={{ width: `${foiz}%` }} />
                <div className="sim-q-yakun" style={{ left: `${yakunFoiz}%` }} />
              </div>
              <div className="sim-q-vaqt-matn">
                <span>{yakunlanmoqda ? t('Mijoz suhbatni yakunlamoqda') : t('Yakunlash: {v}', { v: mmss(jami - YAKUN_SEK) })}</span>
                <span>{t('{v} qoldi', { v: mmss(qolgan) })}</span>
              </div>
            </div>
          )}

          <div className="sim-q-tugmalar">
            <button type="button" className="sim-q-yumaloq" disabled title={t('Ovozli rejimda ishlaydi')} aria-label={t("Mikrofonni o'chirish")}>
              <MicOff size={20} />
            </button>
            {bosqich === 'ulanmoqda' ? (
              <button type="button" className="sim-q-tugat" onClick={() => void yakunla(true)}>
                <PhoneOff size={20} /> {t('Bekor qilish')}
              </button>
            ) : (
              <button type="button" className="sim-q-tugat" disabled={bosqich === 'yopilmoqda'} onClick={() => void yakunla()}>
                <PhoneOff size={20} /> {bosqich === 'yopilmoqda' ? t('Yakunlanmoqda…') : t('Tugatish')}
              </button>
            )}
          </div>
        </section>

        <section className="sim-q-ong" aria-label={t('Jonli matn')}>
          <div className="sim-q-ong-bosh">
            <b>{t('Jonli matn')}</b>
            <span>{t("Faqat qo'ng'iroqdan keyingi tahlil uchun")}</span>
          </div>
          <ol className="sim-q-matn" ref={royxatRef}>
            {matn.map((q, i) => (
              <li key={i} className={q.kim}>
                <span className="sim-q-kim">
                  {q.kim === 'menejer' ? t('Siz') : s.mijozIsmi} · {mmss(q.sek)}
                </span>
                <p>{q.matn}</p>
              </li>
            ))}
            {kutish && (
              <li className="mijoz kutish" aria-label={t('{ism} javob bermoqda…', { ism: s.mijozIsmi })}>
                <span className="sim-q-nuqtalar" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </li>
            )}
          </ol>

          {xato && (
            <div className="sim-q-xato" role="alert">
              {xato}
            </div>
          )}

          <form
            className="sim-q-kiritish"
            onSubmit={(e) => {
              e.preventDefault();
              void yubor();
            }}
          >
            <textarea
              ref={kiritishRef}
              rows={2}
              value={yozuv}
              maxLength={1000}
              disabled={bosqich !== 'suhbat' || mijozTugatdi}
              placeholder={bosqich === 'ulanmoqda' ? t('Ulanmoqda…') : t('{ism}ga javobingizni yozing…', { ism: s.mijozIsmi })}
              aria-label={t('Javobingiz')}
              onChange={(e) => setYozuv(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void yubor();
                }
              }}
            />
            <button type="submit" disabled={!yozuv.trim() || kutish || bosqich !== 'suhbat' || mijozTugatdi} aria-label={t('Yuborish')}>
              <Send size={18} />
            </button>
          </form>
          <div className="sim-q-ishora">{t('Enter — yuborish, Shift + Enter — yangi qator')}</div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
