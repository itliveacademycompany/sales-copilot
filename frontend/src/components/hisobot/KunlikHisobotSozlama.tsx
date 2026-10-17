import { ArrowLeft, ArrowRight, Bell, Check, CircleCheck, FileText, Info, Plus, Send, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, type PlaybookBody, type SeatRow, type TelegramIntegration } from '../../api';
import { useAuth } from '../../auth';
import { joyla, useT } from '../../i18n';
import { TanlovMenyu } from '../analitika/Ochiluvchi';
import { savolMatni } from '../anketa/savolMatni';
import { leadQualityYoz, tozaBody, voronkalarniOl, type CrmVoronka } from '../crm/crmMalumot';
import { HisobotNamunasi } from './HisobotNamunasi';
import { BOSH, hisobotniOl, QISMLAR, tanlanganlar, type HisobotSozlama, type Otish, type Qism } from './hisobotMalumot';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → KUNLIK HISOBOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ikki ekran: asosiy sozlamalar va «Hisobot tarkibi» (?tarkib=1).
 * Holat, chat ID va soat — haqiqiy server sozlamalari
 * (`reports/daily/settings`, soat butun). Qolganlari — playbook ichida
 * (hisobotMalumot.ts), server ularni hali ishlatmaydi va sahifa buni aytadi.
 */

type Server = { botUlangan: boolean; chat: string | null; soat: number };
const SOATLAR = Array.from({ length: 24 }, (_, h) => ({ qiymat: String(h), nom: `${String(h).padStart(2, '0')}:00` }));
const TILLAR = [
  { qiymat: 'uz', nom: "O'zbek tili" },
  { qiymat: 'en', nom: 'English' },
  { qiymat: 'ru', nom: 'Русский' },
];

/** Standart lid guruhlari — tarjima qilinadi; playbook bosqichlari nomi o'zgarishsiz. */
const STANDART_GURUH = ['Issiq', 'Iliq', 'Sovuq', 'Yaroqsiz lid'];

export function KunlikHisobotSozlama() {
  const t = useT();
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const p = business?.permissions ?? [];
  const integratsiya = p.includes('integration:manage');
  const playbookYoz = p.includes('playbook:write');
  const [params, setParams] = useSearchParams();
  const tarkib = params.get('tarkib') === '1';

  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [aslServer, setAslServer] = useState<Server | null>(null);
  const [holat, setHolat] = useState(false);
  const [chat, setChat] = useState('');
  const [soat, setSoat] = useState('9');
  const [asl, setAsl] = useState<HisobotSozlama>(BOSH);
  const [s, setS] = useState<HisobotSozlama>(BOSH);
  const [seatlar, setSeatlar] = useState<SeatRow[]>([]);
  const [band, setBand] = useState<'saqlash' | 'yuborish' | null>(null);
  const [xabar, setXabar] = useState<{ ton: 'ok' | 'xato'; matn: string } | null>(null);

  const yukla = useCallback(async () => {
    if (!base) return;
    const [pl, tg, st] = await Promise.all([
      api.get<PlaybookBody>(`${base}/playbook`).catch(() => null),
      api.get<TelegramIntegration>(`${base}/integrations/telegram`).catch(() => null),
      api.get<SeatRow[]>(`${base}/seats`).catch(() => [] as SeatRow[]),
    ]);
    const cfg = (tg?.integration?.config ?? {}) as { reportChatId?: string | null; reportHour?: number };
    const srv: Server = { botUlangan: !!tg?.connected, chat: cfg.reportChatId ?? null, soat: cfg.reportHour ?? 9 };
    const h = pl ? hisobotniOl(tozaBody(pl)) : BOSH;
    setPb(pl ? tozaBody(pl) : null);
    setAslServer(srv);
    setHolat(!!srv.chat);
    setChat(srv.chat ?? h.oxirgiChat ?? '');
    setSoat(String(srv.soat));
    setAsl(h);
    setS(h);
    setSeatlar(st.filter((x) => x.isActive));
  }, [base]);
  useEffect(() => void yukla(), [yukla]);

  // Tanlov manbalari — biznesning haqiqiy ma'lumotlari
  const katalog: CrmVoronka[] = useMemo(() => (pb ? voronkalarniOl(pb) : []), [pb]);
  const lidGuruhlari = useMemo(() => {
    const lq = (pb?.leadQuality ?? {}) as { rejim?: string; bosqichlar?: { nom: string }[] };
    return lq.rejim === 'bosqichli' && lq.bosqichlar?.length ? [...lq.bosqichlar.map((b) => b.nom), 'Yaroqsiz lid'] : ['Issiq', 'Iliq', 'Sovuq'];
  }, [pb]);
  const savollar = useMemo(() => (pb?.questionnaire.questions ?? []).map((q) => ({ id: q.id, nom: savolMatni(q.question) })), [pb]);

  const serverOzgargan =
    !!aslServer && (holat !== !!aslServer.chat || (holat && chat.trim() !== (aslServer.chat ?? '')) || Number(soat) !== aslServer.soat);
  const hisobotOzgargan = JSON.stringify(s) !== JSON.stringify(asl);
  const ozgargan = serverOzgargan || hisobotOzgargan;
  useEffect(() => {
    if (!ozgargan) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [ozgargan]);

  if (!aslServer) return <div className="card skelet" style={{ height: 520 }} aria-busy="true" />;

  const chatXato = holat && !/^-?\d{3,}$/.test(chat.trim()) ? t("Chat ID faqat raqamlardan iborat bo'lsin (guruhda -100 bilan boshlanadi)") : null;
  const daqiqaXato = s.vazifaEslatma.yoqilgan && !(Number.isInteger(s.vazifaEslatma.daqiqa) && s.vazifaEslatma.daqiqa >= 2 && s.vazifaEslatma.daqiqa <= 5);
  const bildir = (ton: 'ok' | 'xato', matn: string) => {
    setXabar({ ton, matn });
    if (ton === 'ok') setTimeout(() => setXabar((x) => (x?.matn === matn ? null : x)), 3500);
  };

  async function saqla() {
    if (chatXato || daqiqaXato) return;
    setBand('saqlash');
    setXabar(null);
    try {
      if (serverOzgargan) {
        if (!aslServer!.botUlangan) throw new Error(t('Avval Telegram botni ulang — hisobot shu bot orqali yuboriladi'));
        await api.put(`${base}/reports/daily/settings`, { reportChatId: holat ? chat.trim() : null, reportHour: Number(soat) });
      }
      // O'chirilganda chat ID yo'qolmasin — qayta yoqilganda tiklanadi
      const yangi: HisobotSozlama = { ...s, oxirgiChat: holat ? chat.trim() : aslServer!.chat ?? s.oxirgiChat ?? null };
      if (pb && (hisobotOzgargan || JSON.stringify(yangi) !== JSON.stringify(asl))) {
        const body = tozaBody(leadQualityYoz(pb, { hisobot: yangi }));
        const v = await api.post<{ valid: boolean; errors?: Record<string, string[]> }>(`${base}/playbook/validate`, body);
        if (!v.valid) throw new Error(Object.values(v.errors ?? {}).flat()[0] ?? t('Server tekshiruvi xato topdi'));
        await api.post(`${base}/playbook`, { ...body, changeNote: 'Kunlik hisobot sozlamalari yangilandi' });
      }
      await yukla();
      bildir('ok', t('Saqlandi'));
    } catch (e) {
      bildir('xato', e instanceof ApiError || e instanceof Error ? e.message : t('Saqlanmadi'));
    } finally {
      setBand(null);
    }
  }

  async function hozirYubor() {
    setBand('yuborish');
    try {
      const r = await api.post<{ sent: boolean; skipped?: string }>(`${base}/reports/daily/send`, {});
      bildir(r.sent ? 'ok' : 'xato', r.sent ? t('Hisobot hozir yuborildi — Telegram’ni tekshiring') : t('Yuborilmadi: {sabab}', { sabab: r.skipped ?? t('nomaʼlum sabab') }));
    } catch (e) {
      bildir('xato', e instanceof ApiError ? e.message : t('Yuborilmadi'));
    } finally {
      setBand(null);
    }
  }

  const ozgar = (o: Partial<HisobotSozlama>) => setS((x) => ({ ...x, ...o }));
  const ruxsatYoq = !integratsiya && !playbookYoz;

  const past = (
    <div className="kh-past">
      {xabar && (
        <span className={`ak-xabar ${xabar.ton}`} role={xabar.ton === 'xato' ? 'alert' : 'status'}>
          {xabar.ton === 'ok' ? <CircleCheck /> : <TriangleAlert />} {xabar.matn}
        </span>
      )}
      {!xabar && ozgargan && <span className="kr-holat">{t("Saqlanmagan o'zgarishlar bor")}</span>}
      {ozgargan && (
        <button type="button" className="btn ikkinchi" disabled={!!band} onClick={() => void yukla()}>
          {t('Bekor qilish')}
        </button>
      )}
      <button type="button" className="btn" disabled={!ozgargan || !!band || !!chatXato || daqiqaXato || ruxsatYoq} onClick={() => void saqla()}>
        {band === 'saqlash' ? t('Saqlanmoqda…') : t('Saqlash')}
      </button>
    </div>
  );

  // ─── Hisobot tarkibi ekrani ───
  if (tarkib)
    return (
      <HisobotTarkibi
        s={s}
        ozgar={ozgar}
        yozaOladi={playbookYoz}
        seatlar={seatlar}
        katalog={katalog}
        lidGuruhlari={lidGuruhlari}
        savollar={savollar}
        xizmatlar={pb?.classificationPolicy.serviceLines ?? []}
        onOrqaga={() => setParams((x) => (x.delete('tarkib'), x))}
        past={past}
      />
    );

  return (
    <section className="card kh-karta">
      <header className="kh-bosh">
        <h2>{t('Kunlik hisobot sozlamalari')}</h2>
        <p>{t('Har kuni avtomatik hisobot yuborishni sozlang.')}</p>
      </header>

      {!aslServer.botUlangan && (
        <div className="cn-info">
          <Info aria-hidden="true" />
          <span>
            {t('Telegram bot ulanmagan — hisobot bot orqali yuboriladi.')} <Link to="/sozlamalar?b=integratsiya">{t('Botni ulash')}</Link>
          </span>
        </div>
      )}

      <div className="kh-guruh">
        <div className="kh-guruh-nom">
          <Sparkles /> <b>{t('Yuborish va til')}</b>
        </div>
        <div className="kh-forma">
          <span className="ij-yorliq">{t('Holat')}</span>
          <label className="vr-almash ij-almash">
            <input type="checkbox" role="switch" aria-label={t('Kunlik hisobot holati')} checked={holat} disabled={!integratsiya} onChange={(e) => setHolat(e.target.checked)} />
            <span className="vr-almash-yol" aria-hidden="true" />
            <span className={holat ? 'ij-holat yoq' : 'ij-holat'}>{holat ? t('Yoqilgan') : t("O'chirilgan")}</span>
          </label>

          {holat && (
            <>
              <label className="ij-yorliq" htmlFor="kh-chat">
                {t('Qabul qiluvchi chat')}
              </label>
              <div>
                <input id="kh-chat" className="kh-input" value={chat} onChange={(e) => setChat(e.target.value.replace(/\s/g, ''))} placeholder="-1001234567890" disabled={!integratsiya} aria-invalid={!!chatXato} />
                <div className={`yordam${chatXato ? ' bzl-xato' : ''}`}>
                  {chatXato ?? (
                    <>
                      {joyla(t("Telegram guruh yoki shaxsiy chat ID. Guruhni bog'lash yo'riqnomasi — {havola} bo'limida."), {
                        havola: <Link to="/sozlamalar?b=bildirishnoma">{t('Bildirishnomalar')}</Link>,
                      })}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          <label className="ij-yorliq" htmlFor="kh-soat">
            {t('Yuborish vaqti')}
          </label>
          <div>
            <TanlovMenyu id="kh-soat" aria={t('Yuborish vaqti')} qiymat={soat} variantlar={SOATLAR} onOzgar={setSoat} kenglik={160} disabled={!integratsiya} />
            <div className="yordam">{t("Biznes vaqt zonasi bo'yicha. Server hisobotni soat boshida yuboradi.")}</div>
          </div>

          <label className="ij-yorliq" htmlFor="kh-til">
            {t('Hisobot tili')}
          </label>
          <div>
            <TanlovMenyu id="kh-til" aria={t('Hisobot tili')} qiymat={s.til} variantlar={TILLAR.map((v) => ({ ...v, nom: t(v.nom) }))} onOzgar={(v) => ozgar({ til: v as HisobotSozlama['til'] })} kenglik={480} disabled={!playbookYoz} />
            <div className="yordam">
              {t('Kunlik hisobot va Telegram xabari shu tilda yuboriladi.')}
              {s.til !== 'uz' && ` ${t("Hozircha server hisobotni o'zbek tilida yaratadi — tanlov saqlanadi va til qo'shilganda qo'llanadi.")}`}
            </div>
          </div>
        </div>
      </div>

      <div className="kh-guruh">
        <div className="kh-guruh-nom">
          <Bell /> <b>{t('Telegram vazifa bildirishnomalari')}</b>
        </div>
        <p className="kh-izoh">{t('Faqat Telegram botiga ulangan sotuv menejerlariga shaxsiy xabar yuboradi. Bu sozlamalar yuqoridagi kunlik hisobotdan mustaqil.')}</p>
        <label className="vr-almash ij-almash kh-almash">
          <input
            type="checkbox"
            role="switch"
            checked={s.vazifaEslatma.yoqilgan}
            disabled={!playbookYoz}
            onChange={(e) => ozgar({ vazifaEslatma: { ...s.vazifaEslatma, yoqilgan: e.target.checked } })}
          />
          <span className="vr-almash-yol" aria-hidden="true" />
          <b>{t('Vazifa muddati eslatmalari')}</b>
        </label>
        <p className="kh-izoh">{t("Kontakt, vazifa va oldingi tegishli qo'ng'iroq xulosasini «Qo'ng'iroq qilish» va «Bajarildi» amallari bilan yuboradi.")}</p>
        {s.vazifaEslatma.yoqilgan && (
          <div className="kh-qator">
            <label htmlFor="kh-daqiqa">{t('Muddatdan necha daqiqa oldin')}</label>
            <div>
              <input
                id="kh-daqiqa"
                className="kh-input kh-kichik"
                type="number"
                min={2}
                max={5}
                value={Number.isNaN(s.vazifaEslatma.daqiqa) ? '' : s.vazifaEslatma.daqiqa}
                disabled={!playbookYoz}
                aria-invalid={daqiqaXato}
                onChange={(e) => ozgar({ vazifaEslatma: { ...s.vazifaEslatma, daqiqa: e.target.value === '' ? NaN : Number(e.target.value) } })}
              />
              <div className={`yordam${daqiqaXato ? ' bzl-xato' : ''}`}>{t('2 dan 5 gacha butun son tanlang.')}</div>
            </div>
          </div>
        )}
        <hr className="kh-chiziq" />
        <label className="vr-almash ij-almash kh-almash">
          <input type="checkbox" role="switch" checked={s.ertalabki.yoqilgan} disabled={!playbookYoz} onChange={(e) => ozgar({ ertalabki: { yoqilgan: e.target.checked } })} />
          <span className="vr-almash-yol" aria-hidden="true" />
          <b>{t('Ertalabki vazifalar qisqacha hisoboti')}</b>
        </label>
        <p className="kh-izoh">{t('Har bir ish kuni lidlar va vazifalar soni hamda eng yaqin beshta ochiq vazifani yuboradi.')}</p>
        {s.ertalabki.yoqilgan && (
          <div className="kh-moviy">
            {t("Menejerning ish kuni boshlanishidan 5 daqiqa oldin yuboriladi. Ish vaqti «Ish jadvali» bo'limidan olinadi: alohida menejer jadvali yoqilgan bo'lsa — menejerniki, aks holda biznesniki.")}
          </div>
        )}
        <div className="kh-server">
          <Info /> {t("Bu ikki xabarni yuboruvchi xizmat serverda hali yo'q — sozlamalar saqlanadi va xizmat qo'shilganda shu qiymatlar bilan ishlaydi.")}
        </div>
      </div>

      <div className="kh-guruh kh-tarkib-karta">
        <div>
          <div className="kh-guruh-nom">
            <FileText /> <b>{t('Hisobot tarkibi sozlamalari')}</b>
          </div>
          <p className="kh-izoh">
            {t("Yuborish sozlamalarini band qilmasdan, hisobot qismlari, kiritiladigan menejerlar, CRM voronkalari, lid sifati guruhlari, anketa javoblari va bosqich o'tishlarini alohida ekranda tanlang.")}
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setParams((x) => (x.set('tarkib', '1'), x))}>
          {t('Hisobot tarkibini sozlash')} <ArrowRight />
        </button>
      </div>

      <div className="kh-amallar">
        {integratsiya && aslServer.chat && (
          <button type="button" className="btn ikkinchi" disabled={!!band || serverOzgargan} title={serverOzgargan ? t('Avval saqlang') : undefined} onClick={() => void hozirYubor()}>
            <Send /> {band === 'yuborish' ? t('Yuborilmoqda…') : t('Sinov uchun hozir yuborish')}
          </button>
        )}
        {past}
      </div>
    </section>
  );
}

// ─── Hisobot tarkibi ekrani ─────────────────────────────────────────────────

type Tanlov = { tur: 'menejerlar' | 'voronkalar' | 'lidGuruhlar' | 'savollar' } | { tur: 'otishlar' } | null;

function HisobotTarkibi({
  s,
  ozgar,
  yozaOladi,
  seatlar,
  katalog,
  lidGuruhlari,
  savollar,
  xizmatlar,
  onOrqaga,
  past,
}: {
  s: HisobotSozlama;
  ozgar: (o: Partial<HisobotSozlama>) => void;
  yozaOladi: boolean;
  seatlar: SeatRow[];
  katalog: CrmVoronka[];
  lidGuruhlari: string[];
  savollar: { id: string; nom: string }[];
  xizmatlar: string[];
  onOrqaga: () => void;
  past: ReactNode;
}) {
  const t = useT();
  const [tanlov, setTanlov] = useState<Tanlov>(null);
  const manbalar = {
    menejerlar: { sarlavha: t('Menejerlarni tanlash'), tugma: t('Menejerlarni tanlash'), items: seatlar.map((x) => ({ id: x.id, nom: x.displayName })) },
    voronkalar: { sarlavha: t('Voronkalarni tanlash'), tugma: t('Voronkalarni tanlash'), items: katalog.map((v) => ({ id: v.nom, nom: v.nom })) },
    lidGuruhlar: {
      sarlavha: t('Lid sifati guruhlarini tanlash'),
      tugma: t('Lid sifati guruhlarini tanlash'),
      items: lidGuruhlari.map((g) => ({ id: g, nom: STANDART_GURUH.includes(g) ? t(g) : g })),
    },
    savollar: { sarlavha: t('Anketa savollarini tanlash'), tugma: t('Savollarni tanlash'), items: savollar },
  } as const;
  const tanlovQismi: Partial<Record<Qism, keyof typeof manbalar>> = { menejerlar: 'menejerlar', lidlar: 'voronkalar', lidSifati: 'lidGuruhlar', anketa: 'savollar' };
  const soni = (k: keyof typeof manbalar) => {
    const ids = manbalar[k].items.map((i) => i.id);
    return t('{n}/{jami} tanlangan', { n: tanlanganlar(s[k], ids).length, jami: ids.length });
  };
  const nomlar = (k: keyof typeof manbalar) => {
    const ids = tanlanganlar(s[k], manbalar[k].items.map((i) => i.id));
    return manbalar[k].items.filter((i) => ids.includes(i.id)).map((i) => i.nom);
  };

  return (
    <section className="card kh-karta">
      <button type="button" className="kh-orqaga" onClick={onOrqaga}>
        <ArrowLeft /> {t('Kunlik hisobot sozlamalariga qaytish')}
      </button>
      <header className="kh-bosh">
        <h2>{t('Kunlik hisobot tarkibi')}</h2>
        <p>{t("Yaratiladigan kunlik hisobotga qaysi bo'limlar, menejerlar, CRM voronkalari, lid sifati guruhlari, anketa javoblari va bosqich o'tishlari kirishini tanlang.")}</p>
      </header>
      <div className="kh-server">
        <Info /> {t("Server hozircha kunlik hisobotni qat'iy shablonda yaratadi. Tanlangan tarkib saqlanadi va shablon kengaytirilganda shu bo'yicha qo'llanadi.")}
      </div>

      <div className="kh-ikki">
        <div className="kh-guruh">
          <div className="kh-guruh-nom">
            <FileText /> <b>{t('Hisobot qismlari')}</b>
          </div>
          <p className="kh-izoh">{t('Rahbarlar va sotuvchilar uchun kunlik hisobotga qaysi qismlar kirishini tanlang.')}</p>
          <ul className="kh-qismlar">
            {QISMLAR.map((q) => {
              const tq = tanlovQismi[q.k];
              return (
                <li key={q.k}>
                  <div className="kh-qism-bosh">
                    <div>
                      <b>{t(q.nom)}</b>
                      <p>{t(q.izoh)}</p>
                    </div>
                    <label className="vr-almash ij-almash">
                      <input type="checkbox" role="switch" aria-label={t(q.nom)} checked={s.qismlar[q.k]} disabled={!yozaOladi} onChange={(e) => ozgar({ qismlar: { ...s.qismlar, [q.k]: e.target.checked } })} />
                      <span className="vr-almash-yol" aria-hidden="true" />
                      <span className={s.qismlar[q.k] ? 'ij-holat yoq' : 'ij-holat'}>{s.qismlar[q.k] ? t('Yoqilgan') : t("O'chirilgan")}</span>
                    </label>
                  </div>
                  {tq && s.qismlar[q.k] && (
                    <div className="kh-tanlov">
                      <span className="ak-pill">{soni(tq)}</span>
                      <button type="button" className="btn ikkinchi" disabled={!yozaOladi || manbalar[tq].items.length === 0} title={manbalar[tq].items.length === 0 ? t("Tanlash uchun ma'lumot yo'q") : undefined} onClick={() => setTanlov({ tur: tq })}>
                        {manbalar[tq].tugma}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            <li>
              <div className="kh-qism-bosh">
                <div>
                  <b className="kh-otish-nom">
                    <FileText /> {t('Voronka bosqichlari harakati')}
                  </b>
                  <p>{t("Hisobotda alohida ko'rinishi kerak bo'lgan CRM bosqich o'tishlarini tanlang: qaysi menejer, qaysi voronka va qaysi bosqichdan qaysi bosqichga.")}</p>
                </div>
                <button type="button" className="btn ikkinchi" disabled={!yozaOladi} onClick={() => setTanlov({ tur: 'otishlar' })}>
                  {t('Sozlash')}
                </button>
              </div>
              {s.otishlar.length === 0 ? (
                <p className="kh-izoh">{t("Hali bosqich o'tishi qoidasi qo'shilmagan.")}</p>
              ) : (
                <ul className="kh-otishlar">
                  {s.otishlar.map((o) => (
                    <li key={o.id}>
                      {o.voronka}: {o.dan} → {o.ga}
                      <small>{o.menejer === '*' ? t('barcha menejerlar') : seatlar.find((x) => x.id === o.menejer)?.displayName ?? t('menejer')}</small>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>
        </div>

        <HisobotNamunasi
          s={s}
          menejerlar={nomlar('menejerlar')}
          voronkalar={nomlar('voronkalar')}
          lidGuruhlar={nomlar('lidGuruhlar')}
          xizmatlar={xizmatlar}
          savollar={nomlar('savollar')}
        />
      </div>
      <div className="kh-amallar">{past}</div>

      {tanlov && tanlov.tur !== 'otishlar' && (
        <TanlashOynasi
          sarlavha={manbalar[tanlov.tur].sarlavha}
          items={[...manbalar[tanlov.tur].items]}
          tanlov={s[tanlov.tur]}
          onYop={() => setTanlov(null)}
          onSaqla={(v) => {
            ozgar({ [tanlov.tur]: v } as Partial<HisobotSozlama>);
            setTanlov(null);
          }}
        />
      )}
      {tanlov?.tur === 'otishlar' && (
        <OtishlarOynasi
          otishlar={s.otishlar}
          seatlar={seatlar}
          katalog={katalog}
          onYop={() => setTanlov(null)}
          onSaqla={(o) => {
            ozgar({ otishlar: o });
            setTanlov(null);
          }}
        />
      )}
    </section>
  );
}

// ─── Modallar ───────────────────────────────────────────────────────────────

function Modal({ sarlavha, onYop, children }: { sarlavha: string; onYop: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYop]);
  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <div className="vr-oyna xy-oyna" role="dialog" aria-modal="true" aria-labelledby="kh-oyna-nom">
        <div className="vr-oyna-bosh">
          <h3 id="kh-oyna-nom">{sarlavha}</h3>
          <button type="button" className="mj-yop" onClick={onYop} aria-label={t('Yopish')}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function TanlashOynasi({
  sarlavha,
  items,
  tanlov,
  onYop,
  onSaqla,
}: {
  sarlavha: string;
  items: { id: string; nom: string }[];
  tanlov: string[] | null;
  onYop: () => void;
  onSaqla: (v: string[] | null) => void;
}) {
  const t = useT();
  const ids = items.map((i) => i.id);
  const [hammasi, setHammasi] = useState(tanlov === null);
  const [belgilar, setBelgilar] = useState<string[]>(tanlanganlar(tanlov, ids));
  const tanlangan = hammasi ? ids : belgilar;
  return (
    <Modal sarlavha={sarlavha} onYop={onYop}>
      <label className="kh-hammasi">
        <input type="checkbox" checked={hammasi} onChange={(e) => (setHammasi(e.target.checked), e.target.checked && setBelgilar(ids))} />
        <span>
          <b>{t('Hammasi')}</b>
          <small>{t("Keyin qo'shiladiganlari ham avtomatik kiradi")}</small>
        </span>
      </label>
      <ul className="kh-belgilar">
        {items.map((i) => (
          <li key={i.id}>
            <label>
              <input
                type="checkbox"
                checked={tanlangan.includes(i.id)}
                onChange={(e) => {
                  setHammasi(false);
                  setBelgilar((b) => (e.target.checked ? [...(hammasi ? ids : b), i.id].filter((x, k, a) => a.indexOf(x) === k) : (hammasi ? ids : b).filter((x) => x !== i.id)));
                }}
              />
              <span>{i.nom}</span>
            </label>
          </li>
        ))}
      </ul>
      {!hammasi && belgilar.length === 0 && <div className="yordam bm-ogoh">{t("Hech narsa tanlanmagan — bu qism hisobotda bo'sh bo'ladi.")}</div>}
      <div className="vr-oyna-past">
        <span className="kh-soni">
          {t('{n}/{jami} tanlangan', { n: tanlangan.length, jami: ids.length })}
        </span>
        <button type="button" className="btn ikkinchi" onClick={onYop}>
          {t('Bekor qilish')}
        </button>
        <button type="button" className="btn" onClick={() => onSaqla(hammasi ? null : belgilar)}>
          <Check /> {t('Tayyor')}
        </button>
      </div>
    </Modal>
  );
}

function OtishlarOynasi({
  otishlar,
  seatlar,
  katalog,
  onYop,
  onSaqla,
}: {
  otishlar: Otish[];
  seatlar: SeatRow[];
  katalog: CrmVoronka[];
  onYop: () => void;
  onSaqla: (o: Otish[]) => void;
}) {
  const t = useT();
  const [royxat, setRoyxat] = useState(otishlar);
  const [menejer, setMenejer] = useState('*');
  const [voronka, setVoronka] = useState(katalog[0]?.nom ?? '');
  const bosqichlar = katalog.find((v) => v.nom === voronka)?.bosqichlar ?? [];
  const [dan, setDan] = useState(bosqichlar[0] ?? '');
  const [ga, setGa] = useState(bosqichlar[1] ?? '');
  const xato = !voronka
    ? t("Avval «Faol CRM voronkalari»da voronka qo'shing")
    : !dan || !ga
      ? t('Bosqichlarni tanlang')
      : dan === ga
        ? t("«Qaysi bosqichdan» va «qaysi bosqichga» bir xil bo'lmasin")
        : royxat.some((o) => o.menejer === menejer && o.voronka === voronka && o.dan === dan && o.ga === ga)
          ? t("Bu qoida allaqachon qo'shilgan")
          : null;
  const v = (a: string[]) => a.map((x) => ({ qiymat: x, nom: x }));

  return (
    <Modal sarlavha={t('Voronka bosqichlari harakati')} onYop={onYop}>
      {royxat.length === 0 ? (
        <div className="cn-bosh-holat">{t("Hali qoida yo'q.")}</div>
      ) : (
        <ul className="cn-royxat">
          {royxat.map((o) => (
            <li key={o.id}>
              <span className="cn-nuqta" aria-hidden="true" />
              <div>
                <small>
                  {o.voronka} · {o.menejer === '*' ? t('barcha menejerlar') : seatlar.find((x) => x.id === o.menejer)?.displayName ?? t('menejer')}
                </small>
                <b>
                  {o.dan} → {o.ga}
                </b>
              </div>
              <button type="button" className="bm-ikon xavf" aria-label={t("Qoidani o'chirish")} onClick={() => setRoyxat((r) => r.filter((x) => x.id !== o.id))}>
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cn-forma">
        <div className="cn-forma-panjara">
          <div className="maydon-blok">
            <label htmlFor="kh-o-men">{t('Menejer')}</label>
            <TanlovMenyu id="kh-o-men" aria={t('Menejer')} qiymat={menejer} variantlar={[{ qiymat: '*', nom: t('Barcha menejerlar') }, ...seatlar.map((x) => ({ qiymat: x.id, nom: x.displayName }))]} onOzgar={setMenejer} kenglik="100%" />
          </div>
          <div className="maydon-blok">
            <label htmlFor="kh-o-vor">{t('Voronka')}</label>
            <TanlovMenyu
              id="kh-o-vor"
              aria={t('Voronka')}
              qiymat={voronka}
              variantlar={v(katalog.map((x) => x.nom))}
              onOzgar={(x) => {
                setVoronka(x);
                const b = katalog.find((k) => k.nom === x)?.bosqichlar ?? [];
                setDan(b[0] ?? '');
                setGa(b[1] ?? '');
              }}
              kenglik="100%"
              disabled={katalog.length === 0}
            />
          </div>
          <div className="maydon-blok">
            <label htmlFor="kh-o-dan">{t('Qaysi bosqichdan')}</label>
            <TanlovMenyu id="kh-o-dan" aria={t('Qaysi bosqichdan')} qiymat={dan} variantlar={v(bosqichlar)} onOzgar={setDan} kenglik="100%" disabled={!bosqichlar.length} />
          </div>
          <div className="maydon-blok">
            <label htmlFor="kh-o-ga">{t('Qaysi bosqichga')}</label>
            <TanlovMenyu id="kh-o-ga" aria={t('Qaysi bosqichga')} qiymat={ga} variantlar={v(bosqichlar)} onOzgar={setGa} kenglik="100%" disabled={!bosqichlar.length} />
          </div>
        </div>
        {xato && <div className="yordam bzl-xato">{xato}</div>}
        <div className="cn-forma-past">
          <button
            type="button"
            className="btn"
            disabled={!!xato}
            onClick={() => setRoyxat((r) => [...r, { id: `o_${Date.now().toString(36)}`, menejer, voronka, dan, ga }])}
          >
            <Plus /> {t("Qoida qo'shish")}
          </button>
        </div>
      </div>
      <div className="vr-oyna-past">
        <button type="button" className="btn ikkinchi" onClick={onYop}>
          {t('Bekor qilish')}
        </button>
        <button type="button" className="btn" onClick={() => onSaqla(royxat)}>
          <Check /> {t('Tayyor')}
        </button>
      </div>
    </Modal>
  );
}
