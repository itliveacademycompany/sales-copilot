import {
  CircleCheck,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  NotebookPen,
  PhoneCall,
  PlugZap,
  RefreshCw,
  TriangleAlert,
  Unplug,
  Webhook,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, fmtSana } from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';
// Kalit (switch) va sozlama qatorlari — Sozlamalar bilan bir xil uslub
import '../components/sozlama/integratsiyalar.css';
import './crm.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM — istalgan CRM ni bitta tugma bilan ulash
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sahifa CRM larni O'ZI BILMAYDI: ro'yxat, forma maydonlari va qo'llanma
 * backenddagi adapterlardan keladi (`GET /crm`). Yangi CRM qo'shilsa,
 * sahifa o'zgarmaydi — faqat logotip rangi (`LOGO`) ixtiyoriy.
 *
 * Ulangandan keyin SotuvAI har tahlil qilingan qo'ng'iroqni mijoz telefoni
 * bo'yicha CRM dagi sdelkaga bog'laydi va (sozlamaga ko'ra) izoh hamda
 * menejerga vazifa yozadi.
 *
 * Sir (token, webhook) hech qachon qaytarilmaydi: sahifa faqat niqobni ko'radi.
 */

interface Maydon {
  kalit: string;
  nom: string;
  tur: 'matn' | 'sir';
  placeholder: string;
  yordam?: string;
}

interface Crm {
  kind: string;
  name: string;
  description: string;
  guide: string[];
  fields: Maydon[];
  connected: boolean;
  status: 'connected' | 'error' | 'disconnected' | 'paused';
  account: { name: string; url: string | null; address: string | null } | null;
  lastAddress: string | null;
  secretHint: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string | null;
  lastCheckAt: string | null;
  lastError: string | null;
  settings: { izoh: boolean; vazifa: boolean; boshlanish: string | null };
}

interface Tuzilish {
  pipelines: { id: string; name: string; isMain: boolean; statuses: { id: string; name: string; tur: 'ochiq' | 'muvaffaqiyat' | 'yopilgan' }[] }[];
  users: { id: string; name: string; isAdmin: boolean; isActive: boolean }[];
  leadFieldCount: number;
}

interface Jurnal {
  counts: { ok: number; skipped: number; error: number };
  items: {
    id: string;
    entity: 'conversation' | 'task';
    localId: string;
    status: 'ok' | 'skipped' | 'error';
    crmEntity: 'deal' | 'contact' | null;
    crmEntityName: string | null;
    crmUrl: string | null;
    error: string | null;
    updatedAt: string;
  }[];
}

/** Logotip belgisi — faqat ko'rinish; noma'lum CRM uchun bosh harflar. */
const LOGO: Record<string, { matn: string; sinf: string }> = {
  amocrm: { matn: 'amo', sinf: 'amo' },
  bitrix24: { matn: 'B24', sinf: 'bitrix' },
};

const KUN = 86_400_000;

export function Crm() {
  const t = useT();
  const { business } = useAuth();
  const base = `/api/v1/businesses/${business?.businessId}/crm`;
  const [crmlar, setCrmlar] = useState<Crm[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    try {
      const r = await api.get<{ crmlar: Crm[] }>(base);
      setCrmlar(r.crmlar);
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, t]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  const faol = crmlar?.find((c) => c.connected) ?? null;
  // Ulangan CRM birinchi, qolganlari tartib bo'yicha
  const tartib = crmlar ? [...crmlar].sort((a, b) => Number(b.connected) - Number(a.connected)) : [];

  return (
    <div className="crm-sahifa">
      <div className="crm-bosh">
        <h1>{t('CRM')}</h1>
        <p>{t("CRM tizimingizni ulang — SotuvAI har qo'ng'iroq tahlilini mijozning sdelkasiga yozadi va menejerga vazifa qo'yadi.")}</p>
      </div>

      {xato && <div className="card xato-qator">{xato}</div>}
      {!crmlar && !xato && <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>}

      {/* To'r: ulanmagan CRM lar ixcham kartalar bo'lib yonma-yon turadi,
          ulangani yoki formasi ochilgani butun qatorni egallaydi */}
      {crmlar && (
        <div className="crm-panjara">
          {tartib.map((c) => (
            <CrmKarta key={c.kind} c={c} base={`${base}/${c.kind}`} band={faol !== null && faol.kind !== c.kind ? faol.name : null} onOzgardi={yukla} />
          ))}

          <section className="card crm-karta" aria-labelledby="crm-boshqa-nom">
            <div className="crm-karta-bosh">
              <span className="crm-logo boshqa" aria-hidden="true">
                <Webhook />
              </span>
              <div className="crm-karta-sarlavha">
                <h2 id="crm-boshqa-nom">{t('Boshqa CRM')}</h2>
                <span className="yordam">{t('Webhook orqali')}</span>
              </div>
            </div>
            <p className="crm-karta-matn">
              {t("Ro'yxatda yo'q CRM ga vazifalarni imzolangan webhook orqali yuborish mumkin (n8n, Make yoki CRM ning o'z webhooki).")}
            </p>
            <div className="crm-tugmalar">
              <Link to="/sozlamalar?b=crmEksport" className="btn ikkinchi">
                {t('Sozlash')}
              </Link>
            </div>
          </section>
        </div>
      )}

      {/* Hali hech qaysi CRM ulanmagan — ulashdan oldin nima bo'lishini ko'rsatamiz */}
      {crmlar && !faol && <QandayIshlaydi />}
    </div>
  );
}

function QandayIshlaydi() {
  const t = useT();
  const qadamlar: { ikon: ReactNode; sarlavha: string; matn: string }[] = [
    {
      ikon: <PlugZap />,
      sarlavha: 'CRM ni ulang',
      matn: "Kalitni bir marta kiriting — SotuvAI uni CRM da tekshiradi va shifrlab saqlaydi.",
    },
    {
      ikon: <PhoneCall />,
      sarlavha: "Qo'ng'iroq tahlil qilinadi",
      matn: "Har qo'ng'iroq mijoz telefoni bo'yicha CRM dagi ochiq sdelkaga bog'lanadi.",
    },
    {
      ikon: <NotebookPen />,
      sarlavha: 'Natija CRM ga yoziladi',
      matn: "Sdelkada baho, xulosa va keyingi qadam izohi paydo bo'ladi, menejerga vazifa tushadi.",
    },
  ];
  return (
    <section className="crm-qanday" aria-labelledby="crm-qanday-nom">
      <h2 id="crm-qanday-nom">{t('Qanday ishlaydi')}</h2>
      <ol>
        {qadamlar.map((q, i) => (
          <li key={q.sarlavha}>
            <span className="crm-qanday-ikon" aria-hidden="true">
              {q.ikon}
            </span>
            <span className="crm-qanday-raqam">{i + 1}</span>
            <b>{t(q.sarlavha)}</b>
            <span>{t(q.matn)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Ulanmagan karta tagidagi qisqa tavsif — SotuvAI shu CRM bilan nima qiladi. */
const IMKONIYAT = "Har qo'ng'iroq tahlili sdelkaga izoh bo'lib yoziladi, vazifalar menejerga tushadi.";

// ─── Bitta CRM kartasi ───────────────────────────────────────────────────────

function CrmKarta({ c, base, band, onOzgardi }: { c: Crm; base: string; band: string | null; onOzgardi: () => Promise<void> }) {
  const t = useT();
  const [formaOchiq, setFormaOchiq] = useState(false);
  const [jarayon, setJarayon] = useState<'tekshir' | 'uzish' | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  const ulangan = c.connected;
  const buzilgan = ulangan && c.status === 'error';
  const logo = LOGO[c.kind] ?? { matn: c.name.slice(0, 3), sinf: 'boshqa' };
  const muddatKun = c.tokenExpiresAt ? Math.ceil((new Date(c.tokenExpiresAt).getTime() - Date.now()) / KUN) : null;

  const amal = async (tur: 'tekshir' | 'uzish', fn: () => Promise<void>) => {
    setJarayon(tur);
    setXato(null);
    setXabar(null);
    try {
      await fn();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Ulanishda xato'));
    } finally {
      setJarayon(null);
    }
  };

  const tekshir = () =>
    amal('tekshir', async () => {
      const r = await api.post<{ ok: boolean; error?: string }>(`${base}/check`);
      if (r.ok) setXabar(t('Ulanish ishlayapti'));
      else setXato(r.error ? t(r.error) : t('Ulanishda xato'));
      await onOzgardi();
    });

  const uzish = () => {
    if (!window.confirm(t('{nom} uzilsinmi? Kalit o‘chiriladi, CRM dagi maʼlumotlarga tegilmaydi.', { nom: c.name }))) return;
    void amal('uzish', async () => {
      await api.del(base);
      setFormaOchiq(false);
      await onOzgardi();
    });
  };

  return (
    <section
      className={`card crm-karta${ulangan ? ' ulangan' : ''}${ulangan || formaOchiq ? ' keng' : ''}`}
      aria-labelledby={`crm-${c.kind}-nom`}
    >
      <div className="crm-karta-bosh">
        <span className={`crm-logo ${logo.sinf}`} aria-hidden="true">
          {logo.matn}
        </span>
        <div className="crm-karta-sarlavha">
          <h2 id={`crm-${c.kind}-nom`}>{c.name}</h2>
          <span className="yordam">{t(c.description)}</span>
        </div>
        <span className={`badge ${buzilgan ? 'qizil' : ulangan ? 'ok' : 'kul'}`}>
          {buzilgan ? t('xato') : ulangan ? t('ulangan') : t('ulanmagan')}
        </span>
      </div>

      {/* ─── Ulangan ─── */}
      {ulangan && (
        <>
          {buzilgan && c.lastError && (
            <div className="crm-ogoh past" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>
                {t(c.lastError)}. {t('Yangi kalit kiriting yoki ulanishni qayta tekshiring.')}
              </span>
            </div>
          )}
          {!buzilgan && muddatKun !== null && muddatKun <= 30 && (
            <div className="crm-ogoh orta" role="status">
              <TriangleAlert aria-hidden="true" />
              <span>
                {muddatKun <= 0
                  ? t('Token muddati tugagan — CRM da yangisini yarating.')
                  : t('Token {n} kundan keyin tugaydi — oldindan yangisini yarating.', { n: muddatKun })}
              </span>
            </div>
          )}

          <dl className="crm-malumot">
            <div>
              <dt>{t('Hisob')}</dt>
              <dd>
                {c.account?.url ? (
                  <a href={c.account.url} target="_blank" rel="noopener noreferrer" className="crm-havola">
                    {c.account.name} <ExternalLink aria-hidden="true" />
                  </a>
                ) : (
                  c.account?.name
                )}
              </dd>
            </div>
            <div>
              <dt>{t('Kalit')}</dt>
              <dd>
                <code>{c.secretHint}</code>
                {c.tokenExpiresAt && <span className="crm-izoh"> · {t('{sana} gacha', { sana: fmtSana(c.tokenExpiresAt) })}</span>}
              </dd>
            </div>
            <div>
              <dt>{t('Ulangan')}</dt>
              <dd>{c.connectedAt ? fmtSana(c.connectedAt) : '—'}</dd>
            </div>
            <div>
              <dt>{t('Oxirgi tekshiruv')}</dt>
              <dd>{c.lastCheckAt ? fmtSana(c.lastCheckAt) : t("hali bo'lmagan")}</dd>
            </div>
          </dl>

          <div className="crm-tugmalar">
            <button type="button" className="btn ikkinchi" disabled={jarayon !== null} onClick={() => void tekshir()}>
              <RefreshCw aria-hidden="true" className={jarayon === 'tekshir' ? 'aylan' : undefined} />
              {jarayon === 'tekshir' ? t('Tekshirilmoqda…') : t('Ulanishni tekshirish')}
            </button>
            <button type="button" className="btn ikkinchi" disabled={jarayon !== null} aria-expanded={formaOchiq} onClick={() => setFormaOchiq((v) => !v)}>
              <KeyRound aria-hidden="true" />
              {t('Kalitni almashtirish')}
            </button>
            <button type="button" className="btn ikkinchi crm-uzish" disabled={jarayon !== null} onClick={uzish}>
              <Unplug aria-hidden="true" />
              {jarayon === 'uzish' ? t('Uzilmoqda…') : t('Uzish')}
            </button>
          </div>
        </>
      )}

      {xabar && (
        <div className="ok-qator" role="status">
          <CircleCheck aria-hidden="true" /> {xabar}
        </div>
      )}
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}

      {/* ─── Ulanmagan: tugma → forma ─── */}
      {!ulangan && !formaOchiq && <p className="crm-karta-matn">{t(IMKONIYAT)}</p>}
      {!ulangan && !formaOchiq && (
        <div className="crm-tugmalar">
          <button type="button" className="btn" disabled={band !== null} onClick={() => setFormaOchiq(true)}>
            {t('Ulash')}
          </button>
          {band && <span className="yordam">{t('Avval {nom} ni uzing — bir vaqtda bitta CRM ulanadi.', { nom: band })}</span>}
        </div>
      )}

      {formaOchiq && (
        <UlashForma
          c={c}
          base={base}
          onBekor={() => setFormaOchiq(false)}
          onUlandi={async (nom) => {
            setFormaOchiq(false);
            setXato(null);
            setXabar(t('{nom} hisobi ulandi', { nom }));
            await onOzgardi();
          }}
        />
      )}

      {ulangan && !buzilgan && (
        <>
          <Sozlama c={c} base={base} onOzgardi={onOzgardi} />
          <Faoliyat base={base} />
          <TuzilishBolimi base={base} />
        </>
      )}
    </section>
  );
}

// ─── Ulash formasi (adapter maydonlaridan) ───────────────────────────────────

function UlashForma({
  c,
  base,
  onBekor,
  onUlandi,
}: {
  c: Crm;
  base: string;
  onBekor: () => void;
  onUlandi: (nom: string) => Promise<void>;
}) {
  const t = useT();
  const [qiymat, setQiymat] = useState<Record<string, string>>(() =>
    Object.fromEntries(c.fields.map((m) => [m.kalit, m.kalit === 'address' && c.lastAddress ? c.lastAddress : ''])),
  );
  const [ketmoqda, setKetmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  // Qayta ulashda sir bo'sh qoldirilsa — saqlangani ishlatiladi
  const toliq = c.fields.every((m) => qiymat[m.kalit]?.trim() || (m.tur === 'sir' && c.connected));

  const yubor = async (e: FormEvent) => {
    e.preventDefault();
    setKetmoqda(true);
    setXato(null);
    try {
      const r = await api.put<{ account: { nom: string } }>(base, {
        maydonlar: Object.fromEntries(Object.entries(qiymat).map(([k, v]) => [k, v.trim()])),
      });
      await onUlandi(r.account.nom);
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t("Ulab bo'lmadi"));
    } finally {
      setKetmoqda(false);
    }
  };

  return (
    // autoComplete="off" + noyob `name`lar + parol maydoni yo'q: brauzer bu
    // formani login deb o'ylab, saqlangan email va parolni qo'ymasin
    <form className="crm-forma" onSubmit={(e) => void yubor(e)} autoComplete="off" data-lpignore="true">
      <details className="crm-qollanma" open={!c.connected}>
        <summary>{t('Kalitni qayerdan olaman?')}</summary>
        <ol>
          {c.guide.map((q) => (
            <li key={q}>{t(q)}</li>
          ))}
        </ol>
        <p className="yordam">{t('Kalitni hech kimga, jumladan chatga yubormang — faqat shu maydonga kiriting.')}</p>
      </details>

      {c.fields.map((m) => (
        <div className="maydon-blok" key={m.kalit}>
          <label htmlFor={`crm-${c.kind}-${m.kalit}`}>{t(m.nom)}</label>
          {m.tur === 'sir' ? (
            <SirMaydon
              id={`crm-${c.kind}-${m.kalit}`}
              qiymat={qiymat[m.kalit] ?? ''}
              placeholder={c.connected && c.secretHint ? c.secretHint : m.placeholder}
              majburiy={!c.connected}
              onChange={(v) => setQiymat((q) => ({ ...q, [m.kalit]: v }))}
            />
          ) : (
            <input
              id={`crm-${c.kind}-${m.kalit}`}
              name={`sotuvai-crm-${c.kind}-${m.kalit}`}
              value={qiymat[m.kalit] ?? ''}
              placeholder={m.placeholder}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={300}
              required
              data-lpignore="true"
              data-1p-ignore="true"
              onChange={(e) => setQiymat((q) => ({ ...q, [m.kalit]: e.target.value }))}
            />
          )}
          {m.yordam && <div className="yordam">{t(m.yordam)}</div>}
          {m.tur === 'sir' && c.connected && <div className="yordam">{t("Bo'sh qoldirsangiz saqlangan kalit ishlatiladi.")}</div>}
        </div>
      ))}

      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
      <div className="crm-tugmalar">
        <button type="submit" className="btn" disabled={ketmoqda || !toliq}>
          {ketmoqda ? t('Tekshirilmoqda…') : c.connected ? t('Saqlash va tekshirish') : t('Ulash')}
        </button>
        <button type="button" className="btn ikkinchi" onClick={onBekor}>
          {t('Bekor qilish')}
        </button>
      </div>
    </form>
  );
}

/**
 * Sir maydoni — ko'zcha bilan.
 *
 * `type="password"` ISHLATILMAYDI: brauzer parol maydonini ko'rsa formani
 * login deb hisoblab, saqlangan email/parolni qo'yadi (`demo@sotuvai.local`
 * muammosi) va "parolni saqlaysizmi?" deb so'raydi. Shuning uchun oddiy
 * matn maydoni + CSS bilan yashirish. CSS ni qo'llamaydigan eski
 * brauzerda — zaxira sifatida `password`.
 */
function SirMaydon({
  id,
  qiymat,
  placeholder,
  majburiy,
  onChange,
}: {
  id: string;
  qiymat: string;
  placeholder: string;
  majburiy: boolean;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [korinadi, setKorinadi] = useState(false);
  const cssYashiradi = typeof CSS !== 'undefined' && CSS.supports?.('-webkit-text-security', 'disc');

  return (
    <div className="crm-sir">
      <input
        id={id}
        name={`sotuvai-crm-kalit-${id}`}
        type={korinadi || cssYashiradi ? 'text' : 'password'}
        className={korinadi ? undefined : 'crm-sir-yashirin'}
        value={qiymat}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={4000}
        required={majburiy}
        data-lpignore="true"
        data-1p-ignore="true"
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="crm-kozcha"
        aria-label={korinadi ? t('Kalitni yashirish') : t("Kalitni ko'rsatish")}
        aria-pressed={korinadi}
        aria-controls={id}
        title={korinadi ? t('Kalitni yashirish') : t("Kalitni ko'rsatish")}
        onClick={() => setKorinadi((v) => !v)}
      >
        {korinadi ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}

// ─── SotuvAI CRM ga nima yozsin ──────────────────────────────────────────────

function Sozlama({ c, base, onOzgardi }: { c: Crm; base: string; onOzgardi: () => Promise<void> }) {
  const t = useT();
  const [s, setS] = useState(c.settings);
  const [xato, setXato] = useState<string | null>(null);

  const ozgartir = async (kalit: 'izoh' | 'vazifa', v: boolean) => {
    const eski = s;
    setS({ ...s, [kalit]: v });
    setXato(null);
    try {
      await api.patch(`${base}/settings`, { [kalit]: v });
      await onOzgardi();
    } catch (e) {
      setS(eski);
      setXato(e instanceof ApiError ? t(e.message) : t("Saqlab bo'lmadi"));
    }
  };

  return (
    <div className="crm-bolim">
      <h3>{t('Tahlildan keyin CRM ga')}</h3>
      <div className="ogoh-sozlama">
        <label className="sozlama-satr">
          <span className="matn">
            <b>{t('Sdelkaga izoh yozish')}</b>
            <span className="izoh">{t('Baho, qisqa xulosa, asosiy kamchilik, keyingi qadam va SotuvAI dagi havola.')}</span>
          </span>
          <input type="checkbox" className="kalit" role="switch" checked={s.izoh} onChange={(e) => void ozgartir('izoh', e.target.checked)} />
        </label>
        <label className="sozlama-satr">
          <span className="matn">
            <b>{t('Menejerga vazifa yaratish')}</b>
            <span className="izoh">{t("Tahlil vazifa topsa (qayta qo'ng'iroq, va'da), u sdelkaning mas'uliga CRM da vazifa bo'lib tushadi.")}</span>
          </span>
          <input type="checkbox" className="kalit" role="switch" checked={s.vazifa} onChange={(e) => void ozgartir('vazifa', e.target.checked)} />
        </label>
      </div>
      {xato && <div className="xato-qator">{xato}</div>}
      <p className="yordam">
        {s.boshlanish
          ? t("Mijoz telefoni bo'yicha CRM dagi ochiq sdelka topiladi (bo'lmasa — kontakt). Faqat {sana} dan keyin tahlil qilingan qo'ng'iroqlar yoziladi.", {
              sana: fmtSana(s.boshlanish),
            })
          : t("Mijoz telefoni bo'yicha CRM dagi ochiq sdelka topiladi (bo'lmasa — kontakt).")}
      </p>
    </div>
  );
}

// ─── Oxirgi yozuvlar ─────────────────────────────────────────────────────────

function Faoliyat({ base }: { base: string }) {
  const t = useT();
  const [j, setJ] = useState<Jurnal | null>(null);

  useEffect(() => {
    let tirik = true;
    const ol = () =>
      api
        .get<Jurnal>(`${base}/log`)
        .then((r) => {
          if (tirik) setJ(r);
        })
        .catch(() => undefined);
    void ol();
    // Worker har 20 soniyada yozadi — sahifa ochiq tursa yangilanib boradi
    const taymer = setInterval(() => void ol(), 30_000);
    return () => {
      tirik = false;
      clearInterval(taymer);
    };
  }, [base]);

  if (!j) return null;
  const HOLAT: Record<string, string> = { ok: t('yozildi'), skipped: t("o'tkazildi"), error: t('xato') };

  return (
    <div className="crm-bolim">
      <h3>{t('Faoliyat')}</h3>
      <div className="crm-raqamlar uch">
        <div className="crm-raqam">
          <b>{j.counts.ok}</b>
          <span>{t("CRM ga yozilgan qo'ng'iroq")}</span>
        </div>
        <div className="crm-raqam">
          <b>{j.counts.skipped}</b>
          <span>{t('CRM da topilmadi')}</span>
        </div>
        <div className={`crm-raqam${j.counts.error > 0 ? ' ogoh' : ''}`}>
          <b>{j.counts.error}</b>
          <span>{t('Xato (qayta uriniladi)')}</span>
        </div>
      </div>
      {j.items.length === 0 ? (
        <p className="yordam">{t("Hali hech narsa yozilmadi. Yangi qo'ng'iroq tahlil qilingach, bu yerda ko'rinadi.")}</p>
      ) : (
        <ul className="crm-jurnal">
          {j.items.map((i) => (
            <li key={i.id}>
              <span className={`crm-holat ${i.status}`}>{HOLAT[i.status] ?? i.status}</span>
              <span className="crm-jurnal-nima">
                {i.entity === 'task' ? t('Vazifa') : t('Izoh')}
                {i.crmUrl ? (
                  <>
                    {' → '}
                    <a href={i.crmUrl} target="_blank" rel="noopener noreferrer" className="crm-havola">
                      {i.crmEntityName || (i.crmEntity === 'contact' ? t('kontakt') : t('sdelka'))} <ExternalLink aria-hidden="true" />
                    </a>
                  </>
                ) : null}
                {i.entity === 'conversation' && (
                  <>
                    {' · '}
                    <Link to={`/suhbatlar/${i.localId}`}>{t('suhbat')}</Link>
                  </>
                )}
                {i.error && i.status !== 'ok' && <span className="crm-izoh"> — {t(i.error)}</span>}
              </span>
              <time className="crm-izoh">{fmtSana(i.updatedAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Hisob tuzilishi ─────────────────────────────────────────────────────────

function TuzilishBolimi({ base }: { base: string }) {
  const t = useT();
  const [ochiq, setOchiq] = useState(false);
  const [d, setD] = useState<Tuzilish | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  // Faqat ochilganda yuklanadi — CRM API limitini behuda sarflamaslik uchun
  useEffect(() => {
    if (!ochiq || d) return;
    let tirik = true;
    api
      .get<Tuzilish>(`${base}/structure`)
      .then((r) => {
        if (tirik) setD(r);
      })
      .catch((e: unknown) => {
        if (tirik) setXato(e instanceof ApiError ? t(e.message) : t("CRM ma'lumotini olib bo'lmadi"));
      });
    return () => {
      tirik = false;
    };
  }, [ochiq, d, base, t]);

  const faol = d?.users.filter((u) => u.isActive) ?? [];
  const bosqichlar = d?.pipelines.reduce((n, p) => n + p.statuses.length, 0) ?? 0;

  return (
    <details className="crm-bolim crm-tuzilish" onToggle={(e) => setOchiq((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{t('Hisob tuzilishi: voronkalar va foydalanuvchilar')}</summary>
      {xato && <div className="xato-qator">{xato}</div>}
      {ochiq && !d && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {d && (
        <>
          <div className="crm-raqamlar">
            <div className="crm-raqam">
              <b>{d.pipelines.length}</b>
              <span>{t('Voronka##soni')}</span>
            </div>
            <div className="crm-raqam">
              <b>{bosqichlar}</b>
              <span>{t('Bosqich##soni')}</span>
            </div>
            <div className="crm-raqam">
              <b>{faol.length}</b>
              <span>{t('Foydalanuvchi##soni')}</span>
            </div>
            <div className="crm-raqam">
              <b>{d.leadFieldCount}</b>
              <span>{t('Sdelka maydoni')}</span>
            </div>
          </div>
          <ul className="crm-voronkalar">
            {d.pipelines.map((p) => (
              <li key={p.id} className="crm-voronka">
                <div className="crm-voronka-nom">
                  {p.name}
                  {p.isMain && <span className="badge navy">{t('asosiy')}</span>}
                </div>
                <ol className="crm-bosqichlar" aria-label={t('{nom} bosqichlari', { nom: p.name })}>
                  {p.statuses.map((s) => (
                    <li key={s.id} className={`crm-bosqich ${s.tur}`}>
                      {s.name}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          {d.users.length > 0 && (
            <div className="crm-foydalanuvchilar">
              <h4>{t('Foydalanuvchilar')}</h4>
              <ul>
                {d.users.map((u) => (
                  <li key={u.id} className={u.isActive ? undefined : 'nofaol'}>
                    {u.name}
                    {u.isAdmin && <span className="crm-teg">{t('admin')}</span>}
                    {!u.isActive && <span className="crm-teg">{t('nofaol')}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </details>
  );
}
