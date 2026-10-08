import { ArrowDown, ArrowUp, CircleCheck, Lock, Pencil, Plus, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type PlaybookBody, type PlaybookVersion } from '../../api';
import { useAuth } from '../../auth';
import { TanlovMenyu } from '../analitika/Ochiluvchi';
import { bahoniAjrat, bahoniYig, LID_BOSH, LID_OXIR } from '../ai/blok';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → LID SIFATI BOSQICHLARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AI lid sifatini `hot | warm | cold` deb qaytaradi va butun analitika shu
 * qiymatning BOSHIGA qaraydi (api.ts → lidTuri). Bosqichli rejimda AI'ga
 * (baholash ko'rsatmasidagi avtomatik blok orqali) avval mos bosqichni
 * tanlash va javobni «hot — Bosqich nomi» shaklida berish aytiladi:
 * analitika buzilmaydi, qiymatda esa bosqich nomi ham saqlanadi.
 *
 * Bosqichlarning o'zi `playbook.leadQuality.bosqichlar` da saqlanadi.
 */

type Toifa = 'sifatli' | 'sifatsiz' | '';
interface Bosqich {
  id: string;
  nom: string;
  toifa: Toifa;
  shart: string;
  tizim?: boolean;
}
type Rejim = 'raqamli' | 'bosqichli';
interface LidSozlama {
  rejim?: Rejim;
  bosqichlar?: Bosqich[];
}

/** Doim mavjud tizim bosqichi — tahrirlanmaydi va o'chirilmaydi. */
const TIZIM: Bosqich = {
  id: 'yaroqsiz',
  nom: 'Yaroqsiz lid',
  toifa: 'sifatsiz',
  shart: "Tizimli holat.\nMijoz ariza qoldirmaganini aytadi.\nRaqam noto'g'ri yoki boshqa odamga tegishli.",
  tizim: true,
};

/** «Bosqichlarni taklif qilish» — umumiy sotuv amaliyotiga asoslangan andoza. */
const ANDOZA: Omit<Bosqich, 'id'>[] = [
  { nom: 'Ehtiyoj aniq', toifa: 'sifatli', shart: 'Mijoz taklifga mos aniq ehtiyoj yoki muammoni aytadi.' },
  { nom: 'Qiziqish bor', toifa: 'sifatli', shart: "Mijoz savol beradi yoki ko'proq eshitishga tayyor." },
  { nom: "Qiziqish yo'q", toifa: 'sifatsiz', shart: "Mijoz aloqa bo'lganidan keyin taklifni ko'rib chiqishni xohlamaydi." },
  { nom: "Ehtiyoj yo'q", toifa: 'sifatsiz', shart: "Mijoz hozir ehtiyoj yo'qligini yoki muammo allaqachon hal qilinganini aytadi." },
  { nom: 'Mos emas', toifa: 'sifatsiz', shart: 'Mijoz bu taklif yoki segmentga mos kelmaydi.' },
];

const TOIFA_NOM: Record<Toifa, string> = { sifatli: 'Sifatli', sifatsiz: 'Sifatsiz', '': 'Toifa tanlanmagan' };
const BAHOLASH_MAKS = 3000;

const yangiId = () => `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sozlamaOl = (p: PlaybookBody): LidSozlama => ((p.leadQuality ?? {}) as LidSozlama);

/** AI uchun blok: bosqichlar + javob shakli. */
function blokYasa(bs: Bosqich[]): string {
  const qator = (b: Bosqich, i: number) =>
    `${i + 1}. ${b.nom} (${b.toifa === 'sifatli' ? 'sifatli' : b.toifa === 'sifatsiz' ? 'sifatsiz' : 'toifasiz'}): ${b.shart.replace(/\n+/g, ' ').trim()}`;
  return [
    LID_BOSH,
    "Lid sifatini (leadQuality) aniqlashda avval suhbatga eng mos bosqichni quyidagi ro'yxatdan tanla.",
    "Javobni hot, warm yoki cold bilan boshla, keyin « — » va bosqich nomini yoz. Masalan: «hot — Ehtiyoj aniq».",
    'Sifatli bosqich: hot (aniq tayyorlik) yoki warm; sifatsiz bosqich: cold.',
    ...bs.map(qator),
    LID_OXIR,
  ].join('\n');
}

/** Bosqichlar va rejimni playbookka yozish (baholash ko'rsatmasidagi blok bilan). */
function yoz(p: PlaybookBody, rejim: Rejim, bs: Bosqich[]): PlaybookBody {
  const [oz, ai] = bahoniAjrat(p.promptNotes.stage3.scoringGuidance ?? '');
  const toliq = [...bs.filter((b) => !b.tizim), TIZIM];
  return {
    ...p,
    promptNotes: {
      ...p.promptNotes,
      stage3: { ...p.promptNotes.stage3, scoringGuidance: bahoniYig(oz, ai, rejim === 'bosqichli' ? blokYasa(toliq) : '') },
    },
    leadQuality: { ...(p.leadQuality ?? {}), rejim, bosqichlar: bs.filter((b) => !b.tizim) },
  };
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

export function LidSifatiBosqichlari() {
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yozaOladi = business?.permissions.includes('playbook:write') ?? false;

  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [versiya, setVersiya] = useState<PlaybookVersion | null>(null);
  const [yoq, setYoq] = useState(false);
  const [oyna, setOyna] = useState<{ tur: 'forma'; b: Bosqich | null } | { tur: 'ochir'; b: Bosqich } | null>(null);
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ ton: 'ok' | 'xato'; matn: string } | null>(null);

  const yukla = useCallback(async () => {
    if (!base) return;
    try {
      const [p, vs] = await Promise.all([api.get<PlaybookBody>(`${base}/playbook`), api.get<PlaybookVersion[]>(`${base}/playbook/versions`).catch(() => [])]);
      setPb(tozaBody(p));
      setVersiya(vs.find((v) => v.isActive) ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setYoq(true);
      else setXabar({ ton: 'xato', matn: "Ma'lumotni yuklab bo'lmadi" });
    }
  }, [base]);
  useEffect(() => void yukla(), [yukla]);

  if (yoq)
    return (
      <section className="card bm-karta bm-bosh-holat">
        <Sparkles />
        <b>Playbook hali yaratilmagan</b>
        <span>Lid sifati bosqichlari playbook bilan birga ishlaydi.</span>
      </section>
    );
  if (!pb) return <div className="card skelet" style={{ height: 380 }} aria-busy="true" />;

  const sozlama = sozlamaOl(pb);
  const rejim: Rejim = sozlama.rejim === 'bosqichli' ? 'bosqichli' : 'raqamli';
  const bosqichlar = (sozlama.bosqichlar ?? []).filter((b) => b && b.id && b.nom);
  const royxat = [...bosqichlar, TIZIM];

  const bildir = (ton: 'ok' | 'xato', matn: string) => {
    setXabar({ ton, matn });
    setTimeout(() => setXabar((x) => (x?.matn === matn ? null : x)), 3500);
  };

  async function nashr(r: Rejim, bs: Bosqich[], izoh: string, muvaffaqiyat: string) {
    if (!pb) return false;
    const yangi = yoz(pb, r, bs);
    if (yangi.promptNotes.stage3.scoringGuidance.length > BAHOLASH_MAKS) {
      bildir('xato', `Baholash ko'rsatmalari ${BAHOLASH_MAKS} belgidan oshib ketadi (${yangi.promptNotes.stage3.scoringGuidance.length}). Shartlarni qisqartiring.`);
      return false;
    }
    setBand(true);
    try {
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

  const sur = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= bosqichlar.length) return;
    const t = [...bosqichlar];
    [t[i], t[j]] = [t[j]!, t[i]!];
    void nashr(rejim, t, "Lid sifati bosqichlari tartibi o'zgartirildi", 'Tartib saqlandi');
  };

  const taklif = () => {
    const bor = new Set(bosqichlar.map((b) => b.nom.toLowerCase()));
    const qoshiladi = ANDOZA.filter((a) => !bor.has(a.nom.toLowerCase())).map((a) => ({ ...a, id: yangiId() }));
    if (!qoshiladi.length) return bildir('ok', "Barcha taklif qilingan bosqichlar allaqachon bor");
    if (!window.confirm(`${qoshiladi.length} ta standart bosqich qo'shilsinmi?\n\n${qoshiladi.map((q) => `• ${q.nom} — ${TOIFA_NOM[q.toifa]}`).join('\n')}\n\nKeyin har birini tahrirlashingiz mumkin.`)) return;
    void nashr('bosqichli', [...bosqichlar, ...qoshiladi], "Lid sifati bosqichlari taklif asosida qo'shildi", `${qoshiladi.length} ta bosqich qo'shildi`);
  };

  return (
    <div className="as">
      <section className="card as-karta">
        <h2 className="as-sarlavha">Lid sifati bosqichlari</h2>
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
        <div className="ls-bosh">
          <div>
            <div className="ls-sarlavha">
              <h3>Lid sifati bosqichlari</h3>
              <span className={`qo-teg ${rejim === 'bosqichli' ? 'yaxshi' : 'orta'}`}>{rejim === 'bosqichli' ? 'Bosqichli baholash' : 'Raqamli baholash'}</span>
            </div>
            <p>Kelajakdagi lid sifati qarorlarida AI ishlatadigan bosqichlarni sozlang. Eski natijalar o'zgarmaydi.</p>
          </div>
          {yozaOladi && rejim === 'bosqichli' && (
            <button
              type="button"
              className="ls-qaytish"
              disabled={band}
              onClick={() =>
                window.confirm("Raqamli baholashga qaytilsinmi? Bosqichlar saqlanib qoladi, lekin AI ularni ishlatmaydi.") &&
                void nashr('raqamli', bosqichlar, 'Lid sifati: raqamli baholashga qaytildi', 'Raqamli baholash yoqildi')
              }
            >
              Raqamli baholashga qaytish
            </button>
          )}
        </div>
        {xabar && (
          <div className={`bm-xabar as-xabar ${xabar.ton}`} role={xabar.ton === 'xato' ? 'alert' : 'status'}>
            {xabar.ton === 'ok' ? <CircleCheck /> : <TriangleAlert />} {xabar.matn}
          </div>
        )}
      </section>

      {rejim === 'raqamli' ? (
        <section className="card as-karta">
          <div className="ls-raqamli">
            <b>Raqamli lid sifati faol</b>
            <p>
              Kelajakdagi qo'ng'iroqlar hozircha umumiy issiq / iliq / sovuq bahosi bilan ishlaydi. Bosqichlarni tuzib, ularga o'tkazing — AI har lidni
              aniq bosqichga ajratadi.
            </p>
          </div>
          {yozaOladi && (
            <div>
              <button
                type="button"
                className="btn"
                disabled={band}
                onClick={() =>
                  void nashr(
                    'bosqichli',
                    bosqichlar,
                    "Lid sifati: bosqichli baholash yoqildi",
                    bosqichlar.length ? 'Bosqichli baholash yoqildi' : "Bosqichli baholash yoqildi — endi bosqichlarni qo'shing",
                  )
                }
              >
                <Pencil /> {bosqichlar.length ? "Bosqichli baholashga o'tish" : "Lid sifati bosqichlari qo'shish"}
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="card ls-karta">
          <div className="ls-royxat-bosh">
            <div>
              <h4>Lid sifati bosqichlari</h4>
              <p>Har bir bosqich uchun AI tanlash shartlarini yozing va har birini sifatli yoki sifatsiz lid sifatida belgilang.</p>
            </div>
            {yozaOladi && (
              <div className="ls-amallar">
                <button type="button" className="btn ikkinchi" onClick={taklif} disabled={band}>
                  <Sparkles /> Bosqichlarni taklif qilish
                </button>
                <button type="button" className="btn ikkinchi" onClick={() => setOyna({ tur: 'forma', b: null })} disabled={band}>
                  <Plus /> Bosqich qo'shish
                </button>
              </div>
            )}
          </div>
          {bosqichlar.length === 0 && (
            <div className="ls-bosh-holat">Hali bosqich yo'q — «Bosqichlarni taklif qilish» yoki «Bosqich qo'shish» orqali boshlang.</div>
          )}
          <ol className="ls-royxat" aria-busy={band}>
            {royxat.map((b, i) => (
              <li key={b.id} className={`ls-bosqich${b.tizim ? ' tizim' : ''}`}>
                <span className={`ls-raqam ${b.toifa}`}>{i + 1}</span>
                <div className="ls-matn">
                  <b>{b.nom}</b>
                  {b.shart.split('\n').map((s, k) => (
                    <p key={k}>{s}</p>
                  ))}
                  <span className={`ls-toifa ${b.toifa || 'yoq'}`}>{TOIFA_NOM[b.toifa]}</span>
                </div>
                {b.tizim ? (
                  <span className="ls-qulf" title="Tizim bosqichi — o'zgartirib bo'lmaydi">
                    <Lock />
                  </span>
                ) : (
                  yozaOladi && (
                    <div className="xy-amallar">
                      <button type="button" className="bm-ikon" aria-label="Yuqoriga" title="Yuqoriga" disabled={band || i === 0} onClick={() => sur(i, -1)}>
                        <ArrowUp />
                      </button>
                      <button type="button" className="bm-ikon" aria-label="Pastga" title="Pastga" disabled={band || i === bosqichlar.length - 1} onClick={() => sur(i, 1)}>
                        <ArrowDown />
                      </button>
                      <button type="button" className="bm-ikon" aria-label={`${b.nom} — tahrirlash`} title="Tahrirlash" disabled={band} onClick={() => setOyna({ tur: 'forma', b })}>
                        <Pencil />
                      </button>
                      <button type="button" className="bm-ikon xavf" aria-label={`${b.nom} — o'chirish`} title="O'chirish" disabled={band} onClick={() => setOyna({ tur: 'ochir', b })}>
                        <Trash2 />
                      </button>
                    </div>
                  )
                )}
              </li>
            ))}
          </ol>
          {bosqichlar.length > 0 && !bosqichlar.some((b) => b.toifa === 'sifatli') && (
            <div className="ls-ogoh">
              <TriangleAlert /> Sifatli bosqich yo'q — AI hech bir lidni «issiq» yoki «iliq» deb belgilamaydi.
            </div>
          )}
        </section>
      )}

      {oyna?.tur === 'forma' && (
        <BosqichOynasi
          b={oyna.b}
          boshqaNomlar={royxat.filter((x) => x.id !== oyna.b?.id).map((x) => x.nom)}
          band={band}
          onYop={() => setOyna(null)}
          onSaqla={async (yangi) => {
            const bs = oyna.b ? bosqichlar.map((x) => (x.id === yangi.id ? yangi : x)) : [...bosqichlar, yangi];
            const ok = await nashr(
              'bosqichli',
              bs,
              oyna.b ? `Lid sifati bosqichi tahrirlandi: ${yangi.nom}` : `Lid sifati bosqichi qo'shildi: ${yangi.nom}`,
              oyna.b ? 'Saqlandi — yangi versiya faollashtirildi' : `«${yangi.nom}» qo'shildi`,
            );
            if (ok) setOyna(null);
          }}
        />
      )}
      {oyna?.tur === 'ochir' && (
        <Modal sarlavha="O'chirmoqchimisiz?" onYop={() => setOyna(null)}>
          <p className="xy-tasdiq-matn">
            <b>«{oyna.b.nom}»</b> bosqichi o'chiriladi. Yangi qo'ng'iroqlarda AI bu bosqichni tanlamaydi; o'tgan baholar o'zgarmaydi.
          </p>
          <div className="vr-oyna-past">
            <button type="button" className="btn ikkinchi" onClick={() => setOyna(null)} disabled={band} autoFocus>
              Bekor qilish
            </button>
            <button
              type="button"
              className="btn xy-ochir"
              disabled={band}
              onClick={async () => {
                const ok = await nashr('bosqichli', bosqichlar.filter((x) => x.id !== oyna.b.id), `Lid sifati bosqichi o'chirildi: ${oyna.b.nom}`, `«${oyna.b.nom}» o'chirildi`);
                if (ok) setOyna(null);
              }}
            >
              {band ? "O'chirilmoqda…" : "O'chirish"}
            </button>
          </div>
        </Modal>
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
      <Ich className={`vr-oyna ${keng ? 'xy-oyna' : 'xy-tasdiq'}`} role={keng ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="ls-oyna-nom" onSubmit={onSubmit} noValidate={onSubmit ? true : undefined}>
        <div className="vr-oyna-bosh">
          <h3 id="ls-oyna-nom">{sarlavha}</h3>
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

function BosqichOynasi({ b, boshqaNomlar, band, onYop, onSaqla }: { b: Bosqich | null; boshqaNomlar: string[]; band: boolean; onYop: () => void; onSaqla: (b: Bosqich) => void }) {
  const [nom, setNom] = useState(b?.nom ?? '');
  const [toifa, setToifa] = useState<Toifa>(b?.toifa ?? '');
  const [shart, setShart] = useState(b?.shart ?? '');
  const [urindi, setUrindi] = useState(false);

  const n = nom.trim();
  const xato =
    n.length < 2
      ? 'Bosqich nomi kamida 2 belgi'
      : boshqaNomlar.some((x) => x.toLowerCase() === n.toLowerCase())
        ? 'Bunday bosqich allaqachon bor'
        : !toifa
          ? 'Lid toifasini tanlang — AI bosqichni sifatli yoki sifatsiz deb bilishi kerak'
          : shart.trim().length < 10
            ? "«Qachon shu bosqich tanlanadi» kamida 10 belgi"
            : null;

  return (
    <Modal
      sarlavha={b ? 'Lid sifati bosqichini tahrirlash' : "Lid sifati bosqichini qo'shish"}
      keng
      onYop={onYop}
      onSubmit={(e) => {
        e.preventDefault();
        setUrindi(true);
        if (!xato) onSaqla({ id: b?.id ?? yangiId(), nom: n.replace(/[[\]]/g, ''), toifa, shart: shart.trim().replace(/[[\]]/g, '') });
      }}
    >
      <div className="qo-forma">
        <div className="maydon-blok">
          <label htmlFor="ls-nom">Bosqich nomi</label>
          <input id="ls-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Masalan: Ehtiyoj aniq" maxLength={60} autoFocus aria-invalid={urindi && n.length < 2} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="ls-toifa">Lid toifasi</label>
          <TanlovMenyu
            id="ls-toifa"
            aria="Lid toifasi"
            qiymat={toifa}
            variantlar={[
              { qiymat: '', nom: 'Toifa tanlanmagan' },
              { qiymat: 'sifatli', nom: 'Sifatli' },
              { qiymat: 'sifatsiz', nom: 'Sifatsiz' },
            ]}
            onOzgar={(v) => setToifa(v as Toifa)}
            kenglik="100%"
          />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="ls-shart">Qachon shu bosqich tanlanadi</label>
        <textarea
          id="ls-shart"
          rows={4}
          value={shart}
          onChange={(e) => setShart(e.target.value)}
          placeholder="Masalan: Mijoz taklifga mos aniq ehtiyoj yoki muammoni aytadi."
          maxLength={400}
          aria-invalid={urindi && shart.trim().length < 10}
        />
        <div className="yordam">AI shu shartni o'qib, suhbatga eng mos bosqichni tanlaydi. Har qatorga bitta belgi yozish mumkin.</div>
      </div>
      {urindi && xato && <div className="yordam bzl-xato">{xato}</div>}
      <div className="vr-oyna-past">
        <button type="button" className="btn ikkinchi" onClick={onYop} disabled={band}>
          Bekor qilish
        </button>
        <button type="submit" className="btn" disabled={band || (urindi && !!xato)}>
          {band ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </Modal>
  );
}
