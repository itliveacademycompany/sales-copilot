/**
 * Integratsiya sozlamalari: Moi Zvonki qo'ng'iroqlari, vazifalarni CRM ga
 * yuborish va nutqni matnga aylantirish (STT) modeli.
 *
 * Bu uch karta server API'siga to'g'ridan-to'g'ri ulangan:
 * `/integrations/moizvonki`, `/integrations/crm`. STT tanlovi esa har
 * yuklashda so'rovga qo'shiladi.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, fmtSana } from '../../api';
import { getSttModel, setSttModel, STT_MODELLAR, type SttModelKey } from '../../sttModels';
import { joyla, useT } from '../../i18n';
import './integratsiyalar.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOI ZVONKI — telefon qo'ng'iroqlarini avtomatik olish va baholash
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uch qism: ulash (manzil + email + kalit), holat (nechta keldi, nechtasi
 * baholandi, nima xato) va xodimlarni menejerlarga bog'lash.
 *
 * Bog'lash nega alohida qadam: Moi Zvonki xodimi bizdagi qaysi menejer
 * ekanini hech kim avtomatik bila olmaydi. Email mos kelsa TAKLIF
 * qilinadi, lekin tasdiqni rahbar beradi — noto'g'ri bog'lash ballarni
 * boshqa odamga yozib yuborardi.
 */
interface MzHolat {
  connected: boolean;
  config: {
    domain: string | null;
    userName: string | null;
    autoAnalyze: boolean;
    minDurationSeconds: number;
    backfillDays: number;
    dailyLimit: number | null;
    lastCallId: number | null;
    lastStats: {
      olindi: number;
      saqlandi: number;
      javobsiz: number;
      qisqa: number;
      yozuvsiz: number;
      boglanmagan: number;
    } | null;
  } | null;
  keyHint: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  counts: {
    kutmoqda: number;
    ishlanmoqda: number;
    baholandi: number;
    filtrlangan: number;
    xato: number;
    boglanmagan: number;
  };
  recentErrors: { id: string; startedAt: string; reason: string | null }[];
  /** Javob berilgan, lekin yozuvi Moi Zvonki'ga hali yuklanmagan qo'ng'iroqlar. */
  yozuvKutilmoqda: number;
  bugunBaholandi: number;
  /** AI provayder limiti (429) sabab baholash vaqtincha to'xtatilgan. */
  pauza: { gacha: string; sabab: string } | null;
}

interface MzXodimlar {
  manba: 'api' | 'qongiroqlar';
  izoh: string | null;
  seats: { id: string; name: string }[];
  employees: {
    id: string;
    email: string | null;
    name: string | null;
    seatId: string | null;
    suggestedSeatId: string | null;
    calls: number;
  }[];
}

export function MoiZvonki({ businessId, boshqaraOladi }: { businessId: string; boshqaraOladi: boolean }) {
  const t = useT();
  const [h, setH] = useState<MzHolat | null>(null);
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [kalit, setKalit] = useState('');
  const [avto, setAvto] = useState(true);
  const [minDavom, setMinDavom] = useState(20);
  const [orqaga, setOrqaga] = useState(1);
  /** Matn: '' — cheksiz. */
  const [limit, setLimit] = useState('100');
  const [xodimlar, setXodimlar] = useState<MzXodimlar | null>(null);
  const [sinxXabar, setSinxXabar] = useState<string | null>(null);
  const { holat, xato, bajar } = useSaqlash();
  const amal = useSaqlash();

  const base = `/api/v1/businesses/${businessId}/integrations/moizvonki`;

  const yukla = useCallback(() => {
    void api
      .get<MzHolat>(base)
      .then((r) => {
        setH(r);
        if (r.config) {
          setDomain(r.config.domain ? `${r.config.domain}.moizvonki.ru` : '');
          setEmail(r.config.userName ?? '');
          setAvto(r.config.autoAnalyze);
          setMinDavom(r.config.minDurationSeconds);
          setOrqaga(r.config.backfillDays);
          setLimit(r.config.dailyLimit === null ? '' : String(r.config.dailyLimit));
        }
        if (r.connected) {
          void api
            .get<MzXodimlar>(`${base}/employees`)
            .then(setXodimlar)
            .catch(() => setXodimlar(null));
        }
      })
      .catch(() => undefined);
  }, [base]);

  useEffect(yukla, [yukla]);

  /**
   * Baholash fonda ketadi — holat raqamlari har 20 soniyada yangilanadi.
   * Faqat holat: forma maydonlariga tegilmaydi, aks holda yozilayotgan qiymat o'chib ketardi.
   */
  const ulangan = !!h?.connected;
  useEffect(() => {
    if (!ulangan) return;
    const taymer = setInterval(() => {
      void api.get<MzHolat>(base).then(setH).catch(() => undefined);
    }, 20_000);
    return () => clearInterval(taymer);
  }, [ulangan, base]);

  if (!h) return <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  const c = h.counts;
  const limitTogri = limit.trim() === '' || (/^\d+$/.test(limit.trim()) && Number(limit) >= 1 && Number(limit) <= 5000);
  const kunlikLimit = h.config?.dailyLimit ?? null;
  const limitTugadi = kunlikLimit !== null && h.bugunBaholandi >= kunlikLimit;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="karta-bosh">
        <h2>{t("Moi Zvonki — telefon qo'ng'iroqlari")}</h2>
        <span className={`badge ${h.connected ? 'ok' : 'kul'}`}>
          {h.connected ? t('ulangan') : t('ulanmagan')}
        </span>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        {t("Menejerlar telefonidagi qo'ng'iroqlar yozuvi avtomatik olinadi, matnga aylantiriladi va playbook bo'yicha baholanadi. Har 2 daqiqada yangilari tekshiriladi.")}
      </div>

      <details className="crm-hujjat" open={!h.connected}>
        <summary>{t("API ma'lumotlari qayerda?")}</summary>
        <div className="yordam" style={{ marginTop: 8 }}>
          {joyla(
            t("Moi Zvonki kabinetida: {yol}. U yerda «Ваш адрес API» (masalan {misol}) va «Ваш ключ API» turadi. Email — shu kabinetga kiradigan foydalanuvchi emaili. Barcha menejerlarning qo'ng'iroqlari kelishi uchun bu foydalanuvchi {rol} bo'lishi kerak."),
            {
              yol: <b>Настройки → Интеграция → Параметры API</b>,
              misol: <code>kompaniya.moizvonki.ru</code>,
              rol: <b>{t('rahbar (supervisor yoki admin)')}</b>,
            },
          )}
        </div>
      </details>

      {/* ─── Ulash ─── */}
      <div className="soat-qator">
        <div className="maydon-blok">
          <label htmlFor="mz-domain">{t('API manzili')}</label>
          <input
            id="mz-domain"
            value={domain}
            placeholder="kompaniya.moizvonki.ru"
            disabled={!boshqaraOladi}
            maxLength={200}
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>
        <div className="maydon-blok">
          <label htmlFor="mz-email">{t('Foydalanuvchi emaili')}</label>
          <input
            id="mz-email"
            type="email"
            value={email}
            placeholder={t('rahbar@kompaniya.uz')}
            disabled={!boshqaraOladi}
            maxLength={200}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="mz-kalit">{t('API kalit')}</label>
        <input
          id="mz-kalit"
          type="password"
          autoComplete="off"
          value={kalit}
          placeholder={h.keyHint ?? t('Moi Zvonki kabinetidagi kalit')}
          disabled={!boshqaraOladi}
          maxLength={200}
          onChange={(e) => setKalit(e.target.value)}
        />
        <div className="yordam">
          {h.keyHint
            ? t("O'rnatilgan ({belgi}). Bo'sh qoldirsangiz o'zgarmaydi.", { belgi: h.keyHint })
            : t("Kalit shifrlangan holda saqlanadi va keyin hech qachon to'liq ko'rsatilmaydi.")}
        </div>
      </div>

      <div className="soat-qator">
        <div className="maydon-blok">
          <label htmlFor="mz-min">{t("Eng qisqa qo'ng'iroq (soniya)")}</label>
          <input
            id="mz-min"
            type="number"
            min={0}
            max={600}
            value={minDavom}
            disabled={!boshqaraOladi}
            onChange={(e) => setMinDavom(Number(e.target.value))}
          />
          <div className="yordam">
            {t("Bundan qisqasi olinmaydi — «allo, keyinroq» kabi qo'ng'iroqlarni baholash pul sarflaydi, lekin hech narsa demaydi.")}
          </div>
        </div>
        <div className="maydon-blok">
          <label htmlFor="mz-orqaga">{t('Birinchi ulanishda necha kun orqaga')}</label>
          <input
            id="mz-orqaga"
            type="number"
            min={0}
            max={30}
            value={orqaga}
            disabled={!boshqaraOladi}
            onChange={(e) => setOrqaga(Number(e.target.value))}
          />
          <div className="yordam">{t("Faqat birinchi sinxronlashga ta'sir qiladi.")}</div>
        </div>
      </div>

      <div className="maydon-blok">
        <label htmlFor="mz-limit">{t("Kuniga ko'pi bilan nechta qo'ng'iroq baholansin")}</label>
        <input
          id="mz-limit"
          type="number"
          min={1}
          max={5000}
          value={limit}
          placeholder={t('cheksiz')}
          disabled={!boshqaraOladi}
          aria-invalid={!limitTogri}
          onChange={(e) => setLimit(e.target.value)}
        />
        <div className="yordam" style={!limitTogri ? { color: 'var(--past)' } : undefined}>
          {limitTogri
            ? t("Har baho — STT va AI so'rovi (pul yoki bepul kvota). Limitdan oshgani yo'qolmaydi: navbatda qoladi va ertasi kuni baholanadi. Bo'sh — cheksiz.")
            : t("1 dan 5000 gacha butun son yoki bo'sh (cheksiz)")}
        </div>
      </div>

      <div className="ogoh-sozlama" style={{ marginBottom: 12 }}>
        <label className="sozlama-satr">
          <span className="matn">
            <b>{t('Avtomatik baholash')}</b>
            <span className="izoh">
              {t("O'chiq bo'lsa qo'ng'iroqlar faqat ro'yxatga tushadi — STT va AI pul sarflamaydi.")}
            </span>
          </span>
          <input
            type="checkbox"
            className="kalit"
            role="switch"
            disabled={!boshqaraOladi}
            checked={avto}
            onChange={(e) => setAvto(e.target.checked)}
          />
        </label>
      </div>

      <Xabar holat={holat} xato={xato} />
      {boshqaraOladi && (
        <div className="qolda-qator" style={{ marginBottom: 14 }}>
          <button
            className="btn"
            disabled={holat === 'ketmoqda' || !domain.trim() || !email.trim() || !limitTogri}
            onClick={() =>
              void bajar(async () => {
                await api.put(base, {
                  domain: domain.trim(),
                  userName: email.trim(),
                  apiKey: kalit.trim() ? kalit.trim() : null,
                  autoAnalyze: avto,
                  minDurationSeconds: minDavom,
                  backfillDays: orqaga,
                  dailyLimit: limit.trim() === '' ? null : Number(limit),
                });
                setKalit('');
                yukla();
              })
            }
          >
            {holat === 'ketmoqda' ? t('Tekshirilmoqda…') : t('Saqlash va tekshirish')}
          </button>
          {h.connected && (
            <>
              <button
                className="btn ikkinchi"
                disabled={amal.holat === 'ketmoqda'}
                onClick={() =>
                  void amal.bajar(async () => {
                    const r = await api.post<{
                      olindi: number;
                      saqlandi: number;
                      xato?: string;
                    }>(`${base}/sync`);
                    setSinxXabar(
                      r.xato
                        ? t('Xato: {xato}', { xato: r.xato })
                        : t("{n} ta qo'ng'iroq ko'rildi, {yangi} tasi yangi.", { n: r.olindi, yangi: r.saqlandi }),
                    );
                    yukla();
                  })
                }
              >
                {t('Hozir sinxronlash')}
              </button>
              <button
                className="btn ikkinchi"
                onClick={() => {
                  if (!window.confirm(t("Moi Zvonki uzilsinmi? Olingan qo'ng'iroqlar va baholar qoladi."))) return;
                  void amal.bajar(async () => {
                    await api.del(base);
                    yukla();
                  });
                }}
              >
                {t('Uzish')}
              </button>
            </>
          )}
        </div>
      )}
      {sinxXabar && <div className="ok-qator">{sinxXabar}</div>}
      <Xabar holat={amal.holat === 'ok' ? 'tinch' : amal.holat} xato={amal.xato} />

      {/* ─── Holat ─── */}
      {h.connected && (
        <>
          <h3 style={{ marginTop: 6, marginBottom: 8 }}>{t('Holat')}</h3>
          <div className="jamoa-raqam">
            <div className="katak ok">
              <div className="son">{c.baholandi}</div>
              <div className="nom">{t('Baholandi')}</div>
            </div>
            <div className="katak">
              <div className="son">{c.kutmoqda + c.ishlanmoqda}</div>
              <div className="nom">{t('Navbatda')}</div>
            </div>
            <div className={`katak${c.boglanmagan > 0 ? ' sariq' : ''}`}>
              <div className="son">{c.boglanmagan}</div>
              <div className="nom">{t("Menejer bog'lanmagan")}</div>
            </div>
            <div className="katak">
              <div className="son">{c.filtrlangan}</div>
              <div className="nom">{t('Filtrlangan')}</div>
            </div>
            <div className={`katak${c.xato > 0 ? ' sariq' : ''}`}>
              <div className="son">{c.xato}</div>
              <div className="nom">{t('Xato')}</div>
            </div>
          </div>
          <div className="yordam" style={{ marginBottom: 10 }}>
            {t('Oxirgi sinxronlash: {vaqt}', { vaqt: h.lastSyncAt ? fmtSana(h.lastSyncAt) : t("hali bo'lmagan") })}
            {h.config?.lastStats &&
              ' · ' +
                t("{n} ta ko'rildi: {yangi} yangi, {javobsiz} javobsiz, {qisqa} qisqa", {
                  n: h.config.lastStats.olindi,
                  yangi: h.config.lastStats.saqlandi,
                  javobsiz: h.config.lastStats.javobsiz,
                  qisqa: h.config.lastStats.qisqa,
                })}
            {h.yozuvKutilmoqda > 0 &&
              ' · ' + t("{n} ta qo'ng'iroq yozuvi hali yuklanmagan — yuklanishi bilan olinadi", { n: h.yozuvKutilmoqda })}
            {!h.config?.autoAnalyze && ' · ' + t("avtomatik baholash o'chiq")}
            {' · ' + t('bugun baholandi: {n}', { n: `${h.bugunBaholandi}${kunlikLimit !== null ? ` / ${kunlikLimit}` : ''}` })}
          </div>
          {h.pauza && (
            <div className="xato-qator">
              {t("AI limiti: baholash {vaqt} gacha to'xtatildi. Qo'ng'iroqlar yo'qolmaydi — navbatda kutib turibdi va keyin o'zi davom etadi.", {
                vaqt: new Date(h.pauza.gacha).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
              })}
            </div>
          )}
          {limitTugadi && (
            <div className="yordam" style={{ marginBottom: 10, color: 'var(--orta-text)' }}>
              {t("Bugungi limit tugadi ({limit} ta). Qolgan {n} ta qo'ng'iroq ertaga navbat bilan baholanadi.", { limit: kunlikLimit ?? 0, n: c.kutmoqda })}
            </div>
          )}
          {h.lastError && <div className="xato-qator">{t('Oxirgi xato: {xato}', { xato: h.lastError })}</div>}

          {c.xato > 0 && (
            <div className="yordam" style={{ marginBottom: 10 }}>
              {h.recentErrors[0]?.reason && <>{t('Masalan: «{sabab}».', { sabab: h.recentErrors[0].reason })} </>}
              {t("Xatolilar o'zi 3 martagacha qayta uriniladi.")}{' '}
              {boshqaraOladi && (
                <button
                  className="matn-tugma"
                  onClick={() =>
                    void api
                      .post<{ requeued: number }>(`${base}/retry`)
                      .then(yukla)
                  }
                >
                  {t('Xatolilarni qayta urinish')}
                </button>
              )}
            </div>
          )}

          {/* ─── Xodimlar ─── */}
          <h3 style={{ marginTop: 14, marginBottom: 6 }}>{t('Xodimlar → menejerlar')}</h3>
          <div className="yordam" style={{ marginBottom: 8 }}>
            {t("Faqat menejerga bog'langan xodimning qo'ng'iroqlari baholanadi. Bog'lagan zahoti kutib turgan qo'ng'iroqlari ham o'sha menejerga o'tadi.")}
          </div>
          {xodimlar?.izoh && (
            <div className="yordam" style={{ marginBottom: 8, color: 'var(--orta-text)' }}>
              {xodimlar.izoh}
            </div>
          )}
          {!xodimlar ? (
            <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>
          ) : xodimlar.employees.length === 0 ? (
            <div className="hech-narsa">{t('Hali xodim topilmadi')}</div>
          ) : (
            <div className="menejer-jadval">
              {xodimlar.employees.map((x) => (
                <div className="qator" key={x.id}>
                  <div className="bosh">
                    <div className="matn">
                      <div className="ism">{x.name ?? t('Xodim #{id}', { id: x.id })}</div>
                      <div className="izoh">
                        {x.email ?? `ID ${x.id}`} · {t("{n} ta qo'ng'iroq", { n: x.calls })}
                      </div>
                    </div>
                    <div className="amal">
                      {!x.seatId && x.suggestedSeatId && (
                        <span className="badge sariq">{t('email mos')}</span>
                      )}
                      <select
                        value={x.seatId ?? ''}
                        disabled={!boshqaraOladi}
                        aria-label={t('{nom} uchun menejer', { nom: x.name ?? x.id })}
                        onChange={(e) => {
                          const yangi = e.target.value || null;
                          /*
                           * Allaqachon bog'langan xodimni BOSHQA menejerga o'tkazish ikki xil ma'noda
                           * bo'ladi: xato bog'langan (tarix ham ko'chishi kerak) yoki hisob boshqa
                           * odamga berilgan (eski suhbatlar eski menejerda qolishi kerak). Tizim buni
                           * o'zi bila olmaydi — shuning uchun so'raladi.
                           */
                          const eski = xodimlar.seats.find((s) => s.id === x.seatId)?.name;
                          const yangiNom = xodimlar.seats.find((s) => s.id === yangi)?.name;
                          const tarixniKochir =
                            !!x.seatId && !!yangi && x.seatId !== yangi && x.calls > 0
                              ? window.confirm(
                                  t(
                                    "«{xodim}» ning OLDINGI qo'ng'iroqlari ham (baholari bilan) {yangi} ga o'tkazilsinmi?\n\nOK — xato bog'langan edi, bu hisob aslida {yangi}niki.\nBekor qilish — hisob endi {yangi}ga berildi, eski suhbatlar {eski}da qolsin.",
                                    { xodim: x.name ?? x.id, yangi: yangiNom ?? '', eski: eski ?? '' },
                                  ),
                                )
                              : false;
                          void amal.bajar(async () => {
                            const r = await api.put<{ otkazildi: number; kochirildi: number }>(`${base}/employees`, {
                              xodimId: x.id,
                              seatId: yangi,
                              tarixniKochir,
                            });
                            if (r.kochirildi > 0) {
                              setSinxXabar(
                                t("{n} ta qo'ng'iroq (baholari, vazifalari va ogohlantirishlari bilan) {nom}ga ko'chirildi.", { n: r.kochirildi, nom: yangiNom ?? '' }),
                              );
                            } else if (r.otkazildi > 0) {
                              setSinxXabar(t("{n} ta kutayotgan qo'ng'iroq menejerga o'tdi.", { n: r.otkazildi }));
                            }
                            yukla();
                          });
                        }}
                      >
                        <option value="">{t("— bog'lanmagan —")}</option>
                        {xodimlar.seats.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.id === x.suggestedSeatId ? ` (${t('taklif')})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * CRM eksporti — «Vazifalarni CRM'ga yuborish».
 *
 * amoCRM yoki Bitrix24 ga to'g'ridan-to'g'ri ulanish emas, IMZOLANGAN
 * WEBHOOK. Nega — `backend/src/integrations/crm-export.ts` da batafsil
 * yozilgan: qisqasi, har CRM uchun alohida OAuth va maydon xaritalash
 * kerak bo'lardi, webhook esa bugun ishlaydi va n8n orqali istalgan CRM
 * ga ulanadi.
 *
 * Sir hech qachon qaytarilmaydi — faqat niqob. Bir marta kiritilgach uni
 * ko'rish emas, almashtirish mumkin.
 */
interface CrmHolat {
  config: { exportTasks: boolean; url: string | null; hasSecret: boolean };
  secretHint: string | null;
  status: string;
  lastError: string | null;
  recent: { id: string; title: string; exportedAt: string | null; exportError: string | null }[];
}

export function CrmEksport({
  businessId,
  boshqaraOladi,
}: {
  businessId: string;
  boshqaraOladi: boolean;
}) {
  const t = useT();
  const [h, setH] = useState<CrmHolat | null>(null);
  const [url, setUrl] = useState('');
  const [yoq, setYoq] = useState(false);
  const [sir, setSir] = useState('');
  const [sinov, setSinov] = useState<{ ok: boolean; status: number; error: string | null } | null>(
    null,
  );
  const { holat, xato, bajar } = useSaqlash();

  const yukla = useCallback(() => {
    void api
      .get<CrmHolat>(`/api/v1/businesses/${businessId}/integrations/crm`)
      .then((r) => {
        setH(r);
        setUrl(r.config.url ?? '');
        setYoq(r.config.exportTasks);
      })
      .catch(() => undefined);
  }, [businessId]);

  useEffect(yukla, [yukla]);

  if (!h) return <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  const xatolilar = h.recent.filter((r) => r.exportError).length;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="karta-bosh">
        <h2>{t("Vazifalarni CRM'ga yuborish")}</h2>
        <span className={`badge ${h.config.exportTasks ? 'ok' : 'kul'}`}>
          {h.config.exportTasks ? t('yoqilgan') : t("o'chirilgan")}
        </span>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        {joyla(
          t("Har yangi vazifa siz ko'rsatgan manzilga {imzolangan} so'rov bo'lib yuboriladi. amoCRM va Bitrix24 ning kiruvchi webhooki, n8n/Make yoki o'z backendingiz — hammasi ishlaydi."),
          { imzolangan: <b>{t('imzolangan')}</b> },
        )}
      </div>

      <div className="ogoh-sozlama" style={{ marginBottom: 12 }}>
        <label className="sozlama-satr">
          <span className="matn">
            <b>{t('Eksport yoqilsin')}</b>
            <span className="izoh">
              {t("O'chirilganda vazifalar faqat shu ilovada qoladi — hech qayerga yuborilmaydi.")}
            </span>
          </span>
          <input
            type="checkbox"
            className="kalit"
            role="switch"
            disabled={!boshqaraOladi}
            checked={yoq}
            onChange={(e) => setYoq(e.target.checked)}
          />
        </label>
      </div>

      <div className="maydon-blok">
        <label htmlFor="crm-url">{t('Webhook manzili')}</label>
        <input
          id="crm-url"
          value={url}
          placeholder="https://…"
          disabled={!boshqaraOladi}
          maxLength={500}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="maydon-blok">
        <label htmlFor="crm-sir">{t('Imzo siri')}</label>
        <div className="qolda-qator">
          <input
            id="crm-sir"
            value={sir}
            type="password"
            autoComplete="off"
            placeholder={h.secretHint ?? t('kamida 16 belgi')}
            disabled={!boshqaraOladi}
            maxLength={200}
            onChange={(e) => setSir(e.target.value)}
          />
          {boshqaraOladi && (
            <button
              className="btn ikkinchi kichik"
              onClick={() =>
                void api
                  .post<{ secret: string }>(
                    `/api/v1/businesses/${businessId}/integrations/crm/secret`,
                  )
                  .then((r) => setSir(r.secret))
              }
            >
              {t('Yaratish')}
            </button>
          )}
        </div>
        <div className="yordam">
          {h.config.hasSecret
            ? t("O'rnatilgan ({belgi}). Bo'sh qoldirsangiz o'zgarmaydi.", { belgi: h.secretHint ?? '' })
            : t("Imzosiz eksportni yoqib bo'lmaydi — manzilni bilgan har kim soxta vazifa yuborishi mumkin.")}
        </div>
      </div>

      <details className="crm-hujjat">
        <summary>{t('Qabul qiluvchi tomonda imzoni qanday tekshirish kerak')}</summary>
        <div className="yordam" style={{ marginTop: 8 }}>
          {t("Har so'rovda ikki sarlavha keladi:")}
        </div>
        <pre className="kod-blok">{`X-Sotuv-Timestamp: 1767225600
X-Sotuv-Signature: v1=<hex>

imzo = HMAC_SHA256(sir, timestamp + "." + tana)`}</pre>
        <div className="yordam">
          {t("Timestamp'ni ham tekshiring (masalan 5 daqiqadan eski so'rovni rad eting) — aks holda ushlab olingan so'rovni qayta yuborish mumkin bo'ladi.")}
        </div>
      </details>

      <Xabar holat={holat} xato={xato} />

      {sinov &&
        (sinov.ok ? (
          <div className="ok-qator">{t("Sinov so'rovi qabul qilindi ✓")}</div>
        ) : (
          <div className="xato-qator">
            {sinov.status
              ? t('Sinov muvaffaqiyatsiz (HTTP {status}): {xato}', { status: sinov.status, xato: sinov.error ?? '' })
              : t('Sinov muvaffaqiyatsiz: {xato}', { xato: sinov.error ?? '' })}
          </div>
        ))}

      {boshqaraOladi && (
        <div className="qolda-qator">
          <button
            className="btn"
            disabled={holat === 'ketmoqda' || (yoq && !url.trim())}
            onClick={() =>
              void bajar(async () => {
                await api.put(`/api/v1/businesses/${businessId}/integrations/crm`, {
                  exportTasks: yoq,
                  url: url.trim() ? url.trim() : null,
                  secret: sir.trim() ? sir.trim() : null,
                });
                setSir('');
                yukla();
              })
            }
          >
            {holat === 'ketmoqda' ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
          <button
            className="btn ikkinchi"
            disabled={!h.config.url || !h.config.hasSecret}
            onClick={() =>
              void api
                .post<{ ok: boolean; status: number; error: string | null }>(
                  `/api/v1/businesses/${businessId}/integrations/crm/test`,
                )
                .then(setSinov)
                .catch((e: unknown) =>
                  setSinov({
                    ok: false,
                    status: 0,
                    error: e instanceof ApiError ? e.message : t('yuborilmadi'),
                  }),
                )
            }
          >
            {t("Sinov so'rovi")}
          </button>
        </div>
      )}

      {h.recent.length > 0 && (
        <>
          <h3 style={{ marginTop: 18, marginBottom: 6 }}>{t('Oxirgi yuborishlar')}</h3>
          {xatolilar > 0 && boshqaraOladi && (
            <div className="yordam" style={{ marginBottom: 8 }}>
              {t('{n} ta yuborishda xato bor.', { n: xatolilar })}{' '}
              <button
                className="matn-tugma"
                onClick={() =>
                  void api
                    .post<{ requeued: number }>(
                      `/api/v1/businesses/${businessId}/integrations/crm/retry`,
                    )
                    .then(yukla)
                }
              >
                {t('Xatolilarni qayta yuborish')}
              </button>
            </div>
          )}
          <div className="eksport-royxat">
            {h.recent.map((r) => (
              <div className="qator" key={r.id}>
                <span className="nom">{r.title}</span>
                {r.exportError ? (
                  <span className="badge qizil" title={r.exportError}>
                    {t('xato')}
                  </span>
                ) : (
                  <span className="badge ok">{t('yuborildi')}</span>
                )}
                <span className="vaqt">{r.exportedAt ? fmtSana(r.exportedAt) : '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SttTanlash() {
  const t = useT();
  const [model, setModel] = useState<SttModelKey>(() => getSttModel());
  const izoh = STT_MODELLAR.find((m) => m.key === model)?.note;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="karta-bosh">
        <h2>{t('Transkript modeli')}</h2>
        <span className="badge kul">{t('sinov')}</span>
      </div>
      <div className="maydon-blok">
        <label htmlFor="stt-model">{t('Audio yuklashda ishlatiladigan model')}</label>
        <select
          id="stt-model"
          value={model}
          onChange={(e) => {
            const v = e.target.value as SttModelKey;
            setModel(v);
            setSttModel(v);
          }}
        >
          {STT_MODELLAR.map((m) => (
            <option key={m.key} value={m.key}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="yordam">{izoh && t(izoh)}</div>
      </div>
    </div>
  );
}

/** Kichik yordamchi: saqlash holati va xabar. */
function useSaqlash() {
  const t = useT();
  const [holat, setHolat] = useState<'tinch' | 'ketmoqda' | 'ok'>('tinch');
  const [xato, setXato] = useState<string | null>(null);

  const bajar = useCallback(async (fn: () => Promise<unknown>) => {
    setHolat('ketmoqda');
    setXato(null);
    try {
      await fn();
      setHolat('ok');
      setTimeout(() => setHolat('tinch'), 2500);
      return true;
    } catch (e) {
      setHolat('tinch');
      setXato(e instanceof ApiError ? e.message : t("Saqlab bo'lmadi"));
      return false;
    }
  }, [t]);

  return { holat, xato, bajar, setXato };
}

function Xabar({ holat, xato }: { holat: string; xato: string | null }) {
  const t = useT();
  if (xato) return <div className="xato-qator">{xato}</div>;
  if (holat === 'ok') return <div className="ok-qator">{t('Saqlandi')} ✓</div>;
  return null;
}

