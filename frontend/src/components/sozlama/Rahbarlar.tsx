import { CalendarDays, Check, Clock, Copy, Ellipsis, KeyRound, Mail, Power, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type MemberRow } from '../../api';
import { useAuth } from '../../auth';
import { joyla, useT } from '../../i18n';
import { TanlovMenyu } from '../analitika/Ochiluvchi';
import { avatarRang, boshHarf } from '../bosh/malumot';
import { useTashqiBosish } from '../qongiroq/Filtrlar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → RAHBARLAR (FR-165)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rahbarlar `business_member` orqali keladi; menejerlar (seat) alohida
 * bo'limda. Server taklifni faqat email orqali qabul qiladi — Telegram
 * username/ID bilan taklif hali yo'q, shuning uchun bu aniq aytiladi.
 */

const ROL_NOM: Record<MemberRow['role'], string> = {
  owner: 'Ega',
  supervisor: 'Rahbar',
  head: "Bo'lim boshlig'i",
  auditor: 'Auditor',
};
const ROLLAR = [
  { qiymat: 'supervisor', nom: 'Rahbar — kundalik boshqaruv' },
  { qiymat: 'head', nom: "Bo'lim boshlig'i — faqat o'z bo'limi" },
  { qiymat: 'auditor', nom: "Auditor — faqat o'qish" },
];

type Holat = 'faol' | 'kutilmoqda' | 'ochirilgan';
const holatOl = (m: MemberRow): Holat => (!m.isActive || m.activation === 'disabled' ? 'ochirilgan' : m.activation === 'active' ? 'faol' : 'kutilmoqda');
const HOLAT_NOM: Record<Holat, string> = { faol: 'Faol', kutilmoqda: 'Kutilmoqda', ochirilgan: "O'chirilgan" };

const sana = (iso: string) => iso.slice(0, 10);
const oxirgiKirish = (iso: string | null | undefined, t: (s: string, q?: Record<string, string | number>) => string) => {
  if (!iso) return t('Hali kirmagan');
  const d = new Date(iso);
  return t('Oxirgi kirish: {vaqt}', { vaqt: `${d.toLocaleDateString('uz-UZ')} ${d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}` });
};

export function Rahbarlar({ businessId }: { businessId: string }) {
  const t = useT();
  const { user } = useAuth();
  const base = `/api/v1/businesses/${businessId}/members`;
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [yangi, setYangi] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tiklash, setTiklash] = useState<{ ism: string; havola: string } | null>(null);
  const [band, setBand] = useState<string | null>(null);

  const yukla = useCallback(() => {
    void api
      .get<MemberRow[]>(base)
      .then((r) => setRows([...r].sort((a, b) => a.addedAt.localeCompare(b.addedAt))))
      .catch(() => setRows([]));
  }, [base]);
  useEffect(yukla, [yukla]);

  const xabar = (m: string) => {
    setOk(m);
    setTimeout(() => setOk(null), 2500);
  };

  /** Bitta amalni bajaradi: xatoni ko'rsatadi, muvaffaqiyatda ro'yxatni yangilaydi. */
  const amal = async (id: string, fn: () => Promise<unknown>, muvaffaqiyat?: string) => {
    setBand(id);
    setXato(null);
    try {
      await fn();
      if (muvaffaqiyat) xabar(muvaffaqiyat);
      yukla();
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : t("Amal bajarilmadi — qayta urinib ko'ring"));
    } finally {
      setBand(null);
    }
  };

  const soni = (h: Holat) => rows?.filter((m) => holatOl(m) === h).length ?? 0;

  return (
    <section className="card sz-karta rh-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>{t('Rahbarlar')}</h2>
          <p>{t("Rahbarlarni boshqaring. Menejerlar alohida Menejerlar bo'limidan yaratiladi.")}</p>
        </div>
        <button type="button" className={yangi ? 'btn ikkinchi' : 'btn'} aria-expanded={yangi} onClick={() => setYangi((v) => !v)}>
          {yangi ? t('Bekor qilish') : t('Yangi rahbar')}
        </button>
      </div>

      <div className="rh-statlar">
        <div>
          <b>{rows?.length ?? '—'}</b>
          <span>{t('Jami rahbarlar')}</span>
        </div>
        <div className="faol">
          <b>{rows ? soni('faol') : '—'}</b>
          <span>{t('Faol')}</span>
        </div>
        <div className="kutilmoqda">
          <b>{rows ? soni('kutilmoqda') : '—'}</b>
          <span>{t('Kutilmoqda')}</span>
        </div>
        {soni('ochirilgan') > 0 && (
          <div className="ochirilgan">
            <b>{soni('ochirilgan')}</b>
            <span>{t("O'chirilgan")}</span>
          </div>
        )}
      </div>

      {yangi && (
        <YangiRahbar
          base={base}
          onQoshildi={(ism) => {
            setYangi(false);
            xabar(t('{ism} taklif qilindi', { ism }));
            yukla();
          }}
        />
      )}

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

      {tiklash && <TiklashHavolasi {...tiklash} onYop={() => setTiklash(null)} />}

      {!rows ? (
        <div className="card skelet" style={{ height: 96 }} aria-busy="true" />
      ) : rows.length === 0 ? (
        <div className="bn-bosh-holat">{t("Hali rahbar qo'shilmagan.")}</div>
      ) : (
        <ul className="rh-royxat">
          {rows.map((m) => {
            const h = holatOl(m);
            const ism = m.user?.displayName ?? t('Nomaʼlum');
            const men = m.userId === user?.id;
            return (
              <li key={m.id} className={h === 'ochirilgan' ? 'nofaol' : undefined} aria-busy={band === m.id}>
                <span className="rh-avatar" style={{ ['--rang' as string]: avatarRang(m.userId) }} aria-hidden="true">
                  {m.user?.avatarUrl ? <img src={m.user.avatarUrl} alt="" /> : boshHarf(ism)}
                </span>
                <div className="rh-matn">
                  <div className="rh-nom">
                    <b>{ism}</b>
                    {men && <span className="rh-sen">{t('Siz')}</span>}
                    <span className="bzl-pill info">{t(ROL_NOM[m.role])}</span>
                    <span className={`bzl-pill ${h === 'faol' ? 'yaxshi' : h === 'kutilmoqda' ? 'orta' : 'xavf'}`}>{t(HOLAT_NOM[h])}</span>
                  </div>
                  <div className="rh-qator">
                    <span>
                      <Mail aria-hidden="true" /> {m.user?.email ?? '—'}
                    </span>
                    <span>
                      <Clock aria-hidden="true" /> {oxirgiKirish(m.user?.lastLoginAt, t)}
                    </span>
                  </div>
                </div>
                <div className="rh-sana">
                  <CalendarDays aria-hidden="true" />
                  <div>
                    <small>{t("Qo'shilgan")}</small>
                    <b>{sana(m.addedAt)}</b>
                  </div>
                </div>
                <AmalMenyu
                  m={m}
                  men={men}
                  band={band === m.id}
                  onRol={(rol) => void amal(m.id, () => api.patch(`${base}/${m.id}`, { role: rol }), t("Rol o'zgartirildi"))}
                  onFaollik={() =>
                    void amal(m.id, () => api.patch(`${base}/${m.id}`, { isActive: !m.isActive }), m.isActive ? t('Faolsizlantirildi') : t('Faollashtirildi'))
                  }
                  onParol={() =>
                    void amal(m.id, async () => {
                      const r = await api.post<{ resetToken: string }>(`/api/v1/businesses/${businessId}/users/${m.userId}/reset-link`);
                      setTiklash({ ism, havola: `${window.location.origin}/parol-tiklash/${r.resetToken}` });
                    })
                  }
                  onOchir={() => {
                    if (!window.confirm(t("{ism} jamoadan olib tashlansinmi? Bu amalni qaytarib bo'lmaydi.", { ism }))) return;
                    void amal(m.id, () => api.del(`${base}/${m.id}`), t('{ism} olib tashlandi', { ism }));
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Yangi rahbar shakli ────────────────────────────────────────────────────

function YangiRahbar({ base, onQoshildi }: { base: string; onQoshildi: (ism: string) => void }) {
  const t = useT();
  const [kirish, setKirish] = useState('');
  const [ism, setIsm] = useState('');
  const [rol, setRol] = useState('supervisor');
  const [ketmoqda, setKetmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const q = kirish.trim();
  const telegrammi = /^@|^tg:/i.test(q) || /^\d{5,}$/.test(q);
  const emailTogri = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
  // Ism kiritilmasa — email boshidan: "ali.valiyev@..." → "Ali Valiyev"
  const taxminiyIsm = emailTogri
    ? q
        .split('@')[0]!
        .split(/[._-]+/)
        .filter(Boolean)
        .map((s) => s[0]!.toUpperCase() + s.slice(1))
        .join(' ')
    : '';

  const yubor = async (e: FormEvent) => {
    e.preventDefault();
    if (telegrammi) {
      setXato(t("Telegram username yoki ID orqali taklif serverda hali yo'q — email kiriting."));
      return;
    }
    if (!emailTogri) {
      setXato(t("Email noto'g'ri — masalan: rahbar@kompaniya.uz"));
      return;
    }
    const nom = ism.trim() || taxminiyIsm;
    if (nom.length < 2) {
      setXato(t("Ism kamida 2 ta belgidan iborat bo'lsin"));
      return;
    }
    setKetmoqda(true);
    setXato(null);
    try {
      await api.post(`${base}/invite`, { email: q.toLowerCase(), displayName: nom, role: rol });
      onQoshildi(nom);
    } catch (err) {
      setXato(err instanceof ApiError ? err.message : t("Taklif yuborilmadi — qayta urinib ko'ring"));
      setKetmoqda(false);
    }
  };

  return (
    <form className="bzl-forma" onSubmit={(e) => void yubor(e)} noValidate>
      <b className="bzl-forma-sarlavha">{t('Yangi rahbar')}</b>
      <div className="maydon-blok">
        <label htmlFor="rh-kirish">{t('Email, Telegram username yoki ID')}</label>
        <input
          id="rh-kirish"
          value={kirish}
          onChange={(e) => {
            setKirish(e.target.value);
            setXato(null);
          }}
          placeholder={t('email@example.com, @username yoki tg:123456789')}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!xato}
        />
        {telegrammi && !xato && <div className="yordam rh-ogoh">{t("Telegram orqali taklif hali qo'llab-quvvatlanmaydi — email kiriting.")}</div>}
      </div>
      <div className="bzl-forma-panjara">
        <div className="maydon-blok">
          <label htmlFor="rh-ism">{t('Ism familiya')}</label>
          <input id="rh-ism" value={ism} onChange={(e) => setIsm(e.target.value)} placeholder={taxminiyIsm || t('Ism Familiya')} maxLength={100} />
          {!ism.trim() && taxminiyIsm && <div className="yordam">{t("Bo'sh qolsa «{ism}» deb yoziladi", { ism: taxminiyIsm })}</div>}
        </div>
        <div className="maydon-blok">
          <label htmlFor="rh-rol">{t('Rol')}</label>
          <TanlovMenyu id="rh-rol" aria={t('Rol')} qiymat={rol} variantlar={ROLLAR.map((r) => ({ ...r, nom: t(r.nom) }))} onOzgar={setRol} kenglik="100%" />
        </div>
      </div>
      {xato && <div className="yordam bzl-xato">{xato}</div>}
      <p className="sz-eslatma">
        {joyla(
          t("Taklif qilingan rahbar «Kutilmoqda» holatida bo'ladi. U birinchi marta kirishi uchun ro'yxatdagi {yol} orqali havola yarating va unga yetkazing."),
          { yol: <b>⋯ → {t('Parol havolasi')}</b> },
        )}
      </p>
      <div>
        <button type="submit" className="btn" disabled={ketmoqda || !q}>
          {ketmoqda ? t("Qo'shilmoqda…") : t("Qo'shish")}
        </button>
      </div>
    </form>
  );
}

// ─── ⋯ menyusi ──────────────────────────────────────────────────────────────

function AmalMenyu({
  m,
  men,
  band,
  onRol,
  onFaollik,
  onParol,
  onOchir,
}: {
  m: MemberRow;
  men: boolean;
  band: boolean;
  onRol: (rol: string) => void;
  onFaollik: () => void;
  onParol: () => void;
  onOchir: () => void;
}) {
  const t = useT();
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useTashqiBosish(ref, ochiq, () => setOchiq(false));
  const bajar = (fn: () => void) => () => {
    setOchiq(false);
    fn();
  };
  const ega = m.role === 'owner';

  return (
    <div className="rh-menyu" ref={ref} onKeyDown={(e) => e.key === 'Escape' && setOchiq(false)}>
      <button
        type="button"
        className="rh-uchnuqta"
        aria-label={t('{ism} — amallar', { ism: m.user?.displayName ?? t('Rahbar') })}
        aria-haspopup="menu"
        aria-expanded={ochiq}
        disabled={band}
        onClick={() => setOchiq((v) => !v)}
      >
        <Ellipsis />
      </button>
      {ochiq && (
        <div className="rh-menyu-royxat" role="menu">
          {!ega && (
            <>
              <div className="rh-menyu-sarlavha">{t('Rol')}</div>
              {ROLLAR.map((r) => (
                <button key={r.qiymat} type="button" role="menuitemradio" aria-checked={m.role === r.qiymat} onClick={bajar(() => m.role !== r.qiymat && onRol(r.qiymat))}>
                  <span className="rh-belgi">{m.role === r.qiymat && <Check />}</span>
                  {t(ROL_NOM[r.qiymat as MemberRow['role']])}
                </button>
              ))}
              <hr />
            </>
          )}
          <button type="button" role="menuitem" onClick={bajar(onParol)}>
            <KeyRound /> {t('Parol havolasi')}
          </button>
          {!ega && !men && (
            <button type="button" role="menuitem" onClick={bajar(onFaollik)}>
              {m.isActive ? <Power /> : <ShieldCheck />} {m.isActive ? t('Faolsizlantirish') : t('Faollashtirish')}
            </button>
          )}
          {!men && (
            <button type="button" role="menuitem" className="xavf" onClick={bajar(onOchir)}>
              <Trash2 /> {t("O'chirish")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Parol tiklash havolasi ─────────────────────────────────────────────────

function TiklashHavolasi({ ism, havola, onYop }: { ism: string; havola: string; onYop: () => void }) {
  const t = useT();
  const [nusxa, setNusxa] = useState(false);
  return (
    <div className="rh-havola" role="status">
      <div className="rh-havola-bosh">
        <b>{t('{ism} uchun parol havolasi', { ism })}</b>
        <button type="button" className="btn ikkinchi kichik" onClick={onYop}>
          {t('Yopish')}
        </button>
      </div>
      <small>
        {joyla(t("Havola {hozir} ko'rinadi, bir marta ishlaydi va 30 daqiqadan keyin kuchini yo'qotadi. Uni shaxsan yetkazing."), {
          hozir: <b>{t('faqat hozir')}</b>,
        })}
      </small>
      <div className="rh-havola-qator">
        <code>{havola}</code>
        <button
          type="button"
          className="btn ikkinchi kichik"
          onClick={() => {
            void navigator.clipboard?.writeText(havola).then(() => {
              setNusxa(true);
              setTimeout(() => setNusxa(false), 1800);
            });
          }}
        >
          {nusxa ? <Check /> : <Copy />} {nusxa ? t('Nusxalandi') : t('Nusxalash')}
        </button>
      </div>
    </div>
  );
}
