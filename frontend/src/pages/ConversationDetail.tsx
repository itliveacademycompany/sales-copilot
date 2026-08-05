import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  ballKlass,
  ballRang,
  fmtSana,
  fmtSoniya,
  type ConversationDetail as Detail,
} from '../api';
import { Gauge } from '../components/Gauge';
import { AudioPleyer, type AudioPleyerHandle } from '../components/AudioPleyer';
import { useAuth } from '../auth';

/**
 * TZ 8.3 dagi "eng muhim ekran": chapda transkript, o'ngda to'liq kontekst.
 * Ma'lumot zich, lekin har ball ortida isbot turadi (FR-81) va har faktning
 * manbasi ko'rsatilgan — ya'ni zichlik ishonchni kamaytirmaydi.
 */

const KANAL_NOMI: Record<string, string> = {
  telegram: 'Telegram',
  phone: 'Telefon',
  meeting: 'Uchrashuv',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};
const YONALISH_NOMI: Record<string, string> = { inbound: 'Kiruvchi', outbound: 'Chiquvchi', na: '—' };
const MUVOFIQLIK_NOMI: Record<string, { nom: string; klass: string }> = {
  ok: { nom: 'Muammo yo\'q', klass: 'ok' },
  warning: { nom: 'Ogohlantirish', klass: 'sariq' },
  violation: { nom: 'Qoidabuzarlik', klass: 'qizil' },
};
const SHOSHILINCHLIK_NOMI: Record<string, string> = { low: 'Past', medium: 'O\'rtacha', high: 'Yuqori' };
const SPEAKER_USUL_NOMI: Record<string, string> = {
  telegram_id: 'Telegram ID (100% aniq)',
  channel: 'Audio kanal (100% aniq)',
  phone: 'Telefon raqami',
  llm_inferred: 'AI taxmini',
};
const VADA_HOLAT_NOMI: Record<string, { nom: string; klass: string }> = {
  pending: { nom: 'Kutilmoqda', klass: 'kul' },
  done: { nom: 'Bajarildi', klass: 'ok' },
  missed: { nom: 'Muddati o\'tdi', klass: 'qizil' },
};

export function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const { business } = useAuth();
  const [d, setD] = useState<Detail | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [kutayotganSakrash, setKutayotganSakrash] = useState<string | null>(null);
  const [mezonYoritish, setMezonYoritish] = useState<string | null>(null);
  const segRefs = useRef(new Map<string, HTMLDivElement>());
  const mezonRefs = useRef(new Map<string, HTMLDivElement>());
  const audioRef = useRef<AudioPleyerHandle>(null);

  const load = useCallback(() => {
    if (!business || !id) return;
    void api
      .get<Detail>(`/api/v1/businesses/${business.businessId}/conversations/${id}`)
      .then(setD);
  }, [business, id]);

  useEffect(load, [load]);

  /**
   * Isbotdan transkriptga sakrash (TZ 8.3 — mahsulotning asosiy farqlanishi).
   *
   * Muhim: transkript birinchi 12 xabar bilan cheklangan. Agar isbot undan
   * keyingi xabarga ishora qilsa, ref hali mavjud emas — ilgari funksiya
   * jimgina `return` qilib, bosish hech qanday natija bermasdi. Endi bunday
   * holatda transkript avval to'liq ochiladi, keyin sakrash bajariladi.
   */
  const sakra = useCallback((segmentId: string) => {
    const el = segRefs.current.get(segmentId);
    if (!el || !el.isConnected) return false;
    const tinch = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: tinch ? 'auto' : 'smooth', block: 'center' });
    setHighlight(segmentId);
    setTimeout(() => setHighlight(null), 2200);
    return true;
  }, []);


  // Transkript to'liq ochilgandan keyin kutayotgan sakrashni bajaramiz.
  useEffect(() => {
    if (!kutayotganSakrash) return;
    sakra(kutayotganSakrash);
    setKutayotganSakrash(null);
  }, [kutayotganSakrash, showFullTranscript, sakra]);

  /**
   * Teskari bog'lanish: qaysi xabar qaysi mezonlarga isbot bo'lgan.
   *
   * Ilgari bog'lanish bir tomonlama edi (mezon → xabar). Endi rahbar
   * istalgan xabardan "bu gap qaysi bahoga ta'sir qilgan?" degan savolga
   * javob oladi — bu isbotli baholashning to'liq ko'rinishi.
   */
  const segmentMezonlari = useMemo(() => {
    const m = new Map<string, { kod: string; nom: string }[]>();
    if (!d) return m;
    for (const s of d.scores) {
      if (!s.evidenceSegmentId) continue;
      const royxat = m.get(s.evidenceSegmentId) ?? [];
      royxat.push({ kod: s.criterionCode, nom: s.criterionName });
      m.set(s.evidenceSegmentId, royxat);
    }
    return m;
  }, [d]);

  /** Xabardan mezon kartasiga sakrash (teskari yo'nalish). */
  const mezongaSakra = useCallback((kod: string) => {
    const el = mezonRefs.current.get(kod);
    if (!el || !el.isConnected) return;
    const tinch = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: tinch ? 'auto' : 'smooth', block: 'center' });
    setMezonYoritish(kod);
    setTimeout(() => setMezonYoritish(null), 2200);
  }, []);

  // Mezonlarni kategoriya bo'yicha yig'ish — "% + progress bar"
  // ko'rinishi uchun. Faqat baholangan (score != null) mezonlar
  // hisobga olinadi.
  const categoryRollup = useMemo(() => {
    if (!d) return [];
    const byCode = new Map<
      string,
      { code: string; scored: number[]; unknown: number; items: typeof d.scores }
    >();
    for (const s of d.scores) {
      const key = s.categoryCode ?? '—';
      const bucket = byCode.get(key) ?? { code: key, scored: [], unknown: 0, items: [] };
      if (s.score !== null) bucket.scored.push(s.score / s.maxScore);
      else bucket.unknown++;
      bucket.items.push(s);
      byCode.set(key, bucket);
    }
    return [...byCode.values()].map((b) => ({
      ...b,
      pct: b.scored.length > 0 ? (b.scored.reduce((a, c) => a + c, 0) / b.scored.length) * 100 : null,
    }));
  }, [d]);

  if (!d) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  const a = d.analysis;
  const score = a?.overallScore === null || !a ? null : Number(a.overallScore);
  const coaching = a?.managerNote;
  const metrics = a?.dynamics?.replyMetrics;
  const compliance = a?.compliance ? MUVOFIQLIK_NOMI[a.compliance] : null;

  /**
   * TZ 8.3: isbotga bosilsa transkript o'sha joyga sakraydi VA audio o'sha
   * soniyadan ijro etiladi. Audio faqat FAZA 2 da bo'ladi — bo'lmasa bu
   * qadam jimgina o'tkazib yuboriladi, sakrash baribir ishlaydi.
   */
  function jumpTo(segmentId: string | null, startSeconds?: string | number | null) {
    if (!segmentId) return;
    if (startSeconds !== null && startSeconds !== undefined) {
      audioRef.current?.sakraVaIjro(Number(startSeconds));
    }
    if (sakra(segmentId)) return;
    setShowFullTranscript(true);
    setKutayotganSakrash(segmentId);
  }

  async function reanalyze() {
    if (!business || !id) return;
    setReanalyzing(true);
    try {
      await api.post(`/api/v1/businesses/${business.businessId}/conversations/${id}/analyze`);
      setTimeout(() => {
        load();
        setReanalyzing(false);
      }, 1500);
    } catch {
      setReanalyzing(false);
    }
  }

  const boshlanish = new Date(d.conversation.startedAt).getTime();
  const vaqt = (startSeconds: string | number): string => {
    const s = Number(startSeconds);
    if (d.conversation.channel === 'telegram') {
      const t = new Date(boshlanish + s * 1000);
      return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    }
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const visibleSegments = showFullTranscript ? d.segments : d.segments.slice(0, 12);
  const hiddenCount = d.segments.length - visibleSegments.length;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <Link to="/suhbatlar" style={{ color: 'var(--kul-dark)', fontSize: 13 }}>
            ← Suhbatlar
          </Link>
          <h1>Suhbat detali</h1>
          <div className="izoh">
            {fmtSana(d.conversation.startedAt)} · {d.segments.length} xabar
            {d.conversation.language && ` · til: ${d.conversation.language}`}
          </div>
        </div>
        <button className="btn ikkinchi" onClick={() => void reanalyze()} disabled={reanalyzing}>
          {reanalyzing ? 'Navbatga qo\'yildi…' : '↻ Qayta tahlil'}
        </button>
      </div>

      {d.conversation.mediaUrl && (
        <AudioPleyer
          ref={audioRef}
          src={d.conversation.mediaUrl}
          kind={d.conversation.mediaKind}
          duration={d.conversation.durationSeconds}
        />
      )}

      <div className="suhbat-grid">
        {/* ─── Chap: transkript ─── */}
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Yozishma</h2>
          {visibleSegments.map((s) => {
            const mezonlar = segmentMezonlari.get(s.id) ?? [];
            const isbotli = mezonlar.length > 0;
            return (
            <div
              key={s.id}
              ref={(el) => {
                // Unmount bo'lganda o'chiramiz: aks holda xaritada DOM'dan
                // uzilgan eski element qolib, sakrash "muvaffaqiyatli" deb
                // hisoblanadi va transkript ochilmaydi.
                if (el) segRefs.current.set(s.id, el);
                else segRefs.current.delete(s.id);
              }}
              className={`xabar ${s.speaker === 'manager' ? 'menejer' : 'mijoz'}${
                highlight === s.id ? ' yoritilgan' : ''
              }${isbotli ? ' isbotli' : ''}`}
              {...(isbotli
                ? {
                    role: 'button',
                    tabIndex: 0,
                    title: `Isbot: ${mezonlar.map((x) => x.kod).join(', ')} — bahoni ko'rish`,
                    onClick: () => mezongaSakra(mezonlar[0]!.kod),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        mezongaSakra(mezonlar[0]!.kod);
                      }
                    },
                  }
                : {})}
            >
              <div className="kim">{s.speaker === 'manager' ? 'Menejer' : 'Mijoz'}</div>
              {s.text}
              {isbotli && (
                <div className="isbot-belgilar">
                  {mezonlar.map((x) => (
                    <span key={x.kod} className="isbot-kod">
                      {x.kod}
                    </span>
                  ))}
                  <span className="isbot-izoh">bahoga asos bo'ldi</span>
                </div>
              )}
              <div className="vaqt">{vaqt(s.startSeconds)}</div>
            </div>
            );
          })}
          {hiddenCount > 0 && (
            <button className="btn ikkinchi kichik" style={{ width: '100%' }} onClick={() => setShowFullTranscript(true)}>
              Yana {hiddenCount} qatorni ko'rsatish
            </button>
          )}
        </div>

        {/* ─── O'ng: to'liq kontekst ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!a ? (
            <div className="card hech-narsa">
              <div className="katta-ikon">⏳</div>
              {d.conversation.status === 'filtered'
                ? `Tahlil qilinmagan: ${d.conversation.excludedReason ?? 'filtrlangan'}`
                : 'Tahlil hali tayyor emas. Sessiya jim bo\'lgach avtomatik boshlanadi.'}
            </div>
          ) : (
            <>
              {/* ─── Sifat xulosasi: gauge + badgelar ─── */}
              <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <Gauge value={score} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {a.leadQuality && <span className="badge toq">lid: {a.leadQuality}</span>}
                    {compliance && <span className={`badge ${compliance.klass}`}>{compliance.nom}</span>}
                    {a.isFlagged && <span className="badge qizil">⚑ {a.flaggedReason}</span>}
                    {a.scoringMode && a.scoringMode !== 'scored' && (
                      <span className="badge kul">
                        {a.scoringMode === 'skipped_low_confidence' ? 'ishonch past' : 'baholanmadi'}
                      </span>
                    )}
                  </div>
                  {a.summary && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>{a.summary}</p>}
                  {a.primaryGap && (
                    <p style={{ margin: '6px 0 0', fontWeight: 500, fontSize: 13 }}>
                      Asosiy kamchilik: <span style={{ color: 'var(--qizil-dark)' }}>{a.primaryGap}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* ─── Kontekst: qo'ng'iroq/suhbat metama'lumoti ─── */}
              <div className="card">
                <h2 style={{ marginBottom: 10 }}>Suhbat konteksti</h2>
                <div className="meta-grid">
                  <div className="meta-item">
                    <div className="nom">Kanal</div>
                    <div className="qiymat">{KANAL_NOMI[d.conversation.channel] ?? d.conversation.channel}</div>
                  </div>
                  <div className="meta-item">
                    <div className="nom">Yo'nalish</div>
                    <div className="qiymat">{YONALISH_NOMI[d.conversation.direction] ?? '—'}</div>
                  </div>
                  <div className="meta-item">
                    <div className="nom">Menejer</div>
                    <div className="qiymat">{d.conversation.managerName ?? '—'}</div>
                  </div>
                  <div className="meta-item">
                    <div className="nom">Ish vaqti</div>
                    <div className="qiymat">{d.conversation.isOffHours ? 'Ish vaqtidan tashqari' : 'Ish vaqtida'}</div>
                  </div>
                  <div className="meta-item">
                    <div className="nom">Murojaat turi</div>
                    <div className="qiymat">{a.callFamily ?? '—'}</div>
                  </div>
                  <div className="meta-item">
                    <div className="nom">Xizmat yo'nalishi</div>
                    <div className="qiymat">{a.serviceLine ?? '—'}</div>
                  </div>
                  <div className="meta-item">
                    <div className="nom">Biznesga tegishliligi</div>
                    <div className="qiymat">{a.businessRelevance ?? '—'}</div>
                  </div>
                  <div className="meta-item">
                    <div className="nom">Speaker aniqlash usuli</div>
                    <div className="qiymat">
                      {a.speakerAttributionMethod ? SPEAKER_USUL_NOMI[a.speakerAttributionMethod] ?? a.speakerAttributionMethod : '—'}
                    </div>
                  </div>
                  <div className="meta-item">
                    <div className="nom">Klassifikatsiya ishonchi</div>
                    <div className="qiymat">
                      {a.classificationConfidence ? `${Math.round(Number(a.classificationConfidence) * 100)}%` : '—'}
                    </div>
                  </div>
                  {a.scoredCategories !== null && (
                    <div className="meta-item">
                      <div className="nom">Baholangan kategoriyalar</div>
                      <div className="qiymat">
                        {a.scoredCategories}/{a.totalCategories}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Mijoz + oldingi suhbatlar ─── */}
              <div className="grid-2">
                <div className="card">
                  <h2 style={{ marginBottom: 10 }}>Mijoz</h2>
                  {a.clientExtracted?.name || a.clientExtracted?.company || a.clientExtracted?.role ? (
                    <div className="meta-grid">
                      <div className="meta-item">
                        <div className="nom">Ism</div>
                        <div className="qiymat">{a.clientExtracted?.name ?? '—'}</div>
                      </div>
                      <div className="meta-item">
                        <div className="nom">Kompaniya</div>
                        <div className="qiymat">{a.clientExtracted?.company ?? '—'}</div>
                      </div>
                      <div className="meta-item">
                        <div className="nom">Lavozim</div>
                        <div className="qiymat">{a.clientExtracted?.role ?? '—'}</div>
                      </div>
                      {a.clientExtracted?.isDecisionMaker !== null && (
                        <div className="meta-item">
                          <div className="nom">Qaror qabul qiluvchi</div>
                          <span className={`badge ${a.clientExtracted?.isDecisionMaker ? 'ok' : 'kul'}`}>
                            {a.clientExtracted?.isDecisionMaker ? 'Ha' : 'Yo\'q'}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--kul-dark)' }}>Mijoz ma'lumoti aniqlanmadi</div>
                  )}
                </div>

                <div className="card">
                  <h2 style={{ marginBottom: 10 }}>Bu mijoz bilan oldingi suhbatlar</h2>
                  {d.previousConversations.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--kul-dark)' }}>
                      Bu — bu mijoz bilan birinchi qayd etilgan suhbat
                    </div>
                  ) : (
                    d.previousConversations.map((p) => (
                      <div className="tarix-satr" key={p.id}>
                        <span
                          className={`ball ${ballKlass(p.overallScore === null ? null : Number(p.overallScore))}`}
                          style={{ minWidth: 40, fontSize: 12 }}
                        >
                          {p.overallScore === null ? '—' : `${Math.round(Number(p.overallScore))}%`}
                        </span>
                        <Link to={`/suhbatlar/${p.id}`} className="matn">
                          {p.summary ?? 'Xulosa yo\'q'}
                        </Link>
                        <span className="sana">{fmtSana(p.startedAt)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ─── Bitim + signallar ─── */}
              {(a.deal?.amount || (a.signals?.objections?.length ?? 0) > 0 || a.signals?.urgency) && (
                <div className="grid-2">
                  <div className="card">
                    <h2 style={{ marginBottom: 10 }}>Bitim</h2>
                    <div className="meta-grid">
                      <div className="meta-item">
                        <div className="nom">Summa</div>
                        <div className="qiymat">
                          {a.deal?.amount ? `${a.deal.amount.toLocaleString('uz')} ${a.deal.currency ?? ''}` : '—'}
                        </div>
                      </div>
                      <div className="meta-item">
                        <div className="nom">Bosqich</div>
                        <div className="qiymat">{a.deal?.stage ?? '—'}</div>
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <h2 style={{ marginBottom: 10 }}>Signallar va e'tirozlar</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: a.signals?.objections?.length ? 8 : 0 }}>
                      {a.signals?.urgency && (
                        <span className="badge sariq">Shoshilinchlik: {SHOSHILINCHLIK_NOMI[a.signals.urgency]}</span>
                      )}
                      {a.signals?.budgetReaction && <span className="badge navy">Byudjet: {a.signals.budgetReaction}</span>}
                    </div>
                    {a.signals?.objections?.map((o, i) => (
                      <span key={i} className="badge qizil" style={{ marginRight: 6, marginBottom: 6, display: 'inline-block' }}>
                        {o}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Kelishuvlar (va'dalar) ─── */}
              {d.commitments.length > 0 && (
                <div className="card">
                  <h2 style={{ marginBottom: 6 }}>Kelishuvlar</h2>
                  {d.commitments.map((c) => {
                    const st = VADA_HOLAT_NOMI[c.status] ?? { nom: c.status, klass: 'kul' };
                    return (
                      <div className="kelishuv-satr" key={c.id}>
                        <span className={`badge ${c.byParty === 'manager' ? 'navy' : 'toq'}`}>
                          {c.byParty === 'manager' ? 'Menejer' : 'Mijoz'}
                        </span>
                        <span style={{ flex: 1 }}>{c.what}</span>
                        <span className={`badge ${st.klass}`}>{st.nom}</span>
                        {c.deadline && (
                          <span style={{ fontSize: 12, color: 'var(--kul-dark)', whiteSpace: 'nowrap' }}>
                            {fmtSana(c.deadline)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─── Javob dinamikasi ─── */}
              {metrics && (
                <div className="card">
                  <h2 style={{ marginBottom: 10 }}>Suhbat dinamikasi</h2>
                  <div className="stat-mini-grid">
                    <div className="stat-mini">
                      <div className="nom">Birinchi javob</div>
                      <div className="qiymat">{fmtSoniya(metrics.firstResponseSeconds)}</div>
                    </div>
                    <div className="stat-mini">
                      <div className="nom">Median javob</div>
                      <div className="qiymat">{fmtSoniya(metrics.medianResponseSeconds)}</div>
                    </div>
                    <div className="stat-mini">
                      <div className="nom">Mijoz murojaati</div>
                      <div className="qiymat">{metrics.customerTurns}</div>
                    </div>
                    <div className="stat-mini" style={{ background: metrics.unansweredTurns > 0 ? 'var(--qizil-10)' : undefined }}>
                      <div className="nom">Javobsiz</div>
                      <div className="qiymat" style={{ color: metrics.unansweredTurns > 0 ? 'var(--past-text)' : undefined }}>
                        {metrics.unansweredTurns}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Mezonlar: kategoriya bo'yicha + har biri isbot bilan ─── */}
              {categoryRollup.length > 0 && (
                <div className="card">
                  <h2 style={{ marginBottom: 4 }}>Mezonlar bo'yicha baho</h2>
                  <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
                    Isbotga bosing — yozishmadagi aynan o'sha joy ochiladi
                  </div>
                  {categoryRollup.map((cat) => (
                    <div key={cat.code} style={{ marginBottom: 14 }}>
                      <div className="mezon-satr" style={{ paddingTop: 0 }}>
                        <span className="kod">{cat.code}</span>
                        <span className="nom" style={{ fontWeight: 700 }}>
                          {d.categoryNames[cat.code] ?? cat.code}
                        </span>
                        <div className="chiziq">
                          <div
                            style={{
                              width: `${cat.pct ?? 0}%`,
                              background: ballRang(cat.pct),
                            }}
                          />
                        </div>
                        <span className="foiz">{cat.pct === null ? '—' : `${Math.round(cat.pct)}%`}</span>
                      </div>
                      {cat.items.map((s) => (
                        <div
                          className={`mezon-karta${mezonYoritish === s.criterionCode ? ' yoritilgan' : ''}`}
                          key={s.criterionCode}
                          ref={(el) => {
                            if (el) mezonRefs.current.set(s.criterionCode, el);
                            else mezonRefs.current.delete(s.criterionCode);
                          }}
                          style={{ paddingLeft: 34 }}
                        >
                          <div className="bosh">
                            <span className="kod" style={{ fontWeight: 900, color: 'var(--text-secondary)', fontSize: 12 }}>
                              {s.criterionCode}
                            </span>
                            <span className="nom">{s.criterionName}</span>
                            <span
                              className={`ball ${
                                s.score === null ? 'yoq' : s.score >= 2 ? 'yuqori' : s.score === 1 ? 'orta' : 'past'
                              }`}
                            >
                              {s.score === null ? 'aniqlanmadi' : `${s.score}/${s.maxScore}`}
                            </span>
                          </div>
                          {s.evidenceQuote && (
                            <div
                              className="isbot-blok"
                              role="button"
                              tabIndex={0}
                              onClick={() => jumpTo(s.evidenceSegmentId, s.evidenceStartSeconds)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  jumpTo(s.evidenceSegmentId, s.evidenceStartSeconds);
                                }
                              }}
                              title="Yozishmada ko'rsatish"
                            >
                              <span className="vaqt-belgi">
                                {s.evidenceStartSeconds !== null ? `⏱ ${vaqt(s.evidenceStartSeconds)}` : '❝'}
                              </span>
                              "{s.evidenceQuote}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* ─── Savolnoma javoblari ─── */}
              {a.questionnaireAnswers && a.questionnaireAnswers.length > 0 && (
                <div className="card">
                  <h2 style={{ marginBottom: 8 }}>Savolnoma</h2>
                  {a.questionnaireAnswers.map((qa, i) => (
                    <div className="qa-satr" key={i}>
                      <span className="savol">{qa.question}</span>
                      <span className="javob">{qa.answer ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ─── Kouching ─── */}
              {coaching &&
                (coaching.strengths.length > 0 ||
                  coaching.improvements.length > 0 ||
                  coaching.betterPhrases.length > 0) && (
                  <div className="card kouching">
                    <h2 style={{ marginBottom: 8 }}>Kouching</h2>
                    {coaching.strengths.length > 0 && (
                      <>
                        <h3 style={{ color: 'var(--ok)' }}>Nima yaxshi</h3>
                        <ul>
                          {coaching.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {coaching.improvements.length > 0 && (
                      <>
                        <h3 style={{ color: 'var(--qizil-dark)' }}>Nimani tuzatish</h3>
                        <ul>
                          {coaching.improvements.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {coaching.betterPhrases.map((p, i) => (
                      <div className="taklif" key={i}>
                        <div className="kontekst">{p.context}:</div>
                        <b>"{p.suggestion}"</b>
                      </div>
                    ))}
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
