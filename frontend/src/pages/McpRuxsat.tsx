import { BadgeCheck, Eye, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import '../components/sozlama/claudeUlanishi.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLAUDE (MCP) ULANISHIGA RUXSAT — OAuth rozilik sahifasi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Claude foydalanuvchini `/oauth/authorize` orqali shu yerga yuboradi (URL
 * parametrlari bilan). Foydalanuvchi kirmagan bo'lsa — App avval kirish
 * ekranini ko'rsatadi, kirgach URL saqlangani uchun shu sahifa ochiladi.
 *
 * Ruxsat berilsa — server bir martalik kod yasaydi va biz brauzerni
 * Claude'ning qaytish manziliga yo'naltiramiz. Server so'rovni QAYTA
 * tekshiradi: bu sahifadagi ma'lumotga ishonilmaydi.
 */

interface Malumot {
  clientName: string;
  redirectHost: string;
  claudeRasmiy: boolean;
  scope: ('read' | 'write')[];
  ruxsatBeraOladi: boolean;
  foydalanuvchi: { displayName: string; email: string | null };
  bizneslar: { name: string; role: string }[];
}

const ROL: Record<string, string> = { owner: 'Ega', supervisor: 'Rahbar', head: "Bo'lim boshlig'i", auditor: 'Auditor', manager: 'Sotuvchi' };

export function McpRuxsat() {
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(window.location.search)), []);
  const [m, setM] = useState<Malumot | null>(null);
  const [xato, setXato] = useState('');
  const [tanlov, setTanlov] = useState<'read' | 'write'>('read');
  const [band, setBand] = useState(false);

  useEffect(() => {
    void api
      .post<Malumot>('/api/v1/oauth/authorize/info', params)
      .then((r) => {
        setM(r);
        // So'ralmagan ruxsat taklif qilinmaydi; so'ralgan bo'lsa ham standart — xavfsizrog'i.
        setTanlov('read');
      })
      .catch((e: unknown) => setXato(e instanceof ApiError ? e.message : "Server bilan bog'lanib bo'lmadi"));
  }, [params]);

  const qaror = async (approve: boolean) => {
    setBand(true);
    setXato('');
    try {
      const r = await api.post<{ redirect: string }>('/api/v1/oauth/authorize/decide', { params, approve, scope: tanlov });
      window.location.assign(r.redirect);
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : "Server bilan bog'lanib bo'lmadi");
      setBand(false);
    }
  };

  const yozishSoralgan = m?.scope.includes('write') ?? false;

  return (
    <div className="login-fon">
      <div className="login-card mcp-ruxsat">
        <div className="logo">
          Sotuv<em>AI</em>
        </div>

        {xato && !m ? (
          <>
            <div className="kirish-izoh">Ulanib bo'lmadi</div>
            <div className="xato-banner">
              {xato}
              <div style={{ marginTop: 6, fontSize: 12 }}>Claude'da ulanishni qaytadan boshlang.</div>
            </div>
          </>
        ) : !m ? (
          <div className="kirish-izoh" aria-busy="true">
            So'rov tekshirilmoqda…
          </div>
        ) : (
          <>
            <div className="kirish-izoh">
              <b>{m.clientName}</b> sizning Sotuv Intellekti hisobingizga kirishni so'ramoqda.
            </div>

            <div className={`mcp-manba${m.claudeRasmiy ? ' rasmiy' : ''}`}>
              {m.claudeRasmiy ? <BadgeCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
              <span>
                Javob <b>{m.redirectHost}</b> ga qaytariladi
                {m.claudeRasmiy ? " — Claude'ning rasmiy manzili." : '. Bu manzilni tanimasangiz — rad eting.'}
              </span>
            </div>

            <div className="mcp-kim">
              <b>{m.foydalanuvchi.displayName}</b>
              {m.foydalanuvchi.email && <small> · {m.foydalanuvchi.email}</small>}
              <div className="yordam">{m.bizneslar.map((b) => `${b.name} (${ROL[b.role] ?? b.role})`).join(', ')}</div>
            </div>

            {!m.ruxsatBeraOladi ? (
              <div className="xato-banner">
                Claude ulanishi faqat kompaniya egasi va rahbarlar uchun. Rahbaringizga murojaat qiling.
              </div>
            ) : (
              <div className="mcp-tanlov" role="radiogroup" aria-label="Ruxsat darajasi">
                <label className={tanlov === 'read' ? 'faol' : undefined}>
                  <input type="radio" name="mcp-scope" checked={tanlov === 'read'} onChange={() => setTanlov('read')} />
                  <Eye aria-hidden="true" />
                  <span>
                    <b>Faqat o'qish</b>
                    <small>Ko'rsatkichlar, suhbatlar va baholar, ogohlantirishlar, vazifalar, hisobotlar. Hech narsa o'zgartirilmaydi.</small>
                  </span>
                </label>
                <label className={`${tanlov === 'write' ? 'faol' : ''}${yozishSoralgan ? '' : ' ochiq-emas'}`}>
                  <input type="radio" name="mcp-scope" disabled={!yozishSoralgan} checked={tanlov === 'write'} onChange={() => setTanlov('write')} />
                  <SlidersHorizontal aria-hidden="true" />
                  <span>
                    <b>O'qish va boshqarish</b>
                    <small>
                      Qo'shimcha: vazifa yaratish, ogohlantirishni yopish, izoh qoldirish, Moi Zvonki sinxronlash, qayta baholash.
                      {!yozishSoralgan && ' (Claude buni so\'ramadi.)'}
                    </small>
                  </span>
                </label>
              </div>
            )}

            {xato && <div className="xato-banner">{xato}</div>}

            <div className="mcp-tugmalar">
              <button type="button" className="btn ikkinchi" disabled={band} onClick={() => void qaror(false)}>
                Rad etish
              </button>
              {m.ruxsatBeraOladi && (
                <button type="button" className="btn" disabled={band} onClick={() => void qaror(true)}>
                  {band ? 'Yuborilmoqda…' : 'Ruxsat berish'}
                </button>
              )}
            </div>

            <div className="yordam" style={{ marginTop: 12, textAlign: 'center' }}>
              Claude faqat sizning huquqlaringiz doirasida ishlaydi. Ruxsatni istalgan payt Sozlamalar → Claude ulanishi bo'limidan bekor qilasiz.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
