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
  const [h, setH] = useState<MzHolat | null>(null);
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [kalit, setKalit] = useState('');
  const [avto, setAvto] = useState(true);
  const [minDavom, setMinDavom] = useState(20);
  const [orqaga, setOrqaga] = useState(1);
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

  if (!h) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  const c = h.counts;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="karta-bosh">
        <h2>Moi Zvonki — telefon qo'ng'iroqlari</h2>
        <span className={`badge ${h.connected ? 'ok' : 'kul'}`}>
          {h.connected ? 'ulangan' : 'ulanmagan'}
        </span>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        Menejerlar telefonidagi qo'ng'iroqlar yozuvi avtomatik olinadi, matnga aylantiriladi va
        playbook bo'yicha baholanadi. Har 2 daqiqada yangilari tekshiriladi.
      </div>

      <details className="crm-hujjat" open={!h.connected}>
        <summary>API ma'lumotlari qayerda?</summary>
        <div className="yordam" style={{ marginTop: 8 }}>
          Moi Zvonki kabinetida: <b>Настройки → Интеграция → Параметры API</b>. U yerda «Ваш адрес
          API» (masalan <code>kompaniya.moizvonki.ru</code>) va «Ваш ключ API» turadi. Email — shu
          kabinetga kiradigan foydalanuvchi emaili. Barcha menejerlarning qo'ng'iroqlari kelishi
          uchun bu foydalanuvchi <b>rahbar (supervisor yoki admin)</b> bo'lishi kerak.
        </div>
      </details>

      {/* ─── Ulash ─── */}
      <div className="soat-qator">
        <div className="maydon-blok">
          <label htmlFor="mz-domain">API manzili</label>
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
          <label htmlFor="mz-email">Foydalanuvchi emaili</label>
          <input
            id="mz-email"
            type="email"
            value={email}
            placeholder="rahbar@kompaniya.uz"
            disabled={!boshqaraOladi}
            maxLength={200}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="mz-kalit">API kalit</label>
        <input
          id="mz-kalit"
          type="password"
          autoComplete="off"
          value={kalit}
          placeholder={h.keyHint ?? 'Moi Zvonki kabinetidagi kalit'}
          disabled={!boshqaraOladi}
          maxLength={200}
          onChange={(e) => setKalit(e.target.value)}
        />
        <div className="yordam">
          {h.keyHint
            ? `O'rnatilgan (${h.keyHint}). Bo'sh qoldirsangiz o'zgarmaydi.`
            : 'Kalit shifrlangan holda saqlanadi va keyin hech qachon to\'liq ko\'rsatilmaydi.'}
        </div>
      </div>

      <div className="soat-qator">
        <div className="maydon-blok">
          <label htmlFor="mz-min">Eng qisqa qo'ng'iroq (soniya)</label>
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
            Bundan qisqasi olinmaydi — «allo, keyinroq» kabi qo'ng'iroqlarni baholash pul
            sarflaydi, lekin hech narsa demaydi.
          </div>
        </div>
        <div className="maydon-blok">
          <label htmlFor="mz-orqaga">Birinchi ulanishda necha kun orqaga</label>
          <input
            id="mz-orqaga"
            type="number"
            min={0}
            max={30}
            value={orqaga}
            disabled={!boshqaraOladi}
            onChange={(e) => setOrqaga(Number(e.target.value))}
          />
          <div className="yordam">Faqat birinchi sinxronlashga ta'sir qiladi.</div>
        </div>
      </div>

      <div className="ogoh-sozlama" style={{ marginBottom: 12 }}>
        <label className="sozlama-satr">
          <span className="matn">
            <b>Avtomatik baholash</b>
            <span className="izoh">
              O'chiq bo'lsa qo'ng'iroqlar faqat ro'yxatga tushadi — STT va AI pul sarflamaydi.
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
            disabled={holat === 'ketmoqda' || !domain.trim() || !email.trim()}
            onClick={() =>
              void bajar(async () => {
                await api.put(base, {
                  domain: domain.trim(),
                  userName: email.trim(),
                  apiKey: kalit.trim() ? kalit.trim() : null,
                  autoAnalyze: avto,
                  minDurationSeconds: minDavom,
                  backfillDays: orqaga,
                });
                setKalit('');
                yukla();
              })
            }
          >
            {holat === 'ketmoqda' ? 'Tekshirilmoqda…' : 'Saqlash va tekshirish'}
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
                        ? `Xato: ${r.xato}`
                        : `${r.olindi} ta qo'ng'iroq ko'rildi, ${r.saqlandi} tasi yangi.`,
                    );
                    yukla();
                  })
                }
              >
                Hozir sinxronlash
              </button>
              <button
                className="btn ikkinchi"
                onClick={() => {
                  if (!window.confirm('Moi Zvonki uzilsinmi? Olingan qo\'ng\'iroqlar va baholar qoladi.')) return;
                  void amal.bajar(async () => {
                    await api.del(base);
                    yukla();
                  });
                }}
              >
                Uzish
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
          <h3 style={{ marginTop: 6, marginBottom: 8 }}>Holat</h3>
          <div className="jamoa-raqam">
            <div className="katak ok">
              <div className="son">{c.baholandi}</div>
              <div className="nom">Baholandi</div>
            </div>
            <div className="katak">
              <div className="son">{c.kutmoqda + c.ishlanmoqda}</div>
              <div className="nom">Navbatda</div>
            </div>
            <div className={`katak${c.boglanmagan > 0 ? ' sariq' : ''}`}>
              <div className="son">{c.boglanmagan}</div>
              <div className="nom">Menejer bog'lanmagan</div>
            </div>
            <div className="katak">
              <div className="son">{c.filtrlangan}</div>
              <div className="nom">Filtrlangan</div>
            </div>
            <div className={`katak${c.xato > 0 ? ' sariq' : ''}`}>
              <div className="son">{c.xato}</div>
              <div className="nom">Xato</div>
            </div>
          </div>
          <div className="yordam" style={{ marginBottom: 10 }}>
            Oxirgi sinxronlash: {h.lastSyncAt ? fmtSana(h.lastSyncAt) : 'hali bo\'lmagan'}
            {h.config?.lastStats &&
              ` · ${h.config.lastStats.olindi} ta ko'rildi: ${h.config.lastStats.saqlandi} yangi, ` +
                `${h.config.lastStats.javobsiz} javobsiz, ${h.config.lastStats.qisqa} qisqa`}
            {!h.config?.autoAnalyze && ' · avtomatik baholash o\'chiq'}
          </div>
          {h.lastError && <div className="xato-qator">Oxirgi xato: {h.lastError}</div>}

          {c.xato > 0 && (
            <div className="yordam" style={{ marginBottom: 10 }}>
              {h.recentErrors[0]?.reason && <>Masalan: «{h.recentErrors[0].reason}». </>}
              {boshqaraOladi && (
                <button
                  className="matn-tugma"
                  onClick={() =>
                    void api
                      .post<{ requeued: number }>(`${base}/retry`)
                      .then(yukla)
                  }
                >
                  Xatolilarni qayta urinish
                </button>
              )}
            </div>
          )}

          {/* ─── Xodimlar ─── */}
          <h3 style={{ marginTop: 14, marginBottom: 6 }}>Xodimlar → menejerlar</h3>
          <div className="yordam" style={{ marginBottom: 8 }}>
            Faqat menejerga bog'langan xodimning qo'ng'iroqlari baholanadi. Bog'lagan zahoti
            kutib turgan qo'ng'iroqlari ham o'sha menejerga o'tadi.
          </div>
          {xodimlar?.izoh && (
            <div className="yordam" style={{ marginBottom: 8, color: 'var(--orta-text)' }}>
              {xodimlar.izoh}
            </div>
          )}
          {!xodimlar ? (
            <div className="yuklanmoqda">Yuklanmoqda…</div>
          ) : xodimlar.employees.length === 0 ? (
            <div className="hech-narsa">Hali xodim topilmadi</div>
          ) : (
            <div className="menejer-jadval">
              {xodimlar.employees.map((x) => (
                <div className="qator" key={x.id}>
                  <div className="bosh">
                    <div className="matn">
                      <div className="ism">{x.name ?? `Xodim #${x.id}`}</div>
                      <div className="izoh">
                        {x.email ?? `ID ${x.id}`} · {x.calls} ta qo'ng'iroq
                      </div>
                    </div>
                    <div className="amal">
                      {!x.seatId && x.suggestedSeatId && (
                        <span className="badge sariq">email mos</span>
                      )}
                      <select
                        value={x.seatId ?? ''}
                        disabled={!boshqaraOladi}
                        aria-label={`${x.name ?? x.id} uchun menejer`}
                        onChange={(e) =>
                          void amal.bajar(async () => {
                            const r = await api.put<{ otkazildi: number }>(`${base}/employees`, {
                              xodimId: x.id,
                              seatId: e.target.value || null,
                            });
                            if (r.otkazildi > 0) {
                              setSinxXabar(`${r.otkazildi} ta kutayotgan qo'ng'iroq menejerga o'tdi.`);
                            }
                            yukla();
                          })
                        }
                      >
                        <option value="">— bog'lanmagan —</option>
                        {xodimlar.seats.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.id === x.suggestedSeatId ? ' (taklif)' : ''}
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

  if (!h) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  const xatolilar = h.recent.filter((r) => r.exportError).length;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="karta-bosh">
        <h2>Vazifalarni CRM'ga yuborish</h2>
        <span className={`badge ${h.config.exportTasks ? 'ok' : 'kul'}`}>
          {h.config.exportTasks ? 'yoqilgan' : 'o\'chirilgan'}
        </span>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        Har yangi vazifa siz ko'rsatgan manzilga <b>imzolangan</b> so'rov bo'lib yuboriladi.
        amoCRM va Bitrix24 ning kiruvchi webhooki, n8n/Make yoki o'z backendingiz — hammasi
        ishlaydi.
      </div>

      <div className="ogoh-sozlama" style={{ marginBottom: 12 }}>
        <label className="sozlama-satr">
          <span className="matn">
            <b>Eksport yoqilsin</b>
            <span className="izoh">
              O'chirilganda vazifalar faqat shu ilovada qoladi — hech qayerga yuborilmaydi.
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
        <label htmlFor="crm-url">Webhook manzili</label>
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
        <label htmlFor="crm-sir">Imzo siri</label>
        <div className="qolda-qator">
          <input
            id="crm-sir"
            value={sir}
            type="password"
            autoComplete="off"
            placeholder={h.secretHint ?? 'kamida 16 belgi'}
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
              Yaratish
            </button>
          )}
        </div>
        <div className="yordam">
          {h.config.hasSecret
            ? `O'rnatilgan (${h.secretHint}). Bo'sh qoldirsangiz o'zgarmaydi.`
            : 'Imzosiz eksportni yoqib bo\'lmaydi — manzilni bilgan har kim soxta vazifa yuborishi mumkin.'}
        </div>
      </div>

      <details className="crm-hujjat">
        <summary>Qabul qiluvchi tomonda imzoni qanday tekshirish kerak</summary>
        <div className="yordam" style={{ marginTop: 8 }}>
          Har so'rovda ikki sarlavha keladi:
        </div>
        <pre className="kod-blok">{`X-Sotuv-Timestamp: 1767225600
X-Sotuv-Signature: v1=<hex>

imzo = HMAC_SHA256(sir, timestamp + "." + tana)`}</pre>
        <div className="yordam">
          Timestamp'ni ham tekshiring (masalan 5 daqiqadan eski so'rovni rad eting) — aks holda
          ushlab olingan so'rovni qayta yuborish mumkin bo'ladi.
        </div>
      </details>

      <Xabar holat={holat} xato={xato} />

      {sinov &&
        (sinov.ok ? (
          <div className="ok-qator">Sinov so'rovi qabul qilindi ✓</div>
        ) : (
          <div className="xato-qator">
            Sinov muvaffaqiyatsiz{sinov.status ? ` (HTTP ${sinov.status})` : ''}: {sinov.error}
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
            {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
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
                    error: e instanceof ApiError ? e.message : 'yuborilmadi',
                  }),
                )
            }
          >
            Sinov so'rovi
          </button>
        </div>
      )}

      {h.recent.length > 0 && (
        <>
          <h3 style={{ marginTop: 18, marginBottom: 6 }}>Oxirgi yuborishlar</h3>
          {xatolilar > 0 && boshqaraOladi && (
            <div className="yordam" style={{ marginBottom: 8 }}>
              {xatolilar} ta yuborishda xato bor.{' '}
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
                Xatolilarni qayta yuborish
              </button>
            </div>
          )}
          <div className="eksport-royxat">
            {h.recent.map((r) => (
              <div className="qator" key={r.id}>
                <span className="nom">{r.title}</span>
                {r.exportError ? (
                  <span className="badge qizil" title={r.exportError}>
                    xato
                  </span>
                ) : (
                  <span className="badge ok">yuborildi</span>
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
  const [model, setModel] = useState<SttModelKey>(() => getSttModel());

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="karta-bosh">
        <h2>Transkript modeli</h2>
        <span className="badge kul">sinov</span>
      </div>
      <div className="maydon-blok">
        <label htmlFor="stt-model">Audio yuklashda ishlatiladigan model</label>
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
        <div className="yordam">{STT_MODELLAR.find((m) => m.key === model)?.note}</div>
      </div>
    </div>
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

