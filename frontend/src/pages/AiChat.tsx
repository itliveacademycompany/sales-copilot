import {
  ArrowRight,
  Check,
  Copy,
  CornerDownLeft,
  MessageSquarePlus,
  MessagesSquare,
  SendHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtSana, type AlertRow } from '../api';
import { useAuth } from '../auth';
import { TepaPanel } from '../components/bosh/TepaPanel';
import { davrniTop, javobBer, niyatniTop, type Javob, type Niyat } from '../components/chat/javob';

/**
 * AI Chat — jamoa ma'lumotlari bo'yicha yordamchi.
 *
 * Bo'sh holatda — salomlashuv, katta xabar maydoni va tayyor savol
 * kartochkalari. Suhbat boshlangach xabarlar ko'rinadi, maydon pastga
 * tushadi. Suhbatlar tarixi brauzerda (har foydalanuvchiga alohida)
 * saqlanadi — sahifa yangilansa yo'qolmaydi.
 *
 * Javoblar qayerdan kelishi — `components/chat/javob.ts` izohida.
 */

interface Xabar {
  id: string;
  rol: 'men' | 'yordamchi';
  matn: string;
  havola?: Javob['havola'];
  vaqt: string;
}

interface Sessiya {
  id: string;
  sarlavha: string;
  yangilangan: string;
  xabarlar: Xabar[];
}

interface Karta {
  niyat: Niyat;
  sarlavha: string;
  savol: string;
}

const KARTALAR_RAHBAR: Karta[] = [
  {
    niyat: 'kpi',
    sarlavha: 'Sotuv ko\'rsatkichlari',
    savol: 'Bugungi sotuv ko\'rsatkichlarini ko\'rsating. Qancha suhbat bo\'ldi, nechtasi tahlil qilindi?',
  },
  {
    niyat: 'yetakchi',
    sarlavha: 'Eng yaxshi menejer',
    savol: 'Shu hafta eng yaxshi natija ko\'rsatgan menejer kim? Uning ko\'rsatkichlari qanday?',
  },
  {
    niyat: 'zaif',
    sarlavha: 'Suhbat tahlili',
    savol: 'Oxirgi suhbatlarni tahlil qiling. Qaysi bosqichda yaxshilanish kerak?',
  },
  {
    niyat: 'issiq',
    sarlavha: 'Lidlar holati',
    savol: 'Hozirgi lidlar holati qanday? Yopilishga eng yaqin issiq lidlar qaysilar?',
  },
];

const KARTA_SOTUVCHI: Karta = {
  niyat: 'javobsiz',
  sarlavha: 'Javobsiz mijozlar',
  savol: 'Javob kutayotgan mijozlarim bormi? Kimga qayta yozishim kerak?',
};

const QOSHIMCHA: { niyat: Niyat; matn: string }[] = [
  { niyat: 'javobsiz', matn: 'Javob kutayotgan mijozlar bormi?' },
  { niyat: 'vazifa', matn: 'Kechikkan vazifalar bormi?' },
  { niyat: 'kpi', matn: 'Bu hafta ko\'rsatkichlar qanday?' },
];

const PANEL_KALIT = 'sotuvai-chat-panel';

const yangiId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function oqi(kalit: string): Sessiya[] {
  try {
    return JSON.parse(localStorage.getItem(kalit) ?? '[]') as Sessiya[];
  } catch {
    return [];
  }
}

export function AiChat() {
  const { business, user } = useAuth();
  const KALIT = `sotuvai-chat-${user?.id ?? 'mehmon'}`;

  const [sessiyalar, setSessiyalar] = useState<Sessiya[]>(() => oqi(KALIT));
  const [faolId, setFaolId] = useState<string | null>(null);
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  /** Tarix paneli ochiq/yopiqligi eslab qolinadi (kompyuterda). */
  const [tarixOchiq, setTarixOchiq] = useState(() => {
    try {
      return localStorage.getItem(PANEL_KALIT) === '1' && !window.matchMedia('(max-width: 860px)').matches;
    } catch {
      return false;
    }
  });
  const tarixniAlmashtir = (ochiq: boolean) => {
    setTarixOchiq(ochiq);
    try {
      localStorage.setItem(PANEL_KALIT, ochiq ? '1' : '0');
    } catch {
      /* e'tiborsiz */
    }
  };
  const [nusxa, setNusxa] = useState<string | null>(null);
  const [ogohSoni, setOgohSoni] = useState(0);
  const pastki = useRef<HTMLDivElement>(null);
  const maydon = useRef<HTMLTextAreaElement>(null);

  const faol = sessiyalar.find((s) => s.id === faolId) ?? null;
  const xabarlar = faol?.xabarlar ?? [];
  const rahbar = business?.permissions.includes('analytics:read:all') ?? false;
  const kartalar = rahbar ? KARTALAR_RAHBAR : [KARTALAR_RAHBAR[0]!, KARTA_SOTUVCHI, KARTALAR_RAHBAR[2]!, KARTALAR_RAHBAR[3]!];
  const ism = user?.displayName?.split(' ')[0] ?? '';

  // Tarix brauzerda saqlanadi (oxirgi 30 suhbat)
  useEffect(() => {
    try {
      localStorage.setItem(KALIT, JSON.stringify(sessiyalar.slice(0, 30)));
    } catch {
      /* xotira to'lgan yoki yopiq — chat baribir ishlaydi */
    }
  }, [sessiyalar, KALIT]);

  useEffect(() => {
    if (!business?.permissions.includes('alert:read')) return;
    void api
      .get<{ alerts: AlertRow[]; unseenCount: number }>(`/api/v1/businesses/${business.businessId}/alerts?limit=1`)
      .then((r) => setOgohSoni(r.unseenCount))
      .catch(() => undefined);
  }, [business]);

  useEffect(() => {
    pastki.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [xabarlar.length, band]);

  // Xabar maydoni matnga qarab balandlashadi (ko'pi bilan ~6 qator)
  useEffect(() => {
    const el = maydon.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [matn]);

  const xabarQosh = (sessiyaId: string, x: Omit<Xabar, 'id' | 'vaqt'>) =>
    setSessiyalar((v) =>
      v.map((s) =>
        s.id === sessiyaId
          ? {
              ...s,
              yangilangan: new Date().toISOString(),
              xabarlar: [...s.xabarlar, { ...x, id: yangiId(), vaqt: new Date().toISOString() }],
            }
          : s,
      ),
    );

  async function sora(savol: string, niyat: Niyat | null) {
    const t = savol.trim();
    if (!business || band || !t) return;

    let id = faolId;
    if (!id || !faol) {
      id = yangiId();
      const s: Sessiya = {
        id,
        sarlavha: t.length > 60 ? `${t.slice(0, 57)}…` : t,
        yangilangan: new Date().toISOString(),
        xabarlar: [],
      };
      setSessiyalar((v) => [s, ...v]);
      setFaolId(id);
    }
    const sid = id;
    xabarQosh(sid, { rol: 'men', matn: t });
    setMatn('');

    if (!niyat) {
      xabarQosh(sid, {
        rol: 'yordamchi',
        matn:
          'Bu savolga hozircha javob bera olmayman — erkin savollarga javob beruvchi AI yordamchi ' +
          'server tomonda hali ulanmagan.\nQuyidagi mavzular bo\'yicha so\'rang — ularga sizning ' +
          'ma\'lumotlaringizdan aniq javob beraman: ko\'rsatkichlar, eng yaxshi menejer, zaif bosqich, ' +
          'lidlar holati, javobsiz mijozlar, kechikkan vazifalar.',
      });
      return;
    }

    setBand(true);
    try {
      const j = await javobBer(niyat, business, davrniTop(t));
      xabarQosh(sid, { rol: 'yordamchi', matn: j.matn, havola: j.havola });
    } catch {
      xabarQosh(sid, { rol: 'yordamchi', matn: 'Ma\'lumotni olib bo\'lmadi. Birozdan keyin qayta urinib ko\'ring.' });
    } finally {
      setBand(false);
      maydon.current?.focus();
    }
  }

  const yubor = () => void sora(matn, niyatniTop(matn));
  const klaviatura = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter — yuborish, Shift+Enter — yangi qator
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      yubor();
    }
  };

  const yangiSuhbat = () => {
    setFaolId(null);
    setMatn('');
    // Kompyuterda panel mahkamlangan — ochiq qoladi; telefonda kontentni yopmasin
    if (window.matchMedia('(max-width: 860px)').matches) setTarixOchiq(false);
    setTimeout(() => maydon.current?.focus(), 0);
  };

  const nusxaOl = async (x: Xabar) => {
    try {
      await navigator.clipboard.writeText(x.matn);
      setNusxa(x.id);
      setTimeout(() => setNusxa(null), 1500);
    } catch {
      /* clipboard ruxsat berilmagan */
    }
  };

  if (!business) return null;

  const tarkib = (
    <div className={`chat2-maydon${band ? ' band' : ''}`}>
      <textarea
        ref={maydon}
        rows={1}
        value={matn}
        onChange={(e) => setMatn(e.target.value)}
        onKeyDown={klaviatura}
        placeholder="Xabar yozing…"
        aria-label="Xabar"
        disabled={band}
        autoFocus
      />
      <span className="chat2-ishora" aria-hidden="true">
        <CornerDownLeft /> Yuborish
      </span>
      <button
        type="button"
        className="chat2-yubor"
        onClick={yubor}
        disabled={band || matn.trim() === ''}
        aria-label="Yuborish"
      >
        <SendHorizontal />
      </button>
    </div>
  );

  return (
    <div className="chat2">
      <TepaPanel
        biznesNomi={business.name}
        foydalanuvchi={user?.displayName ?? ''}
        ogohSoni={ogohSoni}
        ogohKoradi={business.permissions.includes('alert:read')}
        suhbatlar={[]}
      />

      <div className={`chat2-ish${tarixOchiq ? ' tarixli' : ''}`}>
        {tarixOchiq ? (
          <>
            {/* Telefonda panel kontent ustida ochiladi — fonga bosilsa yopiladi */}
            <button className="chat2-parda" aria-label="Tarixni yopish" onClick={() => tarixniAlmashtir(false)} />
            <aside className="chat2-tarix" aria-label="Suhbatlar tarixi">
              <div className="chat2-tarix-bosh">
                <button
                  type="button"
                  className="chat2-asbob"
                  onClick={() => tarixniAlmashtir(false)}
                  aria-expanded
                  aria-label="Suhbatlar panelini yopish"
                  title="Panelni yopish"
                >
                  <MessagesSquare />
                </button>
                <span className="chat2-tarix-nom">Suhbatlar</span>
                <button
                  type="button"
                  className="chat2-yopish"
                  onClick={yangiSuhbat}
                  aria-label="Yangi suhbat"
                  title="Yangi suhbat"
                >
                  <MessageSquarePlus />
                </button>
              </div>
              {sessiyalar.length === 0 ? (
                <div className="chat2-tarix-bosh-matn">Suhbatlar mavjud emas</div>
              ) : (
                <ul>
                  {sessiyalar.map((s) => (
                    <li key={s.id} className={s.id === faolId ? 'faol' : ''}>
                      <button
                        type="button"
                        className="chat2-tarix-band"
                        onClick={() => {
                          setFaolId(s.id);
                          if (window.matchMedia('(max-width: 860px)').matches) tarixniAlmashtir(false);
                        }}
                      >
                        <b>{s.sarlavha}</b>
                        <small>
                          {fmtSana(s.yangilangan)} · {s.xabarlar.length} xabar
                        </small>
                      </button>
                      <button
                        type="button"
                        className="chat2-ochir"
                        aria-label="Suhbatni o'chirish"
                        title="O'chirish"
                        onClick={() => {
                          setSessiyalar((v) => v.filter((x) => x.id !== s.id));
                          if (faolId === s.id) setFaolId(null);
                        }}
                      >
                        <Trash2 />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </>
        ) : (
          <div className="chat2-asboblar">
            <button
              type="button"
              className="chat2-asbob"
              onClick={() => tarixniAlmashtir(true)}
              aria-expanded={false}
              aria-label="Suhbatlar tarixini ochish"
              title="Suhbatlar tarixi"
            >
              <MessagesSquare />
              {sessiyalar.length > 0 && <span className="chat2-asbob-son">{sessiyalar.length}</span>}
            </button>
            {faol && (
              <button type="button" className="chat2-asbob" onClick={yangiSuhbat} aria-label="Yangi suhbat" title="Yangi suhbat">
                <MessageSquarePlus />
              </button>
            )}
          </div>
        )}

        <div className="chat2-asosiy">
        {xabarlar.length === 0 ? (
          <div className="chat2-salom">
            <span className="chat2-logo" aria-hidden="true">
              <Sparkles />
            </span>
            <h1>Salom{ism ? `, ${ism}` : ''}</h1>
            <p>Bugun sizga qanday yordam bera olaman?</p>
            {tarkib}
            <div className="chat2-kartalar">
              {kartalar.map((k) => (
                <button
                  key={k.sarlavha}
                  type="button"
                  className="chat2-karta"
                  onClick={() => void sora(k.savol, k.niyat)}
                  disabled={band}
                >
                  <b>{k.sarlavha}</b>
                  <span>{k.savol}</span>
                  <ArrowRight className="chat2-karta-strelka" aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="chat2-eslatma">
              Javoblar sizning haqiqiy ma'lumotlaringizdan hisoblanadi. Erkin savollarga AI javobi server
              tomonda ulangach ishlaydi.
            </p>
          </div>
        ) : (
          <div className="chat2-suhbat">
            <div className="chat2-xabarlar" aria-live="polite">
              {xabarlar.map((x) => (
                <div key={x.id} className={`chat2-qator ${x.rol}`}>
                  {x.rol === 'yordamchi' && (
                    <span className="chat2-avatar" aria-hidden="true">
                      <Sparkles />
                    </span>
                  )}
                  <div className="chat2-pufak">
                    <div className="chat2-matn">{x.matn}</div>
                    {x.havola && (
                      <Link to={x.havola.to} className="chat2-havola">
                        {x.havola.nom} <ArrowRight />
                      </Link>
                    )}
                    {x.rol === 'yordamchi' && (
                      <button type="button" className="chat2-nusxa" onClick={() => void nusxaOl(x)} title="Nusxa olish">
                        {nusxa === x.id ? <Check /> : <Copy />}
                        {nusxa === x.id ? 'Nusxa olindi' : 'Nusxa'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {band && (
                <div className="chat2-qator yordamchi">
                  <span className="chat2-avatar" aria-hidden="true">
                    <Sparkles />
                  </span>
                  <div className="chat2-pufak chat-yozmoqda" aria-label="Javob tayyorlanmoqda">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
              {/* Yangi xabarga aylantirish nuqtasi — pastki panel uni yopib qo'ymasligi uchun zaxira bilan */}
              <div ref={pastki} className="chat2-oxiri" />
            </div>

            <div className="chat2-pastki">
              <div className="chat2-takliflar">
                {QOSHIMCHA.map((q) => (
                  <button key={q.matn} type="button" className="chip-tugma" disabled={band} onClick={() => void sora(q.matn, q.niyat)}>
                    {q.matn}
                  </button>
                ))}
              </div>
              {tarkib}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
