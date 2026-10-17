import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Database, Filter, Pencil, Plus, Timer, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, ApiError, type TaskRow } from '../../api';
import { useAuth } from '../../auth';
import { oyNomi, tarjima, useT } from '../../i18n';
import { avatarRang, boshHarf, type BoshMalumot } from '../bosh/malumot';
import { FiltrTugma, SanaTanlagich, TanlovRoyxat, sanaMatn, type SanaTuri, type Tanlov } from '../qongiroq/Filtrlar';
import { TanlovMenyu } from './Ochiluvchi';
import type { Qoshimcha } from './Tablar';
import { HARAKATLAR, MUHIMLIK, harakatNomi, metaOl, metaSaqla, type Muhimlik } from './vazifaMeta';

/**
 * Vazifalar tahlilidan ochiladigan ro'yxat (drill-down).
 *
 * Alohida sahifa emas — Analitika ichida qoladi, davr va tablar saqlanadi,
 * "qaytish" bir bosishda. Holat shu yerning o'zida o'zgaradi (rahbar
 * kechikkanlarni ko'rib, darhol yopadi), ro'yxat qayta yuklanmaydi.
 */

export type MuddatTuri = '' | 'kechikkan' | 'bugun' | 'hafta' | 'muddatsiz';
const MUDDAT: { qiymat: Exclude<MuddatTuri, ''>; nom: string }[] = [
  { qiymat: 'kechikkan', nom: "Muddati o'tgan" },
  { qiymat: 'bugun', nom: 'Bugun' },
  { qiymat: 'hafta', nom: 'Yaqin 7 kun' },
  { qiymat: 'muddatsiz', nom: 'Muddatsiz' },
];
const SARLAVHA: Record<MuddatTuri, { nom: string; izoh: string }> = {
  '': { nom: 'Ochiq vazifalar', izoh: "Hozir bajarilishi kerak bo'lgan barcha ochiq vazifalar." },
  kechikkan: { nom: "Muddati o'tgan vazifalar", izoh: 'Muddati tugagan, lekin hali yopilmagan vazifalar — birinchi navbatda shular.' },
  bugun: { nom: 'Bugungi vazifalar', izoh: 'Muddati bugun tugaydigan ochiq vazifalar.' },
  hafta: { nom: 'Yaqin 7 kunlik vazifalar', izoh: 'Muddati keyingi 7 kun ichida tugaydigan vazifalar.' },
  muddatsiz: { nom: 'Muddatsiz vazifalar', izoh: 'Muddati belgilanmagan vazifalar — ular unutilib ketishi oson.' },
};
const HOLAT: Record<TaskRow['status'], string> = {
  pending: 'Kutilmoqda',
  in_progress: 'Bajarilmoqda',
  blocked: "To'xtatilgan",
  done: 'Bajarilgan',
  cancelled: 'Bekor qilindi',
};
/** Holat menyusidagi variantlar (bekor qilish — faqat mavjud holat bo'lsa ko'rinadi). */
const HOLAT_TANLOV = (['pending', 'in_progress', 'blocked', 'done'] as const).map((h) => ({ qiymat: h as string, nom: HOLAT[h] }));
const OCHIQ = new Set(['pending', 'in_progress', 'blocked']);
type Manba = 'ai' | 'qolda' | 'crm';
const MANBA: Record<Manba, string> = { crm: "CRM bilan bog'langan", ai: 'SotuvAI yaratgan', qolda: "Qo'lda yaratilgan" };
const manbasi = (t: TaskRow): Manba => (t.crmTaskId ? 'crm' : t.source === 'manual' ? 'qolda' : 'ai');
const KUN = 86400_000;
const SAHIFA = 20;

const muddatMatn = (iso: string) => {
  const d = new Date(iso);
  return tarjima('{kun} {oy}, {vaqt}', {
    kun: d.getDate(),
    // Kun bilan birga — rus tilida qaratqich kelishigi ("5 января")
    oy: oyNomi(d.getMonth(), true),
    vaqt: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  });
};
/** PATCH javobida isOverdue yo'q — server bilan bir xil qoida bo'yicha hisoblaymiz. */
const kechikkanmi = (t: TaskRow) => !!t.dueAt && new Date(t.dueAt).getTime() < Date.now() && OCHIQ.has(t.status);
/** datetime-local qiymati (mahalliy vaqt) */
const inputVaqt = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function VazifaRoyxati({
  data,
  q,
  boshMuddat,
  boshMenejer,
  onOrqaga,
}: {
  data: BoshMalumot;
  q: Qoshimcha;
  boshMuddat: MuddatTuri;
  /** null — filtrsiz; '' — biriktirilmaganlar; aks holda menejer ID. */
  boshMenejer: string | null;
  onOrqaga: () => void;
}) {
  const t = useT();
  const { business } = useAuth();
  const bizId = business?.businessId ?? '';
  const biz = bizId ? `/api/v1/businesses/${bizId}` : '';
  // Brauzerda saqlanadigan maydonlar o'zgarganda qayta chizish uchun
  const [, setMetaVersiya] = useState(0);
  const boshqaraOladi = business?.permissions.includes('task:manage:all') ?? false;

  const [menejer, setMenejer] = useState<string[]>(boshMenejer === null ? [] : [boshMenejer]);
  const [muddat, setMuddat] = useState<MuddatTuri>(boshMuddat);
  const [manba, setManba] = useState<string[]>([]);
  const [holat, setHolat] = useState<string[]>([]);
  const [sana, setSana] = useState<{ turi: SanaTuri; from: Date; to: Date } | null>(null);
  const [bajarilgan, setBajarilgan] = useState(false);
  const [sahifa, setSahifa] = useState(1);
  const [tahrir, setTahrir] = useState<TaskRow | 'yangi' | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const tepaRef = useRef<HTMLDivElement>(null);

  const ism = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data.seats) m.set(s.id, s.displayName);
    for (const r of data.board) if (!m.has(r.seatId)) m.set(r.seatId, r.displayName);
    return m;
  }, [data.seats, data.board]);

  const barcha = q.vazifalar ?? [];
  const bugunBosh = new Date();
  bugunBosh.setHours(0, 0, 0, 0);
  const b0 = bugunBosh.getTime();

  const royxat = useMemo(() => {
    const t = barcha.filter((v) => {
      if (!bajarilgan && !OCHIQ.has(v.status)) return false;
      if (menejer.length && !menejer.includes(v.seatId ?? '')) return false;
      if (manba.length && !manba.includes(manbasi(v))) return false;
      if (holat.length && !holat.includes(v.status)) return false;
      if (sana) {
        const c = new Date(v.createdAt).getTime();
        if (c < sana.from.getTime() || c >= sana.to.getTime()) return false;
      }
      const d = v.dueAt ? new Date(v.dueAt).getTime() : null;
      if (muddat === 'kechikkan' && !kechikkanmi(v)) return false;
      if (muddat === 'bugun' && !(d !== null && d >= b0 && d < b0 + KUN)) return false;
      if (muddat === 'hafta' && !(d !== null && d >= Date.now() && d < b0 + 8 * KUN)) return false;
      if (muddat === 'muddatsiz' && d !== null) return false;
      return true;
    });
    // Server tartibi bilan bir xil: muddatlilar oldin (eng yaqini birinchi), muddatsizlar keyin
    return t.sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return +new Date(a.dueAt) - +new Date(b.dueAt);
    });
  }, [barcha, bajarilgan, menejer, manba, holat, sana, muddat, b0]);

  useEffect(() => setSahifa(1), [menejer, manba, holat, sana, muddat, bajarilgan]);
  const sahifalar = Math.max(1, Math.ceil(royxat.length / SAHIFA));
  const korinadi = royxat.slice((sahifa - 1) * SAHIFA, sahifa * SAHIFA);
  const otish = (n: number) => {
    setSahifa(n);
    tepaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tozala = () => {
    setMenejer([]);
    setMuddat('');
    setManba([]);
    setHolat([]);
    setSana(null);
  };
  const filtrBor = menejer.length + manba.length + holat.length > 0 || !!muddat || !!sana;

  // Filtr tanlovlari — joriy natijadagi sonlar bilan
  const ochiqlar = barcha.filter((v) => bajarilgan || OCHIQ.has(v.status));
  const menejerTanlov: Tanlov[] = [...new Set(barcha.map((v) => v.seatId ?? ''))].map((s) => ({
    qiymat: s,
    nom: s ? ism.get(s) ?? t('Menejer') : t('Biriktirilmagan'),
    soni: ochiqlar.filter((v) => (v.seatId ?? '') === s).length,
  }));
  const manbaTanlov: Tanlov[] = (Object.keys(MANBA) as Manba[]).map((m) => ({ qiymat: m, nom: t(MANBA[m]), soni: ochiqlar.filter((v) => manbasi(v) === m).length }));
  const holatTanlov: Tanlov[] = (Object.keys(HOLAT) as TaskRow['status'][])
    .filter((h) => bajarilgan || OCHIQ.has(h))
    .map((h) => ({ qiymat: h, nom: t(HOLAT[h]), soni: ochiqlar.filter((v) => v.status === h).length }));

  // Mijoz yoki lid — suhbat tafsilotidan nom, bo'lmasa xulosa
  const mijoz = (v: TaskRow) => {
    if (!v.conversationId) return null;
    const d = q.tafsilot[v.conversationId];
    const r = data.suhbatlar.find((x) => x.id === v.conversationId);
    return (
      d?.analysis?.clientExtracted?.name ??
      d?.contact?.name ??
      d?.conversation.phoneFrom ??
      r?.summary?.slice(0, 48) ??
      t('Suhbat #{id}', { id: v.conversationId.slice(0, 8) })
    );
  };

  async function holatniOzgartir(v: TaskRow, yangi: TaskRow['status']) {
    setBand(v.id);
    setXato(null);
    try {
      const row = await api.patch<TaskRow>(`${biz}/tasks/${v.id}`, { status: yangi });
      q.vazifaniYangila({ ...v, ...row, isOverdue: kechikkanmi({ ...v, ...row }) });
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : t("Holat saqlanmadi — qayta urinib ko'ring."));
    } finally {
      setBand(null);
    }
  }

  const s = SARLAVHA[muddat];

  return (
    <section className="card vr-karta" ref={tepaRef}>
      <button type="button" className="vr-orqaga" onClick={onOrqaga}>
        <ArrowLeft /> {t('Vazifalar tahliliga qaytish')}
      </button>

      <div className="vr-bosh">
        <div>
          <h2>{t(s.nom)}</h2>
          <p>{t(s.izoh)}</p>
        </div>
        <div className="vr-bosh-ong">
          <span className="vr-soni" title={t('Filtrga mos vazifalar')}>
            {royxat.length}
          </span>
          {boshqaraOladi && (
            <button type="button" className="btn" onClick={() => setTahrir('yangi')}>
              <Plus /> {t("Vazifa qo'shish")}
            </button>
          )}
        </div>
      </div>

      <div className="vr-filtrlar">
        <div className="vr-filtrlar-chap">
          <FiltrTugma ikon={<UserRound />} nom={t('Menejer')} qiymat={menejer.length === 1 ? (menejer[0] ? ism.get(menejer[0]) ?? t('Menejer') : t('Biriktirilmagan')) : undefined} soni={menejer.length > 1 ? menejer.length : undefined} faol={menejer.length > 0}>
            {() => <TanlovRoyxat sarlavha={t('Menejer')} guruhlar={[{ tanlovlar: menejerTanlov }]} tanlangan={menejer} onOzgar={setMenejer} />}
          </FiltrTugma>
          <FiltrTugma ikon={<CalendarDays />} nom={t('Yaratilgan')} qiymat={sana ? sanaMatn(sana.from, sana.to) : undefined} faol={!!sana}>
            {(yop) => (
              <SanaTanlagich
                turi={sana?.turi ?? '30kun'}
                from={sana?.from ?? new Date(Date.now() - 30 * KUN)}
                to={sana?.to ?? new Date()}
                onTanla={(turi, from, to) => {
                  setSana({ turi, from, to });
                  yop();
                }}
              />
            )}
          </FiltrTugma>
          <FiltrTugma ikon={<Timer />} nom={t('Muddat')} qiymat={muddat ? t(MUDDAT.find((m) => m.qiymat === muddat)!.nom) : undefined} faol={!!muddat}>
            {(yop) => (
              <div className="tanlov">
                <div className="tanlov-bosh">
                  <b>{t('Muddat')}</b>
                  {muddat && (
                    <button type="button" className="tanlov-tozala" onClick={() => setMuddat('')}>
                      {t('Tozalash')}
                    </button>
                  )}
                </div>
                {MUDDAT.map((m) => (
                  <button
                    key={m.qiymat}
                    type="button"
                    className={`vr-variant${muddat === m.qiymat ? ' tanlangan' : ''}`}
                    onClick={() => {
                      setMuddat(m.qiymat);
                      yop();
                    }}
                  >
                    {t(m.nom)}
                  </button>
                ))}
              </div>
            )}
          </FiltrTugma>
          <FiltrTugma ikon={<Database />} nom={t('Manba')} soni={manba.length || undefined} faol={manba.length > 0}>
            {() => <TanlovRoyxat sarlavha={t('Manba')} guruhlar={[{ tanlovlar: manbaTanlov }]} tanlangan={manba} onOzgar={setManba} />}
          </FiltrTugma>
          <FiltrTugma ikon={<Filter />} nom={t('Holat')} soni={holat.length || undefined} faol={holat.length > 0}>
            {() => <TanlovRoyxat sarlavha={t('Holat')} guruhlar={[{ tanlovlar: holatTanlov }]} tanlangan={holat} onOzgar={setHolat} />}
          </FiltrTugma>
          {filtrBor && (
            <button type="button" className="vr-tozala" onClick={tozala}>
              <X /> {t('Filtrlarni tozalash')}
            </button>
          )}
        </div>
        <label className="vr-almash">
          <input type="checkbox" role="switch" checked={bajarilgan} onChange={(e) => setBajarilgan(e.target.checked)} />
          <span className="vr-almash-yol" aria-hidden="true" />
          {t("Bajarilganlarni ham ko'rsatish")}
        </label>
      </div>

      {xato && <div className="xato-qator vr-xato">{xato}</div>}
      {q.vazifaCheklangan && <div className="an-eslatma">{t("Vazifalar ko'p — ba'zi holatlar bo'yicha birinchi 200 tasi olindi.")}</div>}

      {royxat.length === 0 ? (
        <div className="vr-bosh-holat">
          <b>{filtrBor ? t("Filtrga mos vazifa yo'q") : t("Ochiq vazifa yo'q")}</b>
          <span>{filtrBor ? t("Filtrlarni o'zgartiring yoki tozalang.") : t('Hamma vazifalar bajarilgan — ajoyib.')}</span>
        </div>
      ) : (
        <div className="vr-jadval-qobiq">
          <table className="vr-jadval">
            <thead>
              <tr>
                <th>{t('Vazifa')}</th>
                <th>{t('Mijoz yoki lid')}</th>
                <th>{t('Menejer')}</th>
                <th>{t('Muddat')}</th>
                <th>{t('Holat')}</th>
                <th className="vr-amal-th">{t('Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {korinadi.map((v) => {
                const kech = kechikkanmi(v);
                const nom = v.seatId ? ism.get(v.seatId) ?? t('Menejer') : null;
                const m = mijoz(v);
                const meta = metaOl(bizId, v.id);
                const harakat = harakatNomi(meta.harakat ?? v.action);
                // Vazifa nomi, mijoz, muddat va strelka — hammasi lid tafsilotlariga olib boradi
                const lidUrl = v.conversationId ? `/lidlar/${v.conversationId}` : null;
                return (
                  <tr key={v.id} className={OCHIQ.has(v.status) ? '' : 'yopiq'}>
                    <td className="vr-vazifa">
                      <b>
                        {lidUrl ? (
                          <Link to={lidUrl} className="vr-nom-havola">
                            {v.title}
                          </Link>
                        ) : (
                          v.title
                        )}
                        {meta.muhimlik && meta.muhimlik !== 'oddiy' && (
                          <span className={`vr-muhim ${meta.muhimlik}`}>{t(MUHIMLIK.find((x) => x.qiymat === meta.muhimlik)!.nom)}</span>
                        )}
                      </b>
                      {(harakat ?? v.description) && <small>{harakat ?? v.description}</small>}
                    </td>
                    <td>{m ? <Link to={lidUrl!} className="vr-mijoz">{m}</Link> : <span className="vr-xira">—</span>}</td>
                    <td>
                      {nom ? (
                        lidUrl ? (
                          <Link to={lidUrl} className="sn-ism vr-menejer">
                            <span className="sn-avatar" style={{ background: avatarRang(v.seatId!) }}>
                              {boshHarf(nom)}
                            </span>
                            {nom}
                          </Link>
                        ) : (
                          <span className="sn-ism vr-menejer">
                            <span className="sn-avatar" style={{ background: avatarRang(v.seatId!) }}>
                              {boshHarf(nom)}
                            </span>
                            {nom}
                          </span>
                        )
                      ) : (
                        <span className="vr-xira">{t('Biriktirilmagan')}</span>
                      )}
                    </td>
                    <td>
                      {v.dueAt ? (
                        lidUrl ? (
                          <Link to={lidUrl} className={`vr-muddat havolali${kech ? ' kech' : ''}`} title={kech ? t("Muddati o'tgan — lid tafsilotlari") : t('Lid tafsilotlari')}>
                            <CalendarDays /> {muddatMatn(v.dueAt)}
                          </Link>
                        ) : (
                          <span className={`vr-muddat${kech ? ' kech' : ''}`} title={kech ? t("Muddati o'tgan") : undefined}>
                            <CalendarDays /> {muddatMatn(v.dueAt)}
                          </span>
                        )
                      ) : (
                        <span className="vr-xira">{t('Muddatsiz')}</span>
                      )}
                    </td>
                    <td>
                      <TanlovMenyu
                        qiymat={v.status}
                        variantlar={HOLAT_TANLOV.concat(v.status === 'cancelled' ? [{ qiymat: 'cancelled', nom: HOLAT.cancelled }] : []).map((x) => ({ ...x, nom: t(x.nom) }))}
                        onOzgar={(h) => void holatniOzgartir(v, h as TaskRow['status'])}
                        aria={t('{nom} — holat', { nom: v.title })}
                        ton={`vr-holat ${v.status}`}
                        kenglik={150}
                        disabled={band === v.id}
                      />
                    </td>
                    <td className="vr-amallar">
                      {boshqaraOladi && (
                        <button type="button" className="vr-amal" onClick={() => setTahrir(v)} aria-label={t('Tahrirlash')} title={t('Tahrirlash')}>
                          <Pencil />
                        </button>
                      )}
                      {v.conversationId ? (
                        <Link to={lidUrl!} className="vr-amal" aria-label={t('Lid tafsilotlari')} title={t('Lid tafsilotlari')}>
                          <ChevronRight />
                        </Link>
                      ) : (
                        <span className="vr-amal bosh" aria-hidden="true" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sahifalar > 1 && <Sahifalash joriy={sahifa} jami={sahifalar} onOt={otish} />}

      {tahrir && (
        <VazifaOyna
          vazifa={tahrir === 'yangi' ? null : tahrir}
          biz={biz}
          bizId={bizId}
          seatlar={data.seats.map((x) => ({ id: x.id, nom: x.displayName }))}
          boshMenejer={menejer.length === 1 ? menejer[0]! : ''}
          onYop={() => setTahrir(null)}
          onSaqlandi={(row) => {
            q.vazifaniYangila({ ...row, isOverdue: kechikkanmi(row) });
            setMetaVersiya((n) => n + 1);
            setTahrir(null);
          }}
        />
      )}
    </section>
  );
}

/** 1 2 3 4 5 … 22 — joriy sahifa atrofida 1 tadan, chetlar doim ko'rinadi. */
function Sahifalash({ joriy, jami, onOt }: { joriy: number; jami: number; onOt: (n: number) => void }) {
  const t = useT();
  const raqamlar: (number | '…')[] = [];
  const korsat = new Set([1, jami, joriy - 1, joriy, joriy + 1]);
  if (joriy <= 4) [2, 3, 4, 5].forEach((n) => korsat.add(n));
  if (joriy >= jami - 3) [jami - 4, jami - 3, jami - 2, jami - 1].forEach((n) => korsat.add(n));
  let oldingi = 0;
  for (let n = 1; n <= jami; n++) {
    if (!korsat.has(n)) continue;
    if (n - oldingi > 1) raqamlar.push('…');
    raqamlar.push(n);
    oldingi = n;
  }
  return (
    <nav className="vr-sahifalash" aria-label={t('Sahifalar')}>
      <button type="button" onClick={() => onOt(joriy - 1)} disabled={joriy === 1} aria-label={t('Oldingi sahifa')}>
        <ChevronLeft />
      </button>
      {raqamlar.map((n, i) =>
        n === '…' ? (
          <span key={`e${i}`} className="vr-nuqta">
            …
          </span>
        ) : (
          <button key={n} type="button" className={n === joriy ? 'faol' : ''} aria-current={n === joriy ? 'page' : undefined} onClick={() => onOt(n)}>
            {n}
          </button>
        ),
      )}
      <button type="button" onClick={() => onOt(joriy + 1)} disabled={joriy === jami} aria-label={t('Keyingi sahifa')}>
        <ChevronRight />
      </button>
    </nav>
  );
}

/** Vazifa qo'shish / tahrirlash oynasi. */
function VazifaOyna({
  vazifa,
  biz,
  bizId,
  seatlar,
  boshMenejer,
  onYop,
  onSaqlandi,
}: {
  vazifa: TaskRow | null;
  biz: string;
  bizId: string;
  seatlar: { id: string; nom: string }[];
  boshMenejer: string;
  onYop: () => void;
  onSaqlandi: (t: TaskRow) => void;
}) {
  const t = useT();
  const eskiMeta = vazifa ? metaOl(bizId, vazifa.id) : {};
  const [sarlavha, setSarlavha] = useState(vazifa?.title ?? '');
  const [tavsif, setTavsif] = useState(vazifa?.description ?? '');
  const [izoh, setIzoh] = useState(eskiMeta.izoh ?? '');
  const [seat, setSeat] = useState(vazifa ? vazifa.seatId ?? '' : boshMenejer || seatlar[0]?.id || '');
  const [harakat, setHarakat] = useState(eskiMeta.harakat ?? (vazifa ? vazifa.action ?? '' : 'follow_up'));
  const [muhimlik, setMuhimlik] = useState<Muhimlik>(eskiMeta.muhimlik ?? 'oddiy');
  const [muddat, setMuddat] = useState(inputVaqt(vazifa?.dueAt ?? null));
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const birinchi = useRef<HTMLInputElement>(null);

  useEffect(() => {
    birinchi.current?.focus();
    const esc = (e: KeyboardEvent) => {
      // Ochiq ro'yxat bo'lsa, Esc avval uni yopadi (TanlovMenyu o'zi ushlaydi)
      if (e.key === 'Escape' && !document.querySelector('.vr-oyna .och-royxat')) onYop();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onYop]);

  // Ro'yxatda yo'q eski harakat qiymati (CRM'dan kelgan) yo'qolib qolmasin
  const harakatlar = [
    ...(harakat === '' ? [{ qiymat: '', nom: t('Belgilanmagan') }] : []),
    ...HARAKATLAR.map((h) => ({ ...h, nom: t(h.nom) })),
    ...(harakat && !HARAKATLAR.some((h) => h.qiymat === harakat) ? [{ qiymat: harakat, nom: harakat }] : []),
  ];
  const tayyor = sarlavha.trim().length >= 3;

  async function saqla(e: FormEvent) {
    e.preventDefault();
    if (!tayyor) {
      setXato(t("Vazifa nomi kamida 3 belgi bo'lsin."));
      return;
    }
    setBand(true);
    setXato(null);
    const umumiy = {
      title: sarlavha.trim(),
      description: tavsif.trim() || null,
      seatId: seat || null,
      dueAt: muddat ? new Date(muddat).toISOString() : null,
    };
    try {
      // Server harakat turini faqat yaratishda qabul qiladi
      const row = vazifa
        ? await api.patch<TaskRow>(`${biz}/tasks/${vazifa.id}`, umumiy)
        : await api.post<TaskRow>(`${biz}/tasks`, { ...umumiy, action: harakat });
      const serverHarakat = vazifa ? vazifa.action ?? null : harakat;
      metaSaqla(bizId, row.id, { muhimlik, izoh, harakat: harakat && harakat !== serverHarakat ? harakat : undefined });
      onSaqlandi({ ...(vazifa ?? {}), ...row } as TaskRow);
    } catch (err) {
      setXato(err instanceof ApiError ? err.message : t('Saqlanmadi'));
    } finally {
      setBand(false);
    }
  }

  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <form className="vr-oyna" role="dialog" aria-modal="true" aria-labelledby="vr-oyna-nom" onSubmit={saqla}>
        <div className="vr-oyna-bosh">
          <h3 id="vr-oyna-nom">{vazifa ? t('Vazifani tahrirlash') : t('Yangi vazifa')}</h3>
          <button type="button" className="vr-amal" onClick={onYop} aria-label={t('Yopish')}>
            <X />
          </button>
        </div>
        <div className="maydon-blok">
          <label htmlFor="vr-nom">{t('Vazifa nomi')}</label>
          <input id="vr-nom" ref={birinchi} className="input" value={sarlavha} onChange={(e) => setSarlavha(e.target.value)} placeholder={t("Masalan: mijozga qayta qo'ng'iroq qilish")} maxLength={300} />
        </div>
        <div className="vr-oyna-ikki">
          <div className="maydon-blok">
            <label htmlFor="vr-seat">{t('Menejer')}</label>
            <TanlovMenyu
              id="vr-seat"
              qiymat={seat}
              variantlar={[...seatlar.map((s) => ({ qiymat: s.id, nom: s.nom })), { qiymat: '', nom: t('Biriktirilmagan') }]}
              onOzgar={setSeat}
              aria={t('Menejer')}
              kenglik="100%"
            />
          </div>
          <div className="maydon-blok">
            <label htmlFor="vr-harakat">{t('Harakat turi')}</label>
            <TanlovMenyu id="vr-harakat" qiymat={harakat} variantlar={harakatlar} onOzgar={setHarakat} aria={t('Harakat turi')} kenglik="100%" />
          </div>
          <div className="maydon-blok">
            <label htmlFor="vr-muddat">{t('Muddat')}</label>
            <input id="vr-muddat" type="datetime-local" className="input" value={muddat} onChange={(e) => setMuddat(e.target.value)} />
          </div>
          <div className="maydon-blok">
            <label htmlFor="vr-muhim">{t('Muhimlik')}</label>
            <TanlovMenyu
              id="vr-muhim"
              qiymat={muhimlik}
              variantlar={MUHIMLIK.map((m) => ({ ...m, nom: t(m.nom) }))}
              onOzgar={(v) => setMuhimlik(v as Muhimlik)}
              aria={t('Muhimlik')}
              ton={`vr-muhim-tugma ${muhimlik}`}
              kenglik="100%"
            />
          </div>
        </div>
        <div className="maydon-blok">
          <label htmlFor="vr-tavsif">{t('Tavsif')}</label>
          <textarea id="vr-tavsif" value={tavsif} onChange={(e) => setTavsif(e.target.value)} rows={3} maxLength={2000} placeholder={t('Nima qilish kerak — mijozga nimani aytish, nimani yuborish')} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="vr-izoh">{t('Izoh')}</label>
          <textarea id="vr-izoh" value={izoh} onChange={(e) => setIzoh(e.target.value)} rows={2} maxLength={1000} placeholder={t('Ichki eslatma — masalan, mijoz kechqurun javob beradi')} />
        </div>
        <small className="vr-oyna-eslatma">{t('Muhimlik va izoh hozircha faqat shu brauzerda saqlanadi.')}</small>
        {xato && <div className="xato-qator">{xato}</div>}
        <div className="vr-oyna-past">
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor qilish')}
          </button>
          <button type="submit" className="btn" disabled={band || !tayyor}>
            {band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
