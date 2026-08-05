import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  fmtSana,
  type BusinessRow,
  type DailyReportRow,
  type MemberRow,
  type SeatFull,
  type TelegramIntegration,
} from '../api';
import { useAuth } from '../auth';

/**
 * SOZLAMALAR — TZ 3.11 (FR-160, 161, 162, 164, 165, 166).
 *
 * To'rtta bo'lim ataylab bitta sahifada, alohida marshrutlarda emas:
 * hammasi "kim va nima bilan ishlaydi" degan bitta savolga tegishli va
 * foydalanuvchi ular orasida tez-tez o'tadi (sotuvchi qo'shdim → unga
 * Telegram id biriktiraman → aktivatsiya havolasini beraman).
 *
 * Har bo'lim o'z ruxsatiga qarab ko'rinadi. Chegara serverda — bu yerdagi
 * yashirish faqat foydasiz tugmani ko'rsatmaslik uchun.
 */

type Bolim = 'profil' | 'biznes' | 'sotuvchilar' | 'rahbarlar' | 'integratsiya';

const ROL_NOM: Record<string, string> = {
  owner: 'Ega',
  supervisor: 'Rahbar',
  head: 'Bo\'lim boshlig\'i',
  auditor: 'Auditor',
};

const AKTIVATSIYA: Record<string, { nom: string; klass: string }> = {
  active: { nom: 'Faol', klass: 'ok' },
  pending: { nom: 'Kutilmoqda', klass: 'sariq' },
  suspended: { nom: 'To\'xtatilgan', klass: 'qizil' },
};

/** TZ 8.2: mavzu tanlovi — tizim / yorug' / qorong'i (FR-162). */
const MAVZU_KALIT = 'sotuvai-mavzu';

function mavzuniQoll(v: string): void {
  const root = document.documentElement;
  if (v === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', v);
  localStorage.setItem(MAVZU_KALIT, v);
}

export function Settings() {
  const { user, business, refresh } = useAuth();
  const [bolim, setBolim] = useState<Bolim>('profil');

  const p = business?.permissions ?? [];
  const bizneskoradi = p.includes('business:read');
  const bizneYozadi = p.includes('business:write');
  const seatBoshqaradi = p.includes('seat:manage:all') || p.includes('seat:manage:department');
  const memberBoshqaradi = p.includes('member:manage');
  const integratsiyaBoshqaradi = p.includes('integration:manage');

  const BOLIMLAR: { key: Bolim; nom: string; korinadi: boolean }[] = [
    { key: 'profil', nom: 'Profil', korinadi: true },
    { key: 'biznes', nom: 'Biznes', korinadi: bizneskoradi },
    { key: 'sotuvchilar', nom: 'Sotuvchilar', korinadi: seatBoshqaradi },
    { key: 'rahbarlar', nom: 'Rahbarlar', korinadi: memberBoshqaradi },
    { key: 'integratsiya', nom: 'Integratsiyalar', korinadi: bizneskoradi },
  ];

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Sozlamalar</h1>
          <div className="izoh">Profil, biznes, jamoa va ulanishlar</div>
        </div>
      </div>

      <div className="tab-qator" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {BOLIMLAR.filter((b) => b.korinadi).map((b) => (
          <button
            key={b.key}
            className={`tab${bolim === b.key ? ' active' : ''}`}
            onClick={() => setBolim(b.key)}
          >
            {b.nom}
          </button>
        ))}
      </div>

      {bolim === 'profil' && <Profil user={user} onSaqlandi={refresh} />}
      {bolim === 'biznes' && business && (
        <Biznes businessId={business.businessId} yozaOladi={bizneYozadi} onSaqlandi={refresh} />
      )}
      {bolim === 'sotuvchilar' && business && <Sotuvchilar businessId={business.businessId} />}
      {bolim === 'rahbarlar' && business && <Rahbarlar businessId={business.businessId} />}
      {bolim === 'integratsiya' && business && (
        <>
          <Integratsiya businessId={business.businessId} boshqaraOladi={integratsiyaBoshqaradi} />
          <KunlikHisobot
            businessId={business.businessId}
            boshqaraOladi={integratsiyaBoshqaradi}
          />
        </>
      )}
    </>
  );
}

/** Kichik yordamchi: saqlash holati va xabar. */
function useSaqlash() {
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
      setXato(e instanceof ApiError ? e.message : 'Saqlab bo\'lmadi');
      return false;
    }
  }, []);

  return { holat, xato, bajar, setXato };
}

function Xabar({ holat, xato }: { holat: string; xato: string | null }) {
  if (xato) return <div className="xato-qator">{xato}</div>;
  if (holat === 'ok') return <div className="ok-qator">Saqlandi ✓</div>;
  return null;
}

// ─── PROFIL (FR-160, FR-162) ────────────────────────────────────────────────

function Profil({
  user,
  onSaqlandi,
}: {
  user: { displayName: string; email: string | null; login: string | null; locale: string } | null;
  onSaqlandi: () => Promise<void>;
}) {
  const [ism, setIsm] = useState(user?.displayName ?? '');
  const [til, setTil] = useState(user?.locale ?? 'uz');
  const [mavzu, setMavzu] = useState(() => localStorage.getItem(MAVZU_KALIT) ?? 'system');
  const { holat, xato, bajar } = useSaqlash();

  const parol = useSaqlash();
  const [joriy, setJoriy] = useState('');
  const [yangi, setYangi] = useState('');

  return (
    <>
      <div className="card">
        <div className="karta-bosh">
          <h2>Profil</h2>
        </div>
        <div className="maydon-blok">
          <label htmlFor="p-ism">Ism</label>
          <input id="p-ism" value={ism} onChange={(e) => setIsm(e.target.value)} maxLength={120} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="p-email">Email</label>
          <input id="p-email" value={user?.email ?? user?.login ?? '—'} disabled />
          <div className="yordam">
            Email o'zgartirish yangi manzilni tasdiqlashni talab qiladi — hozircha qo'llab
            quvvatlanmaydi.
          </div>
        </div>
        <div className="maydon-blok">
          <label htmlFor="p-til">Til</label>
          <select id="p-til" value={til} onChange={(e) => setTil(e.target.value)}>
            <option value="uz">O'zbekcha</option>
            <option value="ru">Ruscha</option>
          </select>
          <div className="yordam">
            Interfeys tarjimasi hali qo'shilmagan — bu tanlov hisobotlar tili uchun saqlanadi.
          </div>
        </div>
        <div className="maydon-blok">
          <label htmlFor="p-mavzu">Ko'rinish (FR-162)</label>
          <select
            id="p-mavzu"
            value={mavzu}
            onChange={(e) => {
              setMavzu(e.target.value);
              mavzuniQoll(e.target.value);
            }}
          >
            <option value="system">Tizim bo'yicha</option>
            <option value="light">Yorug'</option>
            <option value="dark">Qorong'i</option>
          </select>
        </div>
        <Xabar holat={holat} xato={xato} />
        <button
          className="btn"
          disabled={holat === 'ketmoqda' || ism.trim().length < 2}
          onClick={() =>
            void bajar(async () => {
              await api.patch('/api/v1/auth/me', { displayName: ism.trim(), locale: til });
              await onSaqlandi();
            })
          }
        >
          {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="karta-bosh">
          <h2>Parolni o'zgartirish</h2>
        </div>
        <div className="maydon-blok">
          <label htmlFor="p-joriy">Joriy parol</label>
          <input
            id="p-joriy"
            type="password"
            value={joriy}
            onChange={(e) => setJoriy(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="maydon-blok">
          <label htmlFor="p-yangi">Yangi parol</label>
          <input
            id="p-yangi"
            type="password"
            value={yangi}
            onChange={(e) => setYangi(e.target.value)}
            autoComplete="new-password"
          />
          <div className="yordam">Kamida 10 belgi. Uzunlik murakkablikdan muhimroq.</div>
        </div>
        <Xabar holat={parol.holat} xato={parol.xato} />
        <div className="yordam" style={{ marginBottom: 8 }}>
          Parol o'zgargach boshqa barcha qurilmalardagi sessiyalar bekor qilinadi.
        </div>
        <button
          className="btn"
          disabled={parol.holat === 'ketmoqda' || joriy.length < 1 || yangi.length < 10}
          onClick={() =>
            void parol
              .bajar(() =>
                api.post('/api/v1/auth/change-password', {
                  currentPassword: joriy,
                  newPassword: yangi,
                }),
              )
              .then((ok) => {
                if (ok) {
                  setJoriy('');
                  setYangi('');
                }
              })
          }
        >
          {parol.holat === 'ketmoqda' ? 'O\'zgartirilmoqda…' : 'Parolni o\'zgartirish'}
        </button>
      </div>
    </>
  );
}

// ─── BIZNES (FR-161) ────────────────────────────────────────────────────────

function Biznes({
  businessId,
  yozaOladi,
  onSaqlandi,
}: {
  businessId: string;
  yozaOladi: boolean;
  onSaqlandi: () => Promise<void>;
}) {
  const [row, setRow] = useState<BusinessRow | null>(null);
  const { holat, xato, bajar } = useSaqlash();

  useEffect(() => {
    void api.get<BusinessRow>(`/api/v1/businesses/${businessId}`).then(setRow).catch(() => undefined);
  }, [businessId]);

  if (!row) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  return (
    <div className="card">
      <div className="karta-bosh">
        <h2>Biznes sozlamalari</h2>
      </div>
      <div className="maydon-blok">
        <label htmlFor="b-nom">Nomi</label>
        <input
          id="b-nom"
          value={row.name}
          disabled={!yozaOladi}
          onChange={(e) => setRow({ ...row, name: e.target.value })}
          maxLength={120}
        />
      </div>
      <div className="maydon-blok">
        <label htmlFor="b-tz">Vaqt zonasi</label>
        <select
          id="b-tz"
          value={row.timezone}
          disabled={!yozaOladi}
          onChange={(e) => setRow({ ...row, timezone: e.target.value })}
        >
          <option value="Asia/Tashkent">Asia/Tashkent (UTC+5)</option>
          <option value="Asia/Almaty">Asia/Almaty (UTC+6)</option>
          <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
          <option value="UTC">UTC</option>
        </select>
        <div className="yordam">
          Kunlik hisobot va "bugungi vazifalar" shu zonaga qarab hisoblanadi.
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="b-valyuta">Valyuta</label>
        <select
          id="b-valyuta"
          value={row.currency}
          disabled={!yozaOladi}
          onChange={(e) => setRow({ ...row, currency: e.target.value })}
        >
          <option value="UZS">UZS — so'm</option>
          <option value="USD">USD</option>
          <option value="RUB">RUB</option>
        </select>
      </div>
      <div className="maydon-blok">
        <label htmlFor="b-logo">Logotip havolasi</label>
        <input
          id="b-logo"
          value={row.logoUrl ?? ''}
          disabled={!yozaOladi}
          placeholder="https://…"
          onChange={(e) => setRow({ ...row, logoUrl: e.target.value })}
        />
      </div>
      <Xabar holat={holat} xato={xato} />
      {yozaOladi && (
        <button
          className="btn"
          disabled={holat === 'ketmoqda' || row.name.trim().length < 2}
          onClick={() =>
            void bajar(async () => {
              await api.patch(`/api/v1/businesses/${businessId}`, {
                name: row.name.trim(),
                timezone: row.timezone,
                currency: row.currency,
                logoUrl: row.logoUrl?.trim() ? row.logoUrl.trim() : null,
              });
              await onSaqlandi();
            })
          }
        >
          {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      )}
    </div>
  );
}

// ─── SOTUVCHILAR (FR-164) ───────────────────────────────────────────────────

function Sotuvchilar({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<SeatFull[]>([]);
  const [yangiIsm, setYangiIsm] = useState('');
  // Ikki xil havola bir xil bloкda ko'rsatiladi, lekin manzili boshqa —
  // aktivatsiya yangi hisob uchun, tiklash esa mavjud parolni almashtiradi.
  const [havola, setHavola] = useState<
    { seatId: string; token: string; tur: 'aktivatsiya' | 'parol' } | null
  >(null);
  const [tahrir, setTahrir] = useState<string | null>(null);
  const [tgId, setTgId] = useState('');
  const { holat, xato, bajar } = useSaqlash();

  const yukla = useCallback(() => {
    void api
      .get<SeatFull[]>(`/api/v1/businesses/${businessId}/seats`)
      .then(setRows)
      .catch(() => undefined);
  }, [businessId]);

  useEffect(yukla, [yukla]);

  const base = `/api/v1/businesses/${businessId}/seats`;

  return (
    <>
      <div className="card">
        <div className="karta-bosh">
          <h2>Sotuvchilar ({rows.filter((r) => r.isActive).length} faol)</h2>
        </div>
        {rows.length === 0 ? (
          <div className="hech-narsa">Hali sotuvchi qo'shilmagan</div>
        ) : (
          <table className="jadval">
            <thead>
              <tr>
                <th>Ism</th>
                <th>Holat</th>
                <th>Telegram</th>
                <th>Suhbat</th>
                <th>Ball</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const a = AKTIVATSIYA[s.activation] ?? { nom: s.activation, klass: 'kul' };
                return (
                  <tr key={s.id} style={{ opacity: s.isActive ? 1 : 0.5 }}>
                    <td>
                      <b>{s.displayName}</b>
                      {!s.isActive && <span className="badge kul" style={{ marginLeft: 6 }}>o'chirilgan</span>}
                    </td>
                    <td>
                      <span className={`badge ${a.klass}`}>{a.nom}</span>
                    </td>
                    <td>
                      {s.telegramLinked ? (
                        <span className="badge ok">ulangan</span>
                      ) : (
                        <button className="btn ikkinchi kichik" onClick={() => setTahrir(s.id)}>
                          ID biriktirish
                        </button>
                      )}
                    </td>
                    <td>{s.totalConversations}</td>
                    <td>{s.avgScore === null ? '—' : `${Math.round(Number(s.avgScore))}%`}</td>
                    <td>
                      <button
                        className="btn ikkinchi kichik"
                        onClick={() =>
                          void bajar(async () => {
                            const r = await api.post<{ activationToken: string }>(
                              `${base}/${s.id}/activation-link`,
                            );
                            setHavola({ seatId: s.id, token: r.activationToken, tur: 'aktivatsiya' });
                            yukla();
                          })
                        }
                      >
                        Aktivatsiya havolasi
                      </button>{' '}
                      {/* FR-06: o'rin egallangan bo'lsagina — bo'sh o'rinda
                          tiklanadigan hisob yo'q. */}
                      {s.userId && (
                        <>
                          <button
                            className="btn ikkinchi kichik"
                            onClick={() =>
                              void bajar(async () => {
                                const r = await api.post<{ resetToken: string }>(
                                  `/api/v1/businesses/${businessId}/users/${s.userId}/reset-link`,
                                );
                                setHavola({ seatId: s.id, token: r.resetToken, tur: 'parol' });
                              })
                            }
                          >
                            Parol havolasi
                          </button>{' '}
                        </>
                      )}
                      <button
                        className="btn ikkinchi kichik"
                        onClick={() =>
                          void bajar(async () => {
                            await api.patch(`${base}/${s.id}`, { isActive: !s.isActive });
                            yukla();
                          })
                        }
                      >
                        {s.isActive ? 'O\'chirish' : 'Yoqish'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {havola && (
          <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--info)' }}>
            <b>
              {havola.tur === 'parol'
                ? 'Parol tiklash havolasi tayyor'
                : 'Aktivatsiya havolasi tayyor'}
            </b>
            <div className="yordam" style={{ margin: '6px 0' }}>
              Bu token <b>faqat hozir</b> ko'rinadi va bir marta ishlaydi.
              {havola.tur === 'parol' && ' 30 daqiqadan keyin kuchini yo\'qotadi.'} Sotuvchiga
              shaxsan yetkazing.
            </div>
            <code style={{ wordBreak: 'break-all', display: 'block', fontSize: 12 }}>
              {havola.tur === 'parol'
                ? `${window.location.origin}/parol-tiklash/${havola.token}`
                : `${window.location.origin}/aktivatsiya/${havola.token}`}
            </code>
            <button
              className="btn ikkinchi kichik"
              style={{ marginTop: 8 }}
              onClick={() => setHavola(null)}
            >
              Yopish
            </button>
          </div>
        )}

        {tahrir && (
          <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--info)' }}>
            <b>Telegram ID biriktirish</b>
            <div className="yordam" style={{ margin: '6px 0' }}>
              FR-84: speaker roli shu ID orqali <b>deterministik</b> aniqlanadi — taxmin bilan
              emas. Sotuvchining Telegram raqamli ID sini kiriting.
            </div>
            <div className="maydon-blok">
              <input
                value={tgId}
                onChange={(e) => setTgId(e.target.value)}
                placeholder="masalan: 123456789"
              />
            </div>
            <button
              className="btn"
              disabled={!/^\d{3,}$/.test(tgId)}
              onClick={() =>
                void bajar(async () => {
                  await api.patch(
                    `/api/v1/businesses/${businessId}/seats/${tahrir}/telegram`,
                    { telegramId: tgId },
                  );
                  setTahrir(null);
                  setTgId('');
                  yukla();
                })
              }
            >
              Biriktirish
            </button>{' '}
            <button className="btn ikkinchi" onClick={() => setTahrir(null)}>
              Bekor
            </button>
          </div>
        )}
        <Xabar holat={holat} xato={xato} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="karta-bosh">
          <h2>Yangi sotuvchi</h2>
        </div>
        <div className="maydon-blok">
          <label htmlFor="s-ism">Ism familiya</label>
          <input
            id="s-ism"
            value={yangiIsm}
            onChange={(e) => setYangiIsm(e.target.value)}
            placeholder="Malika Karimova"
          />
        </div>
        <button
          className="btn"
          disabled={yangiIsm.trim().length < 2}
          onClick={() =>
            void bajar(async () => {
              await api.post(base, { displayName: yangiIsm.trim() });
              setYangiIsm('');
              yukla();
            })
          }
        >
          Qo'shish
        </button>
      </div>
    </>
  );
}

// ─── RAHBARLAR (FR-165) ─────────────────────────────────────────────────────

function Rahbarlar({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [tiklash, setTiklash] = useState<{ ism: string; token: string } | null>(null);
  const [email, setEmail] = useState('');
  const [ism, setIsm] = useState('');
  const [rol, setRol] = useState<'supervisor' | 'head' | 'auditor'>('supervisor');
  const { holat, xato, bajar } = useSaqlash();

  const yukla = useCallback(() => {
    void api
      .get<MemberRow[]>(`/api/v1/businesses/${businessId}/members`)
      .then(setRows)
      .catch(() => undefined);
  }, [businessId]);

  useEffect(yukla, [yukla]);

  const base = `/api/v1/businesses/${businessId}/members`;

  return (
    <>
      <div className="card">
        <div className="karta-bosh">
          <h2>Rahbarlar</h2>
        </div>
        <table className="jadval">
          <thead>
            <tr>
              <th>Ism</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Oxirgi kirish</th>
              <th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} style={{ opacity: m.isActive ? 1 : 0.5 }}>
                <td>
                  <b>{m.user?.displayName ?? '—'}</b>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{m.user?.email ?? '—'}</td>
                <td>
                  {m.role === 'owner' ? (
                    <span className="badge navy">{ROL_NOM.owner}</span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) =>
                        void bajar(async () => {
                          await api.patch(`${base}/${m.id}`, { role: e.target.value });
                          yukla();
                        })
                      }
                    >
                      <option value="supervisor">{ROL_NOM.supervisor}</option>
                      <option value="head">{ROL_NOM.head}</option>
                      <option value="auditor">{ROL_NOM.auditor}</option>
                    </select>
                  )}
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>
                  {m.user?.lastLoginAt ? fmtSana(m.user.lastLoginAt) : 'hech qachon'}
                </td>
                <td>
                  {/* FR-06: parolni unutgan rahbarga havola. Telegram
                      bog'lanmagan bo'lsa bu yagona yo'l. */}
                  <button
                    className="btn ikkinchi kichik"
                    onClick={() =>
                      void bajar(async () => {
                        const r = await api.post<{ resetToken: string }>(
                          `/api/v1/businesses/${businessId}/users/${m.userId}/reset-link`,
                        );
                        setTiklash({ ism: m.user?.displayName ?? '', token: r.resetToken });
                      })
                    }
                  >
                    Parol havolasi
                  </button>{' '}
                  {m.role !== 'owner' && (
                    <button
                      className="btn ikkinchi kichik"
                      onClick={() =>
                        void bajar(async () => {
                          await api.patch(`${base}/${m.id}`, { isActive: !m.isActive });
                          yukla();
                        })
                      }
                    >
                      {m.isActive ? 'O\'chirish' : 'Yoqish'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="yordam" style={{ marginTop: 8 }}>
          Ega rolini o'zgartirib bo'lmaydi — to'lov va odamlar ustidan nazorat egada qoladi.
        </div>

        {tiklash && (
          <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--info)' }}>
            <b>{tiklash.ism} uchun parol tiklash havolasi</b>
            <div className="yordam" style={{ margin: '6px 0' }}>
              Havola <b>faqat hozir</b> ko'rinadi, bir marta ishlaydi va 30 daqiqadan keyin
              kuchini yo'qotadi. Uni shaxsan yetkazing.
            </div>
            <code style={{ wordBreak: 'break-all', display: 'block', fontSize: 12 }}>
              {`${window.location.origin}/parol-tiklash/${tiklash.token}`}
            </code>
            <button
              className="btn ikkinchi kichik"
              style={{ marginTop: 8 }}
              onClick={() => setTiklash(null)}
            >
              Yopish
            </button>
          </div>
        )}

        <Xabar holat={holat} xato={xato} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="karta-bosh">
          <h2>Rahbar taklif qilish</h2>
        </div>
        <div className="maydon-blok">
          <label htmlFor="r-email">Email</label>
          <input
            id="r-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="rahbar@kompaniya.uz"
          />
        </div>
        <div className="maydon-blok">
          <label htmlFor="r-ism">Ism familiya</label>
          <input id="r-ism" value={ism} onChange={(e) => setIsm(e.target.value)} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="r-rol">Rol</label>
          <select id="r-rol" value={rol} onChange={(e) => setRol(e.target.value as typeof rol)}>
            <option value="supervisor">{ROL_NOM.supervisor} — kundalik boshqaruv</option>
            <option value="head">{ROL_NOM.head} — faqat o'z bo'limi</option>
            <option value="auditor">{ROL_NOM.auditor} — faqat o'qish</option>
          </select>
        </div>
        <button
          className="btn"
          disabled={!email.includes('@') || ism.trim().length < 2}
          onClick={() =>
            void bajar(async () => {
              await api.post(`${base}/invite`, {
                email: email.trim(),
                displayName: ism.trim(),
                role: rol,
              });
              setEmail('');
              setIsm('');
              yukla();
            })
          }
        >
          Taklif qilish
        </button>
      </div>
    </>
  );
}

// ─── INTEGRATSIYALAR (FR-166) ───────────────────────────────────────────────

function Integratsiya({
  businessId,
  boshqaraOladi,
}: {
  businessId: string;
  boshqaraOladi: boolean;
}) {
  const [tg, setTg] = useState<TelegramIntegration | null>(null);
  const [token, setToken] = useState('');
  const [sozlash, setSozlash] = useState<{ webhookUrl: string; setupCommand: string } | null>(null);
  const { holat, xato, bajar } = useSaqlash();

  const base = `/api/v1/businesses/${businessId}/integrations/telegram`;

  const yukla = useCallback(() => {
    void api.get<TelegramIntegration>(base).then(setTg).catch(() => undefined);
  }, [base]);

  useEffect(yukla, [yukla]);

  return (
    <div className="card">
      <div className="karta-bosh">
        <h2>Telegram bot</h2>
        {tg?.connected ? (
          <span className="badge ok">ulangan</span>
        ) : (
          <span className="badge kul">ulanmagan</span>
        )}
      </div>

      {tg?.connected && tg.integration ? (
        <>
          <table className="jadval">
            <tbody>
              <tr>
                <td>Bot</td>
                <td>
                  <b>{tg.integration.config.botUsername ?? '—'}</b>
                </td>
              </tr>
              <tr>
                <td>Token</td>
                <td>{tg.integration.config.tokenHint ?? '—'}</td>
              </tr>
              <tr>
                <td>Ulangan</td>
                <td>
                  {tg.integration.config.connectedAt
                    ? fmtSana(tg.integration.config.connectedAt)
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Yig'ish</td>
                <td>{tg.integration.syncEnabled ? 'yoqilgan' : 'o\'chirilgan'}</td>
              </tr>
              {tg.integration.lastError && (
                <tr>
                  <td>Oxirgi xato</td>
                  <td style={{ color: 'var(--past)' }}>{tg.integration.lastError}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="yordam" style={{ marginTop: 8 }}>
            To'liq token hech qachon qaytarilmaydi — bazada shifrlangan holda saqlanadi.
          </div>
          {boshqaraOladi && (
            <button
              className="btn ikkinchi"
              style={{ marginTop: 10 }}
              onClick={() =>
                void bajar(async () => {
                  await api.del(base);
                  yukla();
                })
              }
            >
              Uzish
            </button>
          )}
        </>
      ) : (
        <>
          <div className="yordam" style={{ marginBottom: 10 }}>
            @BotFather orqali bot yarating va token'ni shu yerga kiriting. Token shifrlangan holda
            saqlanadi.
          </div>
          {boshqaraOladi && (
            <>
              <div className="maydon-blok">
                <label htmlFor="tg-token">Bot token</label>
                <input
                  id="tg-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="123456789:AA…"
                  autoComplete="off"
                />
              </div>
              <button
                className="btn"
                disabled={token.length < 20}
                onClick={() =>
                  void bajar(async () => {
                    const r = await api.post<{ webhookUrl: string; setupCommand: string }>(base, {
                      botToken: token,
                    });
                    setSozlash({ webhookUrl: r.webhookUrl, setupCommand: r.setupCommand });
                    setToken('');
                    yukla();
                  })
                }
              >
                Ulash
              </button>
            </>
          )}
        </>
      )}

      {sozlash && (
        <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--info)' }}>
          <b>Oxirgi qadam — webhook</b>
          <div className="yordam" style={{ margin: '6px 0' }}>
            Shu buyruqni bir marta bajaring (server ommaviy HTTPS domenda bo'lgach buni biz
            avtomatik qilamiz):
          </div>
          <code style={{ wordBreak: 'break-all', display: 'block', fontSize: 12 }}>
            {sozlash.setupCommand}
          </code>
        </div>
      )}

      <Xabar holat={holat} xato={xato} />
    </div>
  );
}

// ─── KUNLIK HISOBOT (FR-134) ────────────────────────────────────────────────

function KunlikHisobot({
  businessId,
  boshqaraOladi,
}: {
  businessId: string;
  boshqaraOladi: boolean;
}) {
  const [chatId, setChatId] = useState('');
  const [soat, setSoat] = useState(9);
  const [reports, setReports] = useState<DailyReportRow[]>([]);
  const [natija, setNatija] = useState<string | null>(null);
  const { holat, xato, bajar } = useSaqlash();

  const base = `/api/v1/businesses/${businessId}`;

  useEffect(() => {
    void api
      .get<TelegramIntegration>(`${base}/integrations/telegram`)
      .then((t) => {
        const cfg = t.integration?.config as
          | { reportChatId?: string | null; reportHour?: number }
          | undefined;
        setChatId(cfg?.reportChatId ?? '');
        setSoat(cfg?.reportHour ?? 9);
      })
      .catch(() => undefined);
    void api
      .get<{ reports: DailyReportRow[] }>(`${base}/reports/daily`)
      .then((r) => setReports(r.reports))
      .catch(() => undefined);
  }, [base]);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="karta-bosh">
        <h2>Kunlik hisobot</h2>
      </div>
      <div className="yordam" style={{ marginBottom: 10 }}>
        Har kuni belgilangan soatda rahbarga Telegram orqali qisqa xulosa yuboriladi: nechta
        suhbat, o'rtacha ball, kim javob kutmoqda, qaysi vazifa kechikkan. Chat ID ni bilish
        uchun botni guruhga qo'shing va{' '}
        <code>@getidsbot</code> yoki shunga o'xshash botdan guruh ID sini oling.
      </div>

      {boshqaraOladi && (
        <>
          <div className="maydon-blok">
            <label htmlFor="h-chat">Qabul qiluvchi chat ID</label>
            <input
              id="h-chat"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-1001234567890"
            />
            <div className="yordam">Guruh ID si manfiy bo'ladi, shaxsiy chat — musbat.</div>
          </div>
          <div className="maydon-blok">
            <label htmlFor="h-soat">Yuborish vaqti</label>
            <select id="h-soat" value={soat} onChange={(e) => setSoat(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <div className="yordam">Biznes vaqt zonasi bo'yicha (Biznes bo'limida sozlanadi).</div>
          </div>
          <Xabar holat={holat} xato={xato} />
          <button
            className="btn"
            disabled={holat === 'ketmoqda'}
            onClick={() =>
              void bajar(() =>
                api.put(`${base}/reports/daily/settings`, {
                  reportChatId: chatId.trim() === '' ? null : chatId.trim(),
                  reportHour: soat,
                }),
              )
            }
          >
            Saqlash
          </button>{' '}
          <button
            className="btn ikkinchi"
            onClick={() =>
              void bajar(async () => {
                const r = await api.post<{ sent: boolean; skipped?: string }>(
                  `${base}/reports/daily/send`,
                );
                setNatija(r.sent ? 'Hisobot yuborildi ✓' : `Yuborilmadi: ${r.skipped}`);
                const yangi = await api.get<{ reports: DailyReportRow[] }>(`${base}/reports/daily`);
                setReports(yangi.reports);
              })
            }
          >
            Hozir yuborish
          </button>
          {natija && (
            <div className={natija.includes('✓') ? 'ok-qator' : 'xato-qator'} style={{ marginTop: 10 }}>
              {natija}
            </div>
          )}
        </>
      )}

      {reports.length > 0 && (
        <>
          <h3 style={{ marginTop: 16, fontSize: 14 }}>Oxirgi hisobotlar</h3>
          {reports.slice(0, 5).map((r) => (
            <details key={r.id} style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                {r.summaryDate} · {r.triggeredBy === 'manual' ? 'qo\'lda' : 'avtomatik'} ·{' '}
                {fmtSana(r.createdAt)}
              </summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: 12,
                  marginTop: 6,
                  fontFamily: 'inherit',
                  color: 'var(--text-secondary)',
                }}
              >
                {r.content}
              </pre>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
