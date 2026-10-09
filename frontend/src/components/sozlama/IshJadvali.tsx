import { Check, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type BiznesIshJadvali, type IshJadvaliQiymat, type SeatFull } from '../../api';
import { useAuth } from '../../auth';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → ISH JADVALI VA OGOHLANTIRISHLAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Jadval SERVERDA saqlanadi (`/work-hours`, `/seats/:id/work-hours`) va
 * butun jamoa uchun amal qiladi: «ish vaqtida javobsiz qolgan» ko'rsatkichi
 * va (kalit yoqilgan bo'lsa) ogohlantirishlar shu jadvalga qarab hisoblanadi.
 *
 * NEGA SOAT, DAQIQA EMAS
 * ──────────────────────
 * Server jadvalni butun soatlarda saqlaydi (`startHour`/`endHour`) — SQL
 * tomondagi `ishVaqtida()` ham soat bo'yicha solishtiradi. `09:30` kiritish
 * imkonini qoldirsak, u jimgina `09:00` ga aylanardi va foydalanuvchi
 * ko'rgani bilan tizim hisoblagani farq qilardi. Shuning uchun tanlov soatlik.
 *
 * MENEJER JADVALI
 * ───────────────
 * `null` — menejer umumiy jadvalga ergashadi (umumiy jadval o'zgarsa, u ham
 * o'zgaradi). «Alohida jadval» kaliti o'chirilganda menejer jadvallari
 * o'chirilmaydi — server ularni e'tiborsiz qoldiradi, kalit qayta yoqilsa
 * hammasi joyida turadi.
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

/** Interfeys holati: kunlar — Du..Ya bo'yicha 7 ta belgi (server ISO 1..7 saqlaydi). */
interface Jadval {
  dan: number;
  gacha: number;
  kunlar: boolean[];
}
interface Sozlama extends Jadval {
  ogohlantirish: boolean;
  alohida: boolean;
  menejerlar: Record<string, Jadval>;
}

const serverdan = (j: IshJadvaliQiymat): Jadval => ({
  dan: j.startHour,
  gacha: j.endHour,
  kunlar: KUNLAR.map((_, i) => j.days.includes(i + 1)),
});
const serverga = (j: Jadval): IshJadvaliQiymat => ({
  startHour: j.dan,
  endHour: j.gacha,
  days: j.kunlar.flatMap((v, i) => (v ? [i + 1] : [])),
});

const soat = (h: number) => `${String(h).padStart(2, '0')}:00`;
const BOSHLANISH = Array.from({ length: 24 }, (_, h) => h);
const TUGASH = Array.from({ length: 24 }, (_, h) => h + 1);

const jadvalXatosi = (j: Jadval) =>
  j.gacha <= j.dan ? "Tugash vaqti boshlanishdan keyin bo'lsin" : !j.kunlar.some(Boolean) ? 'Kamida bitta ish kuni tanlang' : null;
const haftalikSoat = (j: Jadval) => Math.max(0, j.gacha - j.dan) * j.kunlar.filter(Boolean).length;
const teng = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Almash({ yoqilgan, onOzgar, id, nom, ochiq = 'Yoqilgan', yopiq = "O'chirilgan", disabled }: { yoqilgan: boolean; onOzgar: (v: boolean) => void; id: string; nom: string; ochiq?: string; yopiq?: string; disabled?: boolean }) {
  return (
    <label className="vr-almash ij-almash" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" aria-label={nom} checked={yoqilgan} disabled={disabled} onChange={(e) => onOzgar(e.target.checked)} />
      <span className="vr-almash-yol" aria-hidden="true" />
      <span className={yoqilgan ? 'ij-holat yoq' : 'ij-holat'}>{yoqilgan ? ochiq : yopiq}</span>
    </label>
  );
}

function Kunlar({ kunlar, onOzgar, nom, disabled }: { kunlar: boolean[]; onOzgar: (k: boolean[]) => void; nom: string; disabled?: boolean }) {
  return (
    <div className="ij-kunlar" role="group" aria-label={nom}>
      {KUNLAR.map((k, i) => (
        <button
          key={k.qisqa}
          type="button"
          className={`ij-kun${kunlar[i] ? ' faol' : ''}`}
          aria-pressed={kunlar[i]}
          title={k.toliq}
          disabled={disabled}
          onClick={() => onOzgar(kunlar.map((v, x) => (x === i ? !v : v)))}
        >
          {k.qisqa}
        </button>
      ))}
    </div>
  );
}

function Soat({ id, qiymat, variantlar, onOzgar, nom, xato, disabled }: { id?: string; qiymat: number; variantlar: number[]; onOzgar: (h: number) => void; nom: string; xato?: boolean; disabled?: boolean }) {
  return (
    <select id={id} className="ij-vaqt" aria-label={nom} aria-invalid={xato} value={qiymat} disabled={disabled} onChange={(e) => onOzgar(Number(e.target.value))}>
      {variantlar.map((h) => (
        <option key={h} value={h}>
          {soat(h)}
        </option>
      ))}
    </select>
  );
}

export function IshJadvali({ businessId }: { businessId: string }) {
  const { business } = useAuth();
  const yozaOladi = !!business?.permissions.includes('business:write');

  const [asl, setAsl] = useState<Sozlama | null>(null);
  const [s, setS] = useState<Sozlama | null>(null);
  const [seatlar, setSeatlar] = useState<SeatFull[] | null>(null);
  const [zona, setZona] = useState('Asia/Tashkent');
  const [yuklashXato, setYuklashXato] = useState<string | null>(null);
  const [holat, setHolat] = useState<'tinch' | 'saqlanmoqda' | 'saqlandi'>('tinch');
  const [xato, setXato] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    setYuklashXato(null);
    try {
      const [jadval, orinlar] = await Promise.all([
        api.get<{ workHours: BiznesIshJadvali; timezone: string }>(`/api/v1/businesses/${businessId}/work-hours`),
        api.get<SeatFull[]>(`/api/v1/businesses/${businessId}/seats`),
      ]);
      const faol = orinlar.filter((x) => x.isActive);
      const menejerlar: Record<string, Jadval> = {};
      for (const o of faol) if (o.workHours) menejerlar[o.id] = serverdan(o.workHours);
      const holatS: Sozlama = {
        ...serverdan(jadval.workHours),
        ogohlantirish: jadval.workHours.alertsOnlyWorkHours,
        alohida: jadval.workHours.perSeatSchedules,
        menejerlar,
      };
      setZona(jadval.timezone);
      setSeatlar(faol);
      setAsl(holatS);
      setS(holatS);
    } catch (e) {
      setYuklashXato(e instanceof ApiError ? e.message : 'Jadvalni yuklab bo\'lmadi');
    }
  }, [businessId]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  if (yuklashXato) {
    return (
      <section className="card sz-karta ij-karta">
        <div className="yordam bzl-xato">{yuklashXato}</div>
        <div className="pr-past">
          <button type="button" className="btn ikkinchi" onClick={() => void yukla()}>
            Qayta urinish
          </button>
        </div>
      </section>
    );
  }
  if (!s || !asl) return <div className="card skelet" style={{ height: 320 }} aria-busy="true" />;

  const ozgar = (o: Partial<Sozlama>) => setS((v) => (v ? { ...v, ...o } : v));
  const menejer = (id: string): Jadval => s.menejerlar[id] ?? { dan: s.dan, gacha: s.gacha, kunlar: s.kunlar };
  const menejerOzgar = (id: string, o: Partial<Jadval>) =>
    setS((v) => (v ? { ...v, menejerlar: { ...v.menejerlar, [id]: { ...(v.menejerlar[id] ?? { dan: v.dan, gacha: v.gacha, kunlar: v.kunlar }), ...o } } } : v));
  const menejerQaytar = (id: string) =>
    setS((v) => {
      if (!v) return v;
      const m = { ...v.menejerlar };
      delete m[id];
      return { ...v, menejerlar: m };
    });

  const umumiyXato = jadvalXatosi(s);
  const menejerXatolari = s.alohida ? (seatlar ?? []).map((x) => (s.menejerlar[x.id] ? jadvalXatosi(s.menejerlar[x.id]!) : null)) : [];
  const xatoBor = !!umumiyXato || menejerXatolari.some(Boolean);
  const ozgargan = !teng(s, asl);

  const saqla = async () => {
    setHolat('saqlanmoqda');
    setXato(null);
    try {
      const umumiy: BiznesIshJadvali = { ...serverga(s), alertsOnlyWorkHours: s.ogohlantirish, perSeatSchedules: s.alohida };
      const aslUmumiy: BiznesIshJadvali = { ...serverga(asl), alertsOnlyWorkHours: asl.ogohlantirish, perSeatSchedules: asl.alohida };
      if (!teng(umumiy, aslUmumiy)) {
        await api.put(`/api/v1/businesses/${businessId}/work-hours`, umumiy);
      }
      // Faqat o'zgargan menejerlar yuboriladi: o'chirilgan istisno → null (umumiyga qaytadi).
      const idlar = new Set([...Object.keys(s.menejerlar), ...Object.keys(asl.menejerlar)]);
      for (const id of idlar) {
        const yangi = s.menejerlar[id];
        const eski = asl.menejerlar[id];
        if (teng(yangi ?? null, eski ?? null)) continue;
        await api.put(`/api/v1/businesses/${businessId}/seats/${id}/work-hours`, yangi ? serverga(yangi) : null);
      }
      setAsl(s);
      setHolat('saqlandi');
      setTimeout(() => setHolat('tinch'), 2200);
    } catch (e) {
      setHolat('tinch');
      setXato(e instanceof ApiError ? e.message : 'Saqlab bo\'lmadi — internetni tekshiring');
      // Qisman saqlangan bo'lishi mumkin — haqiqiy holatni serverdan qayta olamiz.
      void yukla();
    }
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
        <label className="ij-yorliq" htmlFor="ij-dan">
          Ish boshlanishi
        </label>
        <div>
          <Soat id="ij-dan" nom="Ish boshlanishi" qiymat={s.dan} variantlar={BOSHLANISH} disabled={!yozaOladi} onOzgar={(h) => ozgar({ dan: h })} />
        </div>

        <label className="ij-yorliq" htmlFor="ij-gacha">
          Ish tugashi
        </label>
        <div>
          <Soat id="ij-gacha" nom="Ish tugashi" qiymat={s.gacha} variantlar={TUGASH} xato={s.gacha <= s.dan} disabled={!yozaOladi} onOzgar={(h) => ozgar({ gacha: h })} />
        </div>

        <span className="ij-yorliq">Ish kunlari</span>
        <div>
          <Kunlar nom="Ish kunlari" kunlar={s.kunlar} disabled={!yozaOladi} onOzgar={(k) => ozgar({ kunlar: k })} />
        </div>

        <span className="ij-yorliq" id="ij-ogoh-nom">
          Ogohlantirish faqat ish vaqtida
        </span>
        <div>
          <Almash id="ij-ogoh" nom="Ogohlantirish faqat ish vaqtida" yoqilgan={s.ogohlantirish} disabled={!yozaOladi} onOzgar={(v) => ozgar({ ogohlantirish: v })} />
        </div>

        <span className="ij-yorliq">Menejerlar uchun alohida jadval</span>
        <div>
          <Almash id="ij-alohida" nom="Menejerlar uchun alohida jadval" yoqilgan={s.alohida} disabled={!yozaOladi} onOzgar={(v) => ozgar({ alohida: v })} />
        </div>
      </div>

      {umumiyXato ? (
        <div className="yordam bzl-xato">{umumiyXato}</div>
      ) : (
        <div className="yordam">
          Haftasiga {haftalikSoat(s)} soat · {s.kunlar.filter(Boolean).length} ish kuni · vaqt mintaqasi {zona}
        </div>
      )}
      <div className="yordam">
        {s.ogohlantirish
          ? 'Ish vaqtidan tashqarida boshlangan suhbatlar baholanadi va hisobotga kiradi, lekin ular uchun ogohlantirish yaratilmaydi.'
          : 'Ogohlantirishlar kecha-kunduz yaratiladi. Yoqsangiz, ish vaqtidan tashqaridagi suhbatlar uchun ogohlantirish chiqmaydi.'}
      </div>

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
              const mx = menejerXatolari[i];
              return (
                <div key={x.id} className={`ij-menejer${shaxsiy ? ' shaxsiy' : ''}`}>
                  <div className="ij-menejer-nom">
                    <b>{x.displayName}</b>
                    <small>{shaxsiy ? 'Alohida jadval' : 'Umumiy jadval'}</small>
                  </div>
                  <div className="ij-menejer-vaqt">
                    <Soat nom={`${x.displayName} — boshlanishi`} qiymat={j.dan} variantlar={BOSHLANISH} disabled={!yozaOladi} onOzgar={(h) => menejerOzgar(x.id, { dan: h })} />
                    <span>—</span>
                    <Soat nom={`${x.displayName} — tugashi`} qiymat={j.gacha} variantlar={TUGASH} xato={j.gacha <= j.dan} disabled={!yozaOladi} onOzgar={(h) => menejerOzgar(x.id, { gacha: h })} />
                  </div>
                  <Kunlar nom={`${x.displayName} — ish kunlari`} kunlar={j.kunlar} disabled={!yozaOladi} onOzgar={(k) => menejerOzgar(x.id, { kunlar: k })} />
                  <button
                    type="button"
                    className="ij-qaytar"
                    disabled={!shaxsiy || !yozaOladi}
                    onClick={() => menejerQaytar(x.id)}
                    title="Umumiy jadvalga qaytarish"
                    aria-label={`${x.displayName} — umumiy jadvalga qaytarish`}
                  >
                    <RotateCcw />
                  </button>
                  {mx && <div className="yordam bzl-xato ij-menejer-xato">{mx}</div>}
                </div>
              );
            })
          )}
        </div>
      )}

      <p className="sz-eslatma">
        Jadval butun jamoa uchun serverda saqlanadi. Analitikadagi «ish vaqtida javobsiz qolgan» ko'rsatkichi shu jadvalga qarab hisoblanadi. Umumiy jadvalga ergashadigan menejer umumiy jadval o'zgarsa, u bilan birga o'zgaradi.
        {!yozaOladi && ' Jadvalni faqat biznes egasi yoki biznes sozlamalariga huquqi bor rahbar o\'zgartira oladi.'}
      </p>

      <div className="pr-past">
        {xato && <span className="kr-holat xato">{xato}</span>}
        {!xato && ozgargan && holat === 'tinch' && <span className="kr-holat">Saqlanmagan o'zgarishlar bor</span>}
        {holat === 'saqlandi' && (
          <span className="kr-holat ok">
            <Check /> Saqlandi
          </span>
        )}
        <button type="button" className="btn ikkinchi" disabled={!ozgargan || holat === 'saqlanmoqda'} onClick={() => { setS(asl); setXato(null); }}>
          Bekor qilish
        </button>
        <button type="button" className="btn" disabled={!yozaOladi || !ozgargan || xatoBor || holat === 'saqlanmoqda'} onClick={() => void saqla()}>
          {holat === 'saqlanmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </section>
  );
}
