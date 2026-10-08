import { ArrowUpRight, Check, ChevronLeft, ChevronRight, PartyPopper, RotateCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  ApiError,
  EMPTY_PROFILE,
  ballKlass,
  type BusinessProfile,
  type ConversationRow,
  type PlaybookBody,
} from '../api';
import { useAuth } from '../auth';
import { PlaybookForm, TagList } from '../components/PlaybookForm';

/**
 * TZ 3.2: 5 qadamli onboarding sehrgari. FR-17 — holat `business.onboardingStep`
 * da saqlanadi, shuning uchun yarimda tashlab ketilsa, keyingi safar
 * shu qadamdan davom etadi.
 */

type Step = 'profile' | 'playbook' | 'channel' | 'team' | 'done';
const STEPS: { key: Step; nom: string }[] = [
  { key: 'profile', nom: 'Biznes' },
  { key: 'playbook', nom: 'Baholash' },
  { key: 'channel', nom: 'Kanal' },
  { key: 'team', nom: 'Jamoa' },
  { key: 'done', nom: 'Tayyor' },
];

export function Onboarding() {
  const { business, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>((business?.onboardingStep as Step) ?? 'profile');
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  async function goTo(next: Step) {
    setStep(next);
    await api.patch(base, { onboardingStep: next });
  }

  const idx = STEPS.findIndex((s) => s.key === step);

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* Qadam indikatori — uch xil holat uch xil ma'no bildiradi:
          bajarilgan (yashil ✓), joriy (interaktiv), kelgusi (neytral).
          Ilgari hammasi "xavf" qizilida edi — progress xato emas. */}
      <nav className="qadam-qator" aria-label="Onboarding qadamlari">
        {STEPS.map((s, i) => {
          const holat = i < idx ? 'bajarildi' : i === idx ? 'joriy' : 'kelgusi';
          return (
            <div key={s.key} className={`qadam ${holat}`}>
              <div className="belgi" aria-hidden="true">
                {holat === 'bajarildi' ? <Check strokeWidth={2.5} /> : i + 1}
              </div>
              <span className="nom">
                {s.nom}
                {holat === 'joriy' && <span className="sr-only"> — joriy qadam</span>}
              </span>
              {i < STEPS.length - 1 && <div className="ulagich" />}
            </div>
          );
        })}
      </nav>

      {step === 'profile' && <ProfileStep onNext={() => void goTo('playbook')} />}
      {step === 'playbook' && (
        <PlaybookStep onNext={() => void goTo('channel')} onBack={() => void goTo('profile')} />
      )}
      {step === 'channel' && (
        <ChannelStep onNext={() => void goTo('team')} onBack={() => void goTo('playbook')} />
      )}
      {step === 'team' && <TeamStep onNext={() => void goTo('done')} onBack={() => void goTo('channel')} />}
      {step === 'done' && (
        <DoneStep
          onFinish={async () => {
            await api.patch(base, { onboardingStep: 'done' });
            await refresh();
            navigate('/');
          }}
        />
      )}
    </div>
  );
}

// ─── 1-qadam: biznes profili (FR-11) ────────────────────────────────────────

/** Sozlamalar → Biznes profili ham shu formadan foydalanadi (`tugmaMatni` bilan). */
export function ProfileStep({ onNext, tugmaMatni }: { onNext: () => void; tugmaMatni?: string }) {
  const { business } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  useEffect(() => {
    if (!base) return;
    api
      .get<{ profile: BusinessProfile }>(`${base}/profile`)
      .then((r) => setProfile(r.profile))
      .finally(() => setLoading(false));
  }, [base]);

  async function save() {
    setSaving(true);
    try {
      await api.put(`${base}/profile`, profile);
      onNext();
    } finally {
      setSaving(false);
    }
  }

  const ready =
    profile.businessDescription.trim().length > 0 &&
    profile.primaryOffers.length > 0 &&
    profile.typicalCustomers.trim().length > 0 &&
    profile.customerProblem.trim().length > 0 &&
    profile.commonObjections.length > 0;

  if (loading) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Biznesingiz haqida</h2>
      <div style={{ fontSize: 13, color: 'var(--kul-dark)', marginBottom: 16 }}>
        Bu ma'lumot AI baholash mezonlarini tuzishda asos bo'ladi. Qanchalik aniq yozsangiz,
        shunchalik mos playbook chiqadi.
      </div>

      <div className="maydon-blok">
        <label className="maydon">Biznesingiz nima bilan shug'ullanadi? *</label>
        <textarea
          className="input"
          style={{ minHeight: 60 }}
          value={profile.businessDescription}
          onChange={(e) => setProfile({ ...profile, businessDescription: e.target.value })}
        />
      </div>

      <div className="maydon-blok">
        <label className="maydon">Asosiy mahsulot/xizmatlaringiz *</label>
        <TagList
          items={profile.primaryOffers}
          placeholder="Masalan: Frontend kursi"
          onChange={(primaryOffers) => setProfile({ ...profile, primaryOffers })}
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="maydon-blok">
          <label className="maydon">Mijozingiz kim? *</label>
          <input
            className="input"
            value={profile.typicalCustomers}
            onChange={(e) => setProfile({ ...profile, typicalCustomers: e.target.value })}
          />
        </div>
        <div className="maydon-blok">
          <label className="maydon">Mijoz turi</label>
          <select
            className="input"
            value={profile.customerType}
            onChange={(e) => setProfile({ ...profile, customerType: e.target.value as BusinessProfile['customerType'] })}
          >
            <option value="b2c">Jismoniy shaxslar (B2C)</option>
            <option value="b2b">Kompaniyalar (B2B)</option>
            <option value="both">Ikkalasi ham</option>
          </select>
        </div>
      </div>

      <div className="maydon-blok">
        <label className="maydon">Mijoz qanday muammo bilan keladi? *</label>
        <textarea
          className="input"
          style={{ minHeight: 50 }}
          value={profile.customerProblem}
          onChange={(e) => setProfile({ ...profile, customerProblem: e.target.value })}
        />
      </div>

      <div className="maydon-blok">
        <label className="maydon">Eng ko'p uchraydigan e'tirozlar *</label>
        <TagList
          items={profile.commonObjections}
          placeholder="Masalan: Narxi qimmat"
          onChange={(commonObjections) => setProfile({ ...profile, commonObjections })}
        />
      </div>

      <div className="maydon-blok">
        <label className="maydon">Suhbatda albatta aniqlanishi kerak bo'lgan ma'lumot</label>
        <TagList
          items={profile.mustCaptureFields}
          placeholder="Masalan: Byudjet"
          onChange={(mustCaptureFields) => setProfile({ ...profile, mustCaptureFields })}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" disabled={!ready || saving} onClick={() => void save()}>
          {saving ? (
            'Saqlanmoqda…'
          ) : (
            <>
              {tugmaMatni ?? 'Davom etish'} {!tugmaMatni && <ChevronRight />}
            </>
          )}
        </button>
      </div>
      {!ready && (
        <div style={{ fontSize: 12, color: 'var(--kul-dark)', textAlign: 'right', marginTop: 6 }}>
          * bilan belgilangan maydonlar to'ldirilishi shart
        </div>
      )}
    </div>
  );
}

// ─── 2-qadam: AI Playbook Builder (FR-12) ───────────────────────────────────

function PlaybookStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { business } = useAuth();
  const [draft, setDraft] = useState<PlaybookBody | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const res = await api.post<{ draft: PlaybookBody }>(`${base}/playbook/generate`);
      setDraft(res.draft);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Generatsiya qilib bo\'lmadi. Admin panelida faol AI provayder borligini tekshiring.',
      );
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!draft) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.post(`${base}/playbook`, { ...draft, changeNote: 'AI Playbook Builder — onboarding' });
      onNext();
    } finally {
      setSaving(false);
    }
  }

  if (generating) {
    return (
      <div className="card hech-narsa">
        <div className="katta-ikon"><Sparkles /></div>
        AI baholash mezonlarini tuzmoqda… bu 10-20 soniya oladi
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="xato-banner">{error}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn ikkinchi" onClick={onBack}>
            <ChevronLeft /> Orqaga
          </button>
          <button className="btn" onClick={() => void generate()}>
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <>
      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ fontSize: 24, color: 'var(--ia)', display: 'flex' }}>
          <Sparkles />
        </div>
        <div>
          <b>AI qoralamasi tayyor.</b> Ko'rib chiqing, kerak bo'lsa tahrirlang — keyin qabul qiling.
        </div>
        <button className="btn ikkinchi kichik" style={{ marginLeft: 'auto' }} onClick={() => void generate()}>
          <RotateCw /> Qayta generatsiya
        </button>
      </div>

      <PlaybookForm value={draft} onChange={setDraft} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button className="btn ikkinchi" onClick={onBack}>
          <ChevronLeft /> Orqaga
        </button>
        <button className="btn" disabled={saving} onClick={() => void accept()}>
          {saving ? (
            'Saqlanmoqda…'
          ) : (
            <>
              Qabul qilish va davom etish <ChevronRight />
            </>
          )}
        </button>
      </div>
    </>
  );
}

// ─── 3-qadam: Telegram ulash (FR-14) ────────────────────────────────────────

function ChannelStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { business } = useAuth();
  const [botToken, setBotToken] = useState('');
  const [result, setResult] = useState<{ webhookUrl: string; setupCommand: string } | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  useEffect(() => {
    if (!base) return;
    api
      .get<{ connected: boolean }>(`${base}/integrations/telegram`)
      .then((r) => setConnected(r.connected))
      .catch(() => undefined);
  }, [base]);

  async function connect() {
    setError('');
    try {
      const res = await api.post<{ webhookUrl: string; setupCommand: string }>(
        `${base}/integrations/telegram`,
        { botToken },
      );
      setResult(res);
      setConnected(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ulab bo\'lmadi');
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Telegram botini ulang</h2>
      <div style={{ fontSize: 13, color: 'var(--kul-dark)', marginBottom: 16 }}>
        @BotFather orqali bot yarating va tokenini shu yerga kiriting. Sizning yozishmalaringiz
        avtomatik yig'ilib, baholanadi.
      </div>

      {error && <div className="xato-banner">{error}</div>}

      {!connected && !result && (
        <>
          <div className="maydon-blok">
            <label className="maydon">Bot tokeni</label>
            <input
              className="input"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:AA..."
            />
          </div>
          <button className="btn" onClick={() => void connect()} disabled={!botToken}>
            Ulash
          </button>
        </>
      )}

      {result && (
        <div className="card" style={{ background: 'var(--navy-10)', marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Endi shu buyruqni terminalda (yoki serveringizda) bir marta ishga tushiring:
          </div>
          <code style={{ display: 'block', fontSize: 11, wordBreak: 'break-all', background: 'var(--oq)', padding: 8, borderRadius: 6 }}>
            {result.setupCommand}
          </code>
        </div>
      )}

      {connected && !result && <div className="badge ok">Bot ulangan</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button className="btn ikkinchi" onClick={onBack}>
          <ChevronLeft /> Orqaga
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {!connected && (
            <button className="btn ikkinchi" onClick={onNext}>
              Keyinroq ulayman
            </button>
          )}
          <button className="btn" onClick={onNext}>
            Davom etish <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 4-qadam: jamoani taklif qilish (FR-15) ─────────────────────────────────

function TeamStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { business } = useAuth();
  const [name, setName] = useState('');
  const [seats, setSeats] = useState<{ id: string; displayName: string }[]>([]);
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  useEffect(() => {
    if (!base) return;
    void api.get<{ id: string; displayName: string }[] | { seats: { id: string; displayName: string }[] }>(`${base}/seats`).then((r) =>
      setSeats(Array.isArray(r) ? r : r.seats),
    );
  }, [base]);

  async function addSeat() {
    if (!name.trim()) return;
    const row = await api.post<{ id: string; displayName: string }>(`${base}/seats`, { displayName: name });
    setSeats([...seats, row]);
    setName('');
  }

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Sotuvchilaringizni qo'shing</h2>
      <div style={{ fontSize: 13, color: 'var(--kul-dark)', marginBottom: 16 }}>
        Keyinroq ham qo'shishingiz mumkin. Har birini Telegram profiliga bog'lash sozlamalarda.
      </div>

      {seats.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {seats.map((s) => (
            <span key={s.id} className="badge navy" style={{ marginRight: 6, marginBottom: 6, display: 'inline-block' }}>
              {s.displayName}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sotuvchi ismi"
          onKeyDown={(e) => e.key === 'Enter' && void addSeat()}
        />
        <button className="btn ikkinchi" onClick={() => void addSeat()}>
          + Qo'shish
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn ikkinchi" onClick={onBack}>
          <ChevronLeft /> Orqaga
        </button>
        <button className="btn" onClick={onNext}>
          Davom etish <ChevronRight />
        </button>
      </div>
    </div>
  );
}

// ─── 5-qadam: tayyor ─────────────────────────────────────────────────────────

function DoneStep({ onFinish }: { onFinish: () => void }) {
  const { business } = useAuth();
  const [holat, setHolat] = useState<'boshlanmagan' | 'yuklanmoqda' | 'tayyor' | 'xato'>(
    'boshlanmagan',
  );
  const [natijalar, setNatijalar] = useState<ConversationRow[]>([]);
  const [xatoMatn, setXatoMatn] = useState('');

  /**
   * FR-16: namunalarni yuklaymiz va tahlil tugashini kutamiz.
   * Tahlil fonda ishlaydi, shuning uchun natijani so'rab turamiz (polling).
   */
  async function namunalarniSina() {
    if (!business) return;
    const base = `/api/v1/businesses/${business.businessId}`;
    setHolat('yuklanmoqda');
    setXatoMatn('');
    try {
      const boshlanish = await api.post<{ suhbatIdlari: string[] }>(
        `${base}/onboarding/samples`,
        {},
      );
      const kutilgan = new Set(boshlanish.suhbatIdlari);

      // Har 2 soniyada tekshiramiz, ko'pi bilan 60 soniya.
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await api.get<{ conversations: ConversationRow[] }>(`${base}/conversations`);
        const bizniki = r.conversations.filter((c) => kutilgan.has(c.id));
        const tugagan = bizniki.filter((c) => c.status !== 'received' && c.status !== 'queued');
        if (tugagan.length >= kutilgan.size) {
          setNatijalar(bizniki);
          setHolat('tayyor');
          return;
        }
        if (bizniki.length) setNatijalar(bizniki);
      }
      setXatoMatn("Tahlil kutilganidan uzoq davom etmoqda. Boshqaruv panelida ko'rishingiz mumkin.");
      setHolat('xato');
    } catch (e) {
      setXatoMatn(
        e instanceof ApiError
          ? `Namunalarni yuklab bo'lmadi: ${e.message}`
          : "Namunalarni yuklab bo'lmadi. AI provayderi sozlanganini tekshiring.",
      );
      setHolat('xato');
    }
  }

  return (
    <div className="card" style={{ padding: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 12, color: 'var(--ia)', display: 'flex', justifyContent: 'center' }}>
          <PartyPopper strokeWidth={1.5} />
        </div>
        <h1 style={{ marginBottom: 8 }}>Tayyor!</h1>
        <div style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Telegram yozishmalari endi avtomatik yig'iladi va sizning playbook'ingiz
          bo'yicha baholanadi.
        </div>
      </div>

      {/* FR-16 — mijoz birinchi haqiqiy suhbatni kutmasdan natijani ko'radi */}
      {holat === 'boshlanmagan' && (
        <div className="namuna-taklif">
          <div>
            <b>Hoziroq sinab ko'ring</b>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              3 ta namunaviy suhbatni yuklaymiz va sizning mezonlaringiz bo'yicha
              baholaymiz. Bu haqiqiy tahlil — oldindan yozilgan natija emas.
            </div>
          </div>
          <button className="btn" onClick={() => void namunalarniSina()}>
            Namunalarni baholash
          </button>
        </div>
      )}

      {holat === 'yuklanmoqda' && (
        <div className="namuna-taklif">
          <div>
            <b>Tahlil ketmoqda…</b>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Har bir suhbat playbook mezonlari bo'yicha baholanmoqda. Bu odatda
              yarim daqiqa oladi.
            </div>
          </div>
        </div>
      )}

      {holat === 'xato' && (
        <div className="xato-banner" style={{ marginBottom: 16 }}>
          {xatoMatn}
        </div>
      )}

      {natijalar.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {natijalar.map((r) => {
            const ball = r.overallScore === null ? null : Number(r.overallScore);
            return (
              <div className="namuna-satr" key={r.id}>
                <span className={`ball ${ballKlass(ball)}`}>
                  {ball === null ? '—' : `${Math.round(ball)}%`}
                </span>
                <div className="matn">
                  <div className="xulosa">{r.summary ?? 'Tahlil qilinmoqda…'}</div>
                  {r.primaryGap && (
                    <div className="zaif">
                      <ArrowUpRight /> {r.primaryGap}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {holat === 'tayyor' && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10 }}>
              Har bir bahoning ortida transkriptdagi aniq iqtibos turadi — suhbatni
              ochib ko'rishingiz mumkin.
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button
          className={holat === 'tayyor' || holat === 'boshlanmagan' ? 'btn' : 'btn ikkinchi'}
          onClick={onFinish}
        >
          Boshqaruv paneliga o'tish
        </button>
      </div>
    </div>
  );
}
