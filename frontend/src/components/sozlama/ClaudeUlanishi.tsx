import { Check, Copy, Eye, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, fmtSana } from '../../api';
import { joyla, useT } from '../../i18n';
import './claudeUlanishi.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → CLAUDE ULANISHI (MCP)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rahbar platformani o'z Claude akkauntidan boshqaradi: «Maktubaning bu
 * haftadagi eng zaif mezoni nima?», «muddati o'tgan vazifalarni ko'rsat»,
 * «Muxlisaga ertaga 10:00 ga qayta qo'ng'iroq vazifasini qo'y».
 *
 * Bu yerda: ulash manzili, qadamma-qadam yo'riqnoma va ulangan ilovalar
 * (ruxsatni bekor qilish). Kalit yoki parol hech qayerga kiritilmaydi —
 * Claude OAuth orqali ulanadi va ruxsat shu saytda beriladi.
 */

interface Info {
  mcpUrl: string;
  ommaviy: boolean;
  ruxsatBeraOladi: boolean;
  ilovalar: { grantId: string; clientName: string; scope: ('read' | 'write')[]; ulangan: string; oxirgiFoydalanish: string | null }[];
}

const MISOLLAR = [
  'Bu haftada jamoa qanday ishladi? Eng zaif menejer va uning zaif mezoni qaysi?',
  'Maktubaning oxirgi 5 ta qo\'ng\'irog\'ini ko\'rib chiq — qayerda bitimni boy beryapti? Iqtiboslar bilan ko\'rsat.',
  'Hal qilinmagan qizil bayroqlarni ko\'rsat va har biri bo\'yicha nima qilish kerakligini ayt.',
  'Muddati o\'tgan vazifalar ro\'yxatini menejerlar kesimida ber.',
  'Sovib borayotgan lidlarni ko\'rsat — kimga birinchi qo\'ng\'iroq qilish kerak?',
];

export function ClaudeUlanishi() {
  const t = useT();
  const [info, setInfo] = useState<Info | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [nusxa, setNusxa] = useState<string | null>(null);
  const [band, setBand] = useState<string | null>(null);

  const yukla = useCallback(() => {
    void api
      .get<Info>('/api/v1/mcp/info')
      .then((r) => {
        setInfo(r);
        setXato(null);
      })
      .catch((e: unknown) => setXato(e instanceof ApiError ? e.message : t("Yuklab bo'lmadi")));
  }, [t]);
  useEffect(yukla, [yukla]);

  const nusxaOl = (matn: string, kalit: string) =>
    void navigator.clipboard?.writeText(matn).then(() => {
      setNusxa(kalit);
      setTimeout(() => setNusxa(null), 1800);
    });

  const bekorQil = async (grantId: string, nom: string) => {
    if (!window.confirm(t('«{nom}» ulanishi bekor qilinsinmi? Claude platformaga kira olmay qoladi (qayta ulash mumkin).', { nom }))) return;
    setBand(grantId);
    try {
      await api.del(`/api/v1/mcp/grants/${grantId}`);
      yukla();
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : t('Bekor qilinmadi'));
    } finally {
      setBand(null);
    }
  };

  if (xato && !info) return <div className="card sz-karta"><div className="yordam bzl-xato">{xato}</div></div>;
  if (!info) return <div className="card skelet" style={{ height: 320 }} aria-busy="true" />;

  const kodBuyruq = `claude mcp add --transport http sotuv-intellekti ${info.mcpUrl}`;

  return (
    <section className="card sz-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>{t('Claude ulanishi (MCP)')}</h2>
          <p>{t("Platformani o'z Claude akkauntingizdan boshqaring: savol bering — Claude haqiqiy ma'lumotdan javob beradi, kerak bo'lsa vazifa qo'yadi.")}</p>
        </div>
      </div>

      {!info.ruxsatBeraOladi && (
        <div className="bzl-izoh xato" role="status" style={{ marginBottom: 12 }}>
          <TriangleAlert aria-hidden="true" />
          <span>{t('Claude ulanishi faqat kompaniya egasi va rahbarlar uchun.')}</span>
        </div>
      )}

      <div className="cu-blok">
        <b className="bn-sarlavha">{t('Ulash manzili')}</b>
        <div className="cu-manzil">
          <code>{info.mcpUrl}</code>
          <button type="button" className="btn ikkinchi kichik" onClick={() => nusxaOl(info.mcpUrl, 'url')}>
            {nusxa === 'url' ? <Check /> : <Copy />} {nusxa === 'url' ? t('Nusxalandi') : t('Nusxalash')}
          </button>
        </div>
        {!info.ommaviy && (
          <div className="bzl-izoh" role="status">
            <TriangleAlert aria-hidden="true" />
            <span>
              {joyla(
                t('Bu manzil hozircha faqat shu kompyuterda ishlaydi — {code} va {desktop} uchun yetadi. {web} (brauzer va telefon) uchun sayt ommaviy HTTPS manzilda (serverda) turishi kerak.'),
                { code: <b>Claude Code</b>, desktop: <b>Claude Desktop</b>, web: <b>claude.ai</b> },
              )}
            </span>
          </div>
        )}
      </div>

      <div className="cu-blok">
        <b className="bn-sarlavha">{t('Qanday ulanadi')}</b>
        <ol className="bn-qadamlar">
          <li>
            {joyla(
              t('{ilova} Sozlamalar → {connectors} → {add} → nom: «Sotuv Intellekti», URL: yuqoridagi manzil → {qosh} → {ulash}.'),
              {
                ilova: <b>{t('claude.ai yoki Claude Desktop:')}</b>,
                connectors: <b>Connectors</b>,
                add: <b>Add custom connector</b>,
                qosh: <b>Add</b>,
                ulash: <b>Connect</b>,
              },
            )}
          </li>
          <li>
            <b>Claude Code:</b> {t('terminalda:')}
            <div className="cu-manzil">
              <code>{kodBuyruq}</code>
              <button type="button" className="btn ikkinchi kichik" onClick={() => nusxaOl(kodBuyruq, 'kod')}>
                {nusxa === 'kod' ? <Check /> : <Copy />}
              </button>
            </div>
            {joyla(t("so'ng {mcp} → sotuv-intellekti → {auth}."), { mcp: <code>/mcp</code>, auth: <b>Authenticate</b> })}
          </li>
          <li>
            {joyla(t('Brauzerda shu sayt ochiladi — kiring va ruxsat darajasini tanlang: {oqish} (xavfsiz boshlanish) yoki {boshqarish}.'), {
              oqish: <b>«{t("Faqat o'qish")}»</b>,
              boshqarish: <b>«{t("O'qish va boshqarish")}»</b>,
            })}
          </li>
          <li>{t("Tayyor. Claude'dan so'rang — u sizning huquqlaringiz doirasida ishlaydi; sotuvchi faqat o'zini ko'rgani kabi.")}</li>
        </ol>
      </div>

      <div className="cu-blok">
        <b className="bn-sarlavha">{t("Nimani so'rash mumkin")}</b>
        <ul className="cu-misollar">
          {MISOLLAR.map((asl) => {
            const m = t(asl);
            return (
              <li key={asl}>
                «{m}»
                <button type="button" className="cu-nusxa" aria-label={t('Nusxalash')} onClick={() => nusxaOl(m, asl)}>
                  {nusxa === asl ? <Check /> : <Copy />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="yordam">
          {joyla(t("Tayyor so'rovlar ham bor: Claude'da «/» bosib {haftalik} (haftalik sharh) yoki {kouching} (kouching rejasi)."), {
            haftalik: <b>weekly_review</b>,
            kouching: <b>coach_manager</b>,
          })}
        </div>
      </div>

      <div className="cu-blok">
        <b className="bn-sarlavha">{t('Ulangan ilovalar')}</b>
        {xato && <div className="yordam bzl-xato">{xato}</div>}
        {info.ilovalar.length === 0 ? (
          <div className="bn-bosh-holat">{t('Hali hech qanday ilova ulanmagan.')}</div>
        ) : (
          info.ilovalar.map((a) => (
            <div key={a.grantId} className="bn-manzil">
              <span className="sz-ikon">{a.scope.includes('write') ? <SlidersHorizontal /> : <Eye />}</span>
              <div className="bn-manzil-matn">
                <div>
                  <b>{a.clientName}</b>
                  <span className="bzl-pill info">{a.scope.includes('write') ? t("O'qish va boshqarish") : t("Faqat o'qish")}</span>
                </div>
                <small>
                  {t('Ulangan: {sana} · oxirgi foydalanish: {oxirgi}', {
                    sana: fmtSana(a.ulangan),
                    oxirgi: a.oxirgiFoydalanish ? fmtSana(a.oxirgiFoydalanish) : t("hali yo'q"),
                  })}
                </small>
              </div>
              <div className="bn-manzil-amal">
                <button type="button" className="bzl-amal bn-uz" disabled={band === a.grantId} onClick={() => void bekorQil(a.grantId, a.clientName)}>
                  {t('Bekor qilish')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="sz-eslatma">
        {t("Claude'ga hech qanday kalit yoki parol berilmaydi: u OAuth orqali ulanadi, ruxsatni shu saytda o'zingiz berasiz va istalgan payt bekor qilasiz. Parolni o'zgartirish, sessiyalar va admin panel kabi hisob amallari Claude orqali umuman bajarilmaydi. Claude'ga yuborilgan ma'lumot (suhbat matnlari, ismlar) Anthropic serverlaridan o'tadi.")}
      </p>
    </section>
  );
}
