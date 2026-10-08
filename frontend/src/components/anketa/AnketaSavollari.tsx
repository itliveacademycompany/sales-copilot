import { ArrowDown, ArrowUp, CalendarDays, CircleCheck, Hash, ListChecks, MessageCircleQuestion, Pencil, PieChart, Plus, Save, Trash2, TriangleAlert, Type, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type PlaybookBody, type PlaybookVersion } from '../../api';
import { useAuth } from '../../auth';
import { TanlovMenyu } from '../analitika/Ochiluvchi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → ANKETA SAVOLLARI (FR-28)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Server savol uchun faqat `answerType: boolean | text | number | date`
 * saqlaydi. Ro'yxat variantlari, «mijoz savollari» va xizmat yo'nalishiga
 * bog'lash uchun alohida maydon yo'q — lekin AI savolning MATNINI o'qiydi.
 * Shuning uchun ular savol matni oxiriga o'qiladigan belgilar sifatida
 * yoziladi:  «… [Yo'nalish: IT Kids] [Variantlar: A; B; C]»
 * va bu yerda qayta ajratib ko'rsatiladi. AI ularni matndan tushunadi.
 */

type ServerTur = 'boolean' | 'text' | 'number' | 'date';
type Tur = ServerTur | 'list' | 'client_questions';
type ServerSavol = PlaybookBody['questionnaire']['questions'][number];

interface Savol {
  id: string;
  matn: string;
  tur: Tur;
  variantlar: string[];
  yonalish: string | null;
  majburiy: boolean;
}

const TURLAR: { k: Tur; nom: string; ikon: ReactNode; ton: string }[] = [
  { k: 'client_questions', nom: "Mijoz savollari (avtomatik ro'yxat)", ikon: <MessageCircleQuestion />, ton: 'info' },
  { k: 'boolean', nom: "Ha/Yo'q", ikon: <CircleCheck />, ton: 'yaxshi' },
  { k: 'text', nom: 'Matn', ikon: <Type />, ton: '' },
  { k: 'number', nom: 'Raqam', ikon: <Hash />, ton: '' },
  { k: 'list', nom: "Ro'yxat", ikon: <PieChart />, ton: 'info' },
  { k: 'date', nom: 'Sana', ikon: <CalendarDays />, ton: '' },
];
const TUR = Object.fromEntries(TURLAR.map((t) => [t.k, t])) as Record<Tur, (typeof TURLAR)[number]>;
const QISQA_NOM: Partial<Record<Tur, string>> = { client_questions: 'Mijoz savollari' };

const MIJOZ_BELGI = "[Mijoz savollari ro'yxati]";
const MAKS = 300;

/** Server savolidan — belgilarni ajratib olish. */
function oqi(q: ServerSavol): Savol {
  let matn = q.question;
  let yonalish: string | null = null;
  let variantlar: string[] = [];
  let tur: Tur = q.answerType as ServerTur;
  const yon = matn.match(/\s*\[Yo'nalish:\s*([^\]]+)\]/);
  if (yon) {
    yonalish = yon[1]!.trim();
    matn = matn.replace(yon[0], '');
  }
  const v = matn.match(/\s*\[Variantlar:\s*([^\]]+)\]/);
  if (v) {
    variantlar = v[1]!.split(';').map((s) => s.trim()).filter(Boolean);
    matn = matn.replace(v[0], '');
    tur = 'list';
  }
  if (matn.includes(MIJOZ_BELGI)) {
    matn = matn.replace(MIJOZ_BELGI, '');
    tur = 'client_questions';
  }
  return { id: q.id, matn: matn.trim(), tur, variantlar, yonalish, majburiy: q.required };
}

/** Saqlash uchun — belgilarni matnga qaytarish. */
function yoz(s: Savol): ServerSavol {
  const qism = [s.matn.trim()];
  if (s.yonalish) qism.push(`[Yo'nalish: ${s.yonalish}]`);
  if (s.tur === 'list' && s.variantlar.length) qism.push(`[Variantlar: ${s.variantlar.join('; ')}]`);
  if (s.tur === 'client_questions') qism.push(MIJOZ_BELGI);
  const answerType: ServerTur = s.tur === 'list' || s.tur === 'client_questions' ? 'text' : s.tur;
  return { id: s.id, question: qism.join(' '), answerType, required: s.majburiy };
}
const uzunlik = (s: Savol) => yoz(s).question.length;

const tozaBody = (p: PlaybookBody): PlaybookBody => ({
  criteria: p.criteria,
  questionnaire: p.questionnaire,
  classificationPolicy: p.classificationPolicy,
  promptNotes: p.promptNotes,
  leadQuality: p.leadQuality ?? {},
});

const sanaVaqt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const n = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}.${n(d.getMonth() + 1)}.${n(d.getDate())}, ${n(d.getHours())}:${n(d.getMinutes())}`;
};

type Korinish = '*' | '' | string; // '*' — hammasi, '' — asosiy, aks holda yo'nalish

export function AnketaSavollari() {
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yozaOladi = business?.permissions.includes('playbook:write') ?? false;

  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [asl, setAsl] = useState<Savol[]>([]);
  const [savollar, setSavollar] = useState<Savol[]>([]);
  const [versiya, setVersiya] = useState<PlaybookVersion | null>(null);
  const [yoq, setYoq] = useState(false);
  const [korinish, setKorinish] = useState<Korinish>('*');
  const [oyna, setOyna] = useState<{ savol: Savol | null } | null>(null);
  const [holat, setHolat] = useState<'tinch' | 'ketmoqda'>('tinch');
  const [xabar, setXabar] = useState<{ ton: 'ok' | 'xato'; matn: string } | null>(null);

  const yukla = useCallback(async () => {
    if (!base) return;
    try {
      const [p, vs] = await Promise.all([api.get<PlaybookBody>(`${base}/playbook`), api.get<PlaybookVersion[]>(`${base}/playbook/versions`).catch(() => [])]);
      const t = tozaBody(p);
      const s = t.questionnaire.questions.map(oqi);
      setPb(t);
      setAsl(s);
      setSavollar(s);
      setVersiya(vs.find((v) => v.isActive) ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setYoq(true);
      else setXabar({ ton: 'xato', matn: "Anketani yuklab bo'lmadi" });
    }
  }, [base]);
  useEffect(() => void yukla(), [yukla]);

  const ozgargan = JSON.stringify(savollar) !== JSON.stringify(asl);
  useEffect(() => {
    if (!ozgargan) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [ozgargan]);

  const yonalishlar = useMemo(() => {
    const s = new Set(pb?.classificationPolicy.serviceLines ?? []);
    // Playbookdan olib tashlangan yo'nalishga bog'langan savollar ham ko'rinsin
    for (const q of savollar) if (q.yonalish) s.add(q.yonalish);
    return [...s];
  }, [pb, savollar]);

  const xatolar = useMemo(() => {
    const x: string[] = [];
    for (const s of savollar) {
      if (s.matn.trim().length < 5) x.push(`«${s.matn || s.id}» — savol matni kamida 5 belgi`);
      if (uzunlik(s) > MAKS) x.push(`«${s.matn.slice(0, 40)}…» — juda uzun (variantlar bilan ${uzunlik(s)}/${MAKS})`);
      if (s.tur === 'list' && s.variantlar.length < 2) x.push(`«${s.matn.slice(0, 40)}» — ro'yxatda kamida 2 variant kerak`);
    }
    return x;
  }, [savollar]);

  if (yoq)
    return (
      <section className="card bm-karta bm-bosh-holat">
        <ListChecks />
        <b>Playbook hali yaratilmagan</b>
        <span>Anketa savollari playbook bilan birga onboarding jarayonida yaratiladi.</span>
      </section>
    );
  if (!pb) return <div className="card skelet" style={{ height: 420 }} aria-busy="true" />;

  const bildir = (ton: 'ok' | 'xato', matn: string) => {
    setXabar({ ton, matn });
    setTimeout(() => setXabar((x) => (x?.matn === matn ? null : x)), 3500);
  };

  async function saqla() {
    if (!pb) return;
    setHolat('ketmoqda');
    try {
      const body = tozaBody({ ...pb, questionnaire: { ...pb.questionnaire, questions: savollar.map(yoz) } });
      const v = await api.post<{ valid: boolean; errors?: Record<string, string[]> }>(`${base}/playbook/validate`, body);
      if (!v.valid) {
        bildir('xato', Object.values(v.errors ?? {}).flat()[0] ?? 'Server tekshiruvi xato topdi');
        return;
      }
      await api.post(`${base}/playbook`, { ...body, changeNote: 'Anketa savollari yangilandi' });
      await yukla();
      bildir('ok', 'Saqlandi — yangi versiya faollashtirildi');
    } catch (e) {
      bildir('xato', e instanceof ApiError ? e.message : "Saqlanmadi — qayta urinib ko'ring");
    } finally {
      setHolat('tinch');
    }
  }

  const tahrirlanadimi = (s: Savol) => yozaOladi && korinish !== '*' && (korinish === '' ? !s.yonalish : s.yonalish === korinish);
  const korinadimi = (s: Savol) => korinish === '*' || !s.yonalish || s.yonalish === korinish;
  const guruhlar: { nom: string; kalit: string; savollar: Savol[] }[] = [
    { nom: 'Asosiy', kalit: '', savollar: savollar.filter((s) => !s.yonalish) },
    ...yonalishlar.map((y) => ({ nom: y, kalit: y, savollar: savollar.filter((s) => s.yonalish === y) })),
  ].filter((g) => g.savollar.length > 0 && (korinish === '*' || g.kalit === '' || g.kalit === korinish));
  const korinadiganSoni = savollar.filter(korinadimi).length;

  const surish = (id: string, d: -1 | 1) =>
    setSavollar((arr) => {
      // Faqat bir guruh ichida suriladi
      const s = arr.find((x) => x.id === id)!;
      const guruh = arr.filter((x) => x.yonalish === s.yonalish);
      const i = guruh.indexOf(s);
      const qoshni = guruh[i + d];
      if (!qoshni) return arr;
      const a = arr.indexOf(s);
      const b = arr.indexOf(qoshni);
      const yangi = [...arr];
      [yangi[a], yangi[b]] = [yangi[b]!, yangi[a]!];
      return yangi;
    });

  const korinishVariantlari = [
    { qiymat: '*', nom: 'Hammasi' },
    { qiymat: '', nom: 'Asosiy' },
    ...yonalishlar.map((y) => ({ qiymat: y, nom: `Asosiy + ${y}` })),
  ];

  return (
    <div className="as">
      <section className="card as-karta">
        <h2 className="as-sarlavha">Anketa savollari</h2>
        <div className="as-meta">
          {versiya && <span className="bm-versiya">Versiya {versiya.version}</span>}
          <span>Yangilangan: {sanaVaqt(versiya?.activatedAt ?? versiya?.createdAt)}</span>
          {ozgargan && <span className="bm-qoralama">Saqlanmagan o'zgarishlar</span>}
        </div>
        <div className="as-diqqat">
          <TriangleAlert aria-hidden="true" />
          <span>
            Bu sozlamalar AI qo'ng'iroqlar va lidlarni qanday tahlil qilishiga ta'sir qiladi. Katta o'zgarishdan oldin bir nechta suhbatda natijani
            solishtirib ko'ring.
          </span>
        </div>
      </section>

      <section className="card as-karta">
        <div className="as-bosh">
          <div>
            <h3>Anketa savollari</h3>
            <p>Hammasi ko'rinishi faqat ko'rish uchun. O'z savollarini tahrirlash uchun Asosiy yoki Asosiy + xizmat yo'nalishini tanlang.</p>
          </div>
          {yozaOladi && (
            <div className="as-bosh-amal">
              {ozgargan && (
                <button type="button" className="btn ikkinchi" onClick={() => window.confirm("O'zgarishlar bekor qilinsinmi?") && setSavollar(asl)}>
                  Bekor qilish
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={!ozgargan || xatolar.length > 0 || holat === 'ketmoqda'}
                title={!ozgargan ? "O'zgarish yo'q" : xatolar[0]}
                onClick={() => void saqla()}
              >
                <Save /> {holat === 'ketmoqda' ? 'Saqlanmoqda…' : "O'zgarishlarni saqlash"}
              </button>
            </div>
          )}
        </div>
        <div className="as-filtr">
          <div className="maydon-blok">
            <label htmlFor="as-korinish">Xizmat yo'nalishi</label>
            <TanlovMenyu id="as-korinish" aria="Xizmat yo'nalishi" qiymat={korinish} variantlar={korinishVariantlari} onOzgar={setKorinish} kenglik={420} />
          </div>
          {yozaOladi && (
            <button type="button" className="btn ikkinchi as-qoshish" onClick={() => setOyna({ savol: null })}>
              <Plus /> Savol qo'shish
            </button>
          )}
        </div>
        {xabar && (
          <div className={`bm-xabar as-xabar ${xabar.ton}`} role={xabar.ton === 'xato' ? 'alert' : 'status'}>
            {xabar.ton === 'ok' ? <CircleCheck /> : <TriangleAlert />} {xabar.matn}
          </div>
        )}
        {xatolar.length > 0 && (
          <ul className="bm-xatolar as-xatolar">
            {xatolar.map((x) => (
              <li key={x}>
                <TriangleAlert /> {x}
              </li>
            ))}
          </ul>
        )}
      </section>

      {korinadiganSoni === 0 ? (
        <div className="card bn-bosh-holat as-bosh">
          {savollar.length === 0 ? "Hali savol yo'q — «Savol qo'shish» orqali birinchisini qo'shing." : "Bu ko'rinishda savol yo'q."}
        </div>
      ) : (
        guruhlar.map((g) => (
          <div key={g.kalit || '_asosiy'} className="as-guruh">
            <span className="as-guruh-nom">
              {g.nom} <small>{g.savollar.length}</small>
            </span>
            <ul className="as-royxat">
              {g.savollar.map((s, i) => {
                const t = TUR[s.tur];
                const tahrir = tahrirlanadimi(s);
                return (
                  <li key={s.id} className={`as-savol${!tahrir && korinish !== '*' ? ' faqat-oqish' : ''}`}>
                    <span className="as-ikon" aria-hidden="true">
                      {t.ikon}
                    </span>
                    <div className="as-matn">
                      <div className="as-teglar">
                        <span className={`as-teg ${t.ton}`}>{QISQA_NOM[s.tur] ?? t.nom}</span>
                        <span className="as-teg">{s.yonalish ?? 'Asosiy'}</span>
                        {s.majburiy && <span className="as-teg orta">Majburiy</span>}
                      </div>
                      <b>{s.matn}</b>
                      {s.tur === 'list' && s.variantlar.length > 0 && <small>Variantlar: {s.variantlar.join(', ')}</small>}
                      {s.tur === 'client_questions' && <small>AI suhbatdan mijoz bergan savollarni ro'yxat qilib yig'adi</small>}
                    </div>
                    {tahrir && (
                      <div className="as-amallar">
                        <button type="button" className="bm-ikon" aria-label="Yuqoriga" title="Yuqoriga" disabled={i === 0} onClick={() => surish(s.id, -1)}>
                          <ArrowUp />
                        </button>
                        <button type="button" className="bm-ikon" aria-label="Pastga" title="Pastga" disabled={i === g.savollar.length - 1} onClick={() => surish(s.id, 1)}>
                          <ArrowDown />
                        </button>
                        <button type="button" className="bm-ikon" aria-label="Tahrirlash" title="Tahrirlash" onClick={() => setOyna({ savol: s })}>
                          <Pencil />
                        </button>
                        <button
                          type="button"
                          className="bm-ikon xavf"
                          aria-label="O'chirish"
                          title="O'chirish"
                          onClick={() => window.confirm(`«${s.matn}» savoli o'chirilsinmi?`) && setSavollar((arr) => arr.filter((x) => x.id !== s.id))}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      {oyna && (
        <SavolOynasi
          savol={oyna.savol}
          boshYonalish={korinish === '*' || korinish === '' ? null : korinish}
          yonalishlar={yonalishlar}
          band={new Set(savollar.map((s) => s.id))}
          onYop={() => setOyna(null)}
          onSaqla={(s) => {
            setSavollar((arr) => (oyna.savol ? arr.map((x) => (x.id === oyna.savol!.id ? s : x)) : [...arr, s]));
            setOyna(null);
            bildir('ok', oyna.savol ? 'Savol yangilandi — saqlashni unutmang' : "Savol qo'shildi — saqlashni unutmang");
          }}
        />
      )}
    </div>
  );
}

// ─── Savol qo'shish / tahrirlash oynasi ─────────────────────────────────────

function SavolOynasi({
  savol,
  boshYonalish,
  yonalishlar,
  band,
  onYop,
  onSaqla,
}: {
  savol: Savol | null;
  boshYonalish: string | null;
  yonalishlar: string[];
  band: Set<string>;
  onYop: () => void;
  onSaqla: (s: Savol) => void;
}) {
  const [yonalish, setYonalish] = useState(savol?.yonalish ?? boshYonalish ?? '');
  const [matn, setMatn] = useState(savol?.matn ?? '');
  const [tur, setTur] = useState<Tur>(savol?.tur ?? 'text');
  const [variantlar, setVariantlar] = useState<string[]>(savol?.variantlar ?? []);
  const [yangiVariant, setYangiVariant] = useState('');
  const [majburiy, setMajburiy] = useState(savol?.majburiy ?? false);
  const [urindi, setUrindi] = useState(false);

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYop]);

  const id = savol?.id ?? (() => {
    for (let n = band.size + 1; ; n++) if (!band.has(`q${n}`)) return `q${n}`;
  })();
  const joriy: Savol = { id, matn, tur, variantlar, yonalish: yonalish || null, majburiy };
  const uz = uzunlik(joriy);
  const xato =
    matn.trim().length < 5 ? 'Savol matni kamida 5 belgi' : tur === 'list' && variantlar.length < 2 ? "Kamida 2 ta variant qo'shing" : uz > MAKS ? `Juda uzun: ${uz}/${MAKS} belgi (variantlar bilan)` : null;

  const variantQosh = () => {
    const v = yangiVariant.trim().replace(/[;\]\[]/g, '');
    if (v && !variantlar.includes(v)) setVariantlar((a) => [...a, v]);
    setYangiVariant('');
  };

  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <form
        className="vr-oyna as-oyna"
        role="dialog"
        aria-modal="true"
        aria-labelledby="as-oyna-nom"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setUrindi(true);
          if (!xato) onSaqla({ ...joriy, matn: matn.trim() });
        }}
      >
        <div className="vr-oyna-bosh">
          <h3 id="as-oyna-nom">{savol ? 'Savolni tahrirlash' : "Savol qo'shish"}</h3>
          <button type="button" className="mj-yop" onClick={onYop} aria-label="Yopish">
            <X />
          </button>
        </div>
        <div className="maydon-blok">
          <label htmlFor="as-yonalish">Qayerda ko'rinsin</label>
          <TanlovMenyu
            id="as-yonalish"
            aria="Qayerda ko'rinsin"
            qiymat={yonalish}
            variantlar={[{ qiymat: '', nom: 'Asosiy' }, ...yonalishlar.map((y) => ({ qiymat: y, nom: `Asosiy + ${y}` }))]}
            onOzgar={setYonalish}
            kenglik="100%"
          />
          <div className="yordam">{yonalish ? `Faqat «${yonalish}» yo'nalishidagi suhbatlarda so'raladi.` : "Barcha suhbatlarda so'raladi."}</div>
        </div>
        <div className="maydon-blok">
          <label htmlFor="as-matn">Savol matni</label>
          <input id="as-matn" value={matn} onChange={(e) => setMatn(e.target.value)} placeholder="Savol matni" maxLength={MAKS} autoFocus aria-invalid={urindi && matn.trim().length < 5} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="as-tur">Savol turi</label>
          <TanlovMenyu id="as-tur" aria="Savol turi" qiymat={tur} variantlar={TURLAR.map((t) => ({ qiymat: t.k, nom: t.nom }))} onOzgar={(v) => setTur(v as Tur)} kenglik="100%" />
          {tur === 'client_questions' && <div className="yordam">AI suhbatda mijoz bergan savollarni ro'yxat qilib yig'adi.</div>}
        </div>
        {tur === 'list' && (
          <div className="maydon-blok">
            <label htmlFor="as-variant">Variantlar</label>
            <div className="as-variantlar">
              {variantlar.map((v) => (
                <span key={v} className="as-variant">
                  {v}
                  <button type="button" aria-label={`${v} variantini olib tashlash`} onClick={() => setVariantlar((a) => a.filter((x) => x !== v))}>
                    <X />
                  </button>
                </span>
              ))}
              <input
                id="as-variant"
                value={yangiVariant}
                onChange={(e) => setYangiVariant(e.target.value)}
                onKeyDown={(e: RKeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    variantQosh();
                  } else if (e.key === 'Backspace' && !yangiVariant && variantlar.length) setVariantlar((a) => a.slice(0, -1));
                }}
                onBlur={variantQosh}
                placeholder={variantlar.length ? "Yana variant…" : 'Variant yozib Enter bosing'}
                maxLength={60}
              />
            </div>
          </div>
        )}
        <label className="as-majburiy">
          <input type="checkbox" checked={majburiy} onChange={(e) => setMajburiy(e.target.checked)} />
          <span>
            <b>Majburiy savol</b>
            <small>AI javobni har suhbatda qidiradi; topilmasa «aniqlanmadi» deb belgilaydi</small>
          </span>
        </label>
        <div className={`yordam as-hisob${uz > MAKS ? ' bzl-xato' : ''}`}>
          {uz}/{MAKS} belgi{tur === 'list' || yonalish || tur === 'client_questions' ? " — variantlar va yo'nalish savol matniga qo'shib saqlanadi, AI ularni shu matndan o'qiydi" : ''}
        </div>
        {urindi && xato && <div className="yordam bzl-xato">{xato}</div>}
        <div className="vr-oyna-past">
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            Bekor qilish
          </button>
          <button type="submit" className="btn" disabled={urindi && !!xato}>
            Saqlash
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
