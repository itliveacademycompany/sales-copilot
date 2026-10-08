import { ArrowDown, ArrowUp, Box, CircleCheck, Pencil, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type PlaybookBody, type PlaybookVersion } from '../../api';
import { useAuth } from '../../auth';
import { BloklashIzohi, bosQolganBosqichlar } from '../oilalar/QongiroqOilalari';
import { BLOK_BOSH as BOSH, BLOK_OXIR as OXIR, kontekstniAjrat, kontekstniYig } from './kontekstBlok';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → XIZMAT YO'NALISHLARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Serverda yo'nalish — faqat NOM (`classificationPolicy.serviceLines`).
 * Nom mezon/anketa filtrlari va analitikada aynan solishtiriladi, shuning
 * uchun unga hech narsa qo'shilmaydi.
 *
 * Tavsif, aliaslar va namuna iboralar AI'ga «BIZNES KONTEKSTI» orqali
 * yetadi: `promptNotes.stage2.businessContext` ichida shu bo'lim
 * boshqaradigan alohida blok bor. Blokdan tashqaridagi matn (AI
 * ko'rsatmalari bo'limida yozilgan) o'zgarmaydi.
 */

interface Yonalish {
  nom: string;
  tavsif: string;
  aliaslar: string[];
  iboralar: string[];
}

const KONTEKST_MAKS = 3000;
const NOM_MAKS = 120;

const toza = (s: string) => s.replace(/[|;\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

/** Biznes kontekstidan blokni ajratish: [blokdan tashqari matn, yo'nalish ma'lumotlari]. */
function blokniOqi(matn: string, nomlar: string[]): [string, Map<string, Omit<Yonalish, 'nom'>>] {
  const m = new Map<string, Omit<Yonalish, 'nom'>>();
  const [tashqi, blok] = kontekstniAjrat(matn);
  if (!blok) return [matn, m];
  const ichi = blok.slice(BOSH.length, blok.length - OXIR.length);
  for (const qator of ichi.split('\n')) {
    // Nomlarni uzunidan boshlab tekshiramiz — biri ikkinchisining boshi bo'lsa ham to'g'ri topilsin
    const nom = [...nomlar].sort((x, y) => y.length - x.length).find((n) => qator.startsWith(`- ${n}: `) || qator === `- ${n}:`);
    if (!nom) continue;
    const [tavsif = '', ...qism] = qator.slice(`- ${nom}:`.length).split(' | ');
    const ol = (k: string) => (qism.find((q) => q.startsWith(k))?.slice(k.length) ?? '').split(';').map((s) => s.trim()).filter(Boolean);
    m.set(nom, { tavsif: tavsif.trim(), aliaslar: ol('Aliaslar: '), iboralar: ol('Namuna iboralar: ') });
  }
  return [tashqi, m];
}

function blokniYoz(tashqi: string, ys: Yonalish[]): string {
  const qatorlar = ys
    .filter((y) => y.tavsif || y.aliaslar.length || y.iboralar.length)
    .map((y) => {
      const q = [`- ${y.nom}: ${toza(y.tavsif)}`];
      if (y.aliaslar.length) q.push(`Aliaslar: ${y.aliaslar.map(toza).join('; ')}`);
      if (y.iboralar.length) q.push(`Namuna iboralar: ${y.iboralar.map(toza).join('; ')}`);
      return q.join(' | ');
    });
  if (!qatorlar.length) return tashqi.trim();
  const blok = [BOSH, "Suhbat qaysi yo'nalishga tegishli ekanini aniqlashda quyidagi tavsif, muqobil nomlar va namuna iboralardan foydalan:", ...qatorlar, OXIR].join('\n');
  return kontekstniYig(tashqi, blok);
}

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
const yonBelgi = (n: string) => `[Yo'nalish: ${n}]`;

export function XizmatYonalishlari() {
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yozaOladi = business?.permissions.includes('playbook:write') ?? false;

  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [versiya, setVersiya] = useState<PlaybookVersion | null>(null);
  const [yoq, setYoq] = useState(false);
  const [tartib, setTartib] = useState<string[] | null>(null); // saqlanmagan tartib
  const [oyna, setOyna] = useState<{ tur: 'forma'; y: Yonalish | null } | { tur: 'ochir'; y: Yonalish } | null>(null);
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ ton: 'ok' | 'xato'; matn: string } | null>(null);

  const yukla = useCallback(async () => {
    if (!base) return;
    try {
      const [p, vs] = await Promise.all([api.get<PlaybookBody>(`${base}/playbook`), api.get<PlaybookVersion[]>(`${base}/playbook/versions`).catch(() => [])]);
      setPb(tozaBody(p));
      setVersiya(vs.find((v) => v.isActive) ?? null);
      setTartib(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setYoq(true);
      else setXabar({ ton: 'xato', matn: "Ma'lumotni yuklab bo'lmadi" });
    }
  }, [base]);
  useEffect(() => void yukla(), [yukla]);

  const [tashqi, meta] = useMemo(() => (pb ? blokniOqi(pb.promptNotes.stage2.businessContext ?? '', pb.classificationPolicy.serviceLines) : ['', new Map()]), [pb]);
  const yonalishlar: Yonalish[] = useMemo(
    () => (tartib ?? pb?.classificationPolicy.serviceLines ?? []).map((nom) => ({ nom, tavsif: '', aliaslar: [], iboralar: [], ...meta.get(nom) })),
    [pb, meta, tartib],
  );

  if (yoq)
    return (
      <section className="card bm-karta bm-bosh-holat">
        <Box />
        <b>Playbook hali yaratilmagan</b>
        <span>Xizmat yo'nalishlari playbook bilan birga onboarding jarayonida yaratiladi.</span>
      </section>
    );
  if (!pb) return <div className="card skelet" style={{ height: 380 }} aria-busy="true" />;

  const bildir = (ton: 'ok' | 'xato', matn: string) => {
    setXabar({ ton, matn });
    setTimeout(() => setXabar((x) => (x?.matn === matn ? null : x)), 3500);
  };

  /** Yangi ro'yxatni (va bog'liq o'zgarishlarni) yangi versiya sifatida nashr qiladi. */
  async function nashr(ys: Yonalish[], ozgartir: (p: PlaybookBody) => PlaybookBody, izoh: string, muvaffaqiyat: string) {
    if (!pb) return false;
    setBand(true);
    try {
      const kontekst = blokniYoz(tashqi, ys);
      if (kontekst.length > KONTEKST_MAKS) {
        bildir('xato', `Biznes konteksti ${KONTEKST_MAKS} belgidan oshib ketadi (${kontekst.length}). Iboralar yoki tavsifni qisqartiring.`);
        return false;
      }
      const yangi = ozgartir({
        ...pb,
        classificationPolicy: { ...pb.classificationPolicy, serviceLines: ys.map((y) => y.nom) },
        promptNotes: { ...pb.promptNotes, stage2: { ...pb.promptNotes.stage2, businessContext: kontekst } },
      });
      const body = tozaBody(yangi);
      const v = await api.post<{ valid: boolean; errors?: Record<string, string[]> }>(`${base}/playbook/validate`, body);
      if (!v.valid) {
        bildir('xato', Object.values(v.errors ?? {}).flat()[0] ?? 'Server tekshiruvi xato topdi');
        return false;
      }
      await api.post(`${base}/playbook`, { ...body, changeNote: izoh });
      await yukla();
      bildir('ok', muvaffaqiyat);
      return true;
    } catch (e) {
      bildir('xato', e instanceof ApiError ? e.message : "Saqlanmadi — qayta urinib ko'ring");
      return false;
    } finally {
      setBand(false);
    }
  }

  /** Nom o'zgarganda — mezon filtrlari va anketa belgilarida ham yangilash. */
  const nomniAlmashtir = (eski: string, yangi: string) => (p: PlaybookBody): PlaybookBody =>
    eski === yangi
      ? p
      : {
          ...p,
          criteria: {
            ...p.criteria,
            criteria: p.criteria.criteria.map((c) => ({
              ...c,
              appliesTo: { ...c.appliesTo, serviceLines: c.appliesTo.serviceLines.map((s) => (s === eski ? yangi : s)) },
            })),
          },
          questionnaire: {
            ...p.questionnaire,
            questions: p.questionnaire.questions.map((q) => ({ ...q, question: q.question.split(yonBelgi(eski)).join(yonBelgi(yangi)) })),
          },
        };

  /** O'chirilgandan keyingi o'zgarish: faqat shu yo'nalishga bog'langan mezon «hammaga» aylanib ketmasin — nofaol qilinadi. */
  const ochirishOzgarishi = (nom: string) => (p: PlaybookBody): PlaybookBody => ({
    ...p,
    criteria: {
      ...p.criteria,
      criteria: p.criteria.criteria.map((c) => {
        if (!c.appliesTo.serviceLines.includes(nom)) return c;
        const qolgan = c.appliesTo.serviceLines.filter((s) => s !== nom);
        return qolgan.length ? { ...c, appliesTo: { ...c.appliesTo, serviceLines: qolgan } } : { ...c, isActive: false };
      }),
    },
    questionnaire: { ...p.questionnaire, questions: p.questionnaire.questions.filter((q) => !q.question.includes(yonBelgi(nom))) },
  });

  const boglanish = (nom: string) => ({
    mezonlar: pb.criteria.criteria.filter((c) => c.appliesTo.serviceLines.includes(nom)).length,
    savollar: pb.questionnaire.questions.filter((q) => q.question.includes(yonBelgi(nom))).length,
  });

  const sur = (i: number, d: -1 | 1) => {
    const t = yonalishlar.map((y) => y.nom);
    const j = i + d;
    if (j < 0 || j >= t.length) return;
    [t[i], t[j]] = [t[j]!, t[i]!];
    setTartib(JSON.stringify(t) === JSON.stringify(pb.classificationPolicy.serviceLines) ? null : t);
  };

  return (
    <div className="as">
      <section className="card as-karta">
        <h2 className="as-sarlavha">Xizmat yo'nalishlari</h2>
        <div className="as-meta">
          {versiya && <span className="bm-versiya">Versiya {versiya.version}</span>}
          <span>Yangilangan: {sanaVaqt(versiya?.activatedAt ?? versiya?.createdAt)}</span>
        </div>
        <div className="as-diqqat">
          <TriangleAlert aria-hidden="true" />
          <span>
            Bu sozlamalar AI qo'ng'iroqlar va lidlarni qanday tahlil qilishiga ta'sir qiladi. Har bir saqlash yangi playbook versiyasini yaratadi —
            eski baholar o'zgarmaydi.
          </span>
        </div>
      </section>

      <section className="card as-karta">
        <div className="as-bosh">
          <div>
            <h3>Xizmat yo'nalishlari</h3>
            <p>AI qo'ng'iroqni to'g'ri yo'naltirishi uchun biznesingizdagi asosiy xizmat yo'nalishlarini kiriting va tartibga soling.</p>
          </div>
          {yozaOladi && (
            <div className="as-bosh-amal">
              {tartib && (
                <>
                  <button type="button" className="btn ikkinchi" onClick={() => setTartib(null)} disabled={band}>
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    className="btn ikkinchi"
                    disabled={band}
                    onClick={() => void nashr(yonalishlar, (p) => p, "Xizmat yo'nalishlari tartibi o'zgartirildi", 'Tartib saqlandi')}
                  >
                    Tartibni saqlash
                  </button>
                </>
              )}
              <button type="button" className="btn" onClick={() => setOyna({ tur: 'forma', y: null })} disabled={band}>
                <Plus /> Xizmat yo'nalishi qo'shish
              </button>
            </div>
          )}
        </div>
        <div className="xy-soni">{yonalishlar.length ? `${yonalishlar.length} ta xizmat yo'nalishi sozlangan` : "Hali xizmat yo'nalishi kiritilmagan"}</div>
        {xabar && (
          <div className={`bm-xabar as-xabar ${xabar.ton}`} role={xabar.ton === 'xato' ? 'alert' : 'status'}>
            {xabar.ton === 'ok' ? <CircleCheck /> : <TriangleAlert />} {xabar.matn}
          </div>
        )}
      </section>

      {yonalishlar.length > 0 && (
        <section className="card xy-royxat" aria-busy={band}>
          {yonalishlar.map((y, i) => (
            <article key={y.nom} className="xy-yonalish">
              <div className="xy-bosh">
                <h3>{y.nom}</h3>
                {yozaOladi && (
                  <div className="xy-amallar">
                    <button type="button" className="bm-ikon" aria-label="Yuqoriga" title="Yuqoriga" disabled={i === 0 || band} onClick={() => sur(i, -1)}>
                      <ArrowUp />
                    </button>
                    <button type="button" className="bm-ikon" aria-label="Pastga" title="Pastga" disabled={i === yonalishlar.length - 1 || band} onClick={() => sur(i, 1)}>
                      <ArrowDown />
                    </button>
                    <button type="button" className="bm-ikon" aria-label={`${y.nom} — tahrirlash`} title="Tahrirlash" disabled={band || !!tartib} onClick={() => setOyna({ tur: 'forma', y })}>
                      <Pencil />
                    </button>
                    <button type="button" className="bm-ikon xavf" aria-label={`${y.nom} — o'chirish`} title="O'chirish" disabled={band || !!tartib} onClick={() => setOyna({ tur: 'ochir', y })}>
                      <Trash2 />
                    </button>
                  </div>
                )}
              </div>
              <p className={y.tavsif ? 'xy-tavsif' : 'xy-tavsif bosh'}>{y.tavsif || 'Tavsif kiritilmagan — AI faqat nom bo\'yicha aniqlaydi.'}</p>
              <div className="xy-ustunlar">
                <Teglar nom="Aliaslar" teglar={y.aliaslar} />
                <Teglar nom="Namuna iboralar" teglar={y.iboralar} />
              </div>
            </article>
          ))}
        </section>
      )}

      {oyna?.tur === 'forma' && (
        <YonalishOynasi
          y={oyna.y}
          boshqaNomlar={yonalishlar.filter((x) => x.nom !== oyna.y?.nom).map((x) => x.nom)}
          band={band}
          onYop={() => setOyna(null)}
          onSaqla={async (yangi) => {
            const eski = oyna.y;
            const ys = eski ? yonalishlar.map((x) => (x.nom === eski.nom ? yangi : x)) : [...yonalishlar, yangi];
            const ok = await nashr(
              ys,
              eski ? nomniAlmashtir(eski.nom, yangi.nom) : (p) => p,
              eski ? `Xizmat yo'nalishi tahrirlandi: ${yangi.nom}` : `Xizmat yo'nalishi qo'shildi: ${yangi.nom}`,
              eski ? 'Saqlandi — yangi versiya faollashtirildi' : `«${yangi.nom}» qo'shildi`,
            );
            if (ok) setOyna(null);
          }}
        />
      )}
      {oyna?.tur === 'ochir' && (
        <OchirishOynasi
          y={oyna.y}
          {...boglanish(oyna.y.nom)}
          band={band}
          onYop={() => setOyna(null)}
          bosqichlar={bosQolganBosqichlar(ochirishOzgarishi(oyna.y.nom)(pb))}
          onOchir={async () => {
            const nom = oyna.y.nom;
            const ok = await nashr(yonalishlar.filter((x) => x.nom !== nom), ochirishOzgarishi(nom), `Xizmat yo'nalishi o'chirildi: ${nom}`, `«${nom}» o'chirildi`);
            if (ok) setOyna(null);
          }}
        />
      )}
    </div>
  );
}

function Teglar({ nom, teglar }: { nom: string; teglar: string[] }) {
  return (
    <div className="xy-teglar">
      <span className="bm-yuqori">{nom}</span>
      {teglar.length ? (
        <div>
          {teglar.map((t) => (
            <span key={t} className="xy-teg">
              {t}
            </span>
          ))}
        </div>
      ) : (
        <small>—</small>
      )}
    </div>
  );
}

// ─── Modal asosi ────────────────────────────────────────────────────────────

function Modal({ children, onYop, sarlavha, keng, onSubmit }: { children: ReactNode; onYop: () => void; sarlavha: string; keng?: boolean; onSubmit?: (e: FormEvent) => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYop]);
  const Ich = onSubmit ? 'form' : 'div';
  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <Ich className={`vr-oyna ${keng ? 'xy-oyna' : 'xy-tasdiq'}`} role={keng ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="xy-oyna-nom" onSubmit={onSubmit} noValidate={onSubmit ? true : undefined}>
        <div className="vr-oyna-bosh">
          <h3 id="xy-oyna-nom">{sarlavha}</h3>
          {keng && (
            <button type="button" className="mj-yop" onClick={onYop} aria-label="Yopish">
              <X />
            </button>
          )}
        </div>
        {children}
      </Ich>
    </div>,
    document.body,
  );
}

// ─── Qo'shish / tahrirlash ──────────────────────────────────────────────────

function YonalishOynasi({
  y,
  boshqaNomlar,
  band,
  onYop,
  onSaqla,
}: {
  y: Yonalish | null;
  boshqaNomlar: string[];
  band: boolean;
  onYop: () => void;
  onSaqla: (y: Yonalish) => void;
}) {
  const [nom, setNom] = useState(y?.nom ?? '');
  const [tavsif, setTavsif] = useState(y?.tavsif ?? '');
  const [aliaslar, setAliaslar] = useState<string[]>(y?.aliaslar ?? []);
  const [iboralar, setIboralar] = useState<string[]>(y?.iboralar ?? []);
  const [urindi, setUrindi] = useState(false);

  const n = nom.trim();
  const nomXato = !n
    ? 'Nom kiriting'
    : n.length > NOM_MAKS
      ? `Nom ${NOM_MAKS} belgidan oshmasin`
      : /[[\]|;]/.test(n)
        ? '[ ] | ; belgilari ishlatilmasin'
        : boshqaNomlar.some((b) => b.toLowerCase() === n.toLowerCase())
          ? "Bunday yo'nalish allaqachon bor"
          : null;

  return (
    <Modal
      sarlavha={y ? "Xizmat yo'nalishini tahrirlash" : "Xizmat yo'nalishi qo'shish"}
      keng
      onYop={onYop}
      onSubmit={(e) => {
        e.preventDefault();
        setUrindi(true);
        if (!nomXato) onSaqla({ nom: n, tavsif: toza(tavsif), aliaslar, iboralar });
      }}
    >
      <div className="maydon-blok">
        <label htmlFor="xy-nom">Xizmat yo'nalishi nomi</label>
        <input id="xy-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Masalan: Web dasturlash" maxLength={NOM_MAKS} autoFocus aria-invalid={urindi && !!nomXato} />
        {urindi && nomXato && <div className="yordam bzl-xato">{nomXato}</div>}
        {y && n && n !== y.nom && !nomXato && <div className="yordam">Nom unga bog'langan mezon va anketa savollarida ham yangilanadi.</div>}
      </div>
      <div className="maydon-blok">
        <label htmlFor="xy-tavsif">Tavsif</label>
        <textarea id="xy-tavsif" rows={3} value={tavsif} onChange={(e) => setTavsif(e.target.value)} placeholder="AI bu xizmat yo'nalishini qachon tanlashi kerakligini yozing." maxLength={400} />
      </div>
      <div className="xy-forma-ustunlar">
        <TegKiritish
          id="xy-alias"
          nom="Aliaslar"
          izoh="Ixtiyoriy. Menejerlar bu xizmatni qanday boshqa nomlar bilan atashini qo'shing."
          placeholder="Masalan: dasturlash kursi"
          teglar={aliaslar}
          onOzgar={setAliaslar}
        />
        <TegKiritish
          id="xy-ibora"
          nom="Namuna iboralar"
          izoh="Ixtiyoriy. Suhbatda bu yo'nalishni aniq ko'rsatadigan qisqa iboralarni qo'shing."
          placeholder="Masalan: sayt yaratishni o'rganmoqchiman"
          teglar={iboralar}
          onOzgar={setIboralar}
        />
      </div>
      <div className="vr-oyna-past">
        <button type="button" className="btn ikkinchi" onClick={onYop} disabled={band}>
          Bekor qilish
        </button>
        <button type="submit" className="btn" disabled={band || (urindi && !!nomXato)}>
          {band ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </Modal>
  );
}

function TegKiritish({ id, nom, izoh, placeholder, teglar, onOzgar }: { id: string; nom: string; izoh: string; placeholder: string; teglar: string[]; onOzgar: (t: string[]) => void }) {
  const [matn, setMatn] = useState('');
  const qosh = () => {
    const t = toza(matn).slice(0, 80);
    if (t && !teglar.some((x) => x.toLowerCase() === t.toLowerCase())) onOzgar([...teglar, t]);
    setMatn('');
  };
  return (
    <div className="xy-kiritish">
      <label htmlFor={id}>{nom}</label>
      <small>{izoh}</small>
      {teglar.length > 0 && (
        <div className="xy-tahrir-teglar">
          {teglar.map((t) => (
            <span key={t} className="as-variant">
              {t}
              <button type="button" aria-label={`${t} — olib tashlash`} onClick={() => onOzgar(teglar.filter((x) => x !== t))}>
                <X />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="xy-kiritish-qator">
        <input
          id={id}
          value={matn}
          onChange={(e) => setMatn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              qosh();
            }
          }}
          placeholder={placeholder}
          maxLength={80}
        />
        <button type="button" className="btn ikkinchi" onClick={qosh} disabled={!matn.trim()}>
          Qo'shish
        </button>
      </div>
    </div>
  );
}

// ─── O'chirish tasdig'i ─────────────────────────────────────────────────────

function OchirishOynasi({
  y,
  mezonlar,
  savollar,
  bosqichlar,
  band,
  onYop,
  onOchir,
}: {
  y: Yonalish;
  mezonlar: number;
  savollar: number;
  bosqichlar: string[];
  band: boolean;
  onYop: () => void;
  onOchir: () => void;
}) {
  return (
    <Modal sarlavha="O'chirmoqchimisiz?" onYop={onYop}>
      <p className="xy-tasdiq-matn">
        <b>«{y.nom}»</b> xizmat yo'nalishi faol playbookdan olib tashlanadi.
      </p>
      {bosqichlar.length > 0 && <BloklashIzohi bosqichlar={bosqichlar} />}
      {(mezonlar > 0 || savollar > 0) && (
        <ul className="xy-oqibat">
          {mezonlar > 0 && <li>{mezonlar} ta mezon shu yo'nalishga bog'langan — faqat shu yo'nalish uchun bo'lganlari nofaol qilinadi.</li>}
          {savollar > 0 && <li>{savollar} ta anketa savoli faqat shu yo'nalish uchun — ular o'chiriladi.</li>}
        </ul>
      )}
      <p className="sz-eslatma">Avvalgi versiya saqlanib qoladi — kerak bo'lsa Baholash mezonlari → Versiyalar orqali qaytarish mumkin.</p>
      <div className="vr-oyna-past">
        <button type="button" className="btn ikkinchi" onClick={onYop} disabled={band} autoFocus>
          Bekor qilish
        </button>
        <button type="button" className="btn xy-ochir" onClick={onOchir} disabled={band || bosqichlar.length > 0}>
          {band ? "O'chirilmoqda…" : "O'chirish"}
        </button>
      </div>
    </Modal>
  );
}
