import { ArrowLeft, Check, FileText, Hand, Link2, Phone, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtSoniya } from '../../api';
import { useCrm } from '../../crm/malumot';
import { useT } from '../../i18n';
import { sanaVaqt } from './Bitimlar';
import { TARMOQ_BELGISI, type Kanal } from './IjtimoiyTarmoqlar';
import { avatarManzili, AvatarRasmi, boshHarflar } from './MurojaatAvatar';
import { QabulOyna, type Murojaat } from './Saralanmagan';
import './murojaat-karta.css';

interface ChatXabari {
  id: string;
  dir: 'in' | 'out';
  text: string;
  at: string;
  by?: string | null;
}

type MurojaatTafsil = Omit<Murojaat, 'payload'> & {
  payload: Murojaat['payload'] & {
    startParam?: string;
    leadForm?: string | null;
    adName?: string | null;
    campaignName?: string | null;
  };
  pipelineId: string | null;
  pipelineName: string | null;
  accountName: string | null;
  contact: { id: string; name: string | null; phone: string | null; email: string | null } | null;
  chat: ChatXabari[];
  canReply: boolean;
  replyNote: string | null;
};

const TARMOQ_NOMI: Record<Kanal, string> = { facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram' };
const tarmoqmi = (s: string): s is Kanal => s in TARMOQ_NOMI;
const MANBA_NOMI: Record<string, string> = { call: "Qo'ng'iroq", form: 'Veb-forma', manual: "Qo'lda kiritilgan", ...TARMOQ_NOMI };
/** Yangi xabarlar shu oraliqda tekshiriladi (oyna ochiq va sahifa ko'rinib turganda). */
const YANGILASH_MS = 10_000;

function ManbaIkoni({ source }: { source: string }) {
  if (tarmoqmi(source)) {
    const B = TARMOQ_BELGISI[source];
    return <B />;
  }
  return source === 'call' ? <Phone aria-hidden="true" /> : source === 'form' ? <FileText aria-hidden="true" /> : <Hand aria-hidden="true" />;
}

/**
 * MUROJAAT OYNASI — amoCRM "Неразобранное" kartasi namunasida (Dill Mind dizayni).
 * "Saralanmagan"dagi murojaat bosilganda ochiladi:
 *   • chapda — manba, voronka, kontakt (profil rasmi, hisob nomi), pastda
 *     "Qabul qilish", "Bog'lash", "Rad etish";
 *   • o'ngda — chat: mijoz xabarlari, bot va sahifa javoblari, menejer javoblari;
 *     pastda yozish maydoni — javob mijozga o'sha tarmoqda boradi.
 */
export function MurojaatKarta() {
  const { id } = useParams<{ id: string }>();
  const { base, yangila } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [m, setM] = useState<MurojaatTafsil | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [qabul, setQabul] = useState<'yangi' | 'boglash' | null>(null);
  const [band, setBand] = useState(false);

  const yukla = useCallback(async () => {
    try {
      setM(await api.get<MurojaatTafsil>(`${base}/crm-app/inbox/${id}`));
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, id, t]);

  useEffect(() => {
    setM(null);
    void yukla();
  }, [yukla]);

  // Mijoz yangi yozsa, oyna o'zi yangilanadi
  const kuzatish = Boolean(m && tarmoqmi(m.source) && m.payload.type === 'message');
  useEffect(() => {
    if (!kuzatish) return;
    const taymer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void yukla();
    }, YANGILASH_MS);
    return () => window.clearInterval(taymer);
  }, [kuzatish, yukla]);

  const orqaga = () => navigate(m?.pipelineId ? `/crm/bitimlar?v=${m.pipelineId}` : '/crm/bitimlar');

  const rad = async () => {
    if (!m) return;
    setBand(true);
    try {
      await api.post(`${base}/crm-app/inbox/${m.id}/reject`, {});
      void yangila();
      orqaga();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  if (!m) {
    return <div className="ci-sahifa">{xato ? <div className="card xato-qator">{xato}</div> : <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>}</div>;
  }

  const nom = m.contactName ?? m.name ?? m.payload.username ?? m.phone ?? t('Murojaat');
  const avatar = avatarManzili(base, m);
  const manba = tarmoqmi(m.source) ? TARMOQ_NOMI[m.source] : t(MANBA_NOMI[m.source] ?? m.source);
  const kutilmoqda = m.status === 'pending';
  const tel = m.contact?.phone ?? m.phone;
  const email = m.contact?.email ?? m.email;
  const formaJavoblari = Object.entries(m.payload.values ?? {});

  return (
    <div className="ci-sahifa mrj">
      <header className="mrj-bosh">
        <button type="button" className="ms-ikon-tugma" onClick={orqaga} aria-label={t('Orqaga')} title={t('Orqaga')}>
          <ArrowLeft />
        </button>
        <div className="mrj-sarlavha">
          <h1>{nom}</h1>
          <p>
            <span className={`mrj-holat ${m.status}`}>{kutilmoqda ? t('Saralanmagan') : m.status === 'accepted' ? t('Qabul qilingan') : t('Rad etilgan')}</span>
            {m.pipelineName && <span>{m.pipelineName}</span>}
            <time dateTime={m.createdAt}>{sanaVaqt(m.createdAt)}</time>
          </p>
        </div>
      </header>

      {xato && (
        <div className="card xato-qator" role="alert">
          {xato}
        </div>
      )}

      <div className="mrj-ish">
        <aside className="mrj-chap">
          <div className="mrj-chap-ichi">
            <section className="mrj-blok mrj-kontakt">
              <div className="mrj-kontakt-bosh">
                <span className="mrj-avatar" aria-hidden="true">
                  <AvatarRasmi src={avatar} harflar={boshHarflar(nom)} />
                  <span className={`mrj-belgi ${m.source}`}>
                    <ManbaIkoni source={m.source} />
                  </span>
                </span>
                <div className="mrj-kontakt-nom">
                  <b>{m.contact?.name ?? nom}</b>
                  {m.payload.username && m.payload.username !== nom && <span>{m.payload.username}</span>}
                  <span className={`mrj-hisob ${m.source}`}>
                    <ManbaIkoni source={m.source} />
                    {m.accountName ?? manba}
                  </span>
                </div>
              </div>
              <dl className="mrj-qatorlar">
                <div>
                  <dt>{t('Telefon')}</dt>
                  <dd>{tel ? <a href={`tel:${tel}`}>{tel}</a> : '…'}</dd>
                </div>
                <div>
                  <dt>{t('Email')}</dt>
                  <dd>{email ? <a href={`mailto:${email}`}>{email}</a> : '…'}</dd>
                </div>
              </dl>
              {m.contactId && (
                <Link to={`/crm/kontaktlar/${m.contactId}`} className="ci-havola">
                  {t('Kontakt kartasi')}
                </Link>
              )}
            </section>

            <section className="mrj-blok">
              <h2>{t('Murojaat')}</h2>
              <dl className="mrj-qatorlar">
                <div>
                  <dt>{t('Manba')}</dt>
                  <dd>
                    {manba}
                    {m.payload.type === 'lead_ad' && ` · ${t('reklama formasi')}`}
                  </dd>
                </div>
                <div>
                  <dt>{t('Voronka')}</dt>
                  <dd>{m.pipelineName ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('Kelgan')}</dt>
                  <dd>{sanaVaqt(m.createdAt)}</dd>
                </div>
                {m.payload.startParam && (
                  <div>
                    <dt>{t('Havola belgisi')}</dt>
                    <dd>{m.payload.startParam}</dd>
                  </div>
                )}
                {m.payload.leadForm && (
                  <div>
                    <dt>{t('Forma')}</dt>
                    <dd>{m.payload.leadForm}</dd>
                  </div>
                )}
                {(m.payload.campaignName || m.payload.adName) && (
                  <div>
                    <dt>{t('Reklama')}</dt>
                    <dd>{[m.payload.campaignName, m.payload.adName].filter(Boolean).join(' / ')}</dd>
                  </div>
                )}
                {m.formName && (
                  <div>
                    <dt>{t('Veb-forma')}</dt>
                    <dd>{m.formName}</dd>
                  </div>
                )}
              </dl>
            </section>

            {formaJavoblari.length > 0 && (
              <section className="mrj-blok">
                <h2>{t('Forma javoblari')}</h2>
                <dl className="mrj-qatorlar ustma">
                  {formaJavoblari.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>

          <footer className="mrj-amallar">
            {kutilmoqda ? (
              <>
                <button type="button" className="mrj-amal qabul" disabled={band} onClick={() => setQabul('yangi')}>
                  <Check aria-hidden="true" /> {t('Qabul qilish')}
                </button>
                {m.openDeals > 0 && (
                  <button type="button" className="mrj-amal" disabled={band} onClick={() => setQabul('boglash')}>
                    <Link2 aria-hidden="true" /> {t('Bog‘lash')}
                  </button>
                )}
                <button type="button" className="mrj-amal rad" disabled={band} onClick={() => void rad()}>
                  <X aria-hidden="true" /> {t('Rad etish')}
                </button>
              </>
            ) : m.dealId ? (
              <Link to={`/crm/bitimlar/${m.dealId}`} className="ci-havola">
                {t('Bitim: {n}', { n: m.dealName ?? '—' })}
              </Link>
            ) : (
              <span className="yordam">{t('Rad etilgan')}</span>
            )}
          </footer>
        </aside>

        <Chat m={m} nom={nom} avatar={avatar} manba={manba} onYuborildi={(x) => setM((eski) => (eski ? { ...eski, chat: [...eski.chat.filter((c) => c.id !== x.id), x] } : eski))} />
      </div>

      {qabul && (
        <QabulOyna
          m={m}
          boshRejim={qabul}
          onYop={() => setQabul(null)}
          onTugadi={() => {
            setQabul(null);
            void yangila();
          }}
        />
      )}
    </div>
  );
}

function Chat({
  m,
  nom,
  avatar,
  manba,
  onYuborildi,
}: {
  m: MurojaatTafsil;
  nom: string;
  avatar: string | null;
  manba: string;
  onYuborildi: (x: ChatXabari) => void;
}) {
  const { base } = useCrm();
  const t = useT();
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const pastRef = useRef<HTMLDivElement>(null);

  // Yangi xabar kelganda pastga
  const oxirgi = m.chat[m.chat.length - 1]?.id;
  useEffect(() => {
    const el = pastRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [oxirgi]);

  const yubor = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = matn.trim();
    if (!text || band) return;
    setBand(true);
    setXato(null);
    try {
      const r = await api.post<{ message: ChatXabari }>(`${base}/crm-app/inbox/${m.id}/reply`, { text });
      onYuborildi(r.message);
      setMatn('');
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t('Xabar yuborilmadi'));
    } finally {
      setBand(false);
    }
  };

  // Enter — yuborish, Shift+Enter — yangi qator
  const tugma = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void yubor();
    }
  };

  const tarmoq = tarmoqmi(m.source) && m.payload.type === 'message';
  return (
    <section className="mrj-chat" aria-label={t('Yozishma')}>
      <header className="mrj-chat-bosh">
        <span className={`mrj-hisob ${m.source}`}>
          <ManbaIkoni source={m.source} />
          {m.accountName ?? manba}
        </span>
      </header>

      <div className="mrj-xabarlar" ref={pastRef}>
        {m.source === 'call' && (
          <div className="mrj-qongiroq">
            <Phone aria-hidden="true" />
            <span>
              {[m.payload.seatName, fmtSoniya(m.payload.durationSeconds ?? null)].filter(Boolean).join(' · ') || t("Qo'ng'iroq")}
            </span>
            {m.payload.score !== null && m.payload.score !== undefined && <span className={`ball ${ballKlass(m.payload.score)}`}>{Math.round(m.payload.score)}</span>}
            {m.conversationId && (
              <Link to={`/suhbatlar/${m.conversationId}`} className="ci-havola">
                {t('Suhbatni ochish')}
              </Link>
            )}
          </div>
        )}
        {!tarmoq && m.message && <p className="mrj-matn">{m.message}</p>}
        {tarmoq && m.chat.length === 0 && <p className="mrj-bosh-holat">{t("Mijoz botni ishga tushirdi, hali xabar yozmagan.")}</p>}
        {tarmoq &&
          m.chat.map((x) =>
            x.dir === 'in' ? (
              <div key={x.id} className="mrj-xabar kirgan">
                <span className="mrj-avatar kichik" aria-hidden="true">
                  <AvatarRasmi src={avatar} harflar={boshHarflar(nom)} />
                </span>
                <div className="mrj-pufak">
                  <div className="mrj-meta">
                    <time dateTime={x.at}>{sanaVaqt(x.at)}</time> {nom}
                  </div>
                  <p>{x.text}</p>
                </div>
              </div>
            ) : (
              <div key={x.id} className="mrj-xabar chiqqan">
                <div className="mrj-pufak">
                  <div className="mrj-meta">
                    <time dateTime={x.at}>{sanaVaqt(x.at)}</time> {x.by ? t(x.by) : (m.accountName ?? manba)}
                  </div>
                  <p>{x.text}</p>
                </div>
              </div>
            ),
          )}
      </div>

      {m.canReply ? (
        <form className="mrj-yozish" onSubmit={(e) => void yubor(e)}>
          <textarea
            value={matn}
            rows={2}
            maxLength={4000}
            placeholder={t('Javob yozing — mijozga {t} orqali boradi', { t: manba })}
            aria-label={t('Javob matni')}
            onChange={(e) => setMatn(e.target.value)}
            onKeyDown={tugma}
          />
          <button type="submit" className="btn" disabled={band || !matn.trim()}>
            <Send aria-hidden="true" /> {band ? t('Yuborilmoqda…') : t('Yuborish')}
          </button>
          {xato && (
            <div className="xato-qator mrj-yozish-xato" role="alert">
              {xato}
            </div>
          )}
        </form>
      ) : (
        m.replyNote && <p className="mrj-eslatma">{t(m.replyNote)}</p>
      )}
    </section>
  );
}
