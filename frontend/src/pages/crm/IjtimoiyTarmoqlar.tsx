import { Check, CircleAlert, Copy, Eye, EyeOff, Plug, RefreshCw, Unplug } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, fmtQachon } from '../../api';
import { useCrm } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import './ijtimoiy-tarmoq.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IJTIMOIY TARMOQLAR — "Saralanmagan" ustunidagi Facebook, Instagram, Telegram
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ikon — kanal holati (rangli + yashil nuqta: ulangan; to'q sariq: xato;
 * kulrang: ulanmagan). Bosilganda kanal oynasi ochiladi: yo'riqnoma, webhook
 * manzili, kalitlar, voronka va "Ulash / Sinash / Uzish". Kalitlar serverdan
 * hech qachon qaytmaydi — faqat niqob ("EAAG…x9Zk"). Sozlash — faqat rahbar.
 */

export type Kanal = 'facebook' | 'instagram' | 'telegram';

interface SinovQadami {
  kalit: string;
  ok: boolean;
  xabar: string | null;
  muhim: boolean;
}

interface KanalHolati {
  kanal: Kanal;
  connected: boolean;
  configured: boolean;
  status: 'connected' | 'error' | 'disconnected';
  account: string | null;
  leads: number;
  lastLeadAt: string | null;
  lastEventAt: string | null;
  settings?: { pipelineId: string | null; pageId: string | null; igAccountId: string | null; greeting: string; thanks: string };
  hints?: Record<string, string>;
  webhookUrl?: string | null;
  verifyToken?: string | null;
  lastError?: string | null;
  lastTestAt?: string | null;
  warnings?: string[];
}

interface HolatJavobi {
  canManage: boolean;
  channels: KanalHolati[];
}

const NOMI: Record<Kanal, string> = { facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram' };

// ─── Brend belgilari (rasmiy shakllar, bitta rang) ───────────────────────────

export function FacebookBelgi() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

export function InstagramBelgi() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.3" />
      <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TelegramBelgi() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21.94 4.3 18.7 19.56c-.24 1.08-.88 1.35-1.79.84l-4.94-3.64-2.38 2.29c-.26.26-.48.48-.99.48l.35-5.02 9.13-8.25c.4-.35-.09-.55-.62-.2L6.18 13.17 1.32 11.65c-1.06-.33-1.08-1.06.22-1.57L20.6 2.73c.88-.33 1.65.2 1.34 1.57z" />
    </svg>
  );
}

export const TARMOQ_BELGISI: Record<Kanal, () => ReactNode> = {
  facebook: FacebookBelgi,
  instagram: InstagramBelgi,
  telegram: TelegramBelgi,
};

// ─── Ustun sarlavhasidagi ikonlar ────────────────────────────────────────────

/** `yangilash` o'zgarsa holat qayta o'qiladi (masalan, kanban yangilanganda). */
export function TarmoqIkonlari({ yangilash }: { yangilash?: number }) {
  const { base } = useCrm();
  const t = useT();
  const [data, setData] = useState<HolatJavobi | null>(null);
  const [ochiq, setOchiq] = useState<Kanal | null>(null);

  const yukla = useCallback(async () => {
    try {
      setData(await api.get<HolatJavobi>(`${base}/crm-app/social`));
    } catch {
      // Holat olinmasa ham ikonlar "ulanmagan" ko'rinishida turadi
      setData((d) => d ?? null);
    }
  }, [base]);
  useEffect(() => {
    void yukla();
  }, [yukla, yangilash]);

  const holat = (k: Kanal) => data?.channels.find((c) => c.kanal === k);

  return (
    <>
      <div className="tm-ikonlar" role="group" aria-label={t('Ijtimoiy tarmoqlar')}>
        {(['facebook', 'instagram', 'telegram'] as const).map((k) => {
          const h = holat(k);
          const Belgi = TARMOQ_BELGISI[k];
          const xolat = h?.connected ? 'ulangan' : h?.configured ? 'xato' : 'yoq';
          const izoh = h?.connected
            ? t('{nom}: ulangan', { nom: NOMI[k] }) + (h.account ? ` (${h.account})` : '')
            : h?.configured
              ? t('{nom}: xato — sozlamani tekshiring', { nom: NOMI[k] })
              : t('{nom}: ulanmagan — ulash uchun bosing', { nom: NOMI[k] });
          return (
            <button key={k} type="button" className={`tm-ikon ${k} ${xolat}`} title={izoh} aria-label={izoh} onClick={() => setOchiq(k)}>
              <Belgi />
              {xolat !== 'yoq' && <span className="tm-nuqta" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {ochiq && (
        <TarmoqOyna
          kanal={ochiq}
          boshlangich={holat(ochiq) ?? null}
          canManage={data?.canManage ?? false}
          onYop={() => setOchiq(null)}
          onYangilandi={() => void yukla()}
        />
      )}
    </>
  );
}

// ─── Kanal oynasi ────────────────────────────────────────────────────────────

const QADAM_NOMI: Record<string, string> = {
  token: 'Kalit (token)',
  sahifa: 'Facebook sahifa',
  hisob: 'Instagram hisob',
  obuna: 'Sahifaga obuna (webhook)',
  webhook: 'Webhook',
  holat: 'Telegram holati',
  lidlar: "Qayta olingan lidlar",
};

function TarmoqOyna({
  kanal,
  boshlangich,
  canManage,
  onYop,
  onYangilandi,
}: {
  kanal: Kanal;
  boshlangich: KanalHolati | null;
  canManage: boolean;
  onYop: () => void;
  onYangilandi: () => void;
}) {
  const { base, holat: crm } = useCrm();
  const t = useT();
  const [h, setH] = useState<KanalHolati | null>(boshlangich);
  const [f, setF] = useState({
    appSecret: '',
    accessToken: '',
    botToken: '',
    pageId: boshlangich?.settings?.pageId ?? '',
    igAccountId: boshlangich?.settings?.igAccountId ?? '',
    pipelineId: boshlangich?.settings?.pipelineId ?? '',
    greeting: boshlangich?.settings?.greeting ?? '',
    thanks: boshlangich?.settings?.thanks ?? '',
  });
  const [band, setBand] = useState<'saqla' | 'sina' | 'uz' | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [sinov, setSinov] = useState<{ ok: boolean; qadamlar: SinovQadami[] } | null>(null);
  const [korsat, setKorsat] = useState<Record<string, boolean>>({});
  const [nusxa, setNusxa] = useState<string | null>(null);
  const meta = kanal !== 'telegram';
  const Belgi = TARMOQ_BELGISI[kanal];

  // Meta: webhook manzili va verify token kalitlardan OLDIN kerak — qator tayyorlanadi
  useEffect(() => {
    if (!canManage || h?.webhookUrl) return;
    void api
      .post<{ channel: KanalHolati }>(`${base}/crm-app/social/${kanal}/prepare`, {})
      .then((r) => setH(r.channel))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, kanal, canManage]);

  const natija = (r: { channel?: KanalHolati; test?: { ok: boolean; qadamlar: SinovQadami[] } }) => {
    if (r.channel) {
      setH(r.channel);
      setF((x) => ({
        ...x,
        appSecret: '',
        accessToken: '',
        botToken: '',
        igAccountId: r.channel?.settings?.igAccountId ?? x.igAccountId,
      }));
    }
    setSinov(r.test ?? null);
    onYangilandi();
  };

  const saqla = async () => {
    setBand('saqla');
    setXato(null);
    setSinov(null);
    try {
      const body = meta
        ? {
            appSecret: f.appSecret.trim() || undefined,
            accessToken: f.accessToken.trim() || undefined,
            pageId: f.pageId.trim(),
            igAccountId: f.igAccountId.trim(),
            pipelineId: f.pipelineId || null,
          }
        : { botToken: f.botToken.trim() || undefined, pipelineId: f.pipelineId || null, greeting: f.greeting, thanks: f.thanks };
      natija(await api.put(`${base}/crm-app/social/${kanal}`, body));
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    } finally {
      setBand(null);
    }
  };

  const sina = async () => {
    setBand('sina');
    setXato(null);
    try {
      natija(await api.post(`${base}/crm-app/social/${kanal}/test`, {}));
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Bajarib bo'lmadi"));
    } finally {
      setBand(null);
    }
  };

  const uz = async () => {
    if (!confirm(t('{nom} uzilsinmi? Kalitlar o‘chiriladi, yangi lidlar kelmaydi. Kelgan murojaatlar saqlanadi.', { nom: NOMI[kanal] }))) return;
    setBand('uz');
    setXato(null);
    try {
      natija(await api.del(`${base}/crm-app/social/${kanal}`));
      setSinov(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Bajarib bo'lmadi"));
    } finally {
      setBand(null);
    }
  };

  const nusxala = (kalit: string, matn: string) => {
    void navigator.clipboard?.writeText(matn).then(() => {
      setNusxa(kalit);
      setTimeout(() => setNusxa((x) => (x === kalit ? null : x)), 1600);
    });
  };

  const holatBelgisi = h?.connected ? (
    <span className="badge ok">
      <Check aria-hidden="true" /> {t('Ulangan')}
    </span>
  ) : h?.configured ? (
    <span className="badge sariq">
      <CircleAlert aria-hidden="true" /> {t('Xato')}
    </span>
  ) : (
    <span className="badge kul">{t('Ulanmagan')}</span>
  );

  const sirMaydoni = (kalit: 'appSecret' | 'accessToken' | 'botToken', nom: string, joy: string, yordam?: ReactNode) => {
    const hint = h?.hints?.[kalit];
    return (
      <div className="maydon-blok">
        <label htmlFor={`tm-${kalit}`}>{nom}</label>
        <div className="tm-sir">
          <input
            id={`tm-${kalit}`}
            className="input"
            type={korsat[kalit] ? 'text' : 'password'}
            // Brauzer saqlangan kirish parolini bu yerga qo'ymasin ("off" ni Chrome e'tiborsiz qoldiradi)
            autoComplete="new-password"
            data-1p-ignore=""
            data-lpignore="true"
            data-bwignore=""
            data-form-type="other"
            spellCheck={false}
            value={f[kalit]}
            placeholder={hint ? t('Saqlangan: {h} — almashtirish uchun yangisini kiriting', { h: hint }) : joy}
            onChange={(e) => setF({ ...f, [kalit]: e.target.value })}
          />
          <button
            type="button"
            className="vr-amal"
            aria-label={korsat[kalit] ? t('Yashirish') : t("Ko'rsatish")}
            onClick={() => setKorsat((x) => ({ ...x, [kalit]: !x[kalit] }))}
          >
            {korsat[kalit] ? <EyeOff /> : <Eye />}
          </button>
        </div>
        {yordam && <div className="yordam">{yordam}</div>}
      </div>
    );
  };

  const nusxaQatori = (kalit: string, nom: string, qiymat: string | null | undefined, yordam?: string) => (
    <div className="maydon-blok">
      <label>{nom}</label>
      <div className="tm-nusxa">
        <code>{qiymat ?? t('Tayyorlanmoqda…')}</code>
        <button type="button" className="btn ikkinchi kichik" disabled={!qiymat} onClick={() => qiymat && nusxala(kalit, qiymat)}>
          {nusxa === kalit ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {nusxa === kalit ? t('Nusxalandi') : t('Nusxalash')}
        </button>
      </div>
      {yordam && <div className="yordam">{yordam}</div>}
    </div>
  );

  return (
    <Oyna
      keng
      sarlavha={t('{nom} integratsiyasi', { nom: NOMI[kanal] })}
      onYop={onYop}
      onSubmit={() => canManage && void saqla()}
      past={
        canManage ? (
          <>
            {h?.configured && (
              <button type="button" className="btn ikkinchi tm-uz" disabled={band !== null} onClick={() => void uz()}>
                <Unplug aria-hidden="true" /> {t('Uzish')}
              </button>
            )}
            {h?.configured && (
              <button type="button" className="btn ikkinchi" disabled={band !== null} onClick={() => void sina()}>
                <RefreshCw aria-hidden="true" className={band === 'sina' ? 'tm-aylan' : undefined} /> {t('Sinash')}
              </button>
            )}
            <button type="submit" className="btn" disabled={band !== null}>
              <Plug aria-hidden="true" /> {band === 'saqla' ? t('Tekshirilmoqda…') : h?.configured ? t('Saqlash') : t('Ulash')}
            </button>
          </>
        ) : (
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Yopish')}
          </button>
        )
      }
    >
      <div className={`tm-holat ${kanal}`}>
        <span className={`tm-ikon katta ${kanal} ${h?.connected ? 'ulangan' : h?.configured ? 'xato' : 'yoq'}`} aria-hidden="true">
          <Belgi />
        </span>
        <div className="tm-holat-matn">
          <div className="tm-holat-bosh">
            <b>{h?.account ?? NOMI[kanal]}</b>
            {holatBelgisi}
          </div>
          <div className="yordam">
            {t('Kelgan murojaatlar: {n}', { n: h?.leads ?? 0 })}
            {h?.lastLeadAt && ` · ${t('oxirgisi')} ${fmtQachon(h.lastLeadAt)}`}
            {h?.lastTestAt && ` · ${t('tekshirildi')} ${fmtQachon(h.lastTestAt)}`}
          </div>
        </div>
      </div>

      <p className="ci-oyna-matn">{t(TAVSIF[kanal])}</p>

      {!canManage && <div className="ok-qator tm-eslatma">{t('Integratsiyani faqat rahbar sozlaydi.')}</div>}

      {canManage && (
        <>
          {h?.lastError && <div className="xato-qator">{t('Oxirgi xato: {xato}', { xato: h.lastError })}</div>}
          {h?.warnings?.map((w) => (
            <div key={w} className="tm-ogoh">
              <CircleAlert aria-hidden="true" /> {w}
            </div>
          ))}

          <details className="tm-yoriq" open={!h?.configured}>
            <summary>{t('Qanday ulanadi — qadam-baqadam')}</summary>
            <ol>
              {YORIQNOMA[kanal].map((q) => (
                <li key={q}>{t(q)}</li>
              ))}
            </ol>
          </details>

          {meta && (
            <div className="tm-blok">
              <h4>{t('1. Meta ilovasidagi webhook')}</h4>
              {nusxaQatori('url', t('Callback URL'), h?.webhookUrl, t('Meta ilovasi → Webhooks → «{obj}» → Callback URL', { obj: kanal === 'instagram' ? 'Instagram' : 'Page' }))}
              {nusxaQatori('verify', t('Verify token'), h?.verifyToken, t('Shu matnni «Verify token» maydoniga qo‘ying va «Verify and save» bosing'))}
            </div>
          )}

          <div className="tm-blok">
            <h4>{meta ? t('2. Kalitlar') : t('Bot kaliti')}</h4>
            {meta ? (
              <>
                {sirMaydoni('appSecret', t('App Secret'), t('Meta ilovasi → App settings → Basic → App secret'))}
                {sirMaydoni(
                  'accessToken',
                  kanal === 'instagram' ? t('Access token') : t('Sahifa tokeni (Page Access Token)'),
                  kanal === 'instagram' ? 'EAA… / IGAA…' : 'EAA…',
                  t('Muddatsiz (long-lived) token ishlating, aks holda bir necha soatda eskiradi.'),
                )}
                <div className="vr-oyna-ikki">
                  <div className="maydon-blok">
                    <label htmlFor="tm-page">
                      {t('Facebook sahifa ID')}
                      {kanal === 'instagram' && <span className="yordam"> ({t('ixtiyoriy')})</span>}
                    </label>
                    <input id="tm-page" className="input" inputMode="numeric" value={f.pageId} maxLength={30} onChange={(e) => setF({ ...f, pageId: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  {kanal === 'instagram' && (
                    <div className="maydon-blok">
                      <label htmlFor="tm-ig">
                        {t('Instagram hisob ID')} <span className="yordam">({t('ixtiyoriy')})</span>
                      </label>
                      <input id="tm-ig" className="input" inputMode="numeric" value={f.igAccountId} maxLength={30} onChange={(e) => setF({ ...f, igAccountId: e.target.value.replace(/\D/g, '') })} />
                    </div>
                  )}
                </div>
                {kanal === 'instagram' && <div className="yordam">{t('Instagram target reklama lidlari Facebook sahifa orqali keladi — sahifa ID sini kiriting. Hisob ID bo‘sh qolsa, sahifadan o‘zi aniqlanadi.')}</div>}
              </>
            ) : (
              <>
                {sirMaydoni('botToken', t('Bot token'), '123456789:AA…', t("@BotFather → /newbot → bergan tokenni nusxalang. SotuvAI bildirishnoma botidan boshqa bot bo'lsin."))}
                {h?.webhookUrl && <div className="yordam">{t('Webhook avtomatik o‘rnatiladi: {url}', { url: h.webhookUrl })}</div>}
                <div className="maydon-blok">
                  <label htmlFor="tm-salom">{t('/start ga javob')}</label>
                  <textarea id="tm-salom" rows={3} maxLength={1000} value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} />
                  <div className="yordam">{t('Ostida «Telefon raqamni yuborish» tugmasi chiqadi. Bo‘sh qoldirilsa — javob yuborilmaydi.')}</div>
                </div>
                <div className="maydon-blok">
                  <label htmlFor="tm-rahmat">{t('Telefon yuborilganda javob')}</label>
                  <textarea id="tm-rahmat" rows={2} maxLength={500} value={f.thanks} onChange={(e) => setF({ ...f, thanks: e.target.value })} />
                </div>
              </>
            )}
          </div>

          <div className="tm-blok">
            <h4>{meta ? t('3. Lidlar qayerga tushadi') : t('Lidlar qayerga tushadi')}</h4>
            <div className="maydon-blok">
              <label htmlFor="tm-voronka">{t('Voronka')}</label>
              <select id="tm-voronka" className="input" value={f.pipelineId} onChange={(e) => setF({ ...f, pipelineId: e.target.value })}>
                <option value="">{t('Asosiy voronka')}</option>
                {crm.pipelines
                  .filter((p) => !p.isMain)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <div className="yordam">{t('Murojaat shu voronkaning «Saralanmagan» ustuniga tushadi.')}</div>
            </div>
          </div>

          {sinov && (
            <div className={`tm-sinov ${sinov.ok ? 'ok' : ''}`} role="status">
              <b>{sinov.ok ? t('Hammasi ishlayapti') : t('Tekshiruv natijasi')}</b>
              <ul>
                {sinov.qadamlar.map((q) => (
                  <li key={q.kalit} className={q.ok ? 'ok' : q.muhim ? 'xato' : 'ogoh'}>
                    {q.ok ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                    <span>
                      <b>{t(QADAM_NOMI[q.kalit] ?? q.kalit)}</b>
                      {q.xabar && ` — ${q.kalit === 'lidlar' ? t('{n} ta lid to‘ldirildi', { n: q.xabar }) : q.xabar}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {xato && (
            <div className="xato-qator" role="alert">
              {xato}
            </div>
          )}
        </>
      )}
    </Oyna>
  );
}

const TAVSIF: Record<Kanal, string> = {
  facebook: "Facebook target reklama formalari (Lead Ads) va sahifaga Messenger orqali yozganlar «Saralanmagan»ga tushadi.",
  instagram: "Instagram target reklama formalari (Lead Ads) va Direct'ga yozganlar «Saralanmagan»ga tushadi.",
  telegram: "Kompaniya botingizga yozgan mijozlar «Saralanmagan»ga tushadi: ismi, @username, xabarlari va telefoni (yuborsa).",
};

const YORIQNOMA: Record<Kanal, string[]> = {
  facebook: [
    'developers.facebook.com → My Apps → Create app (turi: Business).',
    'Ilovaga «Webhooks» mahsulotini qo‘shing → «Page» → «Subscribe to this object»: quyidagi Callback URL va Verify token ni qo‘ying, so‘ng «leadgen» va «messages» maydonlariga obuna bo‘ling.',
    'App settings → Basic → App secret ni nusxalang.',
    'Graph API Explorer yoki Business Settings → System users orqali sahifa tokenini oling: ruxsatlar — pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_messaging.',
    'Sahifa ID sini kiriting (Sahifa → About → Page transparency) va «Ulash» ni bosing — tizim tokenni tekshiradi va sahifani ilovaga obuna qiladi.',
    'Sinab ko‘rish: developers.facebook.com/tools/lead-ads-testing — test lid yuboring, u «Saralanmagan»da paydo bo‘ladi.',
  ],
  instagram: [
    'Instagram hisobi professional (Business/Creator) bo‘lishi va Facebook sahifaga bog‘langan bo‘lishi kerak.',
    'developers.facebook.com → Meta ilovasi (Facebook bilan bir xil ilova bo‘lishi mumkin) → Webhooks → «Instagram» obyekti: Callback URL va Verify token ni qo‘ying, «messages» maydoniga obuna bo‘ling.',
    'App secret va token kiriting: ruxsatlar — instagram_basic, instagram_manage_messages, pages_show_list, pages_manage_metadata, leads_retrieval.',
    'Instagram reklama formalari lidlari Facebook sahifa orqali keladi — sahifa ID sini ham kiriting. Agar Facebook integratsiyasi ham ulangan bo‘lsa, lid bir marta tushadi (dubl bo‘lmaydi).',
    '«Ulash» ni bosing — tizim tokenni va Instagram hisobini tekshiradi.',
  ],
  telegram: [
    'Telegram’da @BotFather ga /newbot yozing, bot nomi va @username ni bering.',
    'BotFather bergan tokenni quyidagi maydonga qo‘ying va «Ulash» ni bosing — webhook avtomatik o‘rnatiladi.',
    'Bot havolasini (t.me/sizning_bot) reklama, Instagram bio yoki saytga qo‘ying. Har reklama uchun alohida belgi: t.me/sizning_bot?start=reklama1 — u murojaatda ko‘rinadi.',
    'Mijoz botga yozishi bilan murojaat «Saralanmagan»ga tushadi; keyingi xabarlari shu murojaatga qo‘shiladi.',
  ],
};
