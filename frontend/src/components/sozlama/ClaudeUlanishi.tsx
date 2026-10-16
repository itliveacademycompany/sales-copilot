import { Check, Copy, Eye, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, fmtSana } from '../../api';
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
      .catch((e: unknown) => setXato(e instanceof ApiError ? e.message : "Yuklab bo'lmadi"));
  }, []);
  useEffect(yukla, [yukla]);

  const nusxaOl = (matn: string, kalit: string) =>
    void navigator.clipboard?.writeText(matn).then(() => {
      setNusxa(kalit);
      setTimeout(() => setNusxa(null), 1800);
    });

  const bekorQil = async (grantId: string, nom: string) => {
    if (!window.confirm(`«${nom}» ulanishi bekor qilinsinmi? Claude platformaga kira olmay qoladi (qayta ulash mumkin).`)) return;
    setBand(grantId);
    try {
      await api.del(`/api/v1/mcp/grants/${grantId}`);
      yukla();
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'Bekor qilinmadi');
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
          <h2>Claude ulanishi (MCP)</h2>
          <p>Platformani o'z Claude akkauntingizdan boshqaring: savol bering — Claude haqiqiy ma'lumotdan javob beradi, kerak bo'lsa vazifa qo'yadi.</p>
        </div>
      </div>

      {!info.ruxsatBeraOladi && (
        <div className="bzl-izoh xato" role="status" style={{ marginBottom: 12 }}>
          <TriangleAlert aria-hidden="true" />
          <span>Claude ulanishi faqat kompaniya egasi va rahbarlar uchun.</span>
        </div>
      )}

      <div className="cu-blok">
        <b className="bn-sarlavha">Ulash manzili</b>
        <div className="cu-manzil">
          <code>{info.mcpUrl}</code>
          <button type="button" className="btn ikkinchi kichik" onClick={() => nusxaOl(info.mcpUrl, 'url')}>
            {nusxa === 'url' ? <Check /> : <Copy />} {nusxa === 'url' ? 'Nusxalandi' : 'Nusxalash'}
          </button>
        </div>
        {!info.ommaviy && (
          <div className="bzl-izoh" role="status">
            <TriangleAlert aria-hidden="true" />
            <span>
              Bu manzil hozircha faqat shu kompyuterda ishlaydi — <b>Claude Code</b> va <b>Claude Desktop</b> uchun yetadi. <b>claude.ai</b> (brauzer va
              telefon) uchun sayt ommaviy HTTPS manzilda (serverda) turishi kerak.
            </span>
          </div>
        )}
      </div>

      <div className="cu-blok">
        <b className="bn-sarlavha">Qanday ulanadi</b>
        <ol className="bn-qadamlar">
          <li>
            <b>claude.ai yoki Claude Desktop:</b> Sozlamalar → <b>Connectors</b> → <b>Add custom connector</b> → nom: «Sotuv Intellekti», URL: yuqoridagi
            manzil → <b>Add</b> → <b>Connect</b>.
          </li>
          <li>
            <b>Claude Code:</b> terminalda:
            <div className="cu-manzil">
              <code>{kodBuyruq}</code>
              <button type="button" className="btn ikkinchi kichik" onClick={() => nusxaOl(kodBuyruq, 'kod')}>
                {nusxa === 'kod' ? <Check /> : <Copy />}
              </button>
            </div>
            so'ng <code>/mcp</code> → sotuv-intellekti → <b>Authenticate</b>.
          </li>
          <li>
            Brauzerda shu sayt ochiladi — kiring va ruxsat darajasini tanlang: <b>«Faqat o'qish»</b> (xavfsiz boshlanish) yoki <b>«O'qish va boshqarish»</b>.
          </li>
          <li>Tayyor. Claude'dan so'rang — u sizning huquqlaringiz doirasida ishlaydi; sotuvchi faqat o'zini ko'rgani kabi.</li>
        </ol>
      </div>

      <div className="cu-blok">
        <b className="bn-sarlavha">Nimani so'rash mumkin</b>
        <ul className="cu-misollar">
          {MISOLLAR.map((m) => (
            <li key={m}>
              «{m}»
              <button type="button" className="cu-nusxa" aria-label="Nusxalash" onClick={() => nusxaOl(m, m)}>
                {nusxa === m ? <Check /> : <Copy />}
              </button>
            </li>
          ))}
        </ul>
        <div className="yordam">Tayyor so'rovlar ham bor: Claude'da «/» bosib <b>weekly_review</b> (haftalik sharh) yoki <b>coach_manager</b> (kouching rejasi).</div>
      </div>

      <div className="cu-blok">
        <b className="bn-sarlavha">Ulangan ilovalar</b>
        {xato && <div className="yordam bzl-xato">{xato}</div>}
        {info.ilovalar.length === 0 ? (
          <div className="bn-bosh-holat">Hali hech qanday ilova ulanmagan.</div>
        ) : (
          info.ilovalar.map((a) => (
            <div key={a.grantId} className="bn-manzil">
              <span className="sz-ikon">{a.scope.includes('write') ? <SlidersHorizontal /> : <Eye />}</span>
              <div className="bn-manzil-matn">
                <div>
                  <b>{a.clientName}</b>
                  <span className="bzl-pill info">{a.scope.includes('write') ? "O'qish va boshqarish" : "Faqat o'qish"}</span>
                </div>
                <small>
                  Ulangan: {fmtSana(a.ulangan)} · oxirgi foydalanish: {a.oxirgiFoydalanish ? fmtSana(a.oxirgiFoydalanish) : 'hali yo\'q'}
                </small>
              </div>
              <div className="bn-manzil-amal">
                <button type="button" className="bzl-amal bn-uz" disabled={band === a.grantId} onClick={() => void bekorQil(a.grantId, a.clientName)}>
                  Bekor qilish
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="sz-eslatma">
        Claude'ga hech qanday kalit yoki parol berilmaydi: u OAuth orqali ulanadi, ruxsatni shu saytda o'zingiz berasiz va istalgan payt bekor qilasiz.
        Parolni o'zgartirish, sessiyalar va admin panel kabi hisob amallari Claude orqali umuman bajarilmaydi. Claude'ga yuborilgan ma'lumot (suhbat
        matnlari, ismlar) Anthropic serverlaridan o'tadi.
      </p>
    </section>
  );
}
