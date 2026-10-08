import { Check, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type SeatRow } from '../../api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → ISH JADVALI VA OGOHLANTIRISHLAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Serverda jadval sozlamasi hali yo'q — shu brauzerda, biznes bo'yicha
 * saqlanadi. «Ish vaqtidan tashqari» belgisi suhbat kelganda serverda
 * alohida aniqlanadi. Server sozlamasi qo'shilgach, shu tuzilma (umumiy
 * jadval + menejer bo'yicha istisno) to'g'ridan-to'g'ri yuboriladi.
 */

const KUNLAR = [
  { qisqa: 'Du', toliq: 'Dushanba' },
  { qisqa: 'Se', toliq: 'Seshanba' },
  { qisqa: 'Cho', toliq: 'Chorshanba' },
  { qisqa: 'Pa', toliq: 'Payshanba' },
  { qisqa: 'Ju', toliq: 'Juma' },
  { qisqa: 'Sha', toliq: 'Shanba' },
  { qisqa: 'Ya', toliq: 'Yakshanba' },
];

interface Jadval {
  dan: string;
  gacha: string;
  kunlar: boolean[];
}
interface Sozlama extends Jadval {
  ogohlantirish: boolean;
  alohida: boolean;
  menejerlar: Record<string, Jadval>;
}

const STANDART: Sozlama = {
  ogohlantirish: true,
  dan: '09:00',
  gacha: '18:00',
  kunlar: [true, true, true, true, true, false, false],
  alohida: false,
  menejerlar: {},
};

const kalit = (b: string) => `sotuvai-ish-jadvali-v2:${b}`;
const eskiKalit = (b: string) => `sotuvai-ish-jadvali-${b}`;

function oqi(businessId: string): Sozlama {
  try {
    const v = JSON.parse(localStorage.getItem(kalit(businessId)) ?? 'null') as Partial<Sozlama> | null;
    if (v) return { ...STANDART, ...v, kunlar: v.kunlar?.length === 7 ? v.kunlar : STANDART.kunlar, menejerlar: v.menejerlar ?? {} };
    // Avvalgi ko'rinishdagi (kunma-kun) jadvaldan ko'chirish — tanlov yo'qolmasin
    const eski = JSON.parse(localStorage.getItem(eskiKalit(businessId)) ?? 'null') as { ish: boolean; dan: string; gacha: string }[] | null;
    if (Array.isArray(eski) && eski.length === 7) {
      const birinchi = eski.find((k) => k.ish);
      return { ...STANDART, kunlar: eski.map((k) => k.ish), dan: birinchi?.dan ?? STANDART.dan, gacha: birinchi?.gacha ?? STANDART.gacha };
    }
  } catch {
    /* buzilgan qiymat — standart */
  }
  return STANDART;
}

const daqiqa = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const jadvalXatosi = (j: Jadval) =>
  !j.dan || !j.gacha ? 'Vaqtni kiriting' : daqiqa(j.gacha) <= daqiqa(j.dan) ? "Tugash vaqti boshlanishdan keyin bo'lsin" : !j.kunlar.some(Boolean) ? 'Kamida bitta ish kuni tanlang' : null;
const haftalikSoat = (j: Jadval) => (Math.max(0, daqiqa(j.gacha) - daqiqa(j.dan)) / 60) * j.kunlar.filter(Boolean).length;

function Almash({ yoqilgan, onOzgar, id, nom }: { yoqilgan: boolean; onOzgar: (v: boolean) => void; id: string; nom: string }) {
  return (
    <label className="vr-almash ij-almash" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" aria-label={nom} checked={yoqilgan} onChange={(e) => onOzgar(e.target.checked)} />
      <span className="vr-almash-yol" aria-hidden="true" />
      <span className={yoqilgan ? 'ij-holat yoq' : 'ij-holat'}>{yoqilgan ? 'Yoqilgan' : "O'chirilgan"}</span>
    </label>
  );
}

function Kunlar({ kunlar, onOzgar, nom }: { kunlar: boolean[]; onOzgar: (k: boolean[]) => void; nom: string }) {
  return (
    <div className="ij-kunlar" role="group" aria-label={nom}>
      {KUNLAR.map((k, i) => (
        <button
          key={k.qisqa}
          type="button"
          className={`ij-kun${kunlar[i] ? ' faol' : ''}`}
          aria-pressed={kunlar[i]}
          title={k.toliq}
          onClick={() => onOzgar(kunlar.map((v, x) => (x === i ? !v : v)))}
        >
          {k.qisqa}
        </button>
      ))}
    </div>
  );
}

export function IshJadvali({ businessId }: { businessId: string }) {
  const [asl, setAsl] = useState<Sozlama>(() => oqi(businessId));
  const [s, setS] = useState<Sozlama>(asl);
  const [seatlar, setSeatlar] = useState<SeatRow[] | null>(null);
  const [holat, setHolat] = useState<'tinch' | 'saqlandi' | 'xato'>('tinch');

  useEffect(() => {
    void api
      .get<SeatRow[]>(`/api/v1/businesses/${businessId}/seats`)
      .then((r) => setSeatlar(r.filter((x) => x.isActive)))
      .catch(() => setSeatlar([]));
  }, [businessId]);

  const ozgar = (o: Partial<Sozlama>) => setS((v) => ({ ...v, ...o }));
  const menejer = (id: string): Jadval => s.menejerlar[id] ?? { dan: s.dan, gacha: s.gacha, kunlar: s.kunlar };
  const menejerOzgar = (id: string, o: Partial<Jadval>) => setS((v) => ({ ...v, menejerlar: { ...v.menejerlar, [id]: { ...menejer(id), ...o } } }));
  const menejerQaytar = (id: string) =>
    setS((v) => {
      const m = { ...v.menejerlar };
      delete m[id];
      return { ...v, menejerlar: m };
    });

  const umumiyXato = jadvalXatosi(s);
  const menejerXatolari = s.alohida ? (seatlar ?? []).map((x) => (s.menejerlar[x.id] ? jadvalXatosi(s.menejerlar[x.id]!) : null)) : [];
  const xatoBor = !!umumiyXato || menejerXatolari.some(Boolean);
  const ozgargan = JSON.stringify(s) !== JSON.stringify(asl);

  const saqla = () => {
    try {
      localStorage.setItem(kalit(businessId), JSON.stringify(s));
      setAsl(s);
      setHolat('saqlandi');
    } catch {
      setHolat('xato');
    }
    setTimeout(() => setHolat('tinch'), 2200);
  };

  return (
    <section className="card sz-karta ij-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>Ish jadvali va ogohlantirishlar</h2>
          <p>Ish vaqti va ogohlantirish sozlamalarini boshqaring.</p>
        </div>
      </div>

      <div className="ij-forma">
        <span className="ij-yorliq" id="ij-ogoh-nom">
          Ogohlantirishlar
        </span>
        <div>
          <Almash id="ij-ogoh" nom="Ogohlantirishlar" yoqilgan={s.ogohlantirish} onOzgar={(v) => ozgar({ ogohlantirish: v })} />
        </div>

        <label className="ij-yorliq" htmlFor="ij-dan">
          Ish boshlanishi
        </label>
        <div>
          <input id="ij-dan" type="time" className="ij-vaqt" value={s.dan} onChange={(e) => ozgar({ dan: e.target.value })} />
        </div>

        <label className="ij-yorliq" htmlFor="ij-gacha">
          Ish tugashi
        </label>
        <div>
          <input
            id="ij-gacha"
            type="time"
            className="ij-vaqt"
            value={s.gacha}
            onChange={(e) => ozgar({ gacha: e.target.value })}
            aria-invalid={!!s.dan && !!s.gacha && daqiqa(s.gacha) <= daqiqa(s.dan)}
          />
        </div>

        <span className="ij-yorliq">Ish kunlari</span>
        <div>
          <Kunlar nom="Ish kunlari" kunlar={s.kunlar} onOzgar={(k) => ozgar({ kunlar: k })} />
        </div>

        <span className="ij-yorliq">Menejerlar uchun alohida jadval</span>
        <div>
          <Almash id="ij-alohida" nom="Menejerlar uchun alohida jadval" yoqilgan={s.alohida} onOzgar={(v) => ozgar({ alohida: v })} />
        </div>
      </div>

      {umumiyXato ? (
        <div className="yordam bzl-xato">{umumiyXato}</div>
      ) : (
        <div className="yordam">
          Haftasiga {Math.round(haftalikSoat(s) * 10) / 10} soat · {s.kunlar.filter(Boolean).length} ish kuni
        </div>
      )}

      {s.alohida && (
        <div className="ij-menejerlar">
          {!seatlar ? (
            <div className="card skelet" style={{ height: 64 }} aria-busy="true" />
          ) : seatlar.length === 0 ? (
            <div className="bn-bosh-holat">Faol menejer yo'q — avval Menejerlar bo'limida qo'shing.</div>
          ) : (
            seatlar.map((x, i) => {
              const j = menejer(x.id);
              const shaxsiy = !!s.menejerlar[x.id];
              const xato = menejerXatolari[i];
              return (
                <div key={x.id} className={`ij-menejer${shaxsiy ? ' shaxsiy' : ''}`}>
                  <div className="ij-menejer-nom">
                    <b>{x.displayName}</b>
                    <small>{shaxsiy ? 'Alohida jadval' : 'Umumiy jadval'}</small>
                  </div>
                  <div className="ij-menejer-vaqt">
                    <input type="time" className="ij-vaqt" aria-label={`${x.displayName} — boshlanishi`} value={j.dan} onChange={(e) => menejerOzgar(x.id, { dan: e.target.value })} />
                    <span>—</span>
                    <input type="time" className="ij-vaqt" aria-label={`${x.displayName} — tugashi`} value={j.gacha} onChange={(e) => menejerOzgar(x.id, { gacha: e.target.value })} />
                  </div>
                  <Kunlar nom={`${x.displayName} — ish kunlari`} kunlar={j.kunlar} onOzgar={(k) => menejerOzgar(x.id, { kunlar: k })} />
                  <button
                    type="button"
                    className="ij-qaytar"
                    disabled={!shaxsiy}
                    onClick={() => menejerQaytar(x.id)}
                    title="Umumiy jadvalga qaytarish"
                    aria-label={`${x.displayName} — umumiy jadvalga qaytarish`}
                  >
                    <RotateCcw />
                  </button>
                  {xato && <div className="yordam bzl-xato ij-menejer-xato">{xato}</div>}
                </div>
              );
            })
          )}
        </div>
      )}

      <p className="sz-eslatma">
        Jadval hozircha shu brauzerda saqlanadi — serverda ish jadvali sozlamasi hali yo'q, shuning uchun ogohlantirishlar va «ish vaqtidan tashqari» belgisi
        unga hali bog'lanmagan. Server sozlamasi qo'shilgach, jadval butun jamoa uchun amal qiladi.
      </p>

      <div className="pr-past">
        {ozgargan && holat === 'tinch' && <span className="kr-holat">Saqlanmagan o'zgarishlar bor</span>}
        {holat === 'saqlandi' && (
          <span className="kr-holat ok">
            <Check /> Saqlandi
          </span>
        )}
        {holat === 'xato' && <span className="kr-holat xato">Brauzer xotirasi yopiq — saqlanmadi</span>}
        <button type="button" className="btn ikkinchi" disabled={!ozgargan} onClick={() => setS(asl)}>
          Bekor qilish
        </button>
        <button type="button" className="btn" disabled={!ozgargan || xatoBor} onClick={saqla}>
          Saqlash
        </button>
      </div>
    </section>
  );
}
