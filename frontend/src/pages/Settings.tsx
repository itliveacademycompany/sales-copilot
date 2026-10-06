import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  ApiError,
  fmtSana,
  type BiznesIshJadvali,
  type BusinessProfile,
  type BusinessRow,
  type IshJadvaliQiymat,
  type DailyReportRow,
  type MemberRow,
  type SeatFull,
  type TelegramIntegration,
} from '../api';
import { useAuth } from '../auth';
import { TILLAR, useT, useTil, type Til } from '../i18n';
import { baytMatn, RasmXato, rasmniTayyorla } from '../rasm';
import {
  AKSENTLAR,
  korinishOqi,
  korinishYoz,
  MAVZULAR,
  QORONGI_SXEMALAR,
  YORUG_SXEMALAR,
  type KorinishHolat,
} from '../korinish';
import {
  korinadiganBolimlar,
  SOZLAMA_BOSH,
  sozlamaTopildi,
} from '../settingsSections';
import { getSttModel, setSttModel, STT_MODELLAR, type SttModelKey } from '../sttModels';

/**
 * SOZLAMALAR — TZ 3.11 (FR-160, 161, 162, 164, 165, 166).
 *
 * Bo'limlar guruhlangan yon menyuda va HAR BIRI o'z manzilida
 * (`/sozlamalar/ish-jadvali`). Sabab: sozlama ko'paygan sari tab qatori
 * sig'masdi, va aniq sozlamaga havola berish (masalan qo'llab-quvvatlash
 * uchun) imkonsiz edi.
 *
 * Har bo'lim o'z ruxsatiga qarab ko'rinadi. Chegara serverda — bu yerdagi
 * yashirish faqat foydasiz tugmani ko'rsatmaslik uchun.
 */

const ROL_NOM: Record<string, string> = {
  owner: 'Ega',
  supervisor: 'Rahbar',
  head: 'Bo\'lim boshlig\'i',
  auditor: 'Auditor',
};

/**
 * Kalitlar `activation_status` enum'iga aynan mos: pending / active /
 * disabled. Ilgari bu yerda mavjud bo'lmagan `suspended` turgani uchun
 * o'chirilgan o'rin inglizcha «disabled» bo'lib ko'rinardi.
 */
const AKTIVATSIYA: Record<string, { nom: string; klass: string }> = {
  active: { nom: 'Faol', klass: 'ok' },
  pending: { nom: 'Kutilmoqda', klass: 'sariq' },
  disabled: { nom: 'O\'chirilgan', klass: 'kul' },
};

export function Settings() {
  const { user, business, refresh } = useAuth();
  const t = useT();
  const { bolim: bolimParam } = useParams();
  const navigate = useNavigate();
  const bolim = sozlamaTopildi(bolimParam);

  const p = business?.permissions ?? [];
  const bizneYozadi = p.includes('business:write');
  const integratsiyaBoshqaradi = p.includes('integration:manage');
  const korinadi = korinadiganBolimlar(p);

  /**
   * Noma'lum yoki ruxsat yo'q bo'lim kelsa, manzil kanonik ko'rinishga
   * tuzatiladi — aks holda yon menyuda hech narsa yoritilmasdi.
   */
  useEffect(() => {
    const bor = korinadi.some((b) => b.slug === bolim);
    if (!bor || bolimParam !== bolim) {
      const maqsad = bor ? bolim : (korinadi[0]?.slug ?? SOZLAMA_BOSH);
      navigate(`/sozlamalar/${maqsad}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolimParam, bolim, korinadi.length]);

  // Guruhlar tartibi ro'yxatda qanday bo'lsa — shunday.
  const guruhlar = [...new Set(korinadi.map((b) => b.guruh))];

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>{t('Sozlamalar')}</h1>
          <div className="izoh">{t('Profil, jamoa, ish jadvali va ulanishlar')}</div>
        </div>
      </div>

      <div className="sozlama-layout">
        {/* ─── Yon menyu ─── */}
        <nav className="sozlama-menyu" aria-label={t("Sozlamalar bo'limlari")}>
          {guruhlar.map((g) => (
            <div className="guruh" key={g}>
              <div className="guruh-nom">{t(g)}</div>
              {korinadi
                .filter((b) => b.guruh === g)
                .map((b) =>
                  b.havola ? (
                    // Boshqa sahifaga olib boradigan bo'lim — o'zida kontent yo'q.
                    <Link key={b.slug} to={b.havola} className="menyu-band tashqi">
                      {t(b.nom)}
                      <span className="belgi" aria-hidden="true">
                        ↗
                      </span>
                    </Link>
                  ) : (
                    <button
                      key={b.slug}
                      className={`menyu-band${bolim === b.slug ? ' active' : ''}`}
                      onClick={() => navigate(`/sozlamalar/${b.slug}`)}
                    >
                      {t(b.nom)}
                    </button>
                  ),
                )}
            </div>
          ))}
        </nav>

        {/* ─── Kontent ─── */}
        <div className="sozlama-kontent">
          {bolim === 'profil' && <Profil user={user} onSaqlandi={refresh} />}
          {bolim === 'korinish' && <Korinish user={user} onSaqlandi={refresh} />}
          {bolim === 'biznes' && business && (
            <Biznes businessId={business.businessId} yozaOladi={bizneYozadi} onSaqlandi={refresh} />
          )}
          {bolim === 'bizneslar' && <Bizneslar />}
          {bolim === 'menejerlar' && business && <Sotuvchilar businessId={business.businessId} />}
          {bolim === 'rahbarlar' && business && <Rahbarlar businessId={business.businessId} />}
          {bolim === 'ish-jadvali' && business && (
            <IshJadvali businessId={business.businessId} yozaOladi={bizneYozadi} />
          )}
          {bolim === 'integratsiya' && business && (
            <>
              <Integratsiya
                businessId={business.businessId}
                boshqaraOladi={integratsiyaBoshqaradi}
              />
              <MoiZvonki
                businessId={business.businessId}
                boshqaraOladi={integratsiyaBoshqaradi}
              />
              <CrmEksport
                businessId={business.businessId}
                boshqaraOladi={integratsiyaBoshqaradi}
              />
              <SttTanlash />
            </>
          )}
          {bolim === 'bildirishnoma' && business && (
            <>
              <Ogohlantirishlar businessId={business.businessId} yozaOladi={bizneYozadi} />
              <KunlikHisobot
                businessId={business.businessId}
                boshqaraOladi={integratsiyaBoshqaradi}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Ko'rinish — mavzu, til, aksent rangi va rang sxemalari (FR-162).
 *
 * Profil bo'limidan ajratildi: ko'rinish — QURILMA sozlamasi
 * (localStorage'da saqlanadi va serverga bormaydi), profil esa hisob
 * ma'lumoti. Ularni bitta formada saqlash "Saqlash" tugmasi mavzuga ham
 * tegadimi degan savolni tug'dirardi.
 *
 * "Saqlash" tugmasi yo'q — har tanlov DARHOL qo'llanadi. Sabab: natijani
 * ko'rmasdan turib rang tanlash mumkin emas, tugma esa ko'rishni saqlashdan
 * keyinga surardi.
 */
function Korinish({
  user,
  onSaqlandi,
}: {
  user: { locale: string } | null;
  onSaqlandi: () => Promise<void>;
}) {
  const [k, setK] = useState<KorinishHolat>(() => korinishOqi());
  const yoz = <K extends keyof KorinishHolat>(maydon: K, qiymat: KorinishHolat[K]) =>
    setK(korinishYoz(maydon, qiymat));

  return (
    <>
      {/* ─── Mavzu ─── */}
      <div className="card">
        <div className="karta-bosh">
          <h2>Mavzu</h2>
        </div>
        <div className="yordam" style={{ marginBottom: 12 }}>
          Ko'rinish shu qurilmada saqlanadi va boshqa foydalanuvchilarga ta'sir qilmaydi.
        </div>
        <div className="mavzu-grid">
          {MAVZULAR.map((v) => (
            <button
              key={v.key}
              className={`mavzu-katak${k.mavzu === v.key ? ' active' : ''}`}
              aria-pressed={k.mavzu === v.key}
              onClick={() => yoz('mavzu', v.key)}
            >
              <span className={`namuna ${v.key}`} aria-hidden="true">
                <span className="chiziq" />
                <span className="chiziq qisqa" />
              </span>
              <span className="nom">{v.nom}</span>
              <span className="izoh">{v.izoh}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Til ─── */}
      <TilTanlash user={user} onSaqlandi={onSaqlandi} />

      {/* ─── Asosiy rang ─── */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="karta-bosh">
          <h2>Asosiy rang</h2>
        </div>
        <div className="yordam" style={{ marginBottom: 12 }}>
          Bosiladigan hamma narsa — tugma, faol menyu, fokus halqasi — shu rangda bo'ladi. Ball va
          ogohlantirish ranglari o'zgarmaydi: ular ma'noni bildiradi, bezak emas.
        </div>
        <div className="rang-qator" role="group" aria-label="Asosiy rang">
          {AKSENTLAR.map((a) => (
            <button
              key={a.key}
              className={`rang-nuqta${k.aksent === a.key ? ' active' : ''}`}
              style={{ '--namuna': a.namuna } as CSSProperties}
              aria-pressed={k.aksent === a.key}
              title={a.nom}
              onClick={() => yoz('aksent', a.key)}
            >
              <span className="doira" aria-hidden="true" />
              <span className="nom">{a.nom}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Yorug' rang sxemasi ─── */}
      <SxemaBlok
        sarlavha="Yorug' rang sxemasi"
        izoh="Yorug' mavzudagi fon va chegara ohangi."
        faol={k.mavzu !== 'dark'}
        faolsizIzoh="Hozir qorong'i mavzu tanlangan — bu sxema yorug' mavzuga o'tganda ko'rinadi."
        variantlar={YORUG_SXEMALAR}
        tanlangan={k.yorug}
        onTanla={(v) => yoz('yorug', v)}
      />

      {/* ─── Qorong'i rang sxemasi ─── */}
      <SxemaBlok
        sarlavha="Qorong'i rang sxemasi"
        izoh="Qorong'i mavzudagi fon va chegara ohangi."
        faol={k.mavzu !== 'light'}
        faolsizIzoh="Hozir yorug' mavzu tanlangan — bu sxema qorong'i mavzuga o'tganda ko'rinadi."
        variantlar={QORONGI_SXEMALAR}
        tanlangan={k.qorongi}
        onTanla={(v) => yoz('qorongi', v)}
      />
    </>
  );
}

/**
 * Rang sxemasi tanlovi — yorug' va qorong'i uchun bir xil shakl.
 *
 * `faol=false` bo'lganda blok o'chirilmaydi, faqat xiralashadi va sababi
 * yoziladi. Sabab: yashirib qo'ysak, foydalanuvchi sozlama umuman yo'q deb
 * o'ylardi; o'chirib qo'ysak — nega ishlamayotgani noma'lum qolardi.
 */
function SxemaBlok<T extends string>({
  sarlavha,
  izoh,
  faol,
  faolsizIzoh,
  variantlar,
  tanlangan,
  onTanla,
}: {
  sarlavha: string;
  izoh: string;
  faol: boolean;
  faolsizIzoh: string;
  variantlar: { key: T; nom: string; fon: string; band: string }[];
  tanlangan: T;
  onTanla: (v: T) => void;
}) {
  return (
    <div className={`card sxema-blok${faol ? '' : ' kutmoqda'}`} style={{ marginTop: 14 }}>
      <div className="karta-bosh">
        <h2>{sarlavha}</h2>
        {!faol && <span className="badge kul">keyin qo'llanadi</span>}
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>{faol ? izoh : faolsizIzoh}</div>
      <div className="sxema-grid">
        {variantlar.map((s) => (
          <button
            key={s.key}
            className={`sxema-katak${tanlangan === s.key ? ' active' : ''}`}
            aria-pressed={tanlangan === s.key}
            onClick={() => onTanla(s.key)}
          >
            <span className="namuna" style={{ background: s.fon }} aria-hidden="true">
              <span className="chiziq" style={{ background: s.band }} />
              <span className="chiziq qisqa" style={{ background: s.band }} />
            </span>
            <span className="nom">{s.nom}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Til — hisob sozlamasi (qurilma emas), shuning uchun serverga saqlanadi.
 *
 * Faqat o'zbekcha tayyor. Rus va ingliz tili tanlanadigan qilib
 * ko'rsatilgan, lekin O'CHIRILGAN va sababi yozilgan: tanlansa-yu interfeys
 * o'zbekcha qolsa — bu yolg'on sozlama bo'lardi.
 */
/**
 * Til tanlovi.
 *
 * Ikki joyga yoziladi va ikkalasi ham kerak:
 *   • `localStorage` — interfeys DARHOL almashishi uchun (server javobini
 *     kutib turish kerak emas);
 *   • hisob (`locale`) — boshqa qurilmadan kirganda ham o'sha til.
 *
 * Server so'rovi yiqilsa ham til almashadi: tarjima mijoz tomonda va u
 * tarmoqqa bog'liq emas. Faqat "boshqa qurilmada esda qolmadi" degan
 * ogohlantirish chiqadi.
 */
function TilTanlash({
  user,
  onSaqlandi,
}: {
  user: { locale: string } | null;
  onSaqlandi: () => Promise<void>;
}) {
  const { til, t, tilniOzgartir } = useTil();
  const [xato, setXato] = useState<string | null>(null);

  /**
   * Hisobdagi til qurilmadagidan farq qilsa — bu boshqa qurilmada
   * o'zgartirilgani. Bir marta ergashtiramiz, keyin foydalanuvchi
   * tanlovi ustun turadi.
   */
  useEffect(() => {
    const hisob = user?.locale;
    if (hisob && hisob !== til && TILLAR.some((x) => x.key === hisob)) {
      tilniOzgartir(hisob as Til);
    }
    // Faqat hisob yuklanganda bir marta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.locale]);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="karta-bosh">
        <h2>{t('Til')}</h2>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        {t('Interfeys tilini tanlang. Bu — hisob sozlamasi: qaysi qurilmadan kirsangiz ham saqlanadi.')}
      </div>
      <div className="til-qator" role="group" aria-label={t('Interfeys tili')}>
        {TILLAR.map((x) => (
          <button
            key={x.key}
            className={`til-tugma${til === x.key ? ' active' : ''}`}
            aria-pressed={til === x.key}
            onClick={() => {
              setXato(null);
              tilniOzgartir(x.key);
              // Hisobga yozish — muvaffaqiyatsiz bo'lsa ham til almashadi.
              void api
                .patch('/api/v1/auth/me', { locale: x.key })
                .then(() => onSaqlandi())
                .catch(() =>
                  setXato(
                    t('Til shu qurilmada almashdi, lekin hisobga saqlanmadi — boshqa qurilmada eski til qoladi.'),
                  ),
                );
            }}
          >
            <span className="bayroq" aria-hidden="true">{x.qisqa}</span>
            {x.nom}
          </button>
        ))}
      </div>
      {/*
        Qamrov haqida OCHIQ gap.

        Lug'atdagi iboralar sonini ko'rsatish chalg'ituvchi bo'lardi: u
        tarjima TAYYOR ekanini bildiradi, lekin hamma sahifa hali unga
        ulangani yo'q. Foydalanuvchi tilni tanlashdan oldin nima
        o'zgarishini bilishi kerak.
      */}
      {til !== 'uz' && (
        <div className="yordam" style={{ marginTop: 10 }}>
          {t(
            'Hozircha yon panel va Sozlamalar bo\'limi tarjima qilingan. Qolgan sahifalar o\'zbekcha ko\'rinadi — ular bosqichma-bosqich qo\'shilmoqda.',
          )}
        </div>
      )}
      {xato && <div className="xato-qator">{xato}</div>}
    </div>
  );
}


/**
 * Ogohlantirish sozlamalari.
 *
 * Har tugma HAQIQATAN ishlaydi: `analyze.ts` ogohlantirish yaratishdan
 * oldin shu sozlamaga qaraydi. Faqat interfeysda turgan, lekin hech
 * narsani o'zgartirmaydigan tugma — yolg'on sozlama, undan ko'ra
 * umuman bo'lmagani yaxshi.
 */
interface OgohSozlama {
  kinds: Record<string, boolean>;
  telegram: boolean;
  lowScore: { enabled: boolean; threshold: number; minTurns: number };
  /** Qaysi hodisa qaysi manzilga borsin — `business/channels.ts`. */
  channels: Record<string, { dm: boolean; group: boolean; channel: boolean }>;
}

const OGOH_TURLARI: { key: string; nom: string; izoh: string }[] = [
  {
    key: 'red_flag',
    nom: 'Qizil bayroq',
    izoh: 'Suhbatda playbookda belgilangan jiddiy qoida buzilgan',
  },
  {
    key: 'missed_lead',
    nom: 'Javobsiz mijoz',
    izoh: 'Mijoz yozgan, lekin menejer javob bermagan',
  },
  {
    key: 'broken_commitment',
    nom: 'Buzilgan va\'da',
    izoh: 'Suhbatda berilgan so\'z muddatida bajarilmagan',
  },
  {
    key: 'low_confidence',
    nom: 'Inson ko\'rigi kerak',
    izoh: 'AI o\'z bahosiga ishonchi past — natija tekshirilishi kerak',
  },
  {
    key: 'quality_drop',
    nom: 'Sifat pasayishi',
    izoh: 'Ko\'rsatkich sezilarli tushgan',
  },
];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILDIRISHNOMA KANALLARI — matritsa
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qatorlar — hodisa turlari, ustunlar — manzillar.
 *
 * «Veb» ustuni har doim yoqiq va O'CHIRIB BO'LMAYDI: ogohlantirish
 * yaratilgan-u, hech qayerda ko'rinmasa, u umuman yaratilmagani bilan
 * barobar. Butunlay kerak bo'lmasa — hodisa TURINI yuqoridagi bo'limdan
 * o'chirish kerak. Shu sababli u kalit emas, belgi sifatida ko'rsatiladi.
 */
const KANAL_USTUNLAR: { key: KanalKalit; nom: string; izoh: string }[] = [
  { key: 'web', nom: 'Veb', izoh: 'Ilova ichidagi ro\'yxat — har doim yoqiq' },
  { key: 'dm', nom: 'Bot', izoh: 'Botning shaxsiy yozishmasi' },
  { key: 'group', nom: 'Guruh', izoh: 'Telegram guruhi' },
  { key: 'channel', nom: 'Kanal', izoh: 'Telegram kanali' },
];

type KanalKalit = 'web' | 'dm' | 'group' | 'channel';
type TgKanal = 'dm' | 'group' | 'channel';

const MATRITSA_QATORLAR: { key: string; nom: string }[] = [
  ...OGOH_TURLARI.map((t) => ({ key: t.key, nom: t.nom })),
  { key: 'daily_report', nom: 'Kunlik hisobot' },
];

interface KanalTanlov {
  dm: boolean;
  group: boolean;
  channel: boolean;
}

interface TgManzil {
  chatId: string;
  title: string | null;
}

interface TgManzillar {
  dm: TgManzil | null;
  group: TgManzil | null;
  channel: TgManzil | null;
  discovered: { chatId: string; type: string; title: string | null; seenAt: string }[];
}

function KanalMatritsasi({
  qiymat,
  manzillar,
  yozaOladi,
  onOzgardi,
}: {
  qiymat: Record<string, KanalTanlov>;
  manzillar: TgManzillar | null;
  yozaOladi: boolean;
  onOzgardi: (v: Record<string, KanalTanlov>) => void;
}) {
  /** Manzili yo'q ustunni yoqib bo'lmaydi — xabar baribir hech qayerga bormasdi. */
  const tayyor = (k: TgKanal): boolean => Boolean(manzillar?.[k]);

  return (
    <div className="kanal-matritsa">
      <table>
        <thead>
          <tr>
            <th scope="col">Hodisa</th>
            {KANAL_USTUNLAR.map((u) => (
              <th scope="col" key={u.key}>
                <span className="nom">{u.nom}</span>
                <span className="izoh">
                  {u.key === 'web'
                    ? 'har doim'
                    : tayyor(u.key as TgKanal)
                      ? (manzillar?.[u.key as TgKanal]?.title ?? 'sozlangan')
                      : 'sozlanmagan'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRITSA_QATORLAR.map((q) => {
            const satr = qiymat[q.key] ?? { dm: false, group: false, channel: false };
            return (
              <tr key={q.key}>
                <th scope="row">{q.nom}</th>
                {KANAL_USTUNLAR.map((u) => {
                  if (u.key === 'web') {
                    return (
                      <td key={u.key} className="doim">
                        <span className="belgi" title="Har doim yoqiq" aria-label="Har doim yoqiq">
                          ✓
                        </span>
                      </td>
                    );
                  }
                  const k = u.key as TgKanal;
                  const ochirilgan = !yozaOladi || !tayyor(k);
                  return (
                    <td key={u.key}>
                      <input
                        type="checkbox"
                        className="kalit kichik"
                        role="switch"
                        disabled={ochirilgan}
                        checked={satr[k]}
                        aria-label={`${q.nom} — ${u.nom}`}
                        title={tayyor(k) ? undefined : 'Avval bu kanal uchun manzil tanlang'}
                        onChange={(e) =>
                          onOzgardi({
                            ...qiymat,
                            [q.key]: { ...satr, [k]: e.target.checked },
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Telegram manzillari — bot / guruh / kanal.
 *
 * Guruh va kanalning chat id si Telegram interfeysida hech qayerda
 * ko'rinmaydi. Shuning uchun bot ko'rgan chatlar ro'yxati taklif
 * qilinadi: botni guruhga qo'shib bitta xabar yozsangiz, guruh shu
 * ro'yxatda paydo bo'ladi. Qo'lda kiritish ham qoldirilgan — kanalga
 * bot administrator qilib qo'shilsa-yu hech kim yozmasa, kanal
 * ro'yxatga tushmaydi.
 */
function TelegramManzillar({
  businessId,
  yozaOladi,
  manzillar,
  onYangilandi,
}: {
  businessId: string;
  yozaOladi: boolean;
  manzillar: TgManzillar | null;
  onYangilandi: (v: TgManzillar) => void;
}) {
  const { holat, xato, bajar } = useSaqlash();
  const [sinov, setSinov] = useState<{ kanal: string; ok: boolean; xato: string | null } | null>(
    null,
  );

  if (!manzillar) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  const TURLAR: { key: TgKanal; nom: string; izoh: string; mos: string[] }[] = [
    {
      key: 'dm',
      nom: 'Bot (shaxsiy)',
      izoh: 'Rahbarning bot bilan shaxsiy yozishmasi',
      mos: ['private'],
    },
    {
      key: 'group',
      nom: 'Guruh',
      izoh: 'Jamoa guruhi — botni guruhga qo\'shing va bitta xabar yozing',
      mos: ['group', 'supergroup'],
    },
    {
      key: 'channel',
      nom: 'Kanal',
      izoh: 'E\'lonlar kanali — botni administrator qiling',
      mos: ['channel'],
    },
  ];

  async function saqla(yangi: TgManzillar): Promise<void> {
    const ok = await bajar(async () => {
      const r = await api.put<{ targets: TgManzillar }>(
        `/api/v1/businesses/${businessId}/integrations/telegram/targets`,
        { dm: yangi.dm, group: yangi.group, channel: yangi.channel },
      );
      onYangilandi(r.targets);
    });
    if (!ok) return;
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="karta-bosh">
        <h2>Telegram manzillari</h2>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        Bildirishnomalar shu manzillarga boradi. Bot ko'rgan guruh va kanallar ro'yxatda o'zi
        paydo bo'ladi.
      </div>

      <Xabar holat={holat} xato={xato} />

      <div className="manzil-royxat">
        {TURLAR.map((t) => {
          const joriy = manzillar[t.key];
          const takliflar = manzillar.discovered.filter((d) => t.mos.includes(d.type));
          return (
            <div className="manzil" key={t.key}>
              <div className="bosh">
                <div className="matn">
                  <div className="nom">{t.nom}</div>
                  <div className="izoh">{t.izoh}</div>
                </div>
                {joriy ? (
                  <span className="badge ok">sozlangan</span>
                ) : (
                  <span className="badge kul">sozlanmagan</span>
                )}
              </div>

              <div className="tanlov">
                <select
                  value={joriy?.chatId ?? ''}
                  disabled={!yozaOladi}
                  aria-label={`${t.nom} manzili`}
                  onChange={(e) => {
                    const v = e.target.value;
                    const topildi = takliflar.find((d) => d.chatId === v);
                    void saqla({
                      ...manzillar,
                      [t.key]: v ? { chatId: v, title: topildi?.title ?? null } : null,
                    });
                  }}
                >
                  <option value="">— tanlanmagan —</option>
                  {takliflar.map((d) => (
                    <option key={d.chatId} value={d.chatId}>
                      {d.title ?? d.chatId}
                    </option>
                  ))}
                  {/* Qo'lda kiritilgan, lekin ro'yxatda yo'q manzil yo'qolmasin. */}
                  {joriy && !takliflar.some((d) => d.chatId === joriy.chatId) && (
                    <option value={joriy.chatId}>{joriy.title ?? joriy.chatId}</option>
                  )}
                </select>

                {yozaOladi && (
                  <button
                    className="btn ikkinchi kichik"
                    disabled={!joriy || holat === 'ketmoqda'}
                    onClick={() =>
                      void api
                        .post<{ ok: boolean; error: string | null }>(
                          `/api/v1/businesses/${businessId}/integrations/telegram/targets/test`,
                          { kanal: t.key },
                        )
                        .then((r) => setSinov({ kanal: t.key, ok: r.ok, xato: r.error }))
                        .catch((e: unknown) =>
                          setSinov({
                            kanal: t.key,
                            ok: false,
                            xato: e instanceof ApiError ? e.message : 'yuborilmadi',
                          }),
                        )
                    }
                  >
                    Sinov xabari
                  </button>
                )}
              </div>

              {takliflar.length === 0 && t.key !== 'dm' && (
                <div className="yordam">
                  Hali hech qanday {t.key === 'group' ? 'guruh' : 'kanal'} ko'rinmadi. Botni
                  qo'shing va u yerga bitta xabar yozing.
                </div>
              )}

              {sinov?.kanal === t.key &&
                (sinov.ok ? (
                  <div className="ok-qator">Sinov xabari yuborildi ✓</div>
                ) : (
                  <div className="xato-qator">Yuborilmadi: {sinov.xato}</div>
                ))}

              <details className="qolda">
                <summary>Chat id ni qo'lda kiritish</summary>
                <QoldaManzil
                  joriy={joriy?.chatId ?? ''}
                  ochirilgan={!yozaOladi}
                  onSaqla={(chatId) =>
                    void saqla({
                      ...manzillar,
                      [t.key]: chatId ? { chatId, title: null } : null,
                    })
                  }
                />
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QoldaManzil({
  joriy,
  ochirilgan,
  onSaqla,
}: {
  joriy: string;
  ochirilgan: boolean;
  onSaqla: (chatId: string) => void;
}) {
  const [v, setV] = useState(joriy);
  return (
    <div className="qolda-qator">
      <input
        value={v}
        placeholder="-1001234567890"
        disabled={ochirilgan}
        maxLength={64}
        onChange={(e) => setV(e.target.value)}
      />
      <button
        className="btn ikkinchi kichik"
        disabled={ochirilgan || v.trim() === joriy}
        onClick={() => onSaqla(v.trim())}
      >
        Qo'yish
      </button>
    </div>
  );
}

function Ogohlantirishlar({
  businessId,
  yozaOladi,
}: {
  businessId: string;
  yozaOladi: boolean;
}) {
  const [s, setS] = useState<OgohSozlama | null>(null);
  const [manzillar, setManzillar] = useState<TgManzillar | null>(null);
  const { holat, xato, bajar } = useSaqlash();

  useEffect(() => {
    void api
      .get<{ alertPrefs: OgohSozlama }>(`/api/v1/businesses/${businessId}/alert-prefs`)
      .then((r) => setS(r.alertPrefs))
      .catch(() => undefined);
    /**
     * Manzillar ALOHIDA so'rov: ular integratsiya konfiguratsiyasida,
     * sozlamalar esa biznes qatorida yotadi. Bittasi yiqilsa ikkinchisi
     * baribir ko'rinishi kerak — shuning uchun `Promise.all` emas.
     */
    void api
      .get<{ targets: TgManzillar }>(
        `/api/v1/businesses/${businessId}/integrations/telegram/targets`,
      )
      .then((r) => setManzillar(r.targets))
      .catch(() => setManzillar(null));
  }, [businessId]);

  if (!s) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  const yoqilgan = OGOH_TURLARI.filter((t) => s.kinds[t.key]).length;

  return (
    <>
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="karta-bosh">
        <h2>Ogohlantirishlar</h2>
        <span className="badge kul">
          {yoqilgan}/{OGOH_TURLARI.length} yoqilgan
        </span>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        Qaysi hodisa ogohlantirish yaratishini tanlang. O'chirilgan tur bo'yicha yangi
        ogohlantirish umuman yaratilmaydi — mavjudlari joyida qoladi.
      </div>

      <div className="ogoh-sozlama">
        {OGOH_TURLARI.map((t) => (
          <label className="sozlama-satr" key={t.key}>
            <span className="matn">
              <b>{t.nom}</b>
              <span className="izoh">{t.izoh}</span>
            </span>
            <input
              type="checkbox"
              className="kalit"
              role="switch"
              disabled={!yozaOladi}
              checked={s.kinds[t.key] ?? true}
              onChange={(e) => setS({ ...s, kinds: { ...s.kinds, [t.key]: e.target.checked } })}
            />
          </label>
        ))}
      </div>

      {/* ─── Past ball ogohlantirishi ─── */}
      <div className="ogoh-sozlama" style={{ marginTop: 12 }}>
        <label className="sozlama-satr">
          <span className="matn">
            <b>Past ball ogohlantirishi</b>
            <span className="izoh">
              Baholangan suhbat chegaradan past chiqsa ogohlantirish yaratiladi
            </span>
          </span>
          <input
            type="checkbox"
            className="kalit"
            role="switch"
            disabled={!yozaOladi}
            checked={s.lowScore.enabled}
            onChange={(e) =>
              setS({ ...s, lowScore: { ...s.lowScore, enabled: e.target.checked } })
            }
          />
        </label>

        {s.lowScore.enabled && (
          <div className="soat-qator" style={{ padding: '10px 0 4px' }}>
            <div className="maydon-blok">
              <label htmlFor="ls-chegara">Ball chegarasi (0–100)</label>
              <input
                id="ls-chegara"
                type="number"
                min={0}
                max={100}
                disabled={!yozaOladi}
                value={s.lowScore.threshold}
                onChange={(e) =>
                  setS({
                    ...s,
                    lowScore: { ...s.lowScore, threshold: Number(e.target.value) },
                  })
                }
              />
            </div>
            <div className="maydon-blok">
              <label htmlFor="ls-navbat">Eng kam navbat soni</label>
              <input
                id="ls-navbat"
                type="number"
                min={1}
                max={100}
                disabled={!yozaOladi}
                value={s.lowScore.minTurns}
                onChange={(e) =>
                  setS({
                    ...s,
                    lowScore: { ...s.lowScore, minTurns: Number(e.target.value) },
                  })
                }
              />
              {/*
                Shovqin filtri: ikki xabarlik yozishma past ball olishi
                tabiiy va u ogohlantirishga arzimaydi.
              */}
              <div className="yordam">
                Qisqa yozishmalar hisobga olinmaydi — ular tabiiy ravishda past ball oladi.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Kanallar matritsasi ─── */}
      <h3 style={{ marginTop: 18, marginBottom: 4 }}>Qayerga yuborilsin</h3>
      <div className="yordam" style={{ marginBottom: 10 }}>
        Manzil tanlanmagan ustun o'chirilgan turadi — xabar baribir hech qayerga bormasdi.
        Manzillarni quyidagi kartadan sozlang.
      </div>
      <KanalMatritsasi
        qiymat={s.channels ?? {}}
        manzillar={manzillar}
        yozaOladi={yozaOladi}
        onOzgardi={(channels) => setS({ ...s, channels })}
      />

      <Xabar holat={holat} xato={xato} />
      {yozaOladi && (
        <button
          className="btn"
          disabled={holat === 'ketmoqda'}
          onClick={() =>
            void bajar(async () => {
              await api.put(`/api/v1/businesses/${businessId}/alert-prefs`, s);
            })
          }
        >
          {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      )}
    </div>

    <TelegramManzillar
      businessId={businessId}
      yozaOladi={yozaOladi}
      manzillar={manzillar}
      onYangilandi={setManzillar}
    />
    </>
  );
}

const HAFTA = [
  { n: 1, nom: 'Dushanba' },
  { n: 2, nom: 'Seshanba' },
  { n: 3, nom: 'Chorshanba' },
  { n: 4, nom: 'Payshanba' },
  { n: 5, nom: 'Juma' },
  { n: 6, nom: 'Shanba' },
  { n: 7, nom: 'Yakshanba' },
];

/** Jadval haqiqiy qiymatlarga egami. */
function jadvalTogri(j: IshJadvaliQiymat): boolean {
  return j.endHour > j.startHour && j.days.length > 0;
}

/**
 * Soat va kun tanlovi — biznes jadvali ham, menejer jadvali ham bir xil
 * shaklda. Ikki marta yozilsa, biri o'zgarganda ikkinchisi ortda qolardi
 * (aynan shu xato `AKTIVATSIYA` xaritasida allaqachon sodir bo'lgan).
 */
function JadvalTanlov({
  qiymat,
  onOzgardi,
  ochirilgan,
  idPrefiks,
}: {
  qiymat: IshJadvaliQiymat;
  onOzgardi: (v: IshJadvaliQiymat) => void;
  ochirilgan: boolean;
  idPrefiks: string;
}) {
  return (
    <>
      <div className="soat-qator">
        <div className="maydon-blok">
          <label htmlFor={`${idPrefiks}-start`}>Boshlanish</label>
          <select
            id={`${idPrefiks}-start`}
            value={qiymat.startHour}
            disabled={ochirilgan}
            onChange={(e) => onOzgardi({ ...qiymat, startHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor={`${idPrefiks}-end`}>Tugash</label>
          <select
            id={`${idPrefiks}-end`}
            value={qiymat.endHour}
            disabled={ochirilgan}
            onChange={(e) => onOzgardi({ ...qiymat, endHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="maydon-blok">
        <label>Ish kunlari</label>
        <div className="kun-tanlov">
          {HAFTA.map((k) => (
            <button
              key={k.n}
              type="button"
              disabled={ochirilgan}
              className={`kun-tugma${qiymat.days.includes(k.n) ? ' active' : ''}`}
              aria-pressed={qiymat.days.includes(k.n)}
              aria-label={k.nom}
              onClick={() =>
                onOzgardi({
                  ...qiymat,
                  days: qiymat.days.includes(k.n)
                    ? qiymat.days.filter((x) => x !== k.n)
                    : [...qiymat.days, k.n].sort(),
                })
              }
            >
              {k.nom.slice(0, 2)}
            </button>
          ))}
        </div>
        <div className="yordam">
          {qiymat.days.length === 0
            ? 'Kamida bitta kun tanlang'
            : `${qiymat.days.length} kun · ${String(qiymat.startHour).padStart(2, '0')}:00–${String(qiymat.endHour).padStart(2, '0')}:00`}
        </div>
      </div>
    </>
  );
}

/**
 * Ish jadvali — hisobotlar "ish vaqtida" degan savolga shundan javob beradi.
 *
 * Bu shunchaki ma'lumot emas: "Faoliyat tahlili" dagi javobsiz suhbatlar
 * bo'linishi va ogohlantirish darvozasi aynan shu sozlamadan hisoblanadi.
 */
function IshJadvali({ businessId, yozaOladi }: { businessId: string; yozaOladi: boolean }) {
  const [jadval, setJadval] = useState<IshJadvaliQiymat>({
    startHour: 9,
    endHour: 18,
    days: [1, 2, 3, 4, 5, 6],
  });
  const [faqatIsh, setFaqatIsh] = useState(false);
  const [orinlar, setOrinlar] = useState(false);
  const [zona, setZona] = useState('');
  const [yuklandi, setYuklandi] = useState(false);
  const { holat, xato, bajar } = useSaqlash();

  useEffect(() => {
    void api
      .get<{ workHours: BiznesIshJadvali; timezone: string }>(
        `/api/v1/businesses/${businessId}/work-hours`,
      )
      .then((r) => {
        setJadval({
          startHour: r.workHours.startHour,
          endHour: r.workHours.endHour,
          days: r.workHours.days,
        });
        setFaqatIsh(r.workHours.alertsOnlyWorkHours);
        setOrinlar(r.workHours.perSeatSchedules);
        setZona(r.timezone);
      })
      .finally(() => setYuklandi(true));
  }, [businessId]);

  const notogri = !jadvalTogri(jadval);

  if (!yuklandi) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  return (
    <>
      <div className="card">
        <div className="karta-bosh">
          <h2>Ish jadvali</h2>
        </div>
        <div className="yordam" style={{ marginBottom: 14 }}>
          Hisobotlarda «javobsiz suhbat ish vaqtida bo'ldimi» degan bo'linish aynan shu jadval
          bo'yicha hisoblanadi. Vaqt zonasi: <b>{zona}</b>.
        </div>

        <JadvalTanlov
          qiymat={jadval}
          onOzgardi={setJadval}
          ochirilgan={!yozaOladi}
          idPrefiks="ij"
        />

        {/* Jadval faqat hisobot uchun emas — ogohlantirishga ham ta'sir qiladi. */}
        <div className="ogoh-sozlama" style={{ marginTop: 4, marginBottom: 12 }}>
          <label className="sozlama-satr">
            <span className="matn">
              <b>Ogohlantirishlar faqat ish vaqtida</b>
              <span className="izoh">
                Yoqilsa, ish vaqtidan tashqarida <b>boshlangan</b> suhbatlar uchun ogohlantirish
                yaratilmaydi. Baholash va hisobotlar o'zgarmaydi — faqat ogohlantirish.
              </span>
            </span>
            <input
              type="checkbox"
              className="kalit"
              role="switch"
              disabled={!yozaOladi}
              checked={faqatIsh}
              onChange={(e) => setFaqatIsh(e.target.checked)}
            />
          </label>

          <label className="sozlama-satr">
            <span className="matn">
              <b>Menejerlar uchun alohida jadval</b>
              <span className="izoh">
                Yoqilsa, har menejerga o'z ish vaqtini qo'yish mumkin — kechki smena yoki
                yakshanba ishlaydiganlar uchun. O'chirilganda qo'yilgan jadvallar{' '}
                <b>o'chirilmaydi</b>, faqat hisobga olinmaydi.
              </span>
            </span>
            <input
              type="checkbox"
              className="kalit"
              role="switch"
              disabled={!yozaOladi}
              checked={orinlar}
              onChange={(e) => setOrinlar(e.target.checked)}
            />
          </label>
        </div>

        {notogri && jadval.endHour <= jadval.startHour && (
          <div className="xato-qator">Tugash soati boshlanishdan keyin bo'lishi kerak</div>
        )}
        <Xabar holat={holat} xato={xato} />
        {yozaOladi && (
          <button
            className="btn"
            disabled={holat === 'ketmoqda' || notogri}
            onClick={() =>
              void bajar(async () => {
                await api.put(`/api/v1/businesses/${businessId}/work-hours`, {
                  ...jadval,
                  alertsOnlyWorkHours: faqatIsh,
                  perSeatSchedules: orinlar,
                });
              })
            }
          >
            {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        )}
      </div>

      {orinlar && (
        <MenejerJadvallari
          businessId={businessId}
          yozaOladi={yozaOladi}
          biznesJadval={jadval}
        />
      )}
    </>
  );
}

/**
 * Menejerlar jadvali.
 *
 * Har menejer ikki holatdan birida: biznes jadvaliga ergashadi yoki o'z
 * jadvali bor. Uchinchi holat yo'q.
 *
 * Yangi jadval biznesnikidan NUSXA olinib boshlanadi: bo'sh jadvaldan
 * boshlash foydalanuvchini noldan yozishga majburlardi, holbuki odatda
 * farq bir-ikki soat bo'ladi.
 */
function MenejerJadvallari({
  businessId,
  yozaOladi,
  biznesJadval,
}: {
  businessId: string;
  yozaOladi: boolean;
  biznesJadval: IshJadvaliQiymat;
}) {
  const [rows, setRows] = useState<SeatFull[] | null>(null);
  const [ochiq, setOchiq] = useState<string | null>(null);
  const [qoralama, setQoralama] = useState<IshJadvaliQiymat | null>(null);
  const { holat, xato, bajar } = useSaqlash();

  const yukla = useCallback(() => {
    void api
      .get<SeatFull[]>(`/api/v1/businesses/${businessId}/seats`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [businessId]);

  useEffect(yukla, [yukla]);

  async function saqla(seatId: string, v: IshJadvaliQiymat | null): Promise<void> {
    const ok = await bajar(async () => {
      await api.put(`/api/v1/businesses/${businessId}/seats/${seatId}/work-hours`, v);
    });
    if (ok) {
      setOchiq(null);
      setQoralama(null);
      yukla();
    }
  }

  if (rows === null) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  const faollar = rows.filter((r) => r.isActive);
  const maxsus = faollar.filter((r) => r.workHours !== null).length;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="karta-bosh">
        <h2>Menejerlar jadvali</h2>
        <span className="badge kul">
          {maxsus} / {faollar.length} alohida
        </span>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        Jadvali yo'q menejer biznes jadvaliga ergashadi — biznes jadvalini o'zgartirsangiz u ham
        o'zgaradi.
      </div>

      <Xabar holat={holat} xato={xato} />

      {faollar.length === 0 ? (
        <div className="hech-narsa">Faol menejer yo'q</div>
      ) : (
        <div className="menejer-jadval">
          {faollar.map((s) => {
            const j = s.workHours;
            const oziniki = j !== null;
            return (
              <div className="qator" key={s.id}>
                <div className="bosh">
                  <div className="matn">
                    <div className="ism">{s.displayName}</div>
                    <div className="izoh">
                      {j
                        ? `${String(j.startHour).padStart(2, '0')}:00–${String(j.endHour).padStart(2, '0')}:00 · ${j.days.length} kun`
                        : 'Biznes jadvali bo\'yicha'}
                    </div>
                  </div>
                  <div className="amal">
                    {oziniki && <span className="badge navy">alohida</span>}
                    {yozaOladi && (
                      <button
                        className="btn ikkinchi kichik"
                        onClick={() => {
                          if (ochiq === s.id) {
                            setOchiq(null);
                            setQoralama(null);
                          } else {
                            setOchiq(s.id);
                            setQoralama(j ?? { ...biznesJadval });
                          }
                        }}
                      >
                        {ochiq === s.id
                          ? 'Yopish'
                          : oziniki
                            ? 'O\'zgartirish'
                            : 'Alohida qo\'yish'}
                      </button>
                    )}
                  </div>
                </div>

                {ochiq === s.id && qoralama && (
                  <div className="tahrir">
                    <JadvalTanlov
                      qiymat={qoralama}
                      onOzgardi={setQoralama}
                      ochirilgan={!yozaOladi}
                      idPrefiks={`mj-${s.id}`}
                    />
                    <div className="tugmalar">
                      <button
                        className="btn"
                        disabled={holat === 'ketmoqda' || !jadvalTogri(qoralama)}
                        onClick={() => void saqla(s.id, qoralama)}
                      >
                        Saqlash
                      </button>
                      {oziniki && (
                        <button
                          className="btn ikkinchi"
                          disabled={holat === 'ketmoqda'}
                          onClick={() => void saqla(s.id, null)}
                        >
                          Biznes jadvaliga qaytarish
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

function MoiZvonki({ businessId, boshqaraOladi }: { businessId: string; boshqaraOladi: boolean }) {
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

function CrmEksport({
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

function SttTanlash() {
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

// ─── PROFIL (FR-160, FR-162) ────────────────────────────────────────────────

function Profil({
  user,
  onSaqlandi,
}: {
  user: {
    displayName: string;
    email: string | null;
    login: string | null;
    locale: string;
    avatarUrl: string | null;
  } | null;
  onSaqlandi: () => Promise<void>;
}) {
  const { business } = useAuth();
  const [ism, setIsm] = useState(user?.displayName ?? '');
  const [avatar, setAvatar] = useState(user?.avatarUrl ?? '');
  const { holat, xato, bajar } = useSaqlash();

  const parol = useSaqlash();
  const [joriy, setJoriy] = useState('');
  const [yangi, setYangi] = useState('');

  /** Rasm bo'lmasa — ism harflari. Bo'sh doira hech narsa demaydi. */
  const harflar = (ism || user?.displayName || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <>
      <div className="card">
        <div className="karta-bosh">
          <h2>Profil</h2>
          {business && (
            <span className="badge navy">{ROL_NOM[business.role] ?? business.role}</span>
          )}
        </div>

        <AvatarTanlash
          qiymat={avatar}
          harflar={harflar}
          onOzgardi={setAvatar}
        />

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
        <div className="yordam" style={{ marginBottom: 12 }}>
          Til va mavzu <Link to="/sozlamalar/korinish">Ko'rinish</Link> bo'limida — ular hisob
          emas, ko'rinish sozlamasi.
        </div>
        <Xabar holat={holat} xato={xato} />
        <button
          className="btn"
          disabled={holat === 'ketmoqda' || ism.trim().length < 2}
          onClick={() =>
            void bajar(async () => {
              await api.patch('/api/v1/auth/me', {
                displayName: ism.trim(),
                avatarUrl: avatar.trim() ? avatar.trim() : null,
              });
              await onSaqlandi();
            })
          }
        >
          {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>

      <UlanganHisoblar />

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

/**
 * Bizneslar — foydalanuvchi a'zo bo'lgan bizneslar va faolini almashtirish.
 *
 * Bitta odam bir nechta biznesda bo'lishi mumkin (FR-08). Server buni
 * boshidan qaytarardi, lekin interfeys har doim birinchisini olardi —
 * ya'ni ikkinchi biznesga kirishning yo'li yo'q edi.
 *
 * Rol har biznesda boshqacha bo'lishi mumkin, shuning uchun rol shu yerda
 * ko'rsatiladi: "qaysi biznesda men egaman" degan savol amaliy.
 */
function Bizneslar() {
  const { business, businesses, switchBusiness } = useAuth();

  return (
    <div className="card">
      <div className="karta-bosh">
        <h2>Bizneslar</h2>
        <span className="badge kul">{businesses.length} ta</span>
      </div>
      <div className="yordam" style={{ marginBottom: 12 }}>
        Faol biznes tanlovi shu qurilmada saqlanadi. Barcha bo'lim va hisobotlar tanlangan biznes
        bo'yicha ko'rsatiladi.
      </div>

      {businesses.length === 0 ? (
        <div className="hech-narsa">Hech qanday biznesga a'zo emassiz</div>
      ) : (
        <div className="biznes-royxat">
          {businesses.map((b) => {
            const faol = b.businessId === business?.businessId;
            return (
              <div className={`biznes-katak${faol ? ' active' : ''}`} key={b.businessId}>
                <div className="matn">
                  <div className="nom">
                    {b.name}
                    {faol && <span className="badge navy">faol</span>}
                  </div>
                  <div className="izoh">
                    {ROL_NOM[b.role] ?? b.role} · {b.slug}
                    {b.onboardingStep !== 'done' && ' · sozlanmagan'}
                  </div>
                </div>
                {!faol && (
                  <button
                    className="btn ikkinchi kichik"
                    onClick={() => switchBusiness(b.businessId)}
                  >
                    Bunga o'tish
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="yordam" style={{ marginTop: 12 }}>
        Yangi biznes ochish uchun alohida hisob kerak — bitta hisobdan ikkinchi biznes yaratish
        hali qo'shilmagan.
      </div>
    </div>
  );
}

/**
 * Ulangan hisoblar.
 *
 * Faqat HAQIQATAN mavjud kanallar ko'rsatiladi. Odatda bu yerda
 * foydalanuvchi o'zi uchun Telegram ulash kodini olishi kutiladi — bizda
 * esa sotuvchini Telegram'ga rahbar biriktiradi (Menejerlar bo'limidagi
 * «ID biriktirish»), shuning uchun bu yerda o'zi uchun kod chiqarish
 * tugmasi yo'q. Uni qo'yish, lekin ishlamasligi — noto'g'ri va'da bo'lardi.
 */
function UlanganHisoblar() {
  const { user, business } = useAuth();
  const [tg, setTg] = useState<TelegramIntegration | null>(null);

  useEffect(() => {
    if (!business) return;
    void api
      .get<TelegramIntegration>(
        `/api/v1/businesses/${business.businessId}/integrations/telegram`,
      )
      .then(setTg)
      .catch(() => undefined);
  }, [business?.businessId]);

  const qatorlar = [
    {
      nom: 'Email',
      qiymat: user?.email ?? user?.login ?? '—',
      ulangan: Boolean(user?.email ?? user?.login),
      izoh: 'Kirish va parol tiklash uchun',
    },
    {
      nom: 'Telegram bot',
      // Nishon holatni aytadi — qiymat ustunida uni takrorlash shovqin.
      qiymat: tg?.integration?.config?.botUsername
        ? `@${tg.integration.config.botUsername}`
        : '—',
      ulangan: Boolean(tg?.connected),
      izoh: 'Suhbatlar shu bot orqali keladi',
      havola: '/sozlamalar/integratsiya',
    },
  ];

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="karta-bosh">
        <h2>Ulangan hisoblar</h2>
      </div>
      <div className="ulanish-royxat">
        {qatorlar.map((q) => (
          <div className="qator" key={q.nom}>
            <div className="matn">
              <div className="nom">{q.nom}</div>
              <div className="izoh">{q.izoh}</div>
            </div>
            <div className="ong">
              <span className="qiymat">{q.qiymat}</span>
              <span className={`badge ${q.ulangan ? 'ok' : 'kul'}`}>
                {q.ulangan ? 'ulangan' : 'ulanmagan'}
              </span>
              {q.havola && !q.ulangan && (
                <Link className="btn ikkinchi kichik" to={q.havola}>
                  Ulash
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="yordam" style={{ marginTop: 10 }}>
        Sotuvchining shaxsiy Telegram hisobini rahbar biriktiradi — Menejerlar bo'limidagi «ID
        biriktirish» tugmasi orqali.
      </div>
    </div>
  );
}

/**
 * Avatar tanlash — fayl yuklash yoki tashqi havola.
 *
 * Fayl brauzerda 192px kvadratga kichraytirilib WebP ga siqiladi
 * (`rasm.ts`), keyin `data:` URI sifatida profil bilan birga saqlanadi.
 * Alohida fayl ombori qurilmadi: sabab `media/image.ts` da yozilgan.
 *
 * Havola maydoni ham qoldirildi — allaqachon Gravatar yoki korporativ
 * rasmi borlar uni qayta yuklashi shart emas.
 */
function AvatarTanlash({
  qiymat,
  harflar,
  onOzgardi,
}: {
  qiymat: string;
  harflar: string;
  onOzgardi: (v: string) => void;
}) {
  const fayl = useRef<HTMLInputElement>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [hajm, setHajm] = useState<number | null>(null);
  const [ishlanmoqda, setIshlanmoqda] = useState(false);
  /** Havola buzilganini `onError` aytadi — o'shanda harflarga qaytamiz. */
  const [buzuq, setBuzuq] = useState(false);

  const korsatiladi = qiymat.trim().length > 0 && !buzuq;
  const yuklangan = qiymat.startsWith('data:');

  async function tanlandi(f: File | undefined): Promise<void> {
    if (!f) return;
    setXato(null);
    setIshlanmoqda(true);
    try {
      const r = await rasmniTayyorla(f);
      setBuzuq(false);
      setHajm(r.bayt);
      onOzgardi(r.dataUri);
    } catch (e) {
      setXato(e instanceof RasmXato ? e.message : "Rasmni o'qib bo'lmadi");
    } finally {
      setIshlanmoqda(false);
      // Bir xil faylni qayta tanlash ham `change` bersin.
      if (fayl.current) fayl.current.value = '';
    }
  }

  return (
    <div className="avatar-blok">
      <div className="profil-bosh">
        {korsatiladi ? (
          <img
            className="profil-avatar"
            src={qiymat}
            alt=""
            onError={() => setBuzuq(true)}
          />
        ) : (
          <div className="profil-avatar harf" aria-hidden="true">{harflar}</div>
        )}

        <div className="avatar-amal">
          <div className="tugmalar">
            <button
              type="button"
              className="btn ikkinchi kichik"
              disabled={ishlanmoqda}
              onClick={() => fayl.current?.click()}
            >
              {ishlanmoqda ? 'Tayyorlanmoqda…' : 'Rasm yuklash'}
            </button>
            {qiymat.trim() && (
              <button
                type="button"
                className="btn ikkinchi kichik"
                onClick={() => {
                  onOzgardi('');
                  setHajm(null);
                  setBuzuq(false);
                  setXato(null);
                }}
              >
                Olib tashlash
              </button>
            )}
          </div>
          <div className="yordam">
            {yuklangan
              ? `Yuklangan rasm${hajm === null ? '' : ` · ${baytMatn(hajm)}`} · 192×192 ga kichraytirildi`
              : 'PNG, JPEG yoki WebP. Rasm brauzeringizda kichraytiriladi — katta fayl yuborilmaydi.'}
          </div>
          {buzuq && (
            <div className="yordam" style={{ color: 'var(--orta-text)' }}>
              Bu havoladan rasm yuklanmadi — hozircha ism harflari ko'rsatilmoqda.
            </div>
          )}
        </div>

        <input
          ref={fayl}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => void tanlandi(e.target.files?.[0])}
        />
      </div>

      {xato && <div className="xato-qator">{xato}</div>}

      <details className="avatar-havola">
        <summary>Yoki tashqi havola kiriting</summary>
        <input
          value={yuklangan ? '' : qiymat}
          placeholder="https://…"
          maxLength={500}
          onChange={(e) => {
            setBuzuq(false);
            setHajm(null);
            onOzgardi(e.target.value);
          }}
        />
      </details>
    </div>
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
  const [profil, setProfil] = useState<BusinessProfile | null>(null);
  const { holat, xato, bajar } = useSaqlash();

  useEffect(() => {
    void api.get<BusinessRow>(`/api/v1/businesses/${businessId}`).then(setRow).catch(() => undefined);
    void api
      .get<{ profile: BusinessProfile }>(`/api/v1/businesses/${businessId}/profile`)
      .then((r) => setProfil(r.profile))
      .catch(() => undefined);
  }, [businessId]);

  if (!row || !profil) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  return (
    <>
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
        <label htmlFor="b-soha">Soha</label>
        <input
          id="b-soha"
          value={profil.industry}
          disabled={!yozaOladi}
          placeholder="Masalan: ta'lim markazi, qurilish materiallari"
          maxLength={120}
          onChange={(e) => setProfil({ ...profil, industry: e.target.value })}
        />
        <div className="yordam">
          Bu maydon bezak emas: AI suhbatni baholashda va yangi playbook tuzishda kontekst sifatida
          ishlatadi.
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="b-tavsif">Tavsif</label>
        <textarea
          id="b-tavsif"
          rows={4}
          value={profil.businessDescription}
          disabled={!yozaOladi}
          maxLength={2000}
          placeholder="Biznes nima qiladi, kimga sotadi, qanday sotadi"
          onChange={(e) => setProfil({ ...profil, businessDescription: e.target.value })}
        />
        <div className="yordam">
          {profil.businessDescription.length}/2000 — batafsil yozsangiz, baholash mezonlari
          shunchalik aniq chiqadi.
        </div>
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
              // Soha va tavsif `profile` ichida — alohida endpoint.
              await api.put(`/api/v1/businesses/${businessId}/profile`, profil);
              await onSaqlandi();
            })
          }
        >
          {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      )}
    </div>

    <BiznesMalumoti row={row} />
    </>
  );
}

/**
 * Biznes ma'lumotlari — o'zgartirib bo'lmaydigan, lekin KERAK bo'ladigan
 * qiymatlar.
 *
 * Nega alohida karta: qo'llab-quvvatlashga murojaat qilganda birinchi
 * so'raladigan narsa — biznes ID si. U hech qayerda ko'rinmasa,
 * foydalanuvchi uni URL dan qidirishga majbur bo'lardi. Nusxa olish
 * tugmasi ham shuning uchun.
 */
function BiznesMalumoti({ row }: { row: BusinessRow }) {
  const [nusxa, setNusxa] = useState<string | null>(null);

  const holatBelgi =
    row.onboardingStep === 'done'
      ? { nom: 'Sozlangan', klass: 'ok' }
      : { nom: 'Sozlanmoqda', klass: 'sariq' };

  const qatorlar: { nom: string; qiymat: string; nusxaOl?: boolean }[] = [
    { nom: 'Slug', qiymat: row.slug, nusxaOl: true },
    { nom: 'Biznes ID', qiymat: row.id, nusxaOl: true },
    { nom: 'Yaratilgan', qiymat: fmtSana(row.createdAt) },
    {
      nom: 'Sozlash tugagan',
      qiymat: row.onboardingCompletedAt ? fmtSana(row.onboardingCompletedAt) : '—',
    },
  ];

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="karta-bosh">
        <h2>Biznes ma'lumotlari</h2>
        <span className={`badge ${holatBelgi.klass}`}>{holatBelgi.nom}</span>
      </div>
      <div className="yordam" style={{ marginBottom: 10 }}>
        Bu qiymatlar o'zgarmaydi. Qo'llab-quvvatlashga murojaat qilsangiz, biznes ID sini yuboring.
      </div>
      <dl className="malumot-royxat">
        {qatorlar.map((q) => (
          <div className="qator" key={q.nom}>
            <dt>{q.nom}</dt>
            <dd>
              <span className="qiymat">{q.qiymat}</span>
              {q.nusxaOl && (
                <button
                  type="button"
                  className="nusxa-tugma"
                  onClick={() => {
                    void navigator.clipboard.writeText(q.qiymat).then(() => {
                      setNusxa(q.nom);
                      setTimeout(() => setNusxa(null), 1800);
                    });
                  }}
                >
                  {nusxa === q.nom ? 'Nusxalandi ✓' : 'Nusxa'}
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Jamoa raqamlari — jadval tepasidagi qisqa xulosa.
 *
 * Jadvalning o'zi hamma narsani ko'rsatadi, lekin 20 qatordan keyin
 * "nechtasi hali kirmagan" degan savolga javob berish uchun ko'z bilan
 * sanash kerak bo'lardi. Shu sababli eng ko'p so'raladigan to'rt raqam
 * yuqoriga chiqarilgan.
 *
 * Nol — HAQIQIY nol (hech kim kutilmayapti), "hisoblanmadi" emas.
 * Ma'lumot yo'q holat bu yerda umuman bo'lmaydi: ro'yxat allaqachon
 * yuklangan.
 */
function JamoaRaqamlar({
  jami,
  faol,
  kutilmoqda,
  ochirilgan,
  qoshimcha,
}: {
  jami: number;
  faol: number;
  kutilmoqda: number;
  ochirilgan: number;
  qoshimcha?: { nom: string; son: number };
}) {
  const katak: { nom: string; son: number; klass?: string }[] = [
    { nom: 'Jami', son: jami },
    { nom: 'Faol', son: faol, klass: 'ok' },
    { nom: 'Kutilmoqda', son: kutilmoqda, klass: kutilmoqda > 0 ? 'sariq' : undefined },
    { nom: 'O\'chirilgan', son: ochirilgan },
    ...(qoshimcha ? [{ nom: qoshimcha.nom, son: qoshimcha.son }] : []),
  ];

  return (
    <div className="jamoa-raqam">
      {katak.map((k) => (
        <div className={`katak${k.klass ? ' ' + k.klass : ''}`} key={k.nom}>
          <div className="son">{k.son}</div>
          <div className="nom">{k.nom}</div>
        </div>
      ))}
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
          <h2>Sotuvchilar</h2>
        </div>
        <JamoaRaqamlar
          jami={rows.length}
          faol={rows.filter((r) => r.isActive && r.activation === 'active').length}
          kutilmoqda={rows.filter((r) => r.isActive && r.activation === 'pending').length}
          ochirilgan={rows.filter((r) => !r.isActive).length}
          qoshimcha={{
            nom: 'Telegram ulangan',
            son: rows.filter((r) => r.telegramLinked).length,
          }}
        />
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
        <JamoaRaqamlar
          jami={rows.length}
          faol={rows.filter((r) => r.isActive && r.activation === 'active').length}
          kutilmoqda={rows.filter((r) => r.isActive && r.activation === 'pending').length}
          ochirilgan={rows.filter((r) => !r.isActive).length}
          qoshimcha={{
            nom: 'Hech qachon kirmagan',
            son: rows.filter((r) => !r.user?.lastLoginAt).length,
          }}
        />
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
