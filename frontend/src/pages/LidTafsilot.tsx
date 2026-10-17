import { AlertTriangle, ArrowLeft, CheckCircle2, ListChecks, MessageSquare, MessagesSquare, Phone, StickyNote } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, lidTuri, type ConversationDetail, type TaskRow } from '../api';
import { useAuth } from '../auth';
import { tarjima, useT } from '../i18n';
import { davomiylik, davomiylikMatn } from '../components/bosh/malumot';
import { tafsilotOl } from '../components/tafsilotKesh';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID TAFSILOTLARI — bitta mijoz bilan butun tarix bir sahifada
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kirish nuqtasi — suhbat ID'si (vazifa, lid ro'yxati shu orqali bog'lanadi).
 * Shu suhbatdagi kontakt bilan oldingi suhbatlar, kelishuvlar, vazifalar va
 * rahbar izohlari sana bo'yicha xronologiyaga yig'iladi.
 *
 * CRM bosqichlari (voronka) backendda yo'q — shuning uchun xronologiya
 * SotuvAI ko'rgan voqealardan iborat.
 */

const LID_NOMI = { hot: 'Issiq lid', warm: 'Iliq lid', cold: 'Sovuq lid' } as const;
const OCHIQ = new Set(['pending', 'in_progress', 'blocked']);
const OYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const kunMatn = (t: number) => {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};
const soatMatn = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const muddatMatn = (iso: string) => {
  const d = new Date(iso);
  return `${tarjima(`{kun} ${OYLAR[d.getMonth()]}`, { kun: d.getDate() })}, ${soatMatn(d.getTime())}`;
};

type Tur = 'suhbat' | 'qongiroq' | 'kelishuv' | 'vazifa' | 'bajarildi' | 'izoh';
interface Voqea {
  vaqt: number;
  tur: Tur;
  sarlavha: string;
  matn?: string;
  chiplar?: string[];
  havola?: { nom: string; url: string };
}

export function LidTafsilot() {
  const { id } = useParams<{ id: string }>();
  const { business } = useAuth();
  const navigate = useNavigate();
  const tr = useT();
  const [asosiy, setAsosiy] = useState<ConversationDetail | null>(null);
  const [oldingilar, setOldingilar] = useState<ConversationDetail[]>([]);
  const [vazifalar, setVazifalar] = useState<TaskRow[]>([]);
  const [xato, setXato] = useState(false);

  const biz = business ? `/api/v1/businesses/${business.businessId}` : '';

  useEffect(() => {
    if (!biz || !id) return;
    let bekor = false;
    setXato(false);
    void (async () => {
      try {
        const d = await tafsilotOl(biz, id);
        if (bekor) return;
        setAsosiy(d);
        // Shu kontakt bilan oldingi suhbatlar tafsiloti (xronologiya uchun, 10 tagacha)
        const old = await Promise.all(d.previousConversations.slice(0, 10).map((p) => tafsilotOl(biz, p.id).catch(() => null)));
        if (!bekor) setOldingilar(old.filter((x): x is ConversationDetail => !!x));
        // Vazifalar — holat bo'yicha (ro'yxat API'sida sahifalash yo'q)
        const holatlar = ['pending', 'in_progress', 'blocked', 'done', 'cancelled'];
        const qism = await Promise.all(
          holatlar.map((h) => api.get<{ tasks: TaskRow[] }>(`${biz}/tasks?limit=200&status=${h}`).then((r) => r.tasks).catch(() => [] as TaskRow[])),
        );
        if (!bekor) setVazifalar(qism.flat());
      } catch {
        if (!bekor) setXato(true);
      }
    })();
    return () => {
      bekor = true;
    };
  }, [biz, id]);

  const suhbatlar = useMemo(() => (asosiy ? [asosiy, ...oldingilar] : []), [asosiy, oldingilar]);
  const suhbatIdlar = useMemo(() => new Set(suhbatlar.map((s) => s.conversation.id)), [suhbatlar]);
  const lidVazifalari = vazifalar.filter((t) => t.conversationId && suhbatIdlar.has(t.conversationId));

  const voqealar = useMemo<Voqea[]>(() => {
    const v: Voqea[] = [];
    for (const s of suhbatlar) {
      const c = s.conversation;
      const t = new Date(c.startedAt).getTime();
      const ovozli = !!c.mediaUrl || c.channel === 'phone';
      const javobsiz = s.analysis?.dynamics?.needsReply === true;
      const ball = s.analysis?.overallScore == null ? null : Math.round(Number(s.analysis.overallScore));
      v.push({
        vaqt: t,
        tur: ovozli ? 'qongiroq' : 'suhbat',
        sarlavha: ovozli ? tr("Qo'ng'iroq") : c.channel === 'telegram' ? tr('Telegram suhbati') : tr('Suhbat'),
        matn: s.analysis?.summary ?? c.summary ?? undefined,
        chiplar: [
          c.managerName ?? tr('Menejer'),
          davomiylikMatn(c.durationSeconds ?? davomiylik(c)),
          c.status === 'filtered' ? tr("Bog'lana olmadi") : javobsiz ? tr('Javob kutmoqda') : tr('Javob berilgan'),
          ...(ball !== null ? [tr('Sifat {ball}%', { ball })] : []),
        ],
        havola: { nom: ovozli ? tr("Qo'ng'iroq tafsilotlari") : tr('Suhbat tafsilotlari'), url: `/suhbatlar/${c.id}` },
      });
      for (const k of s.commitments) {
        v.push({
          vaqt: t + 1,
          tur: 'kelishuv',
          sarlavha: k.byParty === 'manager' ? tr('Kelishuv (menejer)') : tr('Kelishuv (mijoz)'),
          matn: k.what,
          chiplar: [
            k.status === 'done' ? tr('Bajarildi') : k.status === 'missed' ? tr("Muddati o'tdi") : tr('Kutilmoqda'),
            ...(k.deadline ? [tr('Muddat: {sana}', { sana: muddatMatn(k.deadline) })] : []),
          ],
        });
      }
      for (const iz of s.comments) {
        v.push({
          vaqt: new Date(iz.createdAt).getTime(),
          tur: 'izoh',
          sarlavha: tr('Rahbar izohi — {ism}', { ism: iz.authorName ?? tr('Rahbar') }),
          matn: iz.body,
        });
      }
    }
    for (const t of lidVazifalari) {
      v.push({
        vaqt: new Date(t.createdAt).getTime(),
        tur: 'vazifa',
        sarlavha: tr('Vazifa yaratildi: {nom}', { nom: t.title }),
        matn: t.description ?? undefined,
        chiplar: [
          t.dueAt ? tr('Muddat: {sana}', { sana: muddatMatn(t.dueAt) }) : tr('Muddatsiz'),
          t.source === 'manual' ? tr("Qo'lda") : 'SotuvAI',
        ],
      });
      if (t.status === 'done' && t.completedAt) {
        v.push({ vaqt: new Date(t.completedAt).getTime(), tur: 'bajarildi', sarlavha: tr('Vazifa bajarildi: {nom}', { nom: t.title }) });
      }
    }
    return v.sort((a, b) => a.vaqt - b.vaqt);
  }, [suhbatlar, lidVazifalari, tr]);

  if (xato)
    return (
      <div className="lt-sahifa">
        <div className="card hech-narsa">{tr("Lid ma'lumotini yuklab bo'lmadi.")}</div>
      </div>
    );
  if (!asosiy)
    return (
      <div className="lt-sahifa" aria-busy="true">
        <div className="card skelet" style={{ height: 90 }} />
        <div className="card skelet" style={{ height: 380 }} />
      </div>
    );

  const a = asosiy.analysis;
  const c = asosiy.conversation;
  const nom = a?.clientExtracted?.name ?? asosiy.contact?.name ?? (c.direction === 'outbound' ? c.phoneTo : c.phoneFrom) ?? tr('Lid #{id}', { id: c.id.slice(0, 8) });
  const tel = c.direction === 'outbound' ? c.phoneTo : c.phoneFrom;
  const tur = lidTuri(a?.leadQuality ?? c.leadQuality);
  const ochiqVazifa = lidVazifalari.filter((t) => OCHIQ.has(t.status)).length;
  const kutilayotganVada = suhbatlar.flatMap((s) => s.commitments).filter((k) => k.status === 'pending').length;
  const faol = ochiqVazifa + kutilayotganVada > 0;
  const tahlil = suhbatlar.filter((s) => s.analysis?.overallScore != null).length;
  const izohlar = suhbatlar.reduce((n, s) => n + s.comments.length, 0);

  // Ma'lumot sifati haqida ogohlantirishlar — rahbar nimaga e'tibor berishi kerak
  const ogohlar: string[] = [];
  if (!a?.clientExtracted?.name && !asosiy.contact?.name) ogohlar.push(tr('Mijoz ismi aniqlanmagan'));
  if (!tel && c.channel === 'phone') ogohlar.push(tr("Telefon raqami yo'q"));
  if (asosiy.commitments.length === 0) ogohlar.push(tr('Keyingi qadam kelishilmagan'));
  if (a?.dynamics?.needsReply) ogohlar.push(tr('Mijoz javob kutib qolgan'));
  if (suhbatlar.some((s) => s.commitments.some((k) => k.status === 'missed'))) ogohlar.push(tr("Bajarilmagan va'da bor"));

  // Voqealarni kunlar bo'yicha guruhlash
  const kunlar: { kun: string; v: Voqea[] }[] = [];
  for (const x of voqealar) {
    const k = kunMatn(x.vaqt);
    const oxirgi = kunlar[kunlar.length - 1];
    if (oxirgi?.kun === k) oxirgi.v.push(x);
    else kunlar.push({ kun: k, v: [x] });
  }

  return (
    <div className="lt-sahifa">
      <header className="lt-bosh">
        <button type="button" className="sd-orqaga" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/lidlar'))} aria-label={tr('Orqaga')} title={tr('Orqaga')}>
          <ArrowLeft />
        </button>
        <div className="lt-bosh-matn">
          <h1>{nom}</h1>
          <span>{tr('Lid tafsilotlari')}</span>
        </div>
        <div className="lt-holatlar">
          {tur && <span className={`la-imk ${tur === 'hot' ? 'yuqori' : tur === 'warm' ? 'orta' : 'past'}`}>{tr(LID_NOMI[tur])}</span>}
          <span className={`lt-holat${faol ? ' faol' : ''}`}>{faol ? tr('Faol') : tr("Ochiq ish yo'q")}</span>
        </div>
      </header>

      <div className="lt-ish">
        <div className="lt-chap">
          <section className="card lt-karta">
            <h2>{tr('Lid tafsilotlari')}</h2>
            <dl className="lt-royxat">
              <Q nom={tr('Qiymati')}>{a?.deal?.amount ? `${a.deal.amount.toLocaleString('uz').replace(/,/g, ' ')} ${a.deal.currency ?? ''}` : '—'}</Q>
              <Q nom={tr('Kontakt')}>{a?.clientExtracted?.name ?? asosiy.contact?.name ?? '—'}</Q>
              <Q nom={tr('Telefon')}>{tel ?? '—'}</Q>
              <Q nom={tr('Kompaniya')}>{a?.clientExtracted?.company ?? asosiy.contact?.company ?? '—'}</Q>
              <Q nom={tr('Lavozim')}>{a?.clientExtracted?.role ?? asosiy.contact?.role ?? '—'}</Q>
              <Q nom={tr('Menejer')}>{c.managerName ?? '—'}</Q>
              <Q nom={tr("Xizmat yo'nalishi")}>{a?.serviceLine ?? '—'}</Q>
              <Q nom={tr('Bitim bosqichi')}>{a?.deal?.stage ?? '—'}</Q>
            </dl>
          </section>

          <section className="card lt-karta">
            <h2>{tr('Operatsion signallar')}</h2>
            <div className="lt-signallar">
              <Signal nom={tr('Suhbatlar')} qiymat={suhbatlar.length} />
              <Signal nom={tr('Tahlil qilingan')} qiymat={tahlil} />
              <Signal nom={tr('Rahbar izohlari')} qiymat={izohlar} />
              <Signal nom={tr('Ochiq vazifalar')} qiymat={ochiqVazifa} ogoh={ochiqVazifa > 0} />
            </div>
          </section>
        </div>

        <section className="card lt-karta lt-xron">
          <div className="lt-xron-bosh">
            <h2>
              <MessagesSquare /> {tr('Mijoz tarixi')} <small>({voqealar.length})</small>
            </h2>
            <span className="lt-chip">{tr('{n} ta suhbat', { n: suhbatlar.length })}</span>
          </div>
          {kunlar.length === 0 ? (
            <div className="jm-bosh">{tr("Voqea yo'q.")}</div>
          ) : (
            <div className="lt-vaqt-chizigi">
              {kunlar.map((k) => (
                <div key={k.kun} className="lt-kun">
                  <div className="lt-kun-ajrat">
                    <span>{k.kun}</span>
                  </div>
                  {k.v.map((x, i) => (
                    <div key={i} className="lt-voqea">
                      <div className={`lt-voqea-karta ${x.tur}`}>
                        <span className="lt-ikon" aria-hidden="true">
                          {IKON[x.tur]}
                        </span>
                        <div className="lt-voqea-ichi">
                          {/* Har voqeaning aniq sanasi va vaqti — kartaning tepasida */}
                          <time className="lt-sana" dateTime={new Date(x.vaqt).toISOString()}>
                            {kunMatn(x.vaqt)} · {soatMatn(x.vaqt)}
                          </time>
                          <div className="lt-voqea-bosh">
                            <b>{x.sarlavha}</b>
                            {x.havola && (
                              <Link to={x.havola.url} className="lt-havola">
                                {x.havola.nom}
                              </Link>
                            )}
                          </div>
                          {x.matn && <p>{x.matn}</p>}
                          {x.chiplar && x.chiplar.length > 0 && (
                            <div className="lt-chiplar">
                              {x.chiplar.map((ch) => (
                                <span key={ch} className="lt-chip">
                                  {ch}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {ogohlar.length > 0 && (
            <div className="lt-ogoh" role="note">
              <AlertTriangle /> {ogohlar.join('; ')}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const IKON: Record<Tur, ReactNode> = {
  suhbat: <MessageSquare />,
  qongiroq: <Phone />,
  kelishuv: <CheckCircle2 />,
  vazifa: <ListChecks />,
  bajarildi: <CheckCircle2 />,
  izoh: <StickyNote />,
};

function Q({ nom, children }: { nom: string; children: ReactNode }) {
  return (
    <div className="lt-qator">
      <dt>{nom}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Signal({ nom, qiymat, ogoh }: { nom: string; qiymat: number; ogoh?: boolean }) {
  return (
    <div className={`lt-signal${ogoh ? ' ogoh' : ''}`}>
      <span>{nom}</span>
      <b>{qiymat}</b>
    </div>
  );
}
