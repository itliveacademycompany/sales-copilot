import {
  Bell,
  Box,
  Building2,
  CalendarDays,
  Check,
  CircleCheck,
  CircleHelp,
  CreditCard,
  Filter,
  Flag,
  Flame,
  FileBarChart,
  MessageSquareWarning,
  MessagesSquare,
  Link2,
  Palette,
  PhoneCall,
  Cpu,
  AudioLines,
  Share2,
  Pencil,
  Send,
  Settings2,
  Trash2,
  Upload,
  Sparkles,
  UserRound,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bizneslar, Korinish, MuammoXabari } from '../components/sozlama/Bolimlar';
import { Bildirishnomalar } from '../components/sozlama/Bildirishnomalar';
import { ProfileStep } from './Onboarding';
import { BaholashMezonlari } from '../components/mezonlar/BaholashMezonlari';
import { AnketaSavollari } from '../components/anketa/AnketaSavollari';
import { XizmatYonalishlari } from '../components/xizmat/XizmatYonalishlari';
import { QongiroqOilalari } from '../components/oilalar/QongiroqOilalari';
import { AiKorsatmalari } from '../components/ai/AiKorsatmalari';
import { LidSifatiBosqichlari } from '../components/lid/LidSifatiBosqichlari';
import { CrmNatija } from '../components/crm/CrmNatija';
import { CrmVoronkalar } from '../components/crm/CrmVoronkalar';
import { KunlikHisobotSozlama } from '../components/hisobot/KunlikHisobotSozlama';
import { Rahbarlar } from '../components/sozlama/Rahbarlar';
import { Menejerlar } from '../components/sozlama/Menejerlar';
import { IshJadvali } from '../components/sozlama/IshJadvali';
import { Obuna } from '../components/sozlama/Obuna';
import { CrmEksport, MoiZvonki, SttTanlash } from '../components/sozlama/Integratsiyalar';
import { AiProvayderlar } from '../components/sozlama/AiProvayderlar';
import { TanlovMenyu } from '../components/analitika/Ochiluvchi';
import { ParolInput } from '../components/ParolInput';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { rasmniTayyorla } from '../components/avatar';
import {
  api,
  ApiError,
  fmtSana,
  EMPTY_PROFILE,
  type BusinessProfile,
  type BusinessRow,
  type DailyReportRow,
  type TelegramIntegration,
} from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';

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

type Bolim =
  | 'profil'
  | 'korinish'
  | 'biznes'
  | 'bizneslar'
  | 'bildirishnoma'
  | 'rahbarlar'
  | 'sotuvchilar'
  | 'jadval'
  | 'obuna'
  | 'muammo'
  | 'mezonlar'
  | 'anketa'
  | 'xizmat'
  | 'oilalar'
  | 'ai'
  | 'lidSifati'
  | 'crmNatija'
  | 'crmVoronka'
  | 'integratsiya'
  | 'moizvonki'
  | 'crmEksport'
  | 'stt'
  | 'aiProvayder'
  | 'kunlik';

const ROL_NOM: Record<string, string> = {
  owner: 'Ega',
  supervisor: 'Rahbar',
  head: 'Bo\'lim boshlig\'i',
  auditor: 'Auditor',
};



type Guruh = 'umumiy' | 'tahlil' | 'lid' | 'hisobot';
const GURUH_NOMI: Record<Guruh, string> = {
  umumiy: 'Umumiy',
  tahlil: "Qo'ng'iroq tahlili",
  lid: 'Lid va CRM',
  hisobot: 'Hisobotlar',
};

export function Settings() {
  const { user, business, refresh } = useAuth();
  const t = useT();
  const [params, setParams] = useSearchParams();

  const p = business?.permissions ?? [];
  const bizneskoradi = p.includes('business:read');
  const bizneYozadi = p.includes('business:write');
  const seatBoshqaradi = p.includes('seat:manage:all') || p.includes('seat:manage:department');
  const memberBoshqaradi = p.includes('member:manage');
  const integratsiyaBoshqaradi = p.includes('integration:manage');
  const obunaKoradi = p.includes('subscription:manage');
  const playbookKoradi = p.includes('playbook:read');

  // Har bo'lim o'z ruxsatiga qarab ko'rinadi — chegara serverda, bu yerda faqat foydasiz tugma yashiriladi
  const BOLIMLAR: { key: Bolim; nom: string; guruh: Guruh; ikon: ReactNode; korinadi: boolean }[] = [
    { key: 'profil', nom: 'Profil', guruh: 'umumiy', ikon: <UserRound />, korinadi: true },
    { key: 'korinish', nom: "Ko'rinish", guruh: 'umumiy', ikon: <Palette />, korinadi: true },
    { key: 'biznes', nom: 'Umumiy', guruh: 'umumiy', ikon: <Settings2 />, korinadi: bizneskoradi },
    { key: 'bizneslar', nom: 'Bizneslar', guruh: 'umumiy', ikon: <Building2 />, korinadi: true },
    { key: 'bildirishnoma', nom: 'Bildirishnomalar', guruh: 'umumiy', ikon: <Bell />, korinadi: bizneskoradi },
    { key: 'rahbarlar', nom: 'Rahbarlar', guruh: 'umumiy', ikon: <UserRoundPlus />, korinadi: memberBoshqaradi },
    { key: 'sotuvchilar', nom: 'Menejerlar', guruh: 'umumiy', ikon: <UsersRound />, korinadi: seatBoshqaradi },
    { key: 'jadval', nom: 'Ish jadvali', guruh: 'umumiy', ikon: <CalendarDays />, korinadi: bizneskoradi },
    { key: 'obuna', nom: 'Obuna', guruh: 'umumiy', ikon: <CreditCard />, korinadi: obunaKoradi },
    { key: 'muammo', nom: 'Muammo haqida xabar berish', guruh: 'umumiy', ikon: <MessageSquareWarning />, korinadi: true },
    { key: 'mezonlar', nom: 'Baholash mezonlari', guruh: 'tahlil', ikon: <CircleCheck />, korinadi: playbookKoradi },
    { key: 'anketa', nom: 'Anketa savollari', guruh: 'tahlil', ikon: <CircleHelp />, korinadi: playbookKoradi },
    { key: 'xizmat', nom: "Xizmat yo'nalishlari", guruh: 'tahlil', ikon: <Box />, korinadi: playbookKoradi },
    { key: 'oilalar', nom: "Qo'ng'iroq oilalari", guruh: 'tahlil', ikon: <MessagesSquare />, korinadi: playbookKoradi },
    { key: 'ai', nom: "AI ko'rsatmalari", guruh: 'tahlil', ikon: <Sparkles />, korinadi: playbookKoradi },
    { key: 'stt', nom: 'Nutqni matnga (STT)', guruh: 'tahlil', ikon: <AudioLines />, korinadi: true },
    // Platforma darajasi — kalitlar butun tizimga ishlatiladi, shuning uchun faqat super-admin
    { key: 'aiProvayder', nom: 'AI provayderlar', guruh: 'tahlil', ikon: <Cpu />, korinadi: user?.systemRole === 'super_admin' },
    { key: 'lidSifati', nom: 'Lid sifati bosqichlari', guruh: 'lid', ikon: <Flame />, korinadi: bizneskoradi },
    { key: 'crmNatija', nom: 'CRM natija bosqichlari', guruh: 'lid', ikon: <Flag />, korinadi: bizneskoradi },
    { key: 'crmVoronka', nom: 'Faol CRM voronkalari', guruh: 'lid', ikon: <Filter />, korinadi: bizneskoradi },
    { key: 'integratsiya', nom: 'Telegram bot', guruh: 'lid', ikon: <Send />, korinadi: bizneskoradi },
    { key: 'moizvonki', nom: 'Moi Zvonki', guruh: 'lid', ikon: <PhoneCall />, korinadi: bizneskoradi },
    { key: 'crmEksport', nom: 'Vazifalarni CRM ga yuborish', guruh: 'lid', ikon: <Share2 />, korinadi: bizneskoradi },
    { key: 'kunlik', nom: 'Kunlik hisobot', guruh: 'hisobot', ikon: <FileBarChart />, korinadi: bizneskoradi },
  ];
  const korinadigan = BOLIMLAR.filter((b) => b.korinadi);
  const bolim = korinadigan.find((b) => b.key === params.get('b')) ?? korinadigan[0]!;
  const ochish = (k: Bolim) =>
    setParams(
      (eski) => {
        const n = new URLSearchParams(eski);
        if (k === 'profil') n.delete('b');
        else n.set('b', k);
        return n;
      },
      { replace: true },
    );
  const guruhlar = (Object.keys(GURUH_NOMI) as Guruh[]).filter((g) => korinadigan.some((b) => b.guruh === g));

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>{t('Sozlamalar')}</h1>
          <div className="izoh">{t('Profil, biznes, jamoa, tahlil va ulanishlar')}</div>
        </div>
      </div>

      {/* 1-daraja: guruhlar; 2-daraja: guruhdagi bo'limlar */}
      <div className="tab-qator sz-guruhlar" role="tablist" aria-label="Sozlamalar guruhlari">
        {guruhlar.map((g) => {
          const soni = korinadigan.filter((b) => b.guruh === g).length;
          return (
            <button
              key={g}
              role="tab"
              aria-selected={bolim.guruh === g}
              className={`tab${bolim.guruh === g ? ' active' : ''}`}
              onClick={() => ochish(korinadigan.find((b) => b.guruh === g)!.key)}
            >
              {t(GURUH_NOMI[g])} <small className="sz-soni">{soni}</small>
            </button>
          );
        })}
      </div>
      <div className="tab-qator sz-bolimlar" role="tablist" aria-label={t(GURUH_NOMI[bolim.guruh])}>
        {korinadigan
          .filter((b) => b.guruh === bolim.guruh)
          .map((b) => (
            <button key={b.key} role="tab" aria-selected={bolim.key === b.key} className={`tab${bolim.key === b.key ? ' active' : ''}`} onClick={() => ochish(b.key)}>
              {b.ikon} {t(b.nom)}
            </button>
          ))}
      </div>

      <div className="sz-ichi">
        {bolim.key === 'profil' && <Profil user={user} business={business} onSaqlandi={refresh} />}
        {bolim.key === 'korinish' && <Korinish />}
        {bolim.key === 'biznes' && business && <Biznes businessId={business.businessId} yozaOladi={bizneYozadi} onSaqlandi={refresh} />}
        {bolim.key === 'bizneslar' && business && <Bizneslar joriyId={business.businessId} />}
        {bolim.key === 'bildirishnoma' && business && <Bildirishnomalar businessId={business.businessId} boshqaraOladi={integratsiyaBoshqaradi} />}
        {bolim.key === 'rahbarlar' && business && <Rahbarlar businessId={business.businessId} />}
        {bolim.key === 'sotuvchilar' && business && <Menejerlar businessId={business.businessId} />}
        {bolim.key === 'jadval' && business && <IshJadvali businessId={business.businessId} />}
        {bolim.key === 'obuna' && business && <Obuna businessId={business.businessId} />}
        {bolim.key === 'muammo' && <MuammoXabari biznes={business?.name ?? '—'} foydalanuvchi={user?.displayName ?? '—'} />}
        {bolim.key === 'mezonlar' && <BaholashMezonlari />}
        {bolim.key === 'anketa' && <AnketaSavollari />}
        {bolim.key === 'xizmat' && <XizmatYonalishlari />}
        {bolim.key === 'oilalar' && <QongiroqOilalari />}
        {bolim.key === 'ai' && (
          <>
            <AiKorsatmalari />
            {bizneskoradi && <BiznesProfili />}
          </>
        )}
        {bolim.key === 'lidSifati' && <LidSifatiBosqichlari />}
        {bolim.key === 'crmNatija' && <CrmNatija />}
        {bolim.key === 'crmVoronka' && <CrmVoronkalar />}
        {bolim.key === 'integratsiya' && business && <Integratsiya businessId={business.businessId} boshqaraOladi={integratsiyaBoshqaradi} />}
        {bolim.key === 'moizvonki' && business && <MoiZvonki businessId={business.businessId} boshqaraOladi={integratsiyaBoshqaradi} />}
        {bolim.key === 'crmEksport' && business && <CrmEksport businessId={business.businessId} boshqaraOladi={integratsiyaBoshqaradi} />}
        {bolim.key === 'stt' && <SttTanlash />}
        {bolim.key === 'aiProvayder' && <AiProvayderlar />}
        {bolim.key === 'kunlik' && <KunlikHisobotSozlama />}
      </div>
    </>
  );
}

/** Onboarding'dagi profil formasi — saqlangach xabar chiqadi. */
function BiznesProfili() {
  const [saqlandi, setSaqlandi] = useState(false);
  return (
    <>
      {saqlandi && (
        <div className="ok-qator" style={{ marginBottom: 10 }}>
          Biznes profili saqlandi <Check />
        </div>
      )}
      <ProfileStep
        tugmaMatni="Saqlash"
        onNext={() => {
          setSaqlandi(true);
          setTimeout(() => setSaqlandi(false), 2500);
        }}
      />
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
  if (holat === 'ok') return <div className="ok-qator">Saqlandi <Check /></div>;
  return null;
}

// ─── PROFIL (FR-160) ────────────────────────────────────────────────────────

function Profil({
  user,
  business,
  onSaqlandi,
}: {
  user: { id: string; displayName: string; email: string | null; login: string | null; locale: string; avatarUrl: string | null } | null;
  business: { businessId: string; role: string; permissions: string[] } | null;
  onSaqlandi: () => Promise<void>;
}) {
  /**
   * Server bitta `avatarUrl` saqlaydi: https havola YOKI yuklangan faylning
   * data-URL'i. Fayl bo'lsa havola maydoni bo'sh ko'rsatiladi — aks holda
   * 30 KB lik base64 matn input ichida ko'rinib qolardi.
   */
  const serverRasm = user?.avatarUrl ?? '';
  const serverFayl = serverRasm.startsWith('data:') ? serverRasm : null;
  const boshlangich = { ism: user?.displayName ?? '', til: user?.locale ?? 'uz', avatar: serverFayl ? '' : serverRasm };
  const [ism, setIsm] = useState(boshlangich.ism);
  const [til, setTil] = useState(boshlangich.til);
  const [avatar, setAvatar] = useState(boshlangich.avatar);
  const [avatarOchiq, setAvatarOchiq] = useState(false);
  const [rasmXato, setRasmXato] = useState(false);
  // Fayldan tanlangan rasm: undefined — o'zgarmagan, null — olib tashlandi, string — yangi rasm
  const saqlanganLokal = serverFayl;
  const [yangiLokal, setYangiLokal] = useState<string | null | undefined>(undefined);
  const [faylXato, setFaylXato] = useState<string | null>(null);
  const [sudrash, setSudrash] = useState(false);
  const faylRef = useRef<HTMLInputElement>(null);
  const lokal = yangiLokal === undefined ? saqlanganLokal : yangiLokal;

  async function faylniOl(f: File | undefined) {
    if (!f) return;
    setFaylXato(null);
    try {
      setYangiLokal(await rasmniTayyorla(f));
    } catch (e) {
      setFaylXato(e instanceof Error ? e.message : "Rasmni o'qib bo'lmadi");
    }
  }
  const [tg, setTg] = useState<TelegramIntegration | null>(null);
  const { holat, xato, bajar } = useSaqlash();

  const parol = useSaqlash();
  const [joriy, setJoriy] = useState('');
  const [yangi, setYangi] = useState('');

  useEffect(() => {
    if (!business) return;
    void api.get<TelegramIntegration>(`/api/v1/businesses/${business.businessId}/integrations/telegram`).then(setTg).catch(() => undefined);
  }, [business?.businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ozgargan =
    ism.trim() !== boshlangich.ism || til !== boshlangich.til || avatar.trim() !== boshlangich.avatar || yangiLokal !== undefined;
  const avatarTogri = avatar.trim() === '' || /^https?:\/\/\S+$/.test(avatar.trim());
  const bosh = (ism.trim() || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');
  const tgBot = tg?.integration?.config.botUsername;

  return (
    <>
      <section className="card pr-karta">
        <header className="pr-bosh">
          <h2>Profil</h2>
          <p>Shaxsiy ma'lumotlaringizni yangilang</p>
        </header>

        <div className="pr-avatar-qator">
          {/* Rasmni avatar ustiga sudrab tashlash ham mumkin */}
          <div
            className={`pr-avatar${sudrash ? ' sudrash' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setSudrash(true);
            }}
            onDragLeave={() => setSudrash(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSudrash(false);
              void faylniOl(e.dataTransfer.files[0]);
            }}
          >
            {lokal ? (
              <img src={lokal} alt="Profil rasmi" />
            ) : avatar.trim() && avatarTogri && !rasmXato ? (
              <img src={avatar.trim()} alt="Profil rasmi" onError={() => setRasmXato(true)} />
            ) : (
              <span>{bosh}</span>
            )}
            <button type="button" className="pr-qalam" onClick={() => faylRef.current?.click()} aria-label="Rasm tanlash">
              <Pencil />
            </button>
            <input
              ref={faylRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                void faylniOl(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          <div className="pr-avatar-matn">
            <b>Rasmni o'zgartirish</b>
            <small>JPG, PNG yoki WEBP · 2 MB gacha · avatar ustiga sudrab tashlash ham mumkin</small>
            <div className="pr-avatar-tugmalar">
              <button type="button" className="btn ikkinchi kichik" onClick={() => faylRef.current?.click()}>
                <Upload /> Rasm tanlash
              </button>
              <button type="button" className="btn ikkinchi kichik" onClick={() => setAvatarOchiq((v) => !v)} aria-expanded={avatarOchiq}>
                <Link2 /> Havola orqali
              </button>
              {(lokal || avatar) && (
                <button
                  type="button"
                  className="btn ikkinchi kichik pr-olib"
                  onClick={() => {
                    setYangiLokal(null);
                    setAvatar('');
                  }}
                >
                  <Trash2 /> Olib tashlash
                </button>
              )}
            </div>
            {faylXato && <small className="pr-xato">{faylXato}</small>}
            {lokal && <small>Rasm profilingizda saqlanadi va barcha qurilmalarda ko'rinadi.</small>}
            {avatarOchiq && (
              <div className="pr-avatar-maydon">
                <input
                  className="input"
                  value={avatar}
                  onChange={(e) => {
                    setAvatar(e.target.value);
                    setRasmXato(false);
                    // Havola yozilsa — u fayl o'rnini oladi (server bitta rasm saqlaydi).
                    if (e.target.value.trim()) setYangiLokal(null);
                  }}
                  placeholder="https://…/rasm.jpg"
                  aria-label="Rasm havolasi"
                  autoFocus
                />
              </div>
            )}
            {!avatarTogri && <small className="pr-xato">Havola https:// bilan boshlanishi kerak</small>}
            {avatarTogri && rasmXato && avatar.trim() && <small className="pr-xato">Rasm ochilmadi — havolani tekshiring</small>}
          </div>
        </div>

        <div className="pr-maydonlar">
          <div className="maydon-blok">
            <label htmlFor="p-ism">Nom</label>
            <input id="p-ism" value={ism} onChange={(e) => setIsm(e.target.value)} maxLength={120} />
          </div>
          <div className="maydon-blok">
            <label htmlFor="p-email">Email</label>
            <input id="p-email" value={user?.email ?? user?.login ?? '—'} disabled title="Email o'zgartirish yangi manzilni tasdiqlashni talab qiladi — hozircha qo'llab-quvvatlanmaydi" />
          </div>
        </div>
        <div className="pr-belgilar">
          {business && <span className="pr-belgi rol">{ROL_NOM[business.role] ?? business.role}</span>}
          <span className="pr-belgi kirish">{user?.email ? 'Email' : 'Login'}</span>
        </div>

        <div className="pr-ajrat" />

        <header className="pr-bosh">
          <h2>Ulangan hisoblar</h2>
          <p>Ulangan hisoblaringizni boshqaring</p>
        </header>
        <div className="pr-hisob">
          <span className="pr-hisob-ikon tg" aria-hidden="true">
            <Send />
          </span>
          <div className="pr-hisob-matn">
            <b>Telegram</b>
            <small>
              {tg?.connected
                ? `${tgBot ? `@${tgBot.replace(/^@/, '')} boti` : 'Bot'} ulangan — kunlik hisobot va parolni tiklash havolalari shu orqali keladi.`
                : 'Telegram botni ulash orqali kunlik hisobot va bildirishnomalar olishingiz mumkin.'}
            </small>
          </div>
          {tg?.connected ? (
            <span className="pr-belgi ulangan">
              <Check /> Ulangan
            </span>
          ) : (
            <Link to="/sozlamalar?b=integratsiya" className="btn ikkinchi">
              Botni ulash
            </Link>
          )}
        </div>

        <div className="pr-ajrat" />
        <Xabar holat={holat} xato={xato} />
        <div className="pr-past">
          <button
            type="button"
            className="btn ikkinchi"
            disabled={!ozgargan || holat === 'ketmoqda'}
            onClick={() => {
              setIsm(boshlangich.ism);
              setTil(boshlangich.til);
              setAvatar(boshlangich.avatar);
              setAvatarOchiq(false);
              setYangiLokal(undefined);
              setFaylXato(null);
            }}
          >
            Bekor qilish
          </button>
          <button
            type="button"
            className="btn"
            disabled={!ozgargan || holat === 'ketmoqda' || ism.trim().length < 2 || !avatarTogri}
            onClick={() =>
              void bajar(async () => {
                await api.patch('/api/v1/auth/me', {
                  displayName: ism.trim(),
                  locale: til,
                  // Fayl tanlangan bo'lsa — uning data-URL'i, aks holda havola.
                  avatarUrl: lokal ?? (avatar.trim() ? avatar.trim() : null),
                });
                setYangiLokal(undefined);
                await onSaqlandi();
                setAvatarOchiq(false);
              })
            }
          >
            {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </section>

      <section className="card pr-karta">
        <header className="pr-bosh">
          <h2>Parolni o'zgartirish</h2>
          <p>Parol o'zgargach boshqa barcha qurilmalardagi sessiyalar bekor qilinadi.</p>
        </header>
        <div className="pr-maydonlar">
          <div className="maydon-blok">
            <label htmlFor="p-joriy">Joriy parol</label>
            <ParolInput id="p-joriy" value={joriy} onChange={(e) => setJoriy(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="maydon-blok">
            <label htmlFor="p-yangi">Yangi parol</label>
            <ParolInput id="p-yangi" value={yangi} onChange={(e) => setYangi(e.target.value)} autoComplete="new-password" />
            <div className="yordam">Kamida 10 belgi. Uzunlik murakkablikdan muhimroq.</div>
          </div>
        </div>
        <Xabar holat={parol.holat} xato={parol.xato} />
        <div className="pr-past">
          <button
            type="button"
            className="btn"
            disabled={parol.holat === 'ketmoqda' || joriy.length < 1 || yangi.length < 10}
            onClick={() =>
              void parol
                .bajar(() => api.post('/api/v1/auth/change-password', { currentPassword: joriy, newPassword: yangi }))
                .then((ok) => {
                  if (ok) {
                    setJoriy('');
                    setYangi('');
                  }
                })
            }
          >
            {parol.holat === 'ketmoqda' ? "O'zgartirilmoqda…" : "Parolni o'zgartirish"}
          </button>
        </div>
      </section>
    </>
  );
}

// ─── BIZNES (FR-161) ────────────────────────────────────────────────────────

const VAQT_ZONALARI = [
  ['Asia/Tashkent', 'UTC+5'],
  ['Asia/Samarkand', 'UTC+5'],
  ['Asia/Almaty', 'UTC+6'],
  ['Asia/Bishkek', 'UTC+6'],
  ['Asia/Dushanbe', 'UTC+5'],
  ['Asia/Ashgabat', 'UTC+5'],
  ['Europe/Moscow', 'UTC+3'],
  ['Europe/Istanbul', 'UTC+3'],
  ['Asia/Dubai', 'UTC+4'],
  ['Asia/Seoul', 'UTC+9'],
  ['Asia/Tokyo', 'UTC+9'],
  ['Europe/London', 'UTC+0'],
  ['Europe/Berlin', 'UTC+1'],
  ['America/New_York', 'UTC-5'],
  ['America/Los_Angeles', 'UTC-8'],
  ['UTC', 'UTC+0'],
].map(([qiymat, ofset]) => ({ qiymat: qiymat!, nom: qiymat === 'UTC' ? 'UTC' : `${qiymat} (${ofset})` }));

const VALYUTALAR = [
  { qiymat: 'UZS', nom: "UZS — so'm" },
  { qiymat: 'USD', nom: 'USD — dollar' },
  { qiymat: 'RUB', nom: 'RUB — rubl' },
];

/** Serverda «soha» maydoni yo'q — shu brauzerda, biznes bo'yicha saqlanadi. */
const sohaKalit = (id: string) => `sotuvai-soha:${id}`;
const sohaOl = (id: string) => {
  try {
    return localStorage.getItem(sohaKalit(id)) ?? '';
  } catch {
    return '';
  }
};

function Biznes({
  businessId,
  yozaOladi,
  onSaqlandi,
}: {
  businessId: string;
  yozaOladi: boolean;
  onSaqlandi: () => Promise<void>;
}) {
  type Qator = BusinessRow & { createdAt?: string; deletedAt?: string | null; profile?: Partial<BusinessProfile> | null };
  const [asl, setAsl] = useState<Qator | null>(null);
  const [nom, setNom] = useState('');
  const [tavsif, setTavsif] = useState('');
  const [tz, setTz] = useState('Asia/Tashkent');
  const [valyuta, setValyuta] = useState('UZS');
  const [logo, setLogo] = useState('');
  const [aslSoha, setAslSoha] = useState(() => sohaOl(businessId));
  const [soha, setSoha] = useState(aslSoha);
  const { holat, xato, bajar } = useSaqlash();

  const yukla = useCallback(() => {
    const s = sohaOl(businessId);
    setAslSoha(s);
    setSoha(s);
    void api
      .get<Qator>(`/api/v1/businesses/${businessId}`)
      .then((r) => {
        setAsl(r);
        setNom(r.name);
        setTavsif(r.profile?.businessDescription ?? '');
        setTz(r.timezone);
        setValyuta(r.currency);
        setLogo(r.logoUrl ?? '');
      })
      .catch(() => undefined);
  }, [businessId]);
  useEffect(yukla, [yukla]);

  if (!asl) return <div className="card skelet" style={{ height: 420 }} aria-busy="true" />;

  const aslTavsif = asl.profile?.businessDescription ?? '';
  const ozgargan =
    nom.trim() !== asl.name ||
    soha.trim() !== aslSoha ||
    tavsif.trim() !== aslTavsif.trim() ||
    tz !== asl.timezone ||
    valyuta !== asl.currency ||
    logo.trim() !== (asl.logoUrl ?? '');
  const logoTogri = logo.trim() === '' || /^https?:\/\/\S+$/.test(logo.trim());
  const TIL_NOMI: Record<string, string> = { uz: "O'zbek tili", 'uz-Cyrl': "O'zbek tili (kirill)", ru: 'Rus tili', en: 'Ingliz tili' };
  const faol = !asl.deletedAt;
  // Serverdagi qiymat ro'yxatda bo'lmasa ham yo'qolmasin
  const zonalar = VAQT_ZONALARI.some((z) => z.qiymat === asl.timezone)
    ? VAQT_ZONALARI
    : [{ qiymat: asl.timezone, nom: asl.timezone }, ...VAQT_ZONALARI];
  const valyutalar = VALYUTALAR.some((v) => v.qiymat === asl.currency)
    ? VALYUTALAR
    : [{ qiymat: asl.currency, nom: asl.currency }, ...VALYUTALAR];

  const bekor = () => {
    setNom(asl.name);
    setSoha(aslSoha);
    setTavsif(aslTavsif);
    setTz(asl.timezone);
    setValyuta(asl.currency);
    setLogo(asl.logoUrl ?? '');
  };

  return (
    <section className="card pr-karta bz-karta">
      <header className="pr-bosh">
        <h2>Umumiy</h2>
        <p>Biznes sozlamalarini yangilash</p>
      </header>

      <div className="pr-maydonlar">
        <div className="maydon-blok">
          <label htmlFor="b-nom">Biznes nomi</label>
          <input id="b-nom" value={nom} disabled={!yozaOladi} onChange={(e) => setNom(e.target.value)} maxLength={120} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="b-soha">Soha</label>
          <input
            id="b-soha"
            value={soha}
            disabled={!yozaOladi}
            onChange={(e) => setSoha(e.target.value)}
            placeholder="Masalan: Ta'lim"
            maxLength={80}
          />
          <div className="yordam">Shu brauzerda saqlanadi — serverda soha maydoni hali yo'q.</div>
        </div>
      </div>
      <div className="maydon-blok bz-toliq">
        <label htmlFor="b-tavsif">Tavsif</label>
        <textarea
          id="b-tavsif"
          rows={2}
          value={tavsif}
          disabled={!yozaOladi}
          onChange={(e) => setTavsif(e.target.value)}
          placeholder="Biznesingiz nima bilan shug'ullanadi — AI suhbatlarni shu kontekstda tahlil qiladi"
          maxLength={2000}
        />
      </div>
      <div className="pr-maydonlar">
        <div className="maydon-blok">
          <label htmlFor="b-til">Biznes tili</label>
          <TanlovMenyu
            id="b-til"
            aria="Biznes tili"
            qiymat={asl.locale}
            variantlar={[{ qiymat: asl.locale, nom: TIL_NOMI[asl.locale] ?? asl.locale }]}
            onOzgar={() => undefined}
            kenglik="100%"
            disabled
          />
          <div className="yordam">Playbooklar va tizim ishlaydigan asosiy til. Biznes yaratishda bir marta tanlanadi. Bu interfeys tili emas.</div>
        </div>
        <div className="maydon-blok">
          <label htmlFor="b-tz">Vaqt zonasi</label>
          <TanlovMenyu id="b-tz" aria="Vaqt zonasi" qiymat={tz} variantlar={zonalar} onOzgar={setTz} kenglik="100%" disabled={!yozaOladi} />
          <div className="yordam">Kunlik hisobot va «bugungi vazifalar» shu zonaga qarab hisoblanadi.</div>
        </div>
      </div>
      <div className="pr-maydonlar">
        <div className="maydon-blok">
          <label htmlFor="b-valyuta">Valyuta</label>
          <TanlovMenyu id="b-valyuta" aria="Valyuta" qiymat={valyuta} variantlar={valyutalar} onOzgar={setValyuta} kenglik="100%" disabled={!yozaOladi} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="b-logo">Logotip havolasi</label>
          <input id="b-logo" value={logo} disabled={!yozaOladi} placeholder="https://…/logo.png" onChange={(e) => setLogo(e.target.value)} />
          {!logoTogri && <div className="yordam" style={{ color: 'var(--past-text)' }}>Havola https:// bilan boshlanishi kerak</div>}
        </div>
      </div>

      {/* Server sozlamasi yo'q almashtirgichlar — holati halol ko'rsatiladi */}
      <div className="bz-almash">
        <div>
          <b>Vazifalarni CRM'ga yuborish</b>
          <small>Mos keladigan vazifalarni ulangan CRM'ga yuborish. CRM hali ulanmagan — vazifalar SotuvAI ichida yuritiladi.</small>
        </div>
        <label className="vr-almash" title="CRM ulanmagan">
          <input type="checkbox" role="switch" checked={false} disabled readOnly />
          <span className="vr-almash-yol" aria-hidden="true" />
        </label>
      </div>
      <div className="bz-almash">
        <div>
          <b>Suhbatlardan AI vazifalar yaratish</b>
          <small>Suhbatda menejer bergan va'dalardan AI avtomatik vazifa yaratadi. Hozir doim yoqilgan — o'chirish sozlamasi hali qo'shilmagan.</small>
        </div>
        <label className="vr-almash" title="Doim yoqilgan">
          <input type="checkbox" role="switch" checked disabled readOnly />
          <span className="vr-almash-yol" aria-hidden="true" />
        </label>
      </div>

      <div className="bz-malumot">
        <b>Biznes ma'lumotlari</b>
        <dl>
          <div>
            <dt>Slug:</dt>
            <dd>{asl.slug}</dd>
          </div>
          <div>
            <dt>ID:</dt>
            <dd className="bz-id">{asl.id}</dd>
          </div>
          <div>
            <dt>Yaratilgan sana:</dt>
            <dd>{asl.createdAt ? asl.createdAt.slice(0, 10) : '—'}</dd>
          </div>
          <div>
            <dt>Holat:</dt>
            <dd className={faol ? 'bz-faol' : 'bz-nofaol'}>{faol ? 'Faol' : "O'chirilgan"}</dd>
          </div>
        </dl>
      </div>

      <Xabar holat={holat} xato={xato} />
      {yozaOladi && (
        <div className="pr-past">
          <button type="button" className="btn ikkinchi" disabled={!ozgargan || holat === 'ketmoqda'} onClick={bekor}>
            Bekor qilish
          </button>
          <button
            type="button"
            className="btn"
            disabled={!ozgargan || holat === 'ketmoqda' || nom.trim().length < 2 || !logoTogri}
            onClick={() =>
              void bajar(async () => {
                try {
                  if (soha.trim()) localStorage.setItem(sohaKalit(businessId), soha.trim());
                  else localStorage.removeItem(sohaKalit(businessId));
                } catch {
                  /* xotira yopiq — soha saqlanmaydi, qolganlari saqlanadi */
                }
                await api.patch(`/api/v1/businesses/${businessId}`, {
                  name: nom.trim(),
                  timezone: tz,
                  currency: valyuta,
                  logoUrl: logo.trim() ? logo.trim() : null,
                });
                // Tavsif biznes profilida — faqat o'zgarganda butun profil qayta yoziladi
                if (tavsif.trim() !== aslTavsif.trim()) {
                  const p = await api.get<{ profile: BusinessProfile }>(`/api/v1/businesses/${businessId}/profile`);
                  await api.put(`/api/v1/businesses/${businessId}/profile`, { ...EMPTY_PROFILE, ...p.profile, businessDescription: tavsif.trim() });
                }
                await onSaqlandi();
                yukla();
              })
            }
          >
            {holat === 'ketmoqda' ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      )}
    </section>
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

export function KunlikHisobot({
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
