import { Check, CircleAlert, CircleCheck, Copy, Eye, EyeOff, KeyRound, Link2, ListChecks, Plug, RefreshCw, RotateCcw, Settings2, Trash2, TriangleAlert, Unplug } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, fmtSana } from '../../api';
import { useAuth } from '../../auth';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { FacebookBelgi } from './IjtimoiyTarmoqlar';
import { MetaFormaCapi } from './MetaFormaCapi';
import './meta-lead-ads.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACEBOOK LEAD ADS — "Facebook orqali ulash"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Oqim: «Facebook orqali ulash» → Meta ruxsat oynasi → shu sahifaga qaytish
 * (`?meta_sessiya=`) → sahifa tanlash → Instant Form'larni tanlash → «Ulash»
 * → holat va diagnostika. Mijoz hech qanday kalit kiritmaydi; tokenlar
 * serverda shifrlangan va bu yerga hech qachon kelmaydi.
 *
 * "Ulandi" va "Lid qabul qilindi" — alohida holatlar: OAuth muvaffaqiyati
 * butun zanjir ishlayapti degani emas, birinchi lid kelguncha sinov kerak.
 */

interface Forma {
  id: string;
  name: string | null;
}

interface TekshiruvQadami {
  kalit: string;
  ok: boolean;
  xabar: string | null;
  muhim: boolean;
}

interface Muammo {
  id: string;
  status: 'failed' | 'auth_wait' | 'queued';
  reason: string | null;
  formId: string | null;
  error: string | null;
  attempts: number;
  receivedAt: string;
}

interface Ulanish {
  id: string;
  pageId: string;
  pageName: string | null;
  status: 'active' | 'error';
  forms: Forma[];
  pipelineId: string | null;
  subscription: { status: 'subscribed' | 'failed' | 'unsubscribed' | 'unknown'; checkedAt: string | null };
  connectedAt: string;
  tokenExpiresAt: string | null;
  lastEventAt: string | null;
  firstLeadAt: string | null;
  lastLeadAt: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  lastCheckAt: string | null;
  lastCheck: TekshiruvQadami[] | null;
  missingPermissions: string[];
  counts: { done: number; duplicate: number; ignored: number; queued: number; failed: number; authWait: number };
  problems: Muammo[];
}

/** Tashkilotning o'z Meta ilovasi — App Secret hech qachon kelmaydi, faqat niqob. */
interface Ilova {
  configured: boolean;
  appId: string | null;
  appName: string | null;
  secretHint: string | null;
  loginConfigId: string | null;
  verifyToken: string;
  redirectUri: string;
  webhookUrl: string;
  deauthorizeUrl: string;
  dataDeletionUrl: string;
}

/** Make orqali qabul qilish holati — API kaliti hech qachon kelmaydi (faqat yaratilganda bir marta). */
type MakeHolat =
  | { exists: false }
  | {
      exists: true;
      url: string;
      header: string;
      keyHint: string;
      pipelineId: string | null;
      createdAt: string;
      keyRotatedAt: string | null;
      lastRequestAt: string | null;
      lastTestAt: string | null;
      firstLeadAt: string | null;
      lastLeadAt: string | null;
      leadCount: number;
      duplicateCount: number;
      lastError: string | null;
      lastErrorAt: string | null;
    };

interface Holat {
  configured: boolean;
  /** Ishlayotgan ilova: tashkilotniki yoki platformaniki (zaxira). */
  source: 'kompaniya' | 'platforma' | null;
  app: Ilova;
  connections: Ulanish[];
}

interface Sessiya {
  id: string;
  connectionId: string | null;
  expiresAt: string;
  missingPermissions: string[];
  pages: { id: string; name: string | null; canAdvertise: boolean; connected: 'shu' | 'boshqa' | null }[];
}

interface MetaForma {
  id: string;
  name: string | null;
  status: string | null;
  createdAt: string | null;
}

interface Voronka {
  id: string;
  name: string;
  isMain: boolean;
}

/** Meta'dan qaytgandagi xato kodlari (`?meta_xato=`) — matn URL dan olinmaydi. */
const QAYTISH_XATO: Record<string, string> = {
  holat: "Ulanish havolasi noto'g'ri — «Facebook orqali ulash» ni qaytadan bosing.",
  eskirgan: "Ulanish havolasining muddati o'tdi — «Facebook orqali ulash» ni qaytadan bosing.",
  ishlatilgan: 'Bu ulanish havolasi allaqachon ishlatilgan — «Facebook orqali ulash» ni qaytadan bosing.',
  rad: "Facebook'da ruxsat berilmadi — ulanish bekor qilindi.",
  sozlanmagan: 'Integratsiya hali sozlanmagan — platforma administratoriga murojaat qiling.',
  almashtirish: "Facebook ulanishni tasdiqlamadi — birozdan keyin qaytadan urinib ko'ring.",
  sahifa_yoq: "Ruxsat berilgan Facebook sahifasi topilmadi. Meta oynasida kamida bitta sahifani tanlang — unda admin yoki reklama huquqingiz bo'lishi kerak.",
  ruxsat: "Sahifalar ro'yxatiga ruxsat berilmadi — «Facebook orqali ulash» ni bosib, so'ralgan barcha ruxsatlarni bering.",
};

const QADAM_NOMI: Record<string, string> = {
  token: 'Sahifa tokeni',
  muddat: 'Token holati',
  ruxsat: 'Ruxsatlar',
  obuna: 'Webhook obunasi (leadgen)',
  forma: 'Forma',
  lidlar: "Lidlarni o'qish (Leads Access)",
};

const OBUNA_NOMI: Record<Ulanish['subscription']['status'], string> = {
  subscribed: 'Obuna bo‘lgan',
  failed: "Obuna bo'lmagan",
  unsubscribed: 'Obuna olib tashlangan',
  unknown: "Noma'lum",
};

const SABAB_NOMI: Record<string, string> = {
  token_revoked: 'Ruxsat bekor qilingan',
  permission: 'Ruxsat yetishmaydi',
  leads_access: "Lidlarga kirish huquqi yo'q",
  page_not_found: 'Topilmadi',
  rate_limit: 'Meta limiti',
  network: 'Tarmoq xatosi',
  unknown: "Noma'lum xato",
};

/** Meta ruxsat oynasiga o'tadi; ruxsatdan keyin shu kabinetning integratsiyalar sahifasiga qaytiladi. */
export async function facebookOrqaliUla(base: string, p: { connectionId?: string; qaytaSora?: boolean } = {}): Promise<void> {
  const r = await api.post<{ url: string }>(`${base}/meta-lead-ads/oauth/start`, {
    qaytish: window.location.origin,
    ...(p.connectionId ? { connectionId: p.connectionId } : {}),
    ...(p.qaytaSora ? { qaytaSora: true } : {}),
  });
  window.location.assign(r.url);
}

// ─── Karta (CRM → Integratsiyalar) ───────────────────────────────────────────

export function MetaLeadAdsKarta() {
  const t = useT();
  const { business } = useAuth();
  const base = `/api/v1/businesses/${business?.businessId}`;
  const [holat, setHolat] = useState<Holat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const [params, setParams] = useSearchParams();
  const [sessiyaId, setSessiyaId] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [voronkalar, setVoronkalar] = useState<Voronka[]>([]);
  const [make, setMake] = useState<MakeHolat | null>(null);
  const [bevositaOchiq, setBevositaOchiq] = useState(false);

  const yukla = useCallback(async () => {
    try {
      const [h, mk] = await Promise.all([api.get<Holat>(`${base}/meta-lead-ads`), api.get<MakeHolat>(`${base}/make-leads`)]);
      setHolat(h);
      setMake(mk);
      // Bevosita ulanish ishlatilayotgan bo'lsa — bo'lim ochiq turadi
      if (h.connections.length > 0 || h.app.configured) setBevositaOchiq(true);
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, t]);

  useEffect(() => {
    void yukla();
    // Voronkalar (lid qaysi voronkaning «Saralanmagan»iga tushadi). CRM yoqilmagan bo'lsa — asosiy.
    void api
      .get<{ enabled?: boolean; pipelines?: Voronka[] }>(`${base}/crm-app`)
      .then((h) => setVoronkalar(h.enabled ? (h.pipelines ?? []) : []))
      .catch(() => setVoronkalar([]));
  }, [yukla, base]);

  // Meta'dan qaytish: sessiya → tanlash oynasi; xato → xabar. Parametr manzildan olib tashlanadi.
  useEffect(() => {
    const s = params.get('meta_sessiya');
    const kod = params.get('meta_xato');
    if (!s && !kod) return;
    if (s && /^[0-9a-f-]{36}$/i.test(s)) {
      setSessiyaId(s);
      setBevositaOchiq(true);
    }
    if (kod) setXabar({ ok: false, matn: t(QAYTISH_XATO[kod] ?? "Ulab bo'lmadi") });
    const yangi = new URLSearchParams(params);
    yangi.delete('meta_sessiya');
    yangi.delete('meta_xato');
    setParams(yangi, { replace: true });
  }, [params, setParams, t]);

  const ula = async (p: { connectionId?: string; qaytaSora?: boolean } = {}) => {
    setBand(true);
    setXabar(null);
    try {
      await facebookOrqaliUla(base, p);
    } catch (e) {
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t("Ulab bo'lmadi") });
      setBand(false);
    }
  };

  const ulanishlar = holat?.connections ?? [];
  const ulangan = ulanishlar.length > 0;
  const xatoBor = ulanishlar.some((c) => c.status === 'error');
  // Holat belgisi: avval Make (asosiy usul), keyin bevosita ulanish
  const belgi: { sinf: string; matn: string } = !holat || !make
    ? { sinf: 'kul', matn: '…' }
    : make.exists && make.firstLeadAt
      ? { sinf: 'ok', matn: t('lid qabul qilinmoqda') }
      : make.exists
        ? { sinf: 'sariq', matn: t('Make kutilmoqda') }
        : ulangan
          ? { sinf: xatoBor ? 'qizil' : 'ok', matn: xatoBor ? t('xato') : t('ulangan') }
          : { sinf: 'kul', matn: t('ulanmagan') };

  return (
    <section className={`card crm-karta mla keng${(make?.exists && make.firstLeadAt) || ulangan ? ' ulangan' : ''}`} aria-labelledby="mla-nom">
      <div className="crm-karta-bosh">
        <span className="crm-logo mla-logo" aria-hidden="true">
          <FacebookBelgi />
        </span>
        <div className="crm-karta-sarlavha">
          <h2 id="mla-nom">{t('Facebook Lead Ads')}</h2>
          <span className="yordam">{t('Facebook va Instagram reklamasidagi Instant Form lidlari')}</span>
        </div>
        <span className={`badge ${belgi.sinf}`}>{belgi.matn}</span>
      </div>

      {xabar && (
        <div className={xabar.ok ? 'ok-qator' : 'xato-qator'} role={xabar.ok ? 'status' : 'alert'}>
          {xabar.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />} {xabar.matn}
        </div>
      )}
      {xato && <div className="xato-qator">{xato}</div>}

      {make && <MakeBolim base={base} holat={make} voronkalar={voronkalar} onYangilandi={yukla} setHolat={setMake} />}

      {holat && (
        <details className="mla-bevosita" open={bevositaOchiq} onToggle={(e) => setBevositaOchiq((e.target as HTMLDetailsElement).open)}>
          <summary>
            <b>{t('Bevosita Meta ulanishi')}</b>
            <span className="yordam">{t('Ixtiyoriy: kompaniyaning o‘z Meta ilovasi orqali, Make’siz')}</span>
          </summary>
          <div className="mla-bevosita-ichi">
            <IlovaBolim base={base} holat={holat} onSaqlandi={yukla} />

            {holat.configured && !ulangan && (
              <div className="crm-tugmalar">
                <button type="button" className="btn mla-fb" disabled={band} onClick={() => void ula()}>
                  <FacebookBelgi /> {band ? t('Facebook ochilmoqda…') : t('Facebook orqali ulash')}
                </button>
              </div>
            )}

            {holat.configured &&
              ulanishlar.map((c) => (
                <UlanishBlok
                  key={c.id}
                  c={c}
                  base={base}
                  voronkalar={voronkalar}
                  onYangilandi={yukla}
                  onQaytaUla={() => void ula({ connectionId: c.id, qaytaSora: true })}
                />
              ))}

            {holat.configured && ulangan && (
              <div className="crm-tugmalar">
                <button type="button" className="btn ikkinchi" disabled={band} onClick={() => void ula()}>
                  <Plug aria-hidden="true" /> {t('Yana bir sahifa ulash')}
                </button>
              </div>
            )}
          </div>
        </details>
      )}

      {(make || holat) && <MetaFormaCapi base={base} />}

      {sessiyaId && (
        <TanlashOyna
          base={base}
          sessiyaId={sessiyaId}
          voronkalar={voronkalar}
          onYop={() => setSessiyaId(null)}
          onQaytaSora={() => void ula({ qaytaSora: true })}
          onUlandi={(nom) => {
            setSessiyaId(null);
            setXabar({ ok: true, matn: t('«{nom}» ulandi. Endi Lead Ads Testing Tool orqali test lid yuborib, «Saralanmagan»ga tushishini tekshiring.', { nom }) });
            void yukla();
          }}
        />
      )}
    </section>
  );
}

// ─── Make orqali (asosiy usul) ───────────────────────────────────────────────

/** Make HTTP modulidagi Data structure uchun namuna — README/qo'llanmadagi kontrakt bilan bir xil. */
const NAMUNA = JSON.stringify(
  {
    external_lead_id: '1234567890123456',
    full_name: 'Aziza Karimova',
    phone_number: '+998901234567',
    email: 'aziza@example.com',
    page_id: '102030405060708',
    page_name: 'Sahifa nomi',
    form_id: '900800700600500',
    form_name: 'Forma nomi',
    ad_id: '120200000000001',
    ad_name: 'Reklama nomi',
    campaign_id: '120200000000003',
    campaign_name: 'Kampaniya nomi',
    created_time: '2026-11-18T10:00:00+0000',
    custom_fields: { 'qaysi_kurs_sizni_qiziqtiradi?': 'Frontend' },
  },
  null,
  2,
);

function MakeBolim({
  base,
  holat,
  voronkalar,
  onYangilandi,
  setHolat,
}: {
  base: string;
  holat: MakeHolat;
  voronkalar: Voronka[];
  onYangilandi: () => Promise<void>;
  setHolat: (h: MakeHolat) => void;
}) {
  const t = useT();
  const yol = base + '/make-leads';
  /** Kalit faqat yaratilgan/almashtirilgan javobda keladi — sahifadan chiqilsa qayta ko'rsatilmaydi. */
  const [yangiKalit, setYangiKalit] = useState<string | null>(null);
  const [band, setBand] = useState<'yarat' | 'almashtir' | 'ochir' | 'voronka' | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const amal = async (tur: NonNullable<typeof band>, fn: () => Promise<void>) => {
    setBand(tur);
    setXato(null);
    try {
      await fn();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Bajarib bo'lmadi"));
    } finally {
      setBand(null);
    }
  };

  const yarat = () =>
    amal('yarat', async () => {
      const r = await api.post<MakeHolat & { key: string }>(yol, {});
      setYangiKalit(r.key);
      const { key: _k, ...h } = r;
      setHolat(h as MakeHolat);
    });

  const almashtir = () => {
    if (!window.confirm(t("Yangi API kaliti yaratilsinmi? Eski kalit DARHOL ishlamay qoladi — Make'dagi keychain'ni yangi kalit bilan yangilashingiz kerak bo'ladi.")))
      return;
    void amal('almashtir', async () => {
      const r = await api.post<MakeHolat & { key: string }>(yol + '/rotate-key', {});
      setYangiKalit(r.key);
      const { key: _k, ...h } = r;
      setHolat(h as MakeHolat);
    });
  };

  const ochir = () => {
    if (!window.confirm(t("Make integratsiyasi o'chirilsinmi? Qabul qilish URL'i va API kaliti ishlamay qoladi. Kelgan lidlar CRM da qoladi.")))
      return;
    void amal('ochir', async () => {
      await api.del(yol);
      setYangiKalit(null);
      await onYangilandi();
    });
  };

  const voronka = (v: string) =>
    amal('voronka', async () => {
      setHolat(await api.patch<MakeHolat>(yol, { pipelineId: v || null }));
    });

  if (!holat.exists) {
    return (
      <div className="mla-make">
        <div className="mla-make-bosh">
          <b>{t('Make orqali ulash')}</b>
          <span className="badge navy">{t('tavsiya etiladi')}</span>
        </div>
        <p className="crm-karta-matn">
          {t("Facebook hisobiga kirish, sahifa va formalarni tanlash Make'da bajariladi. DealMind faqat Make yuborgan lidlarni qabul qiladi — Meta App ID, App Secret yoki token kerak emas.")}
        </p>
        {xato && (
          <div className="xato-qator" role="alert">
            {xato}
          </div>
        )}
        <div className="crm-tugmalar">
          <button type="button" className="btn" disabled={band !== null} onClick={() => void yarat()}>
            <Link2 aria-hidden="true" /> {band === 'yarat' ? t('Yaratilmoqda…') : t('Qabul qilish URL’ini yaratish')}
          </button>
        </div>
      </div>
    );
  }

  const bosqich = (ok: boolean, nom: string, izoh: string) => (
    <div className={`mla-bosqich ${ok ? 'ok' : 'kutish'}`}>
      {ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <span>
        <b>{nom}</b>
        <small>{izoh}</small>
      </span>
    </div>
  );

  return (
    <div className="mla-make">
      <div className="mla-make-bosh">
        <b>{t('Make orqali ulash')}</b>
        <span className="badge navy">{t('asosiy usul')}</span>
      </div>

      {yangiKalit && (
        <div className="mla-kalit" role="status">
          <div className="crm-ogoh orta">
            <TriangleAlert aria-hidden="true" />
            <span>{t("API kaliti faqat hozir ko'rsatiladi. Uni Make'dagi HTTP modulining Credentials (keychain) qismiga saqlang — keyin qayta ko'rib bo'lmaydi, faqat almashtirish mumkin.")}</span>
          </div>
          <NusxaQatori nom={t('API kaliti (X-API-Key)')} qiymat={yangiKalit} />
          <div className="crm-tugmalar">
            <button type="button" className="btn ikkinchi kichik" onClick={() => setYangiKalit(null)}>
              <Check aria-hidden="true" /> {t("Saqladim — yashirish")}
            </button>
          </div>
        </div>
      )}

      {/* Uch alohida holat: URL yaratildi ≠ test o'tdi ≠ haqiqiy lid keldi */}
      <div className="mla-bosqichlar uchta">
        {bosqich(true, t('URL yaratildi'), fmtSana(holat.createdAt))}
        {bosqich(Boolean(holat.lastTestAt), t('Test request qabul qilindi'), holat.lastTestAt ? fmtSana(holat.lastTestAt) : t('hali yo‘q — Make’da "test": true bilan Run once'))}
        {bosqich(Boolean(holat.firstLeadAt), t('Haqiqiy Meta lidi qabul qilindi'), holat.firstLeadAt ? fmtSana(holat.firstLeadAt) : t('hali yo‘q — Lead Ads Testing Tool orqali test lid yuboring'))}
      </div>

      {holat.lastError && (
        <div className="crm-ogoh past" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>
            {holat.lastErrorAt && <b>{fmtSana(holat.lastErrorAt)} · </b>}
            {t(holat.lastError)}
          </span>
        </div>
      )}

      <NusxaQatori nom={t('Qabul qilish URL’i (POST)')} qiymat={holat.url} yordam={t("Make → HTTP → Make a request → URL. Kalit URL'ga qo'shilmaydi — faqat X-API-Key sarlavhasida.")} />

      <dl className="crm-malumot">
        <div>
          <dt>{t('Sarlavha')}</dt>
          <dd>
            <code>{holat.header}</code>
          </dd>
        </div>
        <div>
          <dt>{t('API kaliti')}</dt>
          <dd>
            <code>{holat.keyHint}</code>
            {holat.keyRotatedAt && <span className="crm-izoh"> · {t('almashtirilgan: {sana}', { sana: fmtSana(holat.keyRotatedAt) })}</span>}
          </dd>
        </div>
        <div>
          <dt>{t('Oxirgi qabul qilingan lid')}</dt>
          <dd>{holat.lastLeadAt ? fmtSana(holat.lastLeadAt) : t("hali bo'lmagan")}</dd>
        </div>
        <div>
          <dt>{t('Lidlar')}</dt>
          <dd>
            {t('{n} ta yangi', { n: holat.leadCount })}
            {holat.duplicateCount > 0 && <span className="crm-izoh"> · {t('{n} ta takroriy (o‘tkazib yuborildi)', { n: holat.duplicateCount })}</span>}
          </dd>
        </div>
        <div className="mla-keng">
          <dt>
            <label htmlFor="mla-make-voronka">{t('Voronka')}</label>
          </dt>
          <dd>
            <select id="mla-make-voronka" className="input" disabled={band !== null} value={holat.pipelineId ?? ''} onChange={(e) => void voronka(e.target.value)}>
              <option value="">{t('Asosiy voronka')}</option>
              {voronkalar
                .filter((v) => !v.isMain)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </dd>
        </div>
      </dl>

      <details className="tm-yoriq">
        <summary>{t("Make'da qanday sozlanadi — qadam-baqadam")}</summary>
        <div className="crm-ogoh orta mla-eslatma">
          <TriangleAlert aria-hidden="true" />
          <span>{t("Make hisobingiz DealMind ichida ulanmaydi: scenario'ni Make saytida o'zingiz yaratasiz va yoqasiz. Bu yerda faqat URL va kalit beriladi.")}</span>
        </div>
        <ol>
          <li>{t("Meta Business Settings → Integrations → Leads Access → sahifangiz → CRMs → Assign CRMs → «Make» ni belgilang.")}</li>
          <li>{t("Make → Create a new scenario → «Facebook Lead Ads» → «New Lead». «Create a webhook» → «Create a connection» (standart ulanish, Advanced settings shart emas) → sahifa va formani tanlang.")}</li>
          <li>{t("Lid javoblari (field_data) yetishmasa — keyingi modul «Facebook Lead Ads → Get Lead Details» (Lead ID = New Lead'dan).")}</li>
          <li>{t("«HTTP → Make a request»: Method = POST, URL = yuqoridagi qabul qilish URL'i; Authentication type = API key → Credentials → Add: Key = API kaliti, API key placement = In the header, API key parameter name = x-api-key.")}</li>
          <li>{t("Body content type = application/json, Body input method = Data structure (qiymatlar avtomatik escape qilinadi). Data structure'ni pastdagi JSON namunasidan «Generate» bilan yarating va maydonlarni Facebook modulidan moslang. ID larni matn sifatida yuboring.")}</li>
          <li>{t("«Return error if HTTP request fails» = Yes. Scenario settings → «Store incomplete executions» ni yoqing va HTTP moduliga xato ishlovchisi qo'shing — 5xx/429 da qayta yuboriladi, takroriy yuborish dubl yaratmaydi.")}</li>
          <li>{t("Tekshirish: «Run once» + Data structure'da test = true → yuqorida «Test request qabul qilindi». Keyin test = false (yoki maydonni olib tashlang), scenario'ni yoqing (ON) va Lead Ads Testing Tool bilan haqiqiy test lid yuboring.")}</li>
        </ol>
      </details>

      <details className="tm-yoriq">
        <summary>{t('JSON namunasi (payload kontrakti)')}</summary>
        <p className="yordam">{t("Majburiy faqat external_lead_id (Meta lead ID, matn). Qolganlari ixtiyoriy; bo'sh maydonlar xato bermaydi. Javob: 201 created / 200 duplicate / 200 test_ok; 401 — kalit, 422 — payload xatosi.")}</p>
        <NusxaQatori nom={t('Namuna')} qiymat={NAMUNA} />
      </details>

      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}

      <div className="crm-tugmalar">
        <button type="button" className="btn ikkinchi" disabled={band !== null} onClick={() => void onYangilandi()}>
          <RefreshCw aria-hidden="true" /> {t('Holatni yangilash')}
        </button>
        <button type="button" className="btn ikkinchi" disabled={band !== null} onClick={almashtir}>
          <KeyRound aria-hidden="true" /> {band === 'almashtir' ? t('Almashtirilmoqda…') : t('Kalitni almashtirish')}
        </button>
        <button type="button" className="btn ikkinchi crm-uzish" disabled={band !== null} onClick={ochir}>
          <Trash2 aria-hidden="true" /> {band === 'ochir' ? t('O‘chirilmoqda…') : t('Integratsiyani o‘chirish')}
        </button>
      </div>
    </div>
  );
}

// ─── Kompaniyaning o'z Meta ilovasi ──────────────────────────────────────────

function NusxaQatori({ nom, qiymat, yordam }: { nom: string; qiymat: string; yordam?: string }) {
  const t = useT();
  const [nusxa, setNusxa] = useState(false);
  return (
    <div className="maydon-blok">
      <label>{nom}</label>
      <div className="tm-nusxa">
        <code>{qiymat}</code>
        <button
          type="button"
          className="btn ikkinchi kichik"
          onClick={() =>
            void navigator.clipboard?.writeText(qiymat).then(() => {
              setNusxa(true);
              setTimeout(() => setNusxa(false), 1600);
            })
          }
        >
          {nusxa ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {nusxa ? t('Nusxalandi') : t('Nusxalash')}
        </button>
      </div>
      {yordam && <div className="yordam">{yordam}</div>}
    </div>
  );
}

/**
 * SaaS: har tashkilot O'Z Meta ilovasini shu yerda kiritadi (serverdagi env'ga
 * tegilmaydi). Verify token va manzillar server tomonidan beriladi — rahbar
 * ularni Meta paneliga nusxalaydi. Kalitlar saqlashdan oldin Meta'da tekshiriladi.
 */
function IlovaBolim({ base, holat, onSaqlandi }: { base: string; holat: Holat; onSaqlandi: () => Promise<void> }) {
  const t = useT();
  const a = holat.app;
  const [ochiq, setOchiq] = useState(!a.configured && holat.source !== 'platforma');
  const [f, setF] = useState({ appId: a.appId ?? '', appSecret: '', loginConfigId: a.loginConfigId ?? '' });
  const [korsat, setKorsat] = useState(false);
  const [band, setBand] = useState<'saqla' | 'ochir' | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  useEffect(() => {
    setF((x) => ({ ...x, appId: a.appId ?? x.appId, loginConfigId: a.loginConfigId ?? x.loginConfigId }));
  }, [a.appId, a.loginConfigId]);

  const saqla = async () => {
    setBand('saqla');
    setXato(null);
    setXabar(null);
    try {
      await api.put(base + '/meta-lead-ads/app', {
        appId: f.appId.trim(),
        appSecret: f.appSecret.trim() || undefined,
        loginConfigId: f.loginConfigId.trim() || null,
      });
      setF((x) => ({ ...x, appSecret: '' }));
      setXabar(t('Meta ilovasi tekshirildi va saqlandi. Endi «Facebook orqali ulash» ni bosing.'));
      setOchiq(false);
      await onSaqlandi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    } finally {
      setBand(null);
    }
  };

  const ochir = async () => {
    if (!window.confirm(t('Meta ilovasi sozlamalari o‘chirilsinmi? App Secret o‘chiriladi, verify token yangilanadi.'))) return;
    setBand('ochir');
    setXato(null);
    try {
      await api.del(base + '/meta-lead-ads/app');
      setF({ appId: '', appSecret: '', loginConfigId: '' });
      await onSaqlandi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Bajarib bo'lmadi"));
    } finally {
      setBand(null);
    }
  };

  return (
    <div className="mla-ilova">
      <div className="mla-ilova-bosh">
        <KeyRound aria-hidden="true" />
        <span>
          <b>{t('Meta ilovasi')}</b>
          <small>
            {a.configured
              ? t('{nom} · App ID {id} · App Secret {h}', { nom: a.appName ?? '—', id: a.appId ?? '', h: a.secretHint ?? '' })
              : holat.source === 'platforma'
                ? t('Platforma ilovasi ishlatilmoqda. Xohlasangiz, kompaniyangizning o‘z Meta ilovasini ulang.')
                : t('Kompaniyangizning Meta ilovasi kalitlarini bir marta kiriting — keyin «Facebook orqali ulash» paydo bo‘ladi.')}
          </small>
        </span>
        <button type="button" className="btn ikkinchi kichik" onClick={() => setOchiq((x) => !x)} aria-expanded={ochiq}>
          <Settings2 aria-hidden="true" /> {ochiq ? t('Yopish') : a.configured ? t('Sozlamalar') : t('Sozlash')}
        </button>
      </div>

      {xabar && (
        <div className="ok-qator" role="status">
          <CircleCheck aria-hidden="true" /> {xabar}
        </div>
      )}

      {ochiq && (
        <div className="mla-ilova-ichi">
          <details className="tm-yoriq" open={!a.configured}>
            <summary>{t('Meta panelida qanday sozlanadi — qadam-baqadam')}</summary>
            <ol>
              <li>{t('developers.facebook.com → My Apps → Create app (turi: Business). App settings → Basic: App ID va App secret ni pastga kiriting; App Domains — saytingiz domeni.')}</li>
              <li>{t('«Facebook Login for Business» mahsulotini qo‘shing → Settings: «Valid OAuth Redirect URIs» ga quyidagi redirect manzilini, «Deauthorize callback URL» ga deauthorize manzilini qo‘ying.')}</li>
              <li>{t('Facebook Login for Business → Configurations → Create: token turi «User access token», Assets — Pages, ruxsatlar: pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_manage_ads, ads_management. Configuration ID ni pastga kiriting.')}</li>
              <li>{t('«Webhooks» mahsuloti → «Page»: Callback URL va Verify token ni qo‘ying → «Verify and save» → «leadgen» maydoniga obuna bo‘ling.')}</li>
              <li>{t('App settings → Basic: Privacy Policy URL va «Data deletion callback URL» ni kiriting. Sahifani ulaydigan xodim ilovada Admin yoki Tester bo‘lsin.')}</li>
            </ol>
          </details>

          <div className="tm-blok">
            <h4>{t('Meta paneliga nusxalang')}</h4>
            <NusxaQatori nom={t('Valid OAuth Redirect URI')} qiymat={a.redirectUri} yordam={t('Facebook Login for Business → Settings')} />
            <NusxaQatori nom={t('Webhook Callback URL')} qiymat={a.webhookUrl} yordam={t('Webhooks → Page → Callback URL (kompaniyangiz uchun alohida)')} />
            <NusxaQatori nom={t('Verify token')} qiymat={a.verifyToken} yordam={t('Webhooks → Page → Verify token')} />
            <NusxaQatori nom={t('Deauthorize callback URL')} qiymat={a.deauthorizeUrl} />
            <NusxaQatori nom={t('Data deletion callback URL')} qiymat={a.dataDeletionUrl} />
          </div>

          <div className="tm-blok">
            <h4>{t('Ilova kalitlari')}</h4>
            <div className="vr-oyna-ikki">
              <div className="maydon-blok">
                <label htmlFor="mla-app-id">{t('App ID')}</label>
                <input id="mla-app-id" className="input" inputMode="numeric" maxLength={25} value={f.appId} onChange={(e) => setF({ ...f, appId: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="maydon-blok">
                <label htmlFor="mla-config">
                  {t('Configuration ID')} <span className="yordam">({t('ixtiyoriy')})</span>
                </label>
                <input id="mla-config" className="input" inputMode="numeric" maxLength={25} value={f.loginConfigId} onChange={(e) => setF({ ...f, loginConfigId: e.target.value.replace(/\D/g, '') })} />
              </div>
            </div>
            <div className="maydon-blok">
              <label htmlFor="mla-secret">{t('App Secret')}</label>
              <div className="tm-sir">
                <input
                  id="mla-secret"
                  className="input"
                  type={korsat ? 'text' : 'password'}
                  autoComplete="new-password"
                  data-1p-ignore=""
                  data-lpignore="true"
                  data-bwignore=""
                  data-form-type="other"
                  spellCheck={false}
                  maxLength={128}
                  value={f.appSecret}
                  placeholder={a.secretHint ? t('Saqlangan: {h} — almashtirish uchun yangisini kiriting', { h: a.secretHint }) : ''}
                  onChange={(e) => setF({ ...f, appSecret: e.target.value })}
                />
                <button type="button" className="vr-amal" aria-label={korsat ? t('Yashirish') : t("Ko'rsatish")} onClick={() => setKorsat((x) => !x)}>
                  {korsat ? <EyeOff /> : <Eye />}
                </button>
              </div>
              <div className="yordam">{t('App Secret shifrlangan holda saqlanadi va hech kimga ko‘rsatilmaydi.')}</div>
            </div>
          </div>

          {xato && (
            <div className="xato-qator" role="alert">
              {xato}
            </div>
          )}

          <div className="crm-tugmalar">
            <button type="button" className="btn" disabled={band !== null || !f.appId || (!a.configured && !f.appSecret)} onClick={() => void saqla()}>
              <Check aria-hidden="true" /> {band === 'saqla' ? t('Tekshirilmoqda…') : t('Saqlash va tekshirish')}
            </button>
            {a.configured && (
              <button type="button" className="btn ikkinchi crm-uzish" disabled={band !== null} onClick={() => void ochir()}>
                <Trash2 aria-hidden="true" /> {t('Ilovani o‘chirish')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bitta ulangan sahifa ────────────────────────────────────────────────────

function UlanishBlok({
  c,
  base,
  voronkalar,
  onYangilandi,
  onQaytaUla,
}: {
  c: Ulanish;
  base: string;
  voronkalar: Voronka[];
  onYangilandi: () => Promise<void>;
  onQaytaUla: () => void;
}) {
  const t = useT();
  const [jarayon, setJarayon] = useState<'tekshir' | 'uz' | 'qayta' | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [ogoh, setOgoh] = useState<string | null>(null);
  const [sinov, setSinov] = useState<{ ok: boolean; qadamlar: TekshiruvQadami[] } | null>(null);
  const [formaOyna, setFormaOyna] = useState(false);
  const yol = `${base}/meta-lead-ads/${c.id}`;
  const qadamlar = sinov?.qadamlar ?? c.lastCheck ?? null;
  const voronka = c.pipelineId ? (voronkalar.find((v) => v.id === c.pipelineId)?.name ?? '—') : t('Asosiy voronka');

  const amal = async (tur: 'tekshir' | 'uz' | 'qayta', fn: () => Promise<void>) => {
    setJarayon(tur);
    setXato(null);
    setOgoh(null);
    try {
      await fn();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Bajarib bo'lmadi"));
    } finally {
      setJarayon(null);
    }
  };

  const tekshir = () =>
    amal('tekshir', async () => {
      setSinov(await api.post<{ ok: boolean; qadamlar: TekshiruvQadami[] }>(`${yol}/check`, {}));
      await onYangilandi();
    });

  const uz = () => {
    if (!window.confirm(t('«{nom}» uzilsinmi? Yangi lidlar kelmaydi. Kelgan murojaatlar CRM da qoladi.', { nom: c.pageName ?? c.pageId }))) return;
    void amal('uz', async () => {
      const r = await api.del<{ unsubscribed: boolean; warning: string | null }>(yol);
      if (r.warning) setOgoh(t(r.warning));
      await onYangilandi();
    });
  };

  const qaytaIshla = (eventId?: string) =>
    amal('qayta', async () => {
      await api.post(`${yol}/retry`, eventId ? { eventId } : {});
      await onYangilandi();
    });

  const xatoli = c.status === 'error';
  const muammolar = c.problems.filter((p) => p.status !== 'queued');

  return (
    <div className={`mla-ulanish${xatoli ? ' xatoli' : ''}`}>
      {xatoli && c.lastError && (
        <div className="crm-ogoh past" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{t(c.lastError)}</span>
        </div>
      )}
      {!xatoli && c.lastError && (
        <div className="crm-ogoh orta" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>{t(c.lastError)}</span>
        </div>
      )}
      {c.missingPermissions.length > 0 && (
        <div className="crm-ogoh orta" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>{t('Berilmagan ruxsatlar: {r} — «Qayta ulash» da ularni bering.', { r: c.missingPermissions.join(', ') })}</span>
        </div>
      )}

      {/* Ikki alohida holat: ulanish va birinchi lid */}
      <div className="mla-bosqichlar">
        <div className={`mla-bosqich ${xatoli ? 'xato' : 'ok'}`}>
          {xatoli ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
          <span>
            <b>{xatoli ? t('Ulanishda muammo') : t('Ulandi')}</b>
            <small>{fmtSana(c.connectedAt)}</small>
          </span>
        </div>
        <div className={`mla-bosqich ${c.firstLeadAt ? 'ok' : 'kutish'}`}>
          {c.firstLeadAt ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          <span>
            <b>{c.firstLeadAt ? t('Lid qabul qilindi') : t('Hali lid kelmagan')}</b>
            <small>{c.firstLeadAt ? fmtSana(c.firstLeadAt) : t('Lead Ads Testing Tool orqali test lid yuboring')}</small>
          </span>
        </div>
      </div>

      <dl className="crm-malumot">
        <div>
          <dt>{t('Facebook sahifa')}</dt>
          <dd>
            {c.pageName ?? '—'}
            <span className="crm-izoh"> · ID {c.pageId}</span>
          </dd>
        </div>
        <div>
          <dt>{t('Webhook obunasi')}</dt>
          <dd className={c.subscription.status === 'subscribed' ? undefined : 'mla-qizil'}>{t(OBUNA_NOMI[c.subscription.status])}</dd>
        </div>
        <div className="mla-keng">
          <dt>{t('Tanlangan formalar')}</dt>
          <dd>{c.forms.map((f) => f.name ?? f.id).join(', ') || '—'}</dd>
        </div>
        <div>
          <dt>{t('Voronka')}</dt>
          <dd>{voronka}</dd>
        </div>
        <div>
          <dt>{t('Oxirgi muvaffaqiyatli sinxronlash')}</dt>
          <dd>{c.lastLeadAt ? fmtSana(c.lastLeadAt) : t("hali bo'lmagan")}</dd>
        </div>
        <div>
          <dt>{t('Oxirgi xato')}</dt>
          <dd>{c.lastErrorAt ? `${fmtSana(c.lastErrorAt)} · ${t(SABAB_NOMI[c.lastErrorCode ?? ''] ?? c.lastErrorCode ?? '')}` : '—'}</dd>
        </div>
        <div>
          <dt>{t('Oxirgi tekshiruv')}</dt>
          <dd>{c.lastCheckAt ? fmtSana(c.lastCheckAt) : t("hali bo'lmagan")}</dd>
        </div>
        <div className="mla-keng">
          <dt>{t('30 kun')}</dt>
          <dd>
            {t('{n} ta lid tushdi', { n: c.counts.done })}
            {c.counts.queued > 0 && ` · ${t('{n} ta navbatda', { n: c.counts.queued })}`}
            {c.counts.ignored > 0 && ` · ${t('{n} ta tanlanmagan formadan (kiritilmadi)', { n: c.counts.ignored })}`}
            {c.counts.failed + c.counts.authWait > 0 && <span className="mla-qizil"> · {t('{n} ta xato', { n: c.counts.failed + c.counts.authWait })}</span>}
          </dd>
        </div>
      </dl>

      {qadamlar && qadamlar.length > 0 && (
        <div className={`tm-sinov${qadamlar.every((q) => q.ok || !q.muhim) ? ' ok' : ''}`} role="status">
          <b>{qadamlar.every((q) => q.ok) ? t('Hammasi ishlayapti') : t('Tekshiruv natijasi')}</b>
          <ul>
            {qadamlar.map((q, i) => (
              <li key={`${q.kalit}-${i}`} className={q.ok ? 'ok' : q.muhim ? 'xato' : 'ogoh'}>
                {q.ok ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                <span>
                  <b>{t(QADAM_NOMI[q.kalit] ?? q.kalit)}</b>
                  {q.xabar && ` — ${q.kalit === 'muddat' && q.ok ? t('{sana} gacha', { sana: fmtSana(q.xabar) }) : q.xabar === 'qayta_obuna' ? t('qayta obuna qilindi') : t(q.xabar)}`}
                  {q.kalit === 'muddat' && q.ok && !q.xabar && ` — ${t('Meta muddat bermagan (bekor qilinishi mumkin)')}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {muammolar.length > 0 && (
        <details className="tm-yoriq mla-muammolar">
          <summary>{t('Olinmagan lidlar: {n}', { n: muammolar.length })}</summary>
          <ul>
            {muammolar.map((p) => (
              <li key={p.id}>
                <span>
                  <b>{fmtSana(p.receivedAt)}</b> · {t(SABAB_NOMI[p.reason ?? ''] ?? p.reason ?? '')}
                  {p.error && <small>{p.error}</small>}
                </span>
                <button type="button" className="btn ikkinchi kichik" disabled={jarayon !== null} onClick={() => void qaytaIshla(p.id)}>
                  <RotateCcw aria-hidden="true" /> {t('Qayta ishlash')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {ogoh && <div className="crm-ogoh orta">{ogoh}</div>}
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}

      <div className="crm-tugmalar">
        <button type="button" className="btn ikkinchi" disabled={jarayon !== null} onClick={() => void tekshir()}>
          <RefreshCw aria-hidden="true" className={jarayon === 'tekshir' ? 'aylan' : undefined} />
          {jarayon === 'tekshir' ? t('Tekshirilmoqda…') : t('Holatni tekshirish')}
        </button>
        <button type="button" className="btn ikkinchi" disabled={jarayon !== null} onClick={() => setFormaOyna(true)}>
          <ListChecks aria-hidden="true" /> {t('Formalar')}
        </button>
        <button type="button" className="btn ikkinchi" disabled={jarayon !== null} onClick={onQaytaUla}>
          <FacebookBelgi /> {t('Qayta ulash')}
        </button>
        <button type="button" className="btn ikkinchi crm-uzish" disabled={jarayon !== null} onClick={uz}>
          <Unplug aria-hidden="true" /> {jarayon === 'uz' ? t('Uzilmoqda…') : t('Uzish')}
        </button>
      </div>

      {formaOyna && (
        <FormalarOyna
          base={base}
          ulanish={c}
          voronkalar={voronkalar}
          onYop={() => setFormaOyna(false)}
          onSaqlandi={async () => {
            setFormaOyna(false);
            await onYangilandi();
          }}
        />
      )}
    </div>
  );
}

// ─── Forma va voronka tanlash (umumiy) ───────────────────────────────────────

function FormaTanlov({
  formalar,
  tanlangan,
  setTanlangan,
  voronkalar,
  voronka,
  setVoronka,
}: {
  formalar: MetaForma[];
  tanlangan: Set<string>;
  setTanlangan: (s: Set<string>) => void;
  voronkalar: Voronka[];
  voronka: string;
  setVoronka: (v: string) => void;
}) {
  const t = useT();
  const almashtir = (id: string) => {
    const s = new Set(tanlangan);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setTanlangan(s);
  };
  const faollar = formalar.filter((f) => f.status === 'ACTIVE');
  return (
    <>
      <div className="tm-blok">
        <h4>{t('Instant Form’lar')}</h4>
        {formalar.length === 0 ? (
          <div className="tm-ogoh">
            <CircleAlert aria-hidden="true" /> {t("Bu sahifada Instant Form topilmadi. Avval Meta Ads Manager'da lid formasi yarating.")}
          </div>
        ) : (
          <>
            <div className="mla-forma-amal">
              <button type="button" className="ci-havola" onClick={() => setTanlangan(new Set(faollar.map((f) => f.id)))}>
                {t('Barcha faol formalarni tanlash')}
              </button>
              <span className="yordam">{t('{n} ta tanlandi', { n: tanlangan.size })}</span>
            </div>
            <ul className="mla-royxat" role="group" aria-label={t('Instant Form’lar')}>
              {formalar.map((f) => (
                <li key={f.id}>
                  <label>
                    <input type="checkbox" checked={tanlangan.has(f.id)} onChange={() => almashtir(f.id)} />
                    <span>
                      <b>{f.name ?? f.id}</b>
                      <small>
                        ID {f.id}
                        {f.status && f.status !== 'ACTIVE' && ` · ${f.status}`}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="yordam">{t('Faqat tanlangan formalardan kelgan lidlar CRM ga tushadi. Keyin yaratilgan yangi formani shu yerda qo‘shasiz.')}</div>
          </>
        )}
      </div>
      <div className="tm-blok">
        <h4>{t('Lidlar qayerga tushadi')}</h4>
        <div className="maydon-blok">
          <label htmlFor="mla-voronka">{t('Voronka')}</label>
          <select id="mla-voronka" className="input" value={voronka} onChange={(e) => setVoronka(e.target.value)}>
            <option value="">{t('Asosiy voronka')}</option>
            {voronkalar
              .filter((v) => !v.isMain)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
          <div className="yordam">{t('Murojaat shu voronkaning «Saralanmagan» ustuniga tushadi.')}</div>
        </div>
      </div>
    </>
  );
}

// ─── Ruxsatdan keyin: sahifa va formalarni tanlash ───────────────────────────

function TanlashOyna({
  base,
  sessiyaId,
  voronkalar,
  onYop,
  onUlandi,
  onQaytaSora,
}: {
  base: string;
  sessiyaId: string;
  voronkalar: Voronka[];
  onYop: () => void;
  onUlandi: (nom: string) => void;
  onQaytaSora: () => void;
}) {
  const t = useT();
  const yol = `${base}/meta-lead-ads/sessions/${sessiyaId}`;
  const [s, setS] = useState<Sessiya | null>(null);
  const [sahifa, setSahifa] = useState<string | null>(null);
  const [formalar, setFormalar] = useState<MetaForma[] | null>(null);
  const [tanlangan, setTanlangan] = useState<Set<string>>(new Set());
  const [voronka, setVoronka] = useState('');
  const [band, setBand] = useState<'forma' | 'ulash' | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Sessiya>(yol)
      .then((r) => {
        setS(r);
        // Bitta mos sahifa bo'lsa — darhol tanlanadi
        const mos = r.pages.filter((p) => p.canAdvertise && p.connected !== 'boshqa');
        if (mos.length === 1) setSahifa(mos[0]!.id);
      })
      .catch((e) => setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
  }, [yol, t]);

  useEffect(() => {
    if (!sahifa) return;
    setFormalar(null);
    setTanlangan(new Set());
    setBand('forma');
    setXato(null);
    api
      .get<{ forms: MetaForma[] }>(`${yol}/pages/${sahifa}/forms`)
      .then((r) => {
        setFormalar(r.forms);
        setTanlangan(new Set(r.forms.filter((f) => f.status === 'ACTIVE').map((f) => f.id)));
      })
      .catch((e) => setXato(e instanceof ApiError ? t(e.message) : t("Formalarni olib bo'lmadi")))
      .finally(() => setBand(null));
  }, [sahifa, yol, t]);

  const ula = async () => {
    if (!sahifa || tanlangan.size === 0) return;
    setBand('ulash');
    setXato(null);
    try {
      await api.post(`${base}/meta-lead-ads/connect`, { sessionId: sessiyaId, pageId: sahifa, formIds: [...tanlangan], pipelineId: voronka || null });
      onUlandi(s?.pages.find((p) => p.id === sahifa)?.name ?? sahifa);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ulab bo'lmadi"));
      setBand(null);
    }
  };

  return (
    <Oyna
      keng
      sarlavha={t('Facebook Lead Ads — sahifa va formalar')}
      onYop={onYop}
      onSubmit={() => void ula()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor qilish')}
          </button>
          <button type="submit" className="btn" disabled={!sahifa || tanlangan.size === 0 || band !== null}>
            <Plug aria-hidden="true" /> {band === 'ulash' ? t('Ulanmoqda…') : t('Ulash')}
          </button>
        </>
      }
    >
      {!s && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {s && s.missingPermissions.length > 0 && (
        <div className="tm-ogoh">
          <CircleAlert aria-hidden="true" />
          <span>
            {t('Quyidagi ruxsatlar berilmadi: {r}. Ularsiz lidlar kelmaydi.', { r: s.missingPermissions.join(', ') })}{' '}
            <button type="button" className="ci-havola" onClick={onQaytaSora}>
              {t('Ruxsatlarni qayta so‘rash')}
            </button>
          </span>
        </div>
      )}

      {s && (
        <div className="tm-blok">
          <h4>{t('1. Facebook sahifa')}</h4>
          <ul className="mla-royxat" role="radiogroup" aria-label={t('Facebook sahifa')}>
            {s.pages.map((p) => {
              const ochiq = p.canAdvertise && p.connected !== 'boshqa';
              return (
                <li key={p.id}>
                  <label className={ochiq ? undefined : 'ochiq-emas'}>
                    <input type="radio" name="mla-sahifa" checked={sahifa === p.id} disabled={!ochiq || band !== null} onChange={() => setSahifa(p.id)} />
                    <span>
                      <b>{p.name ?? p.id}</b>
                      <small>
                        ID {p.id}
                        {p.connected === 'shu' && ` · ${t('allaqachon ulangan — sozlamalari yangilanadi')}`}
                        {p.connected === 'boshqa' && ` · ${t('platformadagi boshqa tashkilotga ulangan')}`}
                        {!p.canAdvertise && ` · ${t("reklama (Advertise) huquqi yo'q")}`}
                      </small>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sahifa && band === 'forma' && <div className="yuklanmoqda">{t('Formalar yuklanmoqda…')}</div>}
      {sahifa && formalar && (
        <FormaTanlov formalar={formalar} tanlangan={tanlangan} setTanlangan={setTanlangan} voronkalar={voronkalar} voronka={voronka} setVoronka={setVoronka} />
      )}

      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

// ─── Ulangan sahifaning formalarini o'zgartirish ─────────────────────────────

function FormalarOyna({
  base,
  ulanish,
  voronkalar,
  onYop,
  onSaqlandi,
}: {
  base: string;
  ulanish: Ulanish;
  voronkalar: Voronka[];
  onYop: () => void;
  onSaqlandi: () => Promise<void>;
}) {
  const t = useT();
  const yol = `${base}/meta-lead-ads/${ulanish.id}`;
  const [formalar, setFormalar] = useState<MetaForma[] | null>(null);
  const [tanlangan, setTanlangan] = useState<Set<string>>(new Set(ulanish.forms.map((f) => f.id)));
  const [voronka, setVoronka] = useState(ulanish.pipelineId ?? '');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ forms: MetaForma[]; selected: string[] }>(`${yol}/forms`)
      .then((r) => {
        setFormalar(r.forms);
        setTanlangan(new Set(r.selected));
      })
      .catch((e) => setXato(e instanceof ApiError ? t(e.message) : t("Formalarni olib bo'lmadi")));
  }, [yol, t]);

  const saqla = async () => {
    if (tanlangan.size === 0) return;
    setBand(true);
    setXato(null);
    try {
      await api.patch(yol, { formIds: [...tanlangan], pipelineId: voronka || null });
      await onSaqlandi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  return (
    <Oyna
      keng
      sarlavha={t('Formalar — {nom}', { nom: ulanish.pageName ?? ulanish.pageId })}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor qilish')}
          </button>
          <button type="submit" className="btn" disabled={band || !formalar || tanlangan.size === 0}>
            {band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </>
      }
    >
      {!formalar && !xato && <div className="yuklanmoqda">{t('Formalar yuklanmoqda…')}</div>}
      {formalar && <FormaTanlov formalar={formalar} tanlangan={tanlangan} setTanlangan={setTanlangan} voronkalar={voronkalar} voronka={voronka} setVoronka={setVoronka} />}
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}
