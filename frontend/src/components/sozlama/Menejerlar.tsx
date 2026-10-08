import { Check, Copy, Ellipsis, Hash, KeyRound, Pencil, Phone, Power, Search, Send, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type SeatFull } from '../../api';
import { avatarRang, boshHarf } from '../bosh/malumot';
import { useTashqiBosish } from '../qongiroq/Filtrlar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → MENEJERLAR (FR-164)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Menejer = o'rin (seat), litsenziya birligi. O'chirish serverda yumshoq:
 * qator qoladi (tarixiy analitika buzilmasin), faqat `isActive = false`.
 */

type Holat = 'faol' | 'nofaol';
const AKTIV: Record<SeatFull['activation'], { nom: string; ton: string }> = {
  active: { nom: 'Aktivatsiya qilingan', ton: 'yaxshi' },
  pending: { nom: 'Aktivatsiya kutilmoqda', ton: 'orta' },
  suspended: { nom: "To'xtatilgan", ton: 'xavf' },
};
const CRM_KALIT = 'crm';

/** Modal oynalar — bitta holatda, bir vaqtda faqat bittasi ochiq. */
type Oyna =
  | { tur: 'havola'; seat: SeatFull; nom: string; havola: string | null; kod: string; izoh: ReactNode }
  | { tur: 'tahrir'; seat: SeatFull | null }
  | { tur: 'telegram'; seat: SeatFull };

export function Menejerlar({ businessId }: { businessId: string }) {
  const base = `/api/v1/businesses/${businessId}/seats`;
  const [rows, setRows] = useState<SeatFull[] | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [oyna, setOyna] = useState<Oyna | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const yukla = useCallback(() => {
    void api
      .get<SeatFull[]>(base)
      .then(setRows)
      .catch(() => setRows([]));
  }, [base]);
  useEffect(yukla, [yukla]);

  const xabar = (m: string) => {
    setOk(m);
    setTimeout(() => setOk(null), 2500);
  };
  const amal = async (id: string, fn: () => Promise<unknown>, muvaffaqiyat?: string) => {
    setBand(id);
    setXato(null);
    try {
      await fn();
      if (muvaffaqiyat) xabar(muvaffaqiyat);
      yukla();
      return true;
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : "Amal bajarilmadi — qayta urinib ko'ring");
      return false;
    } finally {
      setBand(null);
    }
  };

  /** Faol, kirgan menejer — parol tiklash havolasi (haqiqiy sahifa bor). */
  const kirishHavolasi = (s: SeatFull) =>
    void amal(s.id, async () => {
      const r = await api.post<{ resetToken: string }>(`/api/v1/businesses/${businessId}/users/${s.userId}/reset-link`);
      setOyna({
        tur: 'havola',
        seat: s,
        nom: 'Kirish havolasi',
        havola: `${window.location.origin}/parol-tiklash/${r.resetToken}`,
        kod: r.resetToken,
        izoh: (
          <>
            Menejer shu havola orqali yangi parol o'rnatib kiradi. Havola <b>bir marta</b> ishlaydi va <b>30 daqiqadan</b> keyin eskiradi.
          </>
        ),
      });
    });

  /** Hali kirmagan menejer — aktivatsiya kodi. */
  const aktivatsiya = (s: SeatFull) =>
    void amal(
      s.id,
      async () => {
        const r = await api.post<{ activationToken: string }>(`${base}/${s.id}/activation-link`);
        setOyna({
          tur: 'havola',
          seat: s,
          nom: 'Aktivatsiya havolasi',
          havola: null,
          kod: r.activationToken,
          izoh: (
            <>
              Kod <b>faqat hozir</b> ko'rinadi va bir marta ishlaydi. Diqqat: kodni qabul qiladigan aktivatsiya sahifasi serverda hali yo'q — kod saqlandi,
              lekin menejer u bilan hozircha kira olmaydi. Aktivatsiya sahifasi backend'ga qo'shilgach, shu kod ishlaydi.
            </>
          ),
        });
      },
    );

  const q = qidiruv.trim().toLowerCase();
  const korinadi = (rows ?? []).filter(
    (s) =>
      !q ||
      [s.displayName, s.login ?? '', ...s.phoneNumbers, ...Object.values(s.externalIds ?? {})].some((v) => v.toLowerCase().includes(q)),
  );
  const faol = rows?.filter((s) => s.isActive) ?? [];
  const bosh = faol.filter((s) => !s.isOccupied).length;

  return (
    <section className="card sz-karta rh-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>Menejerlar</h2>
          <p>CRM menejerlar uchun login yarating va aktivatsiya havolasini yuboring.</p>
        </div>
        <button type="button" className="btn" onClick={() => setOyna({ tur: 'tahrir', seat: null })}>
          Yangi menejer
        </button>
      </div>

      <div className="rh-statlar">
        <div>
          <b>{rows ? faol.length : '—'}</b>
          <span>Jami o'rinlar</span>
        </div>
        <div className="faol">
          <b>{rows ? faol.length - bosh : '—'}</b>
          <span>Faol menejerlar</span>
        </div>
        <div className="info">
          <b>{rows ? bosh : '—'}</b>
          <span>Bo'sh o'rinlar</span>
        </div>
        {rows && rows.length > faol.length && (
          <div className="ochirilgan">
            <b>{rows.length - faol.length}</b>
            <span>O'chirilgan</span>
          </div>
        )}
      </div>

      <div className="maydon-blok mj-qidiruv">
        <label htmlFor="mj-q">Qo'shilgan menejerlarni qidirish</label>
        <div className="mj-qidiruv-maydon">
          <Search aria-hidden="true" />
          <input
            id="mj-q"
            type="text"
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            placeholder="Ism, telefon, login yoki CRM ID bo'yicha qidiring"
            autoComplete="off"
          />
        </div>
      </div>

      {xato && (
        <div className="bzl-izoh xato" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{xato}</span>
        </div>
      )}
      {ok && (
        <div className="rh-ok" role="status">
          <Check aria-hidden="true" /> {ok}
        </div>
      )}

      {!rows ? (
        <div className="card skelet" style={{ height: 96 }} aria-busy="true" />
      ) : rows.length === 0 ? (
        <div className="bn-bosh-holat">Hali menejer qo'shilmagan — «Yangi menejer» tugmasi orqali qo'shing.</div>
      ) : korinadi.length === 0 ? (
        <div className="bn-bosh-holat">«{qidiruv}» bo'yicha menejer topilmadi.</div>
      ) : (
        <ul className="rh-royxat">
          {korinadi.map((s) => {
            const h: Holat = s.isActive ? 'faol' : 'nofaol';
            const a = AKTIV[s.activation] ?? { nom: s.activation, ton: '' };
            const crm = s.externalIds?.[CRM_KALIT];
            return (
              <li key={s.id} className={h === 'nofaol' ? 'nofaol' : undefined} aria-busy={band === s.id}>
                <span className="rh-avatar" style={{ ['--rang' as string]: avatarRang(s.id) }} aria-hidden="true">
                  {boshHarf(s.displayName)}
                </span>
                <div className="rh-matn">
                  <div className="rh-nom">
                    <b>{s.displayName}</b>
                    <span className={`bzl-pill ${h === 'faol' ? 'yaxshi' : 'xavf'}`}>{h === 'faol' ? 'Faol' : "O'chirilgan"}</span>
                    {h === 'faol' && <span className={`bzl-pill ${a.ton}`}>{a.nom}</span>}
                    {s.telegramLinked && <span className="bzl-pill info">Telegram</span>}
                  </div>
                  <div className="rh-qator">
                    <span title="Login">
                      <KeyRound aria-hidden="true" /> {s.login ?? 'login yoʻq'}
                    </span>
                    {s.phoneNumbers.length > 0 && (
                      <span title="Telefon">
                        <Phone aria-hidden="true" /> {s.phoneNumbers.join(', ')}
                      </span>
                    )}
                    {crm && (
                      <span title="CRM ID">
                        <Hash aria-hidden="true" /> {crm}
                      </span>
                    )}
                  </div>
                </div>
                <div className="rh-sana">
                  <Phone aria-hidden="true" />
                  <div>
                    <small>Qo'ng'iroqlar</small>
                    <b>{s.totalConversations}</b>
                  </div>
                </div>
                {!s.isActive ? (
                  <button type="button" className="mj-asosiy" onClick={() => void amal(s.id, () => api.patch(`${base}/${s.id}`, { isActive: true }), 'Faollashtirildi')}>
                    Faollashtirish
                  </button>
                ) : s.activation === 'active' && s.userId ? (
                  <button type="button" className="mj-asosiy" onClick={() => kirishHavolasi(s)} title="Kirish (parol tiklash) havolasini qayta yaratish">
                    Qayta yuborish
                  </button>
                ) : (
                  <button type="button" className="mj-asosiy" onClick={() => aktivatsiya(s)}>
                    Aktivatsiya havolasini olish
                  </button>
                )}
                <MenejerMenyu
                  s={s}
                  band={band === s.id}
                  onTelegram={() => setOyna({ tur: 'telegram', seat: s })}
                  onTahrir={() => setOyna({ tur: 'tahrir', seat: s })}
                  onOchir={() => {
                    if (!window.confirm(`${s.displayName} o'chirilsinmi? Suhbatlar va baholar saqlanib qoladi, o'rin bo'shaydi.`)) return;
                    void amal(s.id, () => api.del(`${base}/${s.id}`), `${s.displayName} o'chirildi`);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      {oyna?.tur === 'havola' && <HavolaOynasi {...oyna} onYop={() => setOyna(null)} />}
      {oyna?.tur === 'tahrir' && (
        <TahrirOynasi
          base={base}
          seat={oyna.seat}
          onYop={() => setOyna(null)}
          onSaqlandi={(nom, yangi) => {
            setOyna(null);
            xabar(yangi ? `${nom} qo'shildi — endi aktivatsiya havolasini oling` : 'Saqlandi');
            yukla();
          }}
        />
      )}
      {oyna?.tur === 'telegram' && (
        <TelegramOynasi
          businessId={businessId}
          seat={oyna.seat}
          onYop={() => setOyna(null)}
          onSaqlandi={(m) => {
            setOyna(null);
            xabar(m);
            yukla();
          }}
        />
      )}
    </section>
  );
}

// ─── ⋯ menyusi ──────────────────────────────────────────────────────────────

function MenejerMenyu({
  s,
  band,
  onTelegram,
  onTahrir,
  onOchir,
}: {
  s: SeatFull;
  band: boolean;
  onTelegram: () => void;
  onTahrir: () => void;
  onOchir: () => void;
}) {
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useTashqiBosish(ref, ochiq, () => setOchiq(false));
  const bajar = (fn: () => void) => () => {
    setOchiq(false);
    fn();
  };
  return (
    <div className="rh-menyu" ref={ref} onKeyDown={(e) => e.key === 'Escape' && setOchiq(false)}>
      <button
        type="button"
        className="rh-uchnuqta"
        aria-label={`${s.displayName} — amallar`}
        aria-haspopup="menu"
        aria-expanded={ochiq}
        disabled={band}
        onClick={() => setOchiq((v) => !v)}
      >
        <Ellipsis />
      </button>
      {ochiq && (
        <div className="rh-menyu-royxat" role="menu">
          <button type="button" role="menuitem" onClick={bajar(onTelegram)}>
            <Send className="mj-tg" /> {s.telegramLinked ? 'Telegram (ulangan)' : 'Telegram ulash'}
          </button>
          <button type="button" role="menuitem" onClick={bajar(onTahrir)}>
            <Pencil /> Almashtirish
          </button>
          {s.isActive && (
            <button type="button" role="menuitem" className="xavf" onClick={bajar(onOchir)}>
              <Trash2 /> O'chirish
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal asosi ────────────────────────────────────────────────────────────

function Modal({ sarlavha, onYop, children, onSubmit }: { sarlavha: string; onYop: () => void; children: ReactNode; onSubmit?: (e: FormEvent) => void }) {
  useEffect(() => {
    const tugma = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', tugma);
    return () => window.removeEventListener('keydown', tugma);
  }, [onYop]);
  const Ich = onSubmit ? 'form' : 'div';
  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <Ich className="vr-oyna mj-oyna" role="dialog" aria-modal="true" aria-labelledby="mj-oyna-nom" onSubmit={onSubmit} noValidate={onSubmit ? true : undefined}>
        <div className="vr-oyna-bosh">
          <h3 id="mj-oyna-nom">{sarlavha}</h3>
          <button type="button" className="mj-yop" onClick={onYop} aria-label="Yopish">
            <X />
          </button>
        </div>
        {children}
      </Ich>
    </div>,
    document.body,
  );
}

function HavolaOynasi({ seat, nom, havola, kod, izoh, onYop }: { seat: SeatFull; nom: string; havola: string | null; kod: string; izoh: ReactNode; onYop: () => void }) {
  const [nusxa, setNusxa] = useState(false);
  const matn = havola ?? kod;
  return (
    <Modal sarlavha={nom} onYop={onYop}>
      <div className="mj-login">
        Login: <code>{seat.login ?? '—'}</code>
      </div>
      <div className="mj-havola">
        <code>{matn}</code>
      </div>
      <p className="sz-eslatma">{izoh}</p>
      <div className="vr-oyna-past">
        <button
          type="button"
          className="btn"
          autoFocus
          onClick={() =>
            void navigator.clipboard?.writeText(matn).then(() => {
              setNusxa(true);
              setTimeout(() => setNusxa(false), 1800);
            })
          }
        >
          {nusxa ? <Check /> : <Copy />} {nusxa ? 'Nusxalandi' : 'Nusxalash'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Yangi menejer / Almashtirish ───────────────────────────────────────────

function TahrirOynasi({ base, seat, onYop, onSaqlandi }: { base: string; seat: SeatFull | null; onYop: () => void; onSaqlandi: (nom: string, yangi: boolean) => void }) {
  const [ism, setIsm] = useState(seat?.displayName ?? '');
  const [login, setLogin] = useState(seat?.login ?? '');
  const [tel, setTel] = useState(seat?.phoneNumbers.join(', ') ?? '');
  const [crm, setCrm] = useState(seat?.externalIds?.[CRM_KALIT] ?? '');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const telefonlar = tel
    .split(/[,;\n]/)
    .map((t) => t.replace(/[\s()-]/g, ''))
    .filter(Boolean);
  const telXato = telefonlar.find((t) => !/^\+?\d{7,15}$/.test(t));
  const loginXato = login.trim() && !/^[a-z0-9._-]{3,40}$/.test(login.trim().toLowerCase());

  const saqla = async (e: FormEvent) => {
    e.preventDefault();
    if (ism.trim().length < 2) return setXato("Ism kamida 2 ta belgidan iborat bo'lsin");
    if (loginXato) return setXato("Login faqat lotin harfi, raqam va . _ - dan iborat, 3–40 belgi");
    if (telXato) return setXato(`Telefon raqami noto'g'ri: ${telXato}`);
    setBand(true);
    setXato(null);
    const externalIds = { ...(seat?.externalIds ?? {}) };
    if (crm.trim()) externalIds[CRM_KALIT] = crm.trim();
    else delete externalIds[CRM_KALIT];
    const body = {
      displayName: ism.trim(),
      ...(login.trim() ? { login: login.trim().toLowerCase() } : {}),
      phoneNumbers: telefonlar,
      externalIds,
    };
    try {
      if (seat) await api.patch(`${base}/${seat.id}`, body);
      else await api.post(base, body);
      onSaqlandi(ism.trim(), !seat);
    } catch (err) {
      setXato(err instanceof ApiError ? err.message : "Saqlanmadi — qayta urinib ko'ring");
      setBand(false);
    }
  };

  return (
    <Modal sarlavha={seat ? 'Menejerni tahrirlash' : 'Yangi menejer'} onYop={onYop} onSubmit={(e) => void saqla(e)}>
      <div className="maydon-blok">
        <label htmlFor="mj-ism">Ism familiya *</label>
        <input id="mj-ism" value={ism} onChange={(e) => setIsm(e.target.value)} placeholder="Malika Karimova" maxLength={100} autoFocus />
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="mj-login">Login</label>
          <input id="mj-login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="malika.k" spellCheck={false} autoComplete="off" aria-invalid={!!loginXato} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="mj-crm">CRM ID</label>
          <input id="mj-crm" value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="Masalan: 10245" spellCheck={false} autoComplete="off" />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="mj-tel">Telefon raqamlari</label>
        <input id="mj-tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+998901234567, +998911234567" inputMode="tel" aria-invalid={!!telXato} />
        <div className="yordam">Vergul bilan ajrating. Qo'ng'iroqda menejerni aniq aniqlash shu raqamlarga tayanadi.</div>
      </div>
      {xato && <div className="yordam bzl-xato">{xato}</div>}
      <div className="vr-oyna-past">
        <button type="button" className="btn ikkinchi" onClick={onYop}>
          Bekor qilish
        </button>
        <button type="submit" className="btn" disabled={band}>
          {band ? 'Saqlanmoqda…' : seat ? 'Saqlash' : "Qo'shish"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Telegram ulash ─────────────────────────────────────────────────────────

function TelegramOynasi({ businessId, seat, onYop, onSaqlandi }: { businessId: string; seat: SeatFull; onYop: () => void; onSaqlandi: (m: string) => void }) {
  const [id, setId] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const url = `/api/v1/businesses/${businessId}/seats/${seat.id}/telegram`;

  const yubor = async (telegramId: string | null) => {
    setBand(true);
    setXato(null);
    try {
      await api.patch(url, { telegramId });
      onSaqlandi(telegramId ? 'Telegram ulandi' : 'Telegram uzildi');
    } catch (err) {
      setXato(err instanceof ApiError ? err.message : 'Saqlanmadi');
      setBand(false);
    }
  };

  return (
    <Modal
      sarlavha="Telegram ulash"
      onYop={onYop}
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\d{3,}$/.test(id.trim())) return setXato("Telegram ID faqat raqamlardan iborat — masalan: 123456789");
        void yubor(id.trim());
      }}
    >
      <p className="sz-eslatma">
        <b>{seat.displayName}</b> ning Telegram raqamli ID'sini kiriting. Suhbatlarda menejer aynan shu ID orqali aniqlanadi — taxmin bilan emas. ID'ni
        bilish uchun menejer <b>@userinfobot</b> ga yozsin.
      </p>
      {seat.telegramLinked && (
        <div className="mj-ulangan">
          <Check aria-hidden="true" /> Hozir Telegram ulangan. Yangi ID kiritsangiz almashtiriladi.
        </div>
      )}
      <div className="maydon-blok">
        <label htmlFor="mj-tg">Telegram ID</label>
        <input id="mj-tg" value={id} onChange={(e) => setId(e.target.value.replace(/\s/g, ''))} placeholder="123456789" inputMode="numeric" autoFocus />
      </div>
      {xato && <div className="yordam bzl-xato">{xato}</div>}
      <div className="vr-oyna-past">
        {seat.telegramLinked && (
          <button type="button" className="btn ikkinchi mj-uz" disabled={band} onClick={() => void yubor(null)}>
            <Power /> Uzish
          </button>
        )}
        <button type="submit" className="btn" disabled={band || !id}>
          {band ? 'Saqlanmoqda…' : 'Ulash'}
        </button>
      </div>
    </Modal>
  );
}
