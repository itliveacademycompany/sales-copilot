import { Check, Info, Megaphone, Send, TriangleAlert, UserRound, Users } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type TelegramIntegration } from '../../api';
import { useAuth } from '../../auth';
import {
  KATEGORIYALAR,
  MOS_TUR,
  TG_KANALLAR,
  type AlertPrefs,
  type AlertTuri,
  type MatritsaTuri,
  type TelegramManzil,
  type TelegramTargets,
  type TgKanal,
} from './bildirishnoma';
import './bildirishnomalar.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → BILDIRISHNOMALAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hammasi serverda: `alert-prefs` (qaysi tur yaratilsin, qayerga borsin, past
 * baho chegarasi) va `integrations/telegram/targets` (bot, guruh, kanal
 * manzillari). Jamoaning har bir rahbari bir xil sozlamani ko'radi va worker
 * xabarlarni aynan shu sozlama bo'yicha tarqatadi.
 */

const xatoMatni = (e: unknown, z: string) => (e instanceof ApiError || e instanceof Error ? e.message : z);
const teng = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Almash({ yoqilgan, onOzgar, aria, disabled, title }: { yoqilgan: boolean; onOzgar?: (v: boolean) => void; aria: string; disabled?: boolean; title?: string }) {
  return (
    <label className="vr-almash bn-almash" title={title}>
      <input type="checkbox" role="switch" aria-label={aria} checked={yoqilgan} disabled={disabled} onChange={(e) => onOzgar?.(e.target.checked)} />
      <span className="vr-almash-yol" aria-hidden="true" />
    </label>
  );
}

export function Bildirishnomalar({ businessId, boshqaraOladi }: { businessId: string; boshqaraOladi: boolean }) {
  const base = `/api/v1/businesses/${businessId}`;
  const { business } = useAuth();
  const yozaOladi = !!business?.permissions.includes('business:write');

  const [asl, setAsl] = useState<AlertPrefs | null>(null);
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [tg, setTg] = useState<TelegramIntegration | null>(null);
  const [manzillar, setManzillar] = useState<TelegramTargets | null>(null);
  const [yuklashXato, setYuklashXato] = useState<string | null>(null);
  const [saqlash, setSaqlash] = useState<'tinch' | 'ketmoqda' | 'saqlandi'>('tinch');
  const [saqlashXato, setSaqlashXato] = useState<string | null>(null);

  const manzillarniYukla = useCallback(async () => {
    const [t, m] = await Promise.all([
      api.get<TelegramIntegration>(`${base}/integrations/telegram`).catch(() => null),
      api.get<{ targets: TelegramTargets }>(`${base}/integrations/telegram/targets`),
    ]);
    setTg(t);
    setManzillar(m.targets);
  }, [base]);

  const yukla = useCallback(async () => {
    setYuklashXato(null);
    try {
      const [p] = await Promise.all([api.get<{ alertPrefs: AlertPrefs }>(`${base}/alert-prefs`), manzillarniYukla()]);
      setAsl(p.alertPrefs);
      setPrefs(p.alertPrefs);
    } catch (e) {
      setYuklashXato(xatoMatni(e, "Sozlamalarni yuklab bo'lmadi"));
    }
  }, [base, manzillarniYukla]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  if (yuklashXato) {
    return (
      <section className="card sz-karta bn-karta">
        <div className="yordam bzl-xato">{yuklashXato}</div>
        <div className="pr-past">
          <button type="button" className="btn ikkinchi" onClick={() => void yukla()}>
            Qayta urinish
          </button>
        </div>
      </section>
    );
  }
  if (!prefs || !asl || !manzillar) return <div className="card skelet" style={{ height: 420 }} aria-busy="true" />;

  const botUlangan = !!tg?.connected;
  const cfg = tg?.integration?.config ?? {};
  const botNomi = cfg.botUsername ? `@${cfg.botUsername.replace(/^@/, '')}` : 'Bot';
  const ozgargan = !teng(prefs, asl);

  const turYoq = (k: AlertTuri, v: boolean) => setPrefs((p) => (p ? { ...p, kinds: { ...p.kinds, [k]: v } } : p));
  const kanal = (k: MatritsaTuri, ch: TgKanal, v: boolean) =>
    setPrefs((p) => (p ? { ...p, channels: { ...p.channels, [k]: { ...p.channels[k], [ch]: v } } } : p));
  const pastBaho = (o: Partial<AlertPrefs['lowScore']>) => setPrefs((p) => (p ? { ...p, lowScore: { ...p.lowScore, ...o } } : p));

  const ls = prefs.lowScore;
  const chegaraTogri = Number.isInteger(ls.threshold) && ls.threshold >= 0 && ls.threshold <= 100;
  const repTogri = Number.isInteger(ls.minTurns) && ls.minTurns >= 1 && ls.minTurns <= 100;
  const kunlikTelegramYoq = !TG_KANALLAR.some((c) => prefs.channels.daily_report[c.k]);

  const saqla = async () => {
    setSaqlash('ketmoqda');
    setSaqlashXato(null);
    try {
      const r = await api.put<{ alertPrefs: AlertPrefs }>(`${base}/alert-prefs`, prefs);
      setAsl(r.alertPrefs);
      setPrefs(r.alertPrefs);
      setSaqlash('saqlandi');
      setTimeout(() => setSaqlash('tinch'), 2200);
    } catch (e) {
      setSaqlash('tinch');
      setSaqlashXato(xatoMatni(e, 'Saqlanmadi'));
    }
  };

  const katak = (k: MatritsaTuri, ch: TgKanal, nom: string) => {
    const turOchiq = k === 'daily_report' || prefs.kinds[k];
    const manzilBor = !!manzillar[ch];
    const title = !turOchiq
      ? "Bu tur o'chirilgan — ogohlantirish yaratilmaydi, shuning uchun yuborilmaydi ham"
      : !manzilBor
        ? `${nom} manzili ulanmagan — quyida ulang, aks holda hech narsa yuborilmaydi`
        : undefined;
    return (
      <span className={manzilBor ? undefined : 'bn-manzilsiz'}>
        <Almash
          yoqilgan={turOchiq && prefs.channels[k][ch]}
          disabled={!yozaOladi || !turOchiq}
          aria={`${nom}`}
          title={title}
          onOzgar={(v) => kanal(k, ch, v)}
        />
      </span>
    );
  };

  return (
    <section className="card sz-karta bn-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>Bildirishnomalar</h2>
          <p>Qaysi ogohlantirishlar yaratilishi va qayerga yuborilishini tanlang.</p>
        </div>
      </div>

      <div className="bn-bolim">
        <b className="bn-sarlavha">Bildirishnoma kanallari</b>
        <div className="bn-jadval-oram">
          <table className="bn-jadval">
            <thead>
              <tr>
                <th scope="col">Ogohlantirish turi</th>
                <th scope="col">Ilovada</th>
                {TG_KANALLAR.map((u) => (
                  <th key={u.k} scope="col">
                    {u.nom}
                    {!manzillar[u.k] && <small className="bn-ustun-izoh">ulanmagan</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KATEGORIYALAR.map((kat) => (
                <Fragment key={kat.nom}>
                  <tr className="bn-kategoriya">
                    <th scope="rowgroup" colSpan={5}>
                      <b>{kat.nom}</b>
                      <small>{kat.izoh}</small>
                    </th>
                  </tr>
                  {kat.turlar.map((tur) => (
                    <Fragment key={tur.k}>
                      <tr className={tur.k === 'quality_drop' ? 'bn-ochiq' : undefined}>
                        <th scope="row">
                          <b>{tur.nom}</b>
                          <small>{tur.izoh}</small>
                        </th>
                        <td>
                          {tur.k === 'daily_report' ? (
                            <span className="bn-yoq" title="Kunlik hisobot «Kunlik hisobot» sahifasida doim ko'rinadi">
                              —
                            </span>
                          ) : (
                            <Almash
                              yoqilgan={prefs.kinds[tur.k]}
                              disabled={!yozaOladi}
                              aria={`${tur.nom} — yaratilsin`}
                              title={prefs.kinds[tur.k] ? "O'chirilsa, bu ogohlantirish umuman yaratilmaydi" : undefined}
                              onOzgar={(v) => turYoq(tur.k as AlertTuri, v)}
                            />
                          )}
                        </td>
                        {TG_KANALLAR.map((u) => (
                          <td key={u.k}>{katak(tur.k, u.k, `${tur.nom} — ${u.nom}`)}</td>
                        ))}
                      </tr>
                      {tur.k === 'quality_drop' && (
                        <tr className="bn-ichki-qator">
                          <td colSpan={5}>
                            <div className="bn-ichki">
                              <div className="bn-ichki-karta">
                                <div className="bn-ichki-bosh">
                                  <div>
                                    <b>Past baho ogohlantirishi</b>
                                    <small>Tahlildan keyin suhbat bahosi chegaradan past chiqsa, «Past baho» ogohlantirishi yaratiladi.</small>
                                  </div>
                                  <Almash
                                    yoqilgan={ls.enabled}
                                    disabled={!yozaOladi || !prefs.kinds.quality_drop}
                                    onOzgar={(v) => pastBaho({ enabled: v })}
                                    aria="Past baho ogohlantirishi"
                                  />
                                </div>
                                <div className="bn-ichki-maydonlar">
                                  <div className="maydon-blok">
                                    <label htmlFor="bn-chegara">Baho chegarasi, % (0–100)</label>
                                    <input
                                      id="bn-chegara"
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      max={100}
                                      disabled={!yozaOladi}
                                      value={Number.isNaN(ls.threshold) ? '' : ls.threshold}
                                      aria-invalid={!chegaraTogri}
                                      onChange={(e) => pastBaho({ threshold: e.target.value === '' ? NaN : Number(e.target.value) })}
                                    />
                                    {!chegaraTogri && <div className="yordam bzl-xato">0 dan 100 gacha butun son</div>}
                                  </div>
                                  <div className="maydon-blok">
                                    <label htmlFor="bn-replika">Kamida nechta replika (1–100)</label>
                                    <input
                                      id="bn-replika"
                                      type="number"
                                      inputMode="numeric"
                                      min={1}
                                      max={100}
                                      disabled={!yozaOladi}
                                      value={Number.isNaN(ls.minTurns) ? '' : ls.minTurns}
                                      aria-invalid={!repTogri}
                                      onChange={(e) => pastBaho({ minTurns: e.target.value === '' ? NaN : Number(e.target.value) })}
                                    />
                                    {!repTogri && <div className="yordam bzl-xato">1 dan 100 gacha butun son</div>}
                                  </div>
                                </div>
                                <small className="yordam">
                                  Qisqa suhbat (bir-ikki replika) tabiiy ravishda past baho oladi — shuning uchun undan qisqasi hisobga olinmaydi. AI ishonchi past
                                  bo'lgan tahlil uchun «Past baho» chiqmaydi: unga «AI ishonchi past» ogohlantirishi beriladi.
                                </small>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sz-eslatma">
          «Ilovada» o'chirilgan tur umuman yaratilmaydi — na ilovada, na Telegram'da. Telegram ustunlari yaratilgan ogohlantirishni qo'shimcha ravishda
          tanlangan manzilga yuboradi. Bahoga e'tiroz ogohlantirishlari doim faqat ilovada ko'rinadi.
          {kunlikTelegramYoq &&
            (cfg.reportChatId
              ? ' Kunlik hisobot uchun Telegram tanlanmagan — u «Kunlik hisobot» bo\'limidagi standart chatga yuboriladi.'
              : ' Kunlik hisobot hozircha Telegram\'ga yuborilmaydi.')}
          {!yozaOladi && " Sozlamani faqat biznes sozlamalariga huquqi bor rahbar o'zgartira oladi."}
        </p>
      </div>

      <div className="pr-past">
        {saqlashXato && <span className="kr-holat xato">{saqlashXato}</span>}
        {!saqlashXato && ozgargan && saqlash === 'tinch' && <span className="kr-holat">Saqlanmagan o'zgarishlar bor</span>}
        {saqlash === 'saqlandi' && (
          <span className="kr-holat ok">
            <Check /> Saqlandi
          </span>
        )}
        <button
          type="button"
          className="btn ikkinchi"
          disabled={!ozgargan || saqlash === 'ketmoqda'}
          onClick={() => {
            setPrefs(asl);
            setSaqlashXato(null);
          }}
        >
          Bekor qilish
        </button>
        <button type="button" className="btn" disabled={!yozaOladi || !ozgargan || !chegaraTogri || !repTogri || saqlash === 'ketmoqda'} onClick={() => void saqla()}>
          {saqlash === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>

      <div className="bn-bolim">
        <div className="bn-manzil-bosh">
          <div>
            <b className="bn-sarlavha">Telegram manzillari</b>
            <small>Ogohlantirishlar yuboriladigan shaxsiy chat, guruh va kanal.</small>
          </div>
        </div>

        {!botUlangan ? (
          <div className="bzl-izoh" role="status">
            <Info aria-hidden="true" />
            <span>
              Manzil ulash uchun avval Telegram botni ulang. <Link to="/sozlamalar?b=integratsiya">Telegram bot sozlamalari</Link>
            </span>
          </div>
        ) : (
          <>
            <ol className="bn-qadamlar">
              <li>
                <b>Shaxsiy chat:</b> {botNomi} botiga Telegram'da istalgan xabar yozing.
              </li>
              <li>
                <b>Guruh:</b> botni guruhga qo'shing va guruhda bitta xabar yozing.
              </li>
              <li>
                <b>Kanal:</b> botni kanalga <b>administrator</b> qilib qo'shing va kanalga bitta post joylang.
              </li>
              <li>Chat quyidagi ro'yxatda paydo bo'ladi — tanlang va «Sinov xabari» bilan tekshiring. Chiqmasa, chat ID'ni qo'lda kiriting.</li>
            </ol>
            {TG_KANALLAR.map((u) => (
              <ManzilKarta
                key={u.k}
                base={base}
                kanal={u.k}
                nom={u.nom}
                manzillar={manzillar}
                boshqaraOladi={boshqaraOladi}
                onYangilandi={setManzillar}
                onQaytaYukla={() => void manzillarniYukla()}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

/** Bitta manzil (shaxsiy chat / guruh / kanal): ko'rsatish, tanlash, sinash, uzish. */
function ManzilKarta({
  base,
  kanal,
  nom,
  manzillar,
  boshqaraOladi,
  onYangilandi,
  onQaytaYukla,
}: {
  base: string;
  kanal: TgKanal;
  nom: string;
  manzillar: TelegramTargets;
  boshqaraOladi: boolean;
  onYangilandi: (t: TelegramTargets) => void;
  onQaytaYukla: () => void;
}) {
  const joriy = manzillar[kanal];
  const [tahrir, setTahrir] = useState(false);
  const [tanlov, setTanlov] = useState('');
  const [qoldaId, setQoldaId] = useState('');
  const [qoldaNom, setQoldaNom] = useState('');
  const [holat, setHolat] = useState<'tinch' | 'ketmoqda'>('tinch');
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);

  const korilgan = manzillar.discovered.filter((d) => MOS_TUR[kanal].includes(d.type));
  const Ikon = kanal === 'channel' ? Megaphone : kanal === 'group' ? Users : UserRound;

  /** Server PUT da kelmagan kalitni `null` qiladi — shuning uchun uchalasi doim yuboriladi. */
  const yoz = async (yangi: TelegramManzil | null) => {
    setHolat('ketmoqda');
    setXabar(null);
    try {
      const body = { dm: manzillar.dm, group: manzillar.group, channel: manzillar.channel, [kanal]: yangi };
      const r = await api.put<{ targets: TelegramTargets }>(`${base}/integrations/telegram/targets`, body);
      onYangilandi(r.targets);
      setTahrir(false);
      setTanlov('');
      setQoldaId('');
      setQoldaNom('');
    } catch (e) {
      setXabar({ ok: false, matn: xatoMatni(e, 'Saqlanmadi') });
    } finally {
      setHolat('tinch');
    }
  };

  const sina = async () => {
    setHolat('ketmoqda');
    setXabar(null);
    try {
      const r = await api.post<{ ok: boolean; error: string | null }>(`${base}/integrations/telegram/targets/test`, { kanal });
      setXabar(r.ok ? { ok: true, matn: "Sinov xabari yuborildi — Telegram'ni tekshiring" } : { ok: false, matn: `Yuborilmadi: ${r.error ?? "noma'lum sabab"}` });
    } catch (e) {
      setXabar({ ok: false, matn: xatoMatni(e, 'Yuborilmadi') });
    } finally {
      setHolat('tinch');
    }
  };

  const qoldaTogri = /^-?\d{3,}$/.test(qoldaId.trim());
  const saqlanadigan: TelegramManzil | null = tanlov
    ? { chatId: tanlov, title: korilgan.find((d) => d.chatId === tanlov)?.title ?? null }
    : qoldaTogri
      ? { chatId: qoldaId.trim(), title: qoldaNom.trim() || null }
      : null;

  return (
    <div className="bn-manzil-blok">
      <div className="bn-manzil">
        <span className="sz-ikon">
          <Ikon />
        </span>
        <div className="bn-manzil-matn">
          <div>
            <b>{joriy ? joriy.title ?? nom : nom}</b>
            <span className={`bzl-pill${joriy ? ' info' : ''}`}>{joriy ? 'Ulangan' : 'Ulanmagan'}</span>
          </div>
          <small>{joriy ? <code>{joriy.chatId}</code> : 'Bu manzilga hech narsa yuborilmaydi.'}</small>
          {xabar && <small className={xabar.ok ? 'bn-ok' : 'bzl-xato'}>{xabar.matn}</small>}
        </div>
        {boshqaraOladi && (
          <div className="bn-manzil-amal">
            {joriy && (
              <button type="button" className="btn ikkinchi" disabled={holat === 'ketmoqda'} onClick={() => void sina()}>
                <Send /> Sinov xabari
              </button>
            )}
            <button type="button" className="btn ikkinchi" aria-expanded={tahrir} onClick={() => setTahrir((v) => !v)}>
              {tahrir ? 'Yopish' : joriy ? 'Almashtirish' : 'Ulash'}
            </button>
            {joriy && (
              <button
                type="button"
                className="bzl-amal bn-uz"
                disabled={holat === 'ketmoqda'}
                onClick={() => {
                  if (window.confirm(`${nom} manzilini uzasizmi? Unga ogohlantirishlar yuborilmay qoladi.`)) void yoz(null);
                }}
              >
                Uzish
              </button>
            )}
          </div>
        )}
      </div>

      {tahrir && boshqaraOladi && (
        <form
          className="bn-ulash"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (saqlanadigan) void yoz(saqlanadigan);
          }}
        >
          <div className="bzl-forma-panjara bn-ulash-panjara">
            <div className="maydon-blok">
              <label htmlFor={`bn-korilgan-${kanal}`}>Bot ko'rgan chatlar</label>
              <select
                id={`bn-korilgan-${kanal}`}
                value={tanlov}
                onChange={(e) => {
                  setTanlov(e.target.value);
                  if (e.target.value) setQoldaId('');
                }}
              >
                <option value="">{korilgan.length ? '— tanlang —' : "Hali hech narsa yo'q"}</option>
                {korilgan.map((d) => (
                  <option key={d.chatId} value={d.chatId}>
                    {d.title ?? d.chatId}
                  </option>
                ))}
              </select>
            </div>
            <div className="maydon-blok">
              <label htmlFor={`bn-chat-${kanal}`}>yoki chat ID</label>
              <input
                id={`bn-chat-${kanal}`}
                value={qoldaId}
                onChange={(e) => {
                  setQoldaId(e.target.value.replace(/\s/g, ''));
                  if (e.target.value) setTanlov('');
                }}
                placeholder={kanal === 'dm' ? '123456789' : '-1001234567890'}
                inputMode="numeric"
                spellCheck={false}
                aria-invalid={!!qoldaId && !qoldaTogri}
              />
            </div>
            {!tanlov && (
              <div className="maydon-blok">
                <label htmlFor={`bn-nom-${kanal}`}>Nomi</label>
                <input id={`bn-nom-${kanal}`} value={qoldaNom} onChange={(e) => setQoldaNom(e.target.value)} placeholder="Masalan: Sotuv bo'limi" maxLength={200} />
              </div>
            )}
          </div>
          {!!qoldaId && !qoldaTogri && (
            <div className="bzl-izoh xato" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>Chat ID faqat raqamlardan iborat (guruh va kanallarda odatda -100 bilan boshlanadi).</span>
            </div>
          )}
          <div className="bn-manzil-amal">
            <button type="submit" className="btn" disabled={!saqlanadigan || holat === 'ketmoqda'}>
              {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
            <button type="button" className="btn ikkinchi" onClick={onQaytaYukla}>
              Ro'yxatni yangilash
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
