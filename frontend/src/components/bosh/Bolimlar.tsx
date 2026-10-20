import { ArrowRight, TriangleAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ballKlass, lidTuri, type AlertRow } from '../../api';
import { useT } from '../../i18n';
import { MalumotIkon } from './Korsatkichlar';
import { ball, davomiylik, davomiylikMatn, qachon, type BoshMalumot } from './malumot';

// ─── OGOHLANTIRISHLAR ───────────────────────────────────────────────────────

const OGOH_TUR: Record<string, string> = {
  red_flag: 'Qizil bayroq',
  missed_lead: 'Javobsiz mijoz',
  broken_commitment: 'Buzilgan va\'da',
  low_confidence: 'Inson ko\'rigi',
  quality_drop: 'Sifat pasayishi',
  sync_error: 'Sinxron xatosi',
};

/** Ogohlantirish tanasidan o'qiladigan izoh — har tur o'z ma'lumotini saqlaydi. */
function ogohIzoh(a: AlertRow, t: ReturnType<typeof useT>): string {
  const b = a.body as Record<string, unknown>;
  switch (a.kind) {
    case 'missed_lead':
      return b.unansweredTurns === undefined || b.unansweredTurns === null
        ? t('Mijozning bir nechta xabari javobsiz qolgan. Bugun qayta yozing.')
        : t('Mijozning {n} ta xabari javobsiz qolgan. Bugun qayta yozing.', { n: String(b.unansweredTurns) });
    case 'red_flag':
      return typeof b.quote === 'string' ? t('Yozishmadan: «{iqtibos}»', { iqtibos: b.quote }) : t('Suhbatda qoidabuzarlik aniqlandi.');
    case 'broken_commitment':
      return t("Mijozga berilgan va'da muddatida bajarilmadi — obro' masalasi.");
    case 'low_confidence':
      return typeof b.reason === 'string'
        ? t('AI natijasi tekshiruv talab qiladi: {sabab}.', { sabab: b.reason })
        : t("AI natijasini inson ko'rib chiqishi kerak.");
    default:
      return t("Batafsil ma'lumot uchun oching.");
  }
}

export function Ogohlar({ data }: { data: BoshMalumot }) {
  const navigate = useNavigate();
  const t = useT();
  const royxat = data.ogohlar.slice(0, 5);

  return (
    <section className="card ogohlar" aria-labelledby="ogoh-sarlavha">
      <div className="karta-bosh">
        <h2 id="ogoh-sarlavha">
          {t('Ogohlantirishlar')} <MalumotIkon matn={t("Hal qilinmagan, darhol e'tibor talab qiladigan hodisalar")} />
          {data.ogohlar.length > 0 && <span className="sanoq-chip">{data.ogohlar.length}</span>}
        </h2>
        <Link to="/ogohlantirishlar" className="havola">
          {t("Ko'rish")}
        </Link>
      </div>
      {royxat.length === 0 ? (
        <div className="hech-narsa">{t("Faol ogohlantirish yo'q — hammasi joyida")}</div>
      ) : (
        <div className="ogoh-royxat">
          {royxat.map((a) => (
            <button
              type="button"
              key={a.id}
              className={`ogoh-band ${a.severity}`}
              onClick={() => navigate(a.conversationId ? `/suhbatlar/${a.conversationId}` : '/ogohlantirishlar')}
            >
              <span className="ogoh-band-bosh">
                <TriangleAlert className="ogoh-band-ikon" aria-hidden="true" />
                <span className="ogoh-tur">{OGOH_TUR[a.kind] ? t(OGOH_TUR[a.kind]!) : a.kind}</span>
                <b>{a.title}</b>
                {a.status === 'new' && <span className="badge qizil">{t('yangi')}</span>}
              </span>
              <span className="ogoh-band-matn">{ogohIzoh(a, t)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── BAHOLASH TIZIMI BO'YICHA MUAMMOLAR ─────────────────────────────────────

function rang(pct: number | null): string {
  if (pct === null) return 'var(--border-strong)';
  if (pct >= 70) return 'var(--yuqori)';
  if (pct >= 50) return 'var(--orta)';
  return 'var(--past)';
}

export function Muammolar({ data }: { data: BoshMalumot }) {
  const navigate = useNavigate();
  const t = useT();
  const pb = data.playbook;
  if (!pb) return null;

  const kategoriyalar = [...pb.criteria.categories]
    .sort((a, b) => a.order - b.order)
    .map((cat) => {
      const mezonlar = data.criteria.filter((m) => m.categoryCode === cat.code && m.avgPct !== null);
      const vazn = mezonlar.reduce((s, m) => s + m.scored, 0);
      const pct = vazn > 0 ? mezonlar.reduce((s, m) => s + (m.avgPct ?? 0) * m.scored, 0) / vazn : null;
      return { ...cat, pct };
    });

  const baholangan = data.criteria.filter((m) => m.avgPct !== null);
  const zaif = baholangan.filter((m) => (m.avgPct ?? 100) < 60);
  const umumiy = data.kpi.current.avgScore;
  const eng = [...kategoriyalar]
    .filter((k) => k.pct !== null)
    .sort((a, b) => (100 - (b.pct ?? 0)) * b.weightPct - (100 - (a.pct ?? 0)) * a.weightPct)[0];
  const turlar = pb.classificationPolicy.callFamilies.filter((f) => f.scored).map((f) => f.name);

  return (
    <section className="card muammolar" aria-labelledby="muammo-sarlavha">
      <div className="karta-bosh">
        <h2 id="muammo-sarlavha" className="kichik-sarlavha-katta">
          {t("Suhbat turlari bo'yicha muammolar")}{' '}
          <MalumotIkon matn={t("Baholash mezonlari kategoriyalari bo'yicha qayerda ko'proq ball yo'qotilmoqda")} />
        </h2>
      </div>

      <div className="muammo-grid">
        <div className="muammo-chap">
          <div className="muammo-tizim faol">
            <div className="muammo-tizim-bosh">
              <b>{t('Umumiy baholash tizimi')}</b>
              <span>{umumiy === null ? '—' : `${Math.round(umumiy)}%`}</span>
            </div>
            <div className="muammo-chiziq">
              <div style={{ width: `${umumiy ?? 0}%`, background: rang(umumiy) }} />
            </div>
            <small style={{ color: zaif.length > 0 ? 'var(--orta-text)' : 'var(--yuqori-text)' }}>
              {t('{n} / {jami} zaif', { n: zaif.length, jami: baholangan.length })}
            </small>
          </div>
          {turlar.length > 0 && (
            <div className="muammo-turlar">
              <span>{t('Umumiy tizim bilan baholanadi')}</span>
              <p>{turlar.join(', ')}</p>
            </div>
          )}
        </div>

        <div className="muammo-tafsilot">
          <div className="muammo-tafsilot-bosh">
            <h3>
              {t('Umumiy baholash tizimi')} <span className="kod-chip">umumiy</span>
            </h3>
            <span className="muammo-foiz">{umumiy === null ? '—' : `${Math.round(umumiy)}%`}</span>
          </div>

          <div className="muammo-segmentlar" role="img" aria-label={t("Kategoriyalar bo'yicha ball")}>
            {kategoriyalar.map((k) => (
              <span
                key={k.code}
                style={{ flexGrow: k.weightPct, background: rang(k.pct) }}
                title={t('{nom}: {ball} · vazn {vazn}%', {
                  nom: k.name,
                  ball: k.pct === null ? t('baholanmagan') : `${Math.round(k.pct)}%`,
                  vazn: k.weightPct,
                })}
              />
            ))}
          </div>

          <ul className="muammo-legenda">
            {kategoriyalar.map((k) => (
              <li key={k.code}>
                <span className="nuqta" style={{ background: rang(k.pct) }} aria-hidden="true" />
                {k.name} <b>{k.pct === null ? '—' : `${Math.round(k.pct)}%`}</b>
              </li>
            ))}
          </ul>

          <p className="muammo-xulosa">
            {baholangan.length === 0
              ? t("Bu davrda baholangan mezon yo'q.")
              : t('{jami} ta mezondan {n} tasi zaif bajarilmoqda.', { jami: baholangan.length, n: zaif.length }) +
                (eng ? ' ' + t("Eng ko'p yo'qotish «{nom}» bosqichida.", { nom: eng.name }) : '') +
                ' ' +
                t("O'z tizimi yo'q barcha suhbat turlariga qo'llaniladi.")}
          </p>

          <button className="btn ikkinchi" onClick={() => navigate('/analitika')}>
            {t('Batafsil')} <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── SO'NGGI TAHLILLAR ──────────────────────────────────────────────────────

const SOHA: Record<string, string> = {
  sales: 'Sotuv',
  support: 'Qo\'llab-quvvatlash',
  internal: 'Ichki',
  spam: 'Spam',
  other: 'Boshqa',
};
const YONALISH: Record<string, string> = { inbound: 'Kiruvchi', outbound: 'Chiquvchi' };
const KANAL: Record<string, string> = {
  telegram: 'Telegram',
  phone: 'Telefon',
  meeting: 'Uchrashuv',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};
const LID: Record<string, { nom: string; klass: string }> = {
  hot: { nom: 'Issiq lid', klass: 'yuqori' },
  warm: { nom: 'Iliq lid', klass: 'orta' },
  cold: { nom: 'Sovuq lid', klass: 'sovuq' },
};

export function SonggiTahlillar({ data }: { data: BoshMalumot }) {
  const navigate = useNavigate();
  const tr = useT();
  const oilalar = new Map((data.playbook?.classificationPolicy.callFamilies ?? []).map((f) => [f.key, f.name]));
  const royxat = data.suhbatlar.filter((s) => s.status === 'done').slice(0, 5);

  return (
    <section className="card songgi" aria-labelledby="songgi-sarlavha">
      <div className="karta-bosh">
        <h2 id="songgi-sarlavha">
          {tr("So'nggi tahlillar")} <MalumotIkon matn={tr("Eng oxirgi baholangan suhbatlar — bosib to'liq tahlilni oching")} />
        </h2>
        <Link to="/suhbatlar" className="havola">
          {tr("Ko'rish")}
        </Link>
      </div>

      {royxat.length === 0 ? (
        <div className="hech-narsa">{tr("Hali tahlil qilingan suhbat yo'q")}</div>
      ) : (
        <ol className="vaqt-chizigi">
          {royxat.map((r) => {
            const t = data.tafsilotlar[r.id];
            const a = t?.analysis;
            const b = ball(r);
            const lid = lidTuri(r.leadQuality);
            const oila = a?.callFamily ? oilalar.get(a.callFamily) ?? a.callFamily : null;
            const dav = t?.conversation.durationSeconds ?? davomiylik(r);
            const yon = t?.conversation.direction ? YONALISH[t.conversation.direction] : undefined;
            return (
              <li key={r.id}>
                <span className={`vc-nuqta ${ballKlass(b)}`} aria-hidden="true" />
                <button type="button" className="vc-kontent" onClick={() => navigate(`/suhbatlar/${r.id}`)}>
                  <span className="vc-bosh">
                    <b>{oila ?? tr('Suhbat tahlili')}</b>
                    <small>{qachon(r.startedAt)}</small>
                  </span>
                  <span className="vc-asosiy">
                    <span className="vc-xulosa">{r.summary ?? tr("Xulosa yo'q")}</span>
                    <span className={`ball ${ballKlass(b)}`}>{b === null ? '—' : `${b.toFixed(1)}%`}</span>
                  </span>
                  <span className="vc-teglar">
                    <span className="vc-vaqt">{davomiylikMatn(dav)}</span>
                    {a?.businessRelevance && (
                      <span className="teg">{SOHA[a.businessRelevance] ? tr(SOHA[a.businessRelevance]!) : a.businessRelevance}</span>
                    )}
                    <span className="teg">{yon ? tr(yon) : KANAL[r.channel] ? tr(KANAL[r.channel]!) : r.channel}</span>
                    {a?.serviceLine && <span className="teg kok">{a.serviceLine}</span>}
                    {lid && <span className={`teg ${LID[lid]!.klass}`}>{tr(LID[lid]!.nom)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
