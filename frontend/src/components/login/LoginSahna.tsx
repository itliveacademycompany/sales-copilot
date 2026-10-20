import {
  BadgeCheck,
  Check,
  CircleAlert,
  Lightbulb,
  MessagesSquare,
  Mouse,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { joyla, useT } from '../../i18n';

/**
 * Kirish sahifasidagi interaktiv taqdimot — bosqichma-bosqich yig'iladigan sahna.
 *
 * Progress (0…1) `--p` CSS o'zgaruvchisi sifatida `.login-fon` ga yoziladi.
 * Ochilganda hikoya o'zi oxirigacha o'ynaydi; sichqoncha g'ildiragi, touchpad
 * yoki bosqich nuqtalari bilan istalgan payt qo'lda boshqariladi. Har bir element o'z oralig'ida (`--a`…`--b`)
 * `--t` ni hisoblaydi — shuning uchun hammasi ikki tomonga ham ishlaydi:
 * oldinga aylantirsa yig'iladi, orqaga qaytsa teskari ochiladi.
 *
 * Uch bosqich — chapdagi uch va'daning o'zi:
 *   01 Telegram yozishmalari — suhbat kelib tushadi
 *   02 Isbotli baholash      — skaner, iqtiboslar, mezonlar
 *   03 Kouching va o'sish    — ball va aniq tavsiya
 *
 * Interaktiv rejim faqat keng ekranda va harakat cheklanmagan bo'lsa yoqiladi;
 * aks holda sahna oxirgi holatda turadi (bosqich nuqtalari baribir bosiladi).
 * Sahnadagi suhbat va ball — namuna, haqiqiy ma'lumot emas.
 */

const BOSQICHLAR = [
  {
    ikon: <MessagesSquare />,
    nom: 'Telegram yozishmalari',
    matn: "Suhbatlar avtomatik yig'iladi va sizning skriptingiz bo'yicha tahlil qilinadi.",
  },
  {
    ikon: <ShieldCheck />,
    nom: 'Isbotli baholash',
    matn: 'Har bir ball yozishmadagi aniq iqtibos bilan tasdiqlanadi.',
  },
  {
    ikon: <TrendingUp />,
    nom: "Kouching va o'sish",
    matn: 'Har bir sotuvchi uchun eng zaif joy va aniq tavsiya.',
  },
] as const;

/** Bosqich chegaralari (progress bo'yicha) va chiziqdagi bosilganda boriladigan nuqta. */
const CHEGARA = [0.34, 0.67] as const;
const BOSQICH_NUQTA = [0.31, 0.64, 1] as const;

const BALL = 87;
const AYLANA = 2 * Math.PI * 24;
/** Ball halqasi to'ladigan oraliq. */
const BALL_A = 0.7;
const BALL_B = 0.86;

/** Sahnaning loyiha o'lchami — joyga `--k` masshtab bilan sig'diriladi. */
const KADR_W = 520;
const KADR_H = 392;

/**
 * Xabar matni — lug'at kaliti (`lugat/kirish.ts`). Belgilangan iqtibos
 * (`belgi`) gap ichidagi `{belgi}` o'rniga tushadi — so'z tartibi har
 * tilda o'zicha, shuning uchun gap bo'laklab emas, butunligicha tarjima qilinadi.
 */
interface Xabar {
  kim: 'mijoz' | 'menejer';
  matn: string;
  belgi?: { matn: string; a: number; b: number };
}

const XABARLAR: Xabar[] = [
  { kim: 'mijoz', matn: 'Assalomu alaykum! Frontend kursi narxi qancha?' },
  {
    kim: 'menejer',
    matn: 'Va alaykum assalom! {belgi} — ishga kirish uchunmi?',
    belgi: { matn: 'Avval maqsadingizni bilsam', a: 0.4, b: 0.47 },
  },
  { kim: 'mijoz', matn: 'Ha, ishga. Lekin narxi qimmat emasmi?' },
  {
    kim: 'menejer',
    matn: 'Tushunaman. {belgi} — birinchi dars bepul.',
    belgi: { matn: "Bo'lib to'lash imkoni bor", a: 0.5, b: 0.57 },
  },
];

const MEZONLAR: { nom: string; ok: boolean }[] = [
  { nom: 'Salomlashish', ok: true },
  { nom: 'Ehtiyojni aniqlash', ok: true },
  { nom: "E'tirozga javob", ok: true },
  { nom: 'Keyingi qadam', ok: false },
];

/** Element o'z animatsiyasini progressning qaysi oralig'ida o'ynashi. */
function oraliq(a: number, b: number): CSSProperties {
  return { '--a': a, '--b': b } as CSSProperties;
}

const cheklash = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Avtomatik ijro: vaqt (ms) → progress. Har bosqich oxirida qisqa pauza —
 * tomoshabin natijani ko'rib ulgursin. Segmentlar ichida ease-in-out.
 */
const IJRO: readonly (readonly [number, number])[] = [
  [0, 0],
  [500, 0.02],
  [3600, 0.31],
  [4600, 0.31],
  [8200, 0.64],
  [9200, 0.64],
  [12600, 1],
];
const IJRO_OXIRI = IJRO[IJRO.length - 1]?.[0] ?? 0;

function ijroProgress(ms: number): number {
  for (let i = 1; i < IJRO.length; i++) {
    const [ta, pa] = IJRO[i - 1] ?? [0, 0];
    const [tb, pb] = IJRO[i] ?? [0, 0];
    if (ms <= tb) {
      const x = cheklash((ms - ta) / (tb - ta || 1));
      const e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
      return pa + (pb - pa) * e;
    }
  }
  return 1;
}

/** G'ildirakning qancha piksel aylanishi butun hikoyani o'tkazadi. */
const GILDIRAK_YOLI = 1600;

/** Interaktiv rejim: keng ekran + harakat cheklanmagan. Aks holda sahna statik. */
export function useInteraktivRejim(): boolean {
  const sorov = '(min-width: 981px) and (prefers-reduced-motion: no-preference)';
  const [yoqilgan, setYoqilgan] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(sorov).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(sorov);
    const ozgardi = () => setYoqilgan(mq.matches);
    mq.addEventListener('change', ozgardi);
    return () => mq.removeEventListener('change', ozgardi);
  }, []);
  return yoqilgan;
}

interface Boshqaruv {
  /** Progressni berilgan nuqtaga silliq olib boradi (avto ijro to'xtaydi). */
  bor: (p: number) => void;
  /** Hikoyani boshidan avtomatik qayta o'ynatadi. */
  qaytaIjro: () => void;
}

export function LoginSahna() {
  const t = useT();
  const interaktiv = useInteraktivRejim();
  const [bosqich, setBosqich] = useState(interaktiv ? 0 : 2);
  /** Hikoya oxiriga yetdimi (qayta ko'rish tugmasi uchun). */
  const [oxirida, setOxirida] = useState(!interaktiv);
  /** Foydalanuvchi o'zi boshqardimi — ishorani yashirish uchun. */
  const [boshqardi, setBoshqardi] = useState(false);

  const ildizRef = useRef<HTMLDivElement>(null);
  const kadrRef = useRef<HTMLDivElement>(null);
  const halqaRef = useRef<SVGCircleElement>(null);
  const sonRef = useRef<HTMLSpanElement>(null);
  const boshqaruvRef = useRef<Boshqaruv>({ bor: () => {}, qaytaIjro: () => {} });

  // ─── Progress: avto ijro yoki g'ildirak/teginish → silliq → CSS `--p` ───
  useEffect(() => {
    const ildiz = ildizRef.current;
    const fon = ildiz?.closest<HTMLElement>('.login-fon');
    if (!ildiz || !fon) return;

    let avto = interaktiv;
    let boshlangan = performance.now();
    let joriy = interaktiv ? 0 : 1;
    let maqsad = joriy;
    let raf = 0;
    let ishlayapti = false;
    let oxirgiBosqich = -1;
    let oxirgiOxirida = !interaktiv;

    const qolla = (p: number) => {
      fon.style.setProperty('--p', p.toFixed(4));
      const t = cheklash((p - BALL_A) / (BALL_B - BALL_A));
      halqaRef.current?.style.setProperty('stroke-dashoffset', String(AYLANA * (1 - (BALL / 100) * t)));
      if (sonRef.current) sonRef.current.textContent = String(Math.round(BALL * t));
      const b = p < CHEGARA[0] ? 0 : p < CHEGARA[1] ? 1 : 2;
      if (b !== oxirgiBosqich) {
        oxirgiBosqich = b;
        setBosqich(b);
      }
      const ox = p >= 0.999;
      if (ox !== oxirgiOxirida) {
        oxirgiOxirida = ox;
        setOxirida(ox);
      }
    };

    const kadr = (hozir: number) => {
      if (avto) {
        const ms = hozir - boshlangan;
        joriy = maqsad = ijroProgress(ms);
        if (ms >= IJRO_OXIRI) avto = false;
      } else {
        joriy += (maqsad - joriy) * 0.14;
        if (Math.abs(maqsad - joriy) < 0.0006) joriy = maqsad;
      }
      qolla(joriy);
      if (avto || joriy !== maqsad) raf = requestAnimationFrame(kadr);
      else ishlayapti = false;
    };
    const uygot = () => {
      if (ishlayapti) return;
      ishlayapti = true;
      raf = requestAnimationFrame(kadr);
    };

    /** Foydalanuvchi boshqaruvni oladi — avto ijro joriy nuqtada to'xtaydi. */
    const qolgaOl = () => {
      if (avto) {
        avto = false;
        maqsad = joriy;
      }
      setBoshqardi(true);
    };

    boshqaruvRef.current = {
      bor: (p) => {
        qolgaOl();
        maqsad = cheklash(p);
        uygot();
      },
      qaytaIjro: () => {
        avto = true;
        boshlangan = performance.now();
        uygot();
      },
    };

    qolla(joriy);
    if (!interaktiv) return () => fon.style.removeProperty('--p');

    // G'ildirak / touchpad — butun kirish ekrani bo'ylab. Sahifa bitta
    // ekranli, shuning uchun aylantirish boshqa hech narsaga kerak emas.
    const gildirak = (e: WheelEvent) => {
      if (e.ctrlKey) return; // brauzer zoomi
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      if (!d) return;
      qolgaOl();
      maqsad = cheklash(maqsad + d / GILDIRAK_YOLI);
      uygot();
    };
    // Sensorli ekranli noutbuklar: sahna ustida barmoq bilan surish
    let oxirgiY: number | null = null;
    const tegish = (e: TouchEvent) => (oxirgiY = e.touches[0]?.clientY ?? null);
    const surish = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (y === undefined || oxirgiY === null) return;
      qolgaOl();
      maqsad = cheklash(maqsad + ((oxirgiY - y) * 2.5) / GILDIRAK_YOLI);
      oxirgiY = y;
      uygot();
    };

    fon.addEventListener('wheel', gildirak, { passive: true });
    ildiz.addEventListener('touchstart', tegish, { passive: true });
    ildiz.addEventListener('touchmove', surish, { passive: true });
    uygot();

    return () => {
      cancelAnimationFrame(raf);
      fon.removeEventListener('wheel', gildirak);
      ildiz.removeEventListener('touchstart', tegish);
      ildiz.removeEventListener('touchmove', surish);
      fon.style.removeProperty('--p');
    };
  }, [interaktiv]);

  // ─── Sahnani mavjud joyga sig'dirish ───
  useEffect(() => {
    const kadr = kadrRef.current;
    if (!kadr) return;
    const kuzatuvchi = new ResizeObserver(() => {
      const { width, height } = kadr.getBoundingClientRect();
      const k = Math.min(width / KADR_W, height / KADR_H, 1.25);
      kadr.style.setProperty('--k', Math.max(0.4, k).toFixed(3));
    });
    kuzatuvchi.observe(kadr);
    return () => kuzatuvchi.disconnect();
  }, []);

  const joriy = BOSQICHLAR[bosqich] ?? BOSQICHLAR[0];

  return (
    <div className="ks" ref={ildizRef}>
      <div className="ks-qator">
        <div className="ks-kadr" ref={kadrRef} aria-hidden="true">
          <div className="ks-ekran">
            {/* ─── Telegram suhbati ─── */}
            <div className="ks-suhbat">
              <div className="ks-suhbat-bosh">
                <span className="ks-avatar">DM</span>
                <span className="ks-suhbat-nom">
                  <b>Dilnoza M.</b>
                  <small>{t('Telegram · mijoz')}</small>
                </span>
                <span className="ks-jonli">
                  <i /> {t('jonli')}
                </span>
              </div>
              <div className="ks-xabarlar">
                {XABARLAR.map((x, i) => (
                  <div key={i} className={`ks-xabar ks-t ${x.kim}`} style={oraliq(0.02 + i * 0.07, 0.07 + i * 0.07)}>
                    {x.belgi
                      ? joyla(t(x.matn), {
                          belgi: (
                            <mark className="ks-t" style={oraliq(x.belgi.a, x.belgi.b)}>
                              {t(x.belgi.matn)}
                            </mark>
                          ),
                        })
                      : t(x.matn)}
                  </div>
                ))}
              </div>
              <span className="ks-skaner ks-t" style={oraliq(0.36, 0.6)} />
            </div>

            {/* ─── Tahlil ─── */}
            <div className="ks-tahlil">
              <div className="ks-tahlil-bosh ks-t" style={oraliq(0.35, 0.4)}>
                {t("Skript bo'yicha tahlil")}
              </div>
              {MEZONLAR.map((m, i) => (
                <div
                  key={m.nom}
                  className={`ks-mezon ks-t ${m.ok ? 'ok' : 'diqqat'}`}
                  style={oraliq(0.4 + i * 0.06, 0.45 + i * 0.06)}
                >
                  <span className="ks-mezon-ikon">{m.ok ? <Check /> : <CircleAlert />}</span>
                  <span className="ks-mezon-nom">{t(m.nom)}</span>
                </div>
              ))}

              <div className="ks-ball ks-t" style={oraliq(0.67, 0.72)}>
                <div className="ks-halqa">
                  <svg viewBox="0 0 56 56">
                    <circle className="iz" cx="28" cy="28" r="24" />
                    <circle
                      ref={halqaRef}
                      className="qiymat"
                      cx="28"
                      cy="28"
                      r="24"
                      strokeDasharray={AYLANA}
                      strokeDashoffset={AYLANA}
                    />
                  </svg>
                  <span>
                    <span ref={sonRef}>0</span>%
                  </span>
                </div>
                <div className="ks-ball-matn">
                  <b>{t('Umumiy ball')}</b>
                  <span className="ks-chip ks-t" style={oraliq(0.82, 0.87)}>
                    {t('3 ta isbot')}
                  </span>
                </div>
              </div>
            </div>

            {/* ─── Kouch tavsiyasi ─── */}
            <div className="ks-tavsiya ks-t" style={oraliq(0.86, 0.95)}>
              <span className="ks-tavsiya-ikon">
                <Lightbulb />
              </span>
              <span>
                <b>{t('Kouch tavsiyasi:')}</b>{' '}
                {t("suhbatni aniq qadam bilan yakunlang — «Ertaga 15:00 da qo'ng'iroq qilsam bo'ladimi?»")}
              </span>
              <BadgeCheck className="ks-tavsiya-belgi" />
            </div>
          </div>
        </div>

        {/* ─── Bosqichlar chizig'i ─── */}
        <nav className="ks-chiziq" aria-label={t('Taqdimot bosqichlari')}>
          <span className="ks-chiziq-iz" aria-hidden="true">
            <i />
          </span>
          {BOSQICHLAR.map((b, i) => (
            <button
              key={b.nom}
              type="button"
              className={`ks-nuqta${i === bosqich ? ' faol' : ''}${i < bosqich ? ' otdi' : ''}`}
              style={{ top: `${(i / (BOSQICHLAR.length - 1)) * 100}%` }}
              onClick={() => boshqaruvRef.current.bor(BOSQICH_NUQTA[i] ?? 1)}
              aria-label={t('{raqam}-bosqich: {nom}', { raqam: i + 1, nom: t(b.nom) })}
              aria-current={i === bosqich ? 'step' : undefined}
            >
              {String(i + 1).padStart(2, '0')}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Joriy bosqich izohi ─── */}
      <div className="ks-izoh">
        <span className="afzallik-ikon" aria-hidden="true">
          {joriy.ikon}
        </span>
        <span key={bosqich} className="ks-izoh-matn" aria-live="polite">
          <b>{t(joriy.nom)}</b>
          <span className="afzallik-matn">{t(joriy.matn)}</span>
        </span>

        {interaktiv && oxirida && (
          <button type="button" className="ks-qayta" onClick={() => boshqaruvRef.current.qaytaIjro()}>
            <RotateCcw /> {t("Qayta ko'rish")}
          </button>
        )}
        {interaktiv && !oxirida && !boshqardi && (
          <span className="ks-ishora" aria-hidden="true">
            <Mouse /> {t("G'ildirak bilan boshqaring")}
          </span>
        )}
      </div>
    </div>
  );
}
