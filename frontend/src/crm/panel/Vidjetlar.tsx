import { AlertTriangle, Camera, FileAudio, MessageCircle, Send } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { pul } from '../malumot';
import type { BitimVidjetNatija, PanelJavob, Vidjet } from './turlar';

/**
 * Bosh sahifa vidjetlarining ichki qismi. Har vidjet faqat ma'lumotni
 * chizadi; ramka (sarlavha, sozlash tugmalari) — `IshStoli.tsx` da.
 *
 * Rang qoidasi (Dill Mind): holat raqami — indigo (`--info`), davr raqami —
 * yashil (`--yuqori`), o'sish/kamayish — yashil/qizil, ma'lumot ustunlari —
 * neytral (`--data`). Kategoriya ranglari (manbalar, kanallar) — `--pn-k1..8`
 * qat'iy tartibda.
 */

type T = (s: string, q?: Record<string, string | number>) => string;

export interface VidjetKontekst {
  data: PanelJavob | null;
  bitim: BitimVidjetNatija | null | undefined;
  /** "bugun", "kecha", "7 kunda"… — "+N bugun" yozuvi uchun. */
  davrIzoh: string;
  /** Bosiladigan qatorlar uchun. */
  och: (yol: string) => void;
  /** Bitim vidjeti bosqich qatoridan voronkani topish uchun. */
  bosqichVoronkasi: (stageId: string) => string | null;
}

// ─── Kichik yordamchilar ────────────────────────────────────────────────────

function sonFmt(n: number): string {
  return pul(n);
}

function Delta({ n }: { n: number | null | undefined }) {
  if (n === null || n === undefined) return null;
  const klass = n > 0 ? 'usdi' : n < 0 ? 'kamaydi' : 'teng';
  return <span className={`pn-delta ${klass}`}>{n > 0 ? `+${sonFmt(n)}` : n < 0 ? `−${sonFmt(Math.abs(n))}` : '0'}</span>;
}

function Summa({ n, t }: { n: number; t: T }) {
  return <span className="pn-summa">{t('{s} so‘m', { s: sonFmt(n) })}</span>;
}

export function MalumotYoq({ matn, havola }: { matn?: string; havola?: ReactNode }) {
  const t = useT();
  return (
    <div className="pn-yoq">
      <AlertTriangle aria-hidden="true" />
      <div>
        <b>{matn ?? t("Ko'rsatish uchun ma'lumot yetarli emas")}</b>
        {havola && <div>{havola}</div>}
      </div>
    </div>
  );
}

export function davomiylik(daq: number, t: T): string {
  const s = Math.floor(daq / 60);
  const d = Math.round(daq % 60);
  if (s > 0) return d > 0 ? t('{s} soat {d} daq', { s, d }) : t('{s} soat', { s });
  return t('{d} daq', { d });
}

function qachon(iso: string | null, t: T): { matn: string; onlayn: boolean } {
  if (!iso) return { matn: t('kirmagan'), onlayn: false };
  const daq = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (daq <= 3) return { matn: t('onlayn'), onlayn: true };
  if (daq < 60) return { matn: t('{n} daq oldin', { n: daq }), onlayn: false };
  const soat = Math.round(daq / 60);
  if (soat < 24) return { matn: t('{n} soat oldin', { n: soat }), onlayn: false };
  return { matn: t('{n} kun oldin', { n: Math.round(soat / 24) }), onlayn: false };
}

function boshHarf(nom: string): string {
  const q = nom.replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
  return ((q[0]?.[0] ?? '') + (q[1]?.[0] ?? '')).toUpperCase() || '·';
}

// ─── Raqamli plitkalar ──────────────────────────────────────────────────────

/** Holat raqami: katta indigo raqam, ostida summa, pastda "+N davr". */
function HolatRaqami({ qiymat, summa, delta, ctx, onClick }: { qiymat: number; summa?: number; delta?: number; ctx: VidjetKontekst; onClick?: () => void }) {
  const t = useT();
  return (
    <button type="button" className="pn-raqam-blok" onClick={onClick} disabled={!onClick}>
      <span className="pn-katta holat">{sonFmt(qiymat)}</span>
      {summa !== undefined && <Summa n={summa} t={t} />}
      <span className="pn-ajratgich" aria-hidden="true" />
      {delta !== undefined && (
        <span className="pn-past">
          <Delta n={delta} />
          <small>{ctx.davrIzoh}</small>
        </span>
      )}
    </button>
  );
}

/** Davr raqami: katta yashil raqam va "bugun". */
function DavrRaqami({ qiymat, ctx, onClick }: { qiymat: number; ctx: VidjetKontekst; onClick?: () => void }) {
  return (
    <button type="button" className="pn-raqam-blok" onClick={onClick} disabled={!onClick}>
      <span className="pn-katta davr">{sonFmt(qiymat)}</span>
      <small className="pn-davr-izoh">{ctx.davrIzoh}</small>
    </button>
  );
}

// ─── Ro'yxat (ustunli) ──────────────────────────────────────────────────────

interface Qator {
  kalit: string;
  nom: ReactNode;
  son: number;
  summa?: number;
  delta?: number | null;
  onClick?: () => void;
}

/** Ko'p qatorlarni N tagacha qisqartiradi, qolgani "Boshqalar". */
function qisqart(q: Qator[], n: number, t: T): Qator[] {
  if (q.length <= n) return q;
  const qolgan = q.slice(n);
  return [
    ...q.slice(0, n),
    {
      kalit: '__boshqa',
      nom: t('Boshqalar'),
      son: qolgan.reduce((s, x) => s + x.son, 0),
      summa: qolgan.some((x) => x.summa !== undefined) ? qolgan.reduce((s, x) => s + (x.summa ?? 0), 0) : undefined,
      delta: qolgan.some((x) => x.delta !== undefined && x.delta !== null) ? qolgan.reduce((s, x) => s + (x.delta ?? 0), 0) : undefined,
    },
  ];
}

function Royxat({ qatorlar, birlik, maks = 6 }: { qatorlar: Qator[]; birlik?: (n: number) => string; maks?: number }) {
  const t = useT();
  const korinadi = qisqart(qatorlar, maks, t);
  const eng = Math.max(1, ...korinadi.map((q) => q.son));
  return (
    <ul className="pn-royxat">
      {korinadi.map((q) => (
        <li key={q.kalit}>
          <button type="button" onClick={q.onClick} disabled={!q.onClick}>
            <span className="pn-qator">
              <span className="pn-qator-nom">
                {q.nom} <b>{birlik ? birlik(q.son) : sonFmt(q.son)}</b>
                {q.summa !== undefined && <span className="pn-sust"> ({t('{s} so‘m', { s: sonFmt(q.summa) })})</span>}
              </span>
              {q.delta !== undefined && <Delta n={q.delta} />}
            </span>
            <span className="pn-trek" aria-hidden="true">
              <span style={{ width: q.son > 0 ? `max(3px, ${(q.son / eng) * 100}%)` : 0 }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Ro'yxatli vidjet boshi: chapda katta raqam (+summa), o'ngda "+N davr". */
function RoyxatBoshi({ qiymat, summa, delta, ctx, davrRaqami }: { qiymat: number; summa?: number; delta?: number | null; ctx: VidjetKontekst; davrRaqami?: boolean }) {
  const t = useT();
  if (davrRaqami) {
    return (
      <div className="pn-rbosh">
        <span />
        <span className="pn-rbosh-ong">
          <span className="pn-katta davr">{sonFmt(qiymat)}</span>
          <small>{ctx.davrIzoh}</small>
        </span>
      </div>
    );
  }
  return (
    <div className="pn-rbosh">
      <span className="pn-rbosh-chap">
        <span className="pn-katta holat">{sonFmt(qiymat)}</span>
        {summa !== undefined && <Summa n={summa} t={t} />}
      </span>
      {delta !== undefined && delta !== null && (
        <span className="pn-rbosh-ong">
          <Delta n={delta} />
          <small>{ctx.davrIzoh}</small>
        </span>
      )}
    </div>
  );
}

// ─── Doiraviy yoylar (bitim manbalari) ──────────────────────────────────────

function Halqalar({ qatorlar }: { qatorlar: { kalit: string; nom: string; son: number }[] }) {
  const t = useT();
  const [faol, setFaol] = useState<number | null>(null);
  const eng = Math.max(1, ...qatorlar.map((q) => q.son));
  const jami = qatorlar.reduce((s, q) => s + q.son, 0);
  const R = 92;
  const qadam = 13;
  const yoy = (r: number, ulush: number) => {
    // 270° gacha: chapdan (soat 6 dan) boshlab soat yo'nalishida
    const burchak = Math.max(0.002, ulush) * 270;
    const bosh = 90;
    const ox = (a: number) => 120 + r * Math.cos((a * Math.PI) / 180);
    const oy = (a: number) => 120 + r * Math.sin((a * Math.PI) / 180);
    const tugash = bosh + burchak;
    return `M ${ox(bosh)} ${oy(bosh)} A ${r} ${r} 0 ${burchak > 180 ? 1 : 0} 1 ${ox(tugash)} ${oy(tugash)}`;
  };
  return (
    <div className="pn-halqa">
      <svg viewBox="0 0 240 240" role="img" aria-label={t('{n} ta bitim manbalar bo‘yicha', { n: jami })}>
        {qatorlar.map((q, i) => (
          <g key={q.kalit} onMouseEnter={() => setFaol(i)} onMouseLeave={() => setFaol(null)}>
            <path d={yoy(R - i * qadam, 1)} className="pn-halqa-iz" />
            <path
              d={yoy(R - i * qadam, q.son / eng)}
              className="pn-halqa-yoy"
              style={{ stroke: `var(--pn-k${(i % 8) + 1})`, opacity: faol === null || faol === i ? 1 : 0.35 }}
            >
              <title>{`${q.nom}: ${q.son}`}</title>
            </path>
          </g>
        ))}
        <text x="120" y="118" textAnchor="middle" className="pn-halqa-jami">
          {faol === null ? jami : (qatorlar[faol]?.son ?? 0)}
        </text>
        <text x="120" y="136" textAnchor="middle" className="pn-halqa-nom">
          {faol === null ? t('bitim##son') : (qatorlar[faol]?.nom ?? '')}
        </text>
      </svg>
      <ul className="pn-legenda">
        {qatorlar.map((q, i) => (
          <li key={q.kalit} onMouseEnter={() => setFaol(i)} onMouseLeave={() => setFaol(null)}>
            <i style={{ background: `var(--pn-k${(i % 8) + 1})` }} aria-hidden="true" />
            <span>{q.nom}</span>
            <b>{sonFmt(q.son)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Spidometr (maqsad) ─────────────────────────────────────────────────────

function Spidometr({ ulush }: { ulush: number }) {
  const u = Math.max(0, Math.min(1, ulush));
  const burchak = 180 + u * 180;
  const r = 78;
  const nx = 110 + (r - 14) * Math.cos((burchak * Math.PI) / 180);
  const ny = 100 + (r - 14) * Math.sin((burchak * Math.PI) / 180);
  const ex = 110 + r * Math.cos((burchak * Math.PI) / 180);
  const ey = 100 + r * Math.sin((burchak * Math.PI) / 180);
  return (
    <svg viewBox="0 0 220 120" className="pn-spidometr" aria-hidden="true">
      <path d={`M ${110 - r} 100 A ${r} ${r} 0 0 1 ${110 + r} 100`} className="pn-spid-iz" />
      {u > 0 && <path d={`M ${110 - r} 100 A ${r} ${r} 0 0 1 ${ex} ${ey}`} className="pn-spid-yoy" />}
      <line x1="110" y1="100" x2={nx} y2={ny} className="pn-spid-mil" />
      <circle cx="110" cy="100" r="5" className="pn-spid-markaz" />
      {[0, 25, 50, 75, 100].map((f) => {
        const a = ((180 + (f / 100) * 180) * Math.PI) / 180;
        return (
          <text key={f} x={110 + (r + 14) * Math.cos(a)} y={100 + (r + 14) * Math.sin(a) + 3} textAnchor="middle" className="pn-spid-belgi">
            {f}%
          </text>
        );
      })}
    </svg>
  );
}

// ─── Chiziqli grafik (prognoz, javob vaqti) ─────────────────────────────────

/** Monoton kubik egri chiziq yo'li — "o'yilib" ketmaydi (manfiyga tushmaydi). */
function egri(n: { x: number; y: number }[]): string {
  if (n.length < 2) return '';
  const d: string[] = [`M ${n[0]!.x} ${n[0]!.y}`];
  for (let i = 0; i < n.length - 1; i++) {
    const a = n[i]!;
    const b = n[i + 1]!;
    const dx = (b.x - a.x) / 2;
    d.push(`C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`);
  }
  return d.join(' ');
}

function Prognoz({ data }: { data: NonNullable<PanelJavob['forecast']> }) {
  const t = useT();
  const [faol, setFaol] = useState<number | null>(null);
  const W = 720;
  const H = 230;
  const past = 34;
  const eng = Math.max(1, ...data.points.map((p) => p.count));
  const x = (i: number) => 18 + (i * (W - 36)) / Math.max(1, data.points.length - 1);
  const y = (v: number) => H - past - (v / eng) * (H - past - 78);
  const nuqta = data.points.map((p, i) => ({ x: x(i), y: y(p.count) }));
  const chiziq = nuqta.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const maydon = `${chiziq} L ${nuqta[nuqta.length - 1]!.x} ${H - past} L ${nuqta[0]!.x} ${H - past} Z`;
  return (
    <div
      className="pn-prognoz"
      title={
        data.cycleDays !== null
          ? t("O'rtacha bitim sikli: {n} kun (so'nggi 180 kunda yutilganlar)", { n: data.cycleDays })
          : t("Yutilgan bitimlar hali kam — 14 kunlik sikl olindi")
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pn-grafik" aria-hidden="true">
        <defs>
          <linearGradient id="pn-prognoz-fon" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--yuqori)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--yuqori)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {nuqta.map((p, i) => (
          <line key={i} x1={p.x} x2={p.x} y1="8" y2={H - past} className="pn-chiziq-tor" />
        ))}
        <line x1="0" x2={W} y1={H - past} y2={H - past} className="pn-oq" />
        <path d={maydon} fill="url(#pn-prognoz-fon)" />
        <path d={chiziq} className="pn-chiziq yashil" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Nuqtalar va yozuvlar HTML da — SVG cho'zilganda doira oval bo'lib qolmasin */}
      <div className="pn-prognoz-ust">
        {data.points.map((p, i) => (
          <div
            key={p.days}
            className={`pn-prognoz-ustun${faol === i ? ' faol' : ''}`}
            style={{ left: `${(x(i) / W) * 100}%` }}
            onMouseEnter={() => setFaol(i)}
            onMouseLeave={() => setFaol(null)}
          >
            <div className="pn-prognoz-yorliq" style={{ top: `${(y(p.count) / H) * 100}%` }}>
              <b>{sonFmt(p.count)}</b>
              <small>{t('bitim##son')}</small>
              <small className="pn-summa">{t('{s} so‘m', { s: sonFmt(p.sum) })}</small>
            </div>
            <span className="pn-nuqta yashil" style={{ top: `${(y(p.count) / H) * 100}%` }} />
            <div className="pn-prognoz-past" style={{ top: `calc(${((H - past) / H) * 100}% + 8px)` }}>
              <span>{i === 0 ? t('Ishdagi bitimlar') : t('{n} kun ichida', { n: p.days })}</span>
              <b className={i === 0 ? 'yashil' : undefined}>{i === 0 ? t('hozir') : t('yopilishi kutiladi')}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JavobGrafik({ data }: { data: NonNullable<PanelJavob['responseTime']> }) {
  const t = useT();
  const [faol, setFaol] = useState<number | null>(null);
  const W = 960;
  const H = 230;
  const past = 26;
  const eng = Math.max(1, ...data.hours.map((h) => h.minutes ?? 0));
  const x = (h: number) => 14 + (h * (W - 28)) / 24;
  const y = (v: number) => H - past - (v / eng) * (H - past - 40);
  // 24:00 nuqtasi — 0:00 ning takrori emas, egri chiziq oxiri (bo'sh)
  const nuqta = [...data.hours.map((h) => ({ x: x(h.hour), y: y(h.minutes ?? 0) })), { x: x(24), y: y(0) }];
  const engKatta = data.hours.reduce((m, h) => ((h.minutes ?? -1) > (data.hours[m]?.minutes ?? -1) ? h.hour : m), 0);
  const tanlangan = faol ?? (data.replies ? engKatta : null);
  const tq = tanlangan === null ? null : data.hours[tanlangan];
  return (
    <div className="pn-javob" onMouseLeave={() => setFaol(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pn-grafik" aria-hidden="true">
        {Array.from({ length: 25 }, (_, h) => (
          <line key={h} x1={x(h)} x2={x(h)} y1="8" y2={H - past} className="pn-chiziq-tor" />
        ))}
        <line x1="0" x2={W} y1={H - past} y2={H - past} className="pn-oq" />
        <path d={egri(nuqta)} className="pn-chiziq binafsha" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: 24 }, (_, h) => (
          <rect key={h} x={x(h) - (W - 28) / 48} y="0" width={(W - 28) / 24} height={H - past} fill="transparent" onMouseEnter={() => setFaol(h)} />
        ))}
      </svg>
      {tq && tq.minutes !== null && (
        <div className="pn-javob-belgi" style={{ left: `${(x(tq.hour) / W) * 100}%`, top: `${(y(tq.minutes) / H) * 100}%` }}>
          <span className="pn-nuqta binafsha" />
          <span className="pn-tooltip">
            <b>{davomiylik(tq.minutes, t)}</b>
            <small>
              {`${String(tq.hour).padStart(2, '0')}:00–${String(tq.hour + 1).padStart(2, '0')}:00`} · {t('{n} ta javob', { n: tq.count })}
            </small>
          </span>
        </div>
      )}
      {faol !== null && tq && tq.minutes === null && (
        <div className="pn-javob-belgi" style={{ left: `${(x(faol) / W) * 100}%`, top: '70%' }}>
          <span className="pn-tooltip">
            <small>{`${String(faol).padStart(2, '0')}:00 · ${t("javob yo'q")}`}</small>
          </span>
        </div>
      )}
      <div className="pn-javob-oq">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h} style={{ left: `${(x(h) / W) * 100}%` }}>{`${h}:00`}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Asosiy tanlovchi ───────────────────────────────────────────────────────

const KANAL: Record<string, { nom: string; ikon: ReactNode }> = {
  telegram: { nom: 'Telegram', ikon: <Send /> },
  whatsapp: { nom: 'WhatsApp', ikon: <MessageCircle /> },
  instagram: { nom: 'Instagram', ikon: <Camera /> },
};

export function VidjetIchi({ w, ctx }: { w: Vidjet; ctx: VidjetKontekst }) {
  const t = useT();
  const d = ctx.data;
  const bolim = d;
  if (!bolim) return <div className="pn-skelet" aria-hidden="true" />;
  const xato = <MalumotYoq matn={t("Ma'lumotni yuklab bo'lmadi")} />;

  switch (w.type) {
    case 'overdue_tasks':
      return bolim?.tasks ? (
        <HolatRaqami qiymat={bolim.tasks.overdue} delta={bolim.tasks.overdueNew} ctx={ctx} onClick={() => ctx.och('/crm/vazifalar?p=overdue')} />
      ) : (
        xato
      );
    case 'done_tasks':
      return bolim?.tasks ? <DavrRaqami qiymat={bolim.tasks.done} ctx={ctx} onClick={() => ctx.och('/crm/vazifalar?p=done')} /> : xato;
    case 'todo_tasks':
      return bolim?.tasks ? (
        <HolatRaqami qiymat={bolim.tasks.todo} delta={bolim.tasks.todoNew} ctx={ctx} onClick={() => ctx.och('/crm/vazifalar?p=all')} />
      ) : (
        xato
      );
    case 'no_task_deals':
      return bolim?.deals ? (
        <HolatRaqami
          qiymat={bolim.deals.noTask}
          summa={bolim.deals.noTaskSum}
          delta={bolim.deals.noTaskNew}
          ctx={ctx}
          onClick={() => ctx.och('/crm/bitimlar?k=jadval&status=open&task=none')}
        />
      ) : (
        xato
      );
    case 'won_deals':
      return bolim?.deals ? (
        <HolatRaqami qiymat={bolim.deals.won} summa={bolim.deals.wonSum} delta={bolim.deals.wonNew} ctx={ctx} onClick={() => ctx.och('/crm/bitimlar?k=jadval&status=won')} />
      ) : (
        xato
      );
    case 'incoming_calls':
      return bolim?.calls ? <DavrRaqami qiymat={bolim.calls.inbound} ctx={ctx} onClick={() => ctx.och('/crm/qongiroqlar')} /> : xato;
    case 'outgoing_calls':
      return bolim?.calls ? <DavrRaqami qiymat={bolim.calls.outbound} ctx={ctx} onClick={() => ctx.och('/crm/qongiroqlar')} /> : xato;
    case 'notes':
      return bolim?.notes !== null && bolim?.notes !== undefined ? <DavrRaqami qiymat={bolim.notes} ctx={ctx} /> : xato;

    case 'deal_sources': {
      if (!bolim?.sources) return xato;
      if (!bolim.sources.length) return <MalumotYoq matn={t("Tanlangan davrda yangi bitim yo'q")} />;
      const q = bolim.sources.map((s) => ({ kalit: s.source ?? '', nom: s.source ?? t("Manbasiz"), son: s.count }));
      const kor = q.length > 7 ? [...q.slice(0, 6), { kalit: '__boshqa', nom: t('Boshqalar'), son: q.slice(6).reduce((s, x) => s + x.son, 0) }] : q;
      return <Halqalar qatorlar={kor} />;
    }

    case 'deals_by_manager': {
      if (!bolim?.managers || !bolim.deals) return xato;
      return (
        <>
          <RoyxatBoshi qiymat={bolim.deals.open} summa={bolim.deals.openSum} delta={bolim.deals.openDelta} ctx={ctx} />
          {bolim.managers.length ? (
            <Royxat
              birlik={(n) => t('{n} bitim', { n: sonFmt(n) })}
              qatorlar={bolim.managers.map((m) => ({
                kalit: m.seatId ?? '-',
                nom: m.name ?? t("Mas'ulsiz"),
                son: m.count,
                summa: m.sum,
                delta: m.delta,
                onClick: m.seatId ? () => ctx.och(`/crm/bitimlar?k=jadval&status=open&seat=${m.seatId}`) : undefined,
              }))}
            />
          ) : (
            <MalumotYoq matn={t("Ochiq bitim yo'q")} />
          )}
        </>
      );
    }

    case 'goals': {
      if (!bolim?.goal) return xato;
      const r = bolim.goal.row;
      const bor = r && ((r.planSum ?? 0) > 0 || (r.planCount ?? 0) > 0);
      if (!r || !bor) {
        return (
          <div className="pn-maqsad bosh">
            <MalumotYoq havola={<button type="button" className="pn-havola" onClick={() => ctx.och('/crm/voronka-tahlili?tab=maqsad')}>{t('Oylik rejani belgilang')}</button>} />
            <Spidometr ulush={0} />
          </div>
        );
      }
      const pulda = (r.planSum ?? 0) > 0;
      const ulush = pulda ? (r.sumPct ?? 0) : (r.countPct ?? 0);
      return (
        <div className="pn-maqsad">
          <Spidometr ulush={ulush} />
          <div className="pn-maqsad-son">
            <b>{Math.round(ulush * 100)}%</b>
            <span>
              {pulda
                ? t('{f} / {p} so‘m', { f: sonFmt(r.factSum), p: sonFmt(r.planSum ?? 0) })
                : t('{f} / {p} bitim', { f: sonFmt(r.factCount), p: sonFmt(r.planCount ?? 0) })}
            </span>
            <small>{bolim.goal.month}</small>
          </div>
        </div>
      );
    }

    case 'system_usage': {
      if (!bolim?.usage) return xato;
      if (!bolim.usage.length) return <MalumotYoq />;
      const eng = Math.max(1, ...bolim.usage.map((u) => u.minutes));
      return (
        <ul className="pn-faollik">
          <li className="pn-faollik-sarlavha" aria-hidden="true">
            <span />
            <small>{t('Oxirgi faollik')}</small>
          </li>
          {bolim.usage.slice(0, 7).map((u) => {
            const q = qachon(u.lastAt, t);
            return (
              <li key={u.userId}>
                <span className="pn-avatar" aria-hidden="true">
                  {boshHarf(u.name)}
                </span>
                <span className="pn-faollik-asos">
                  <span className="pn-qator">
                    <span className="pn-qator-nom">
                      {u.name} <b>{davomiylik(u.minutes, t)}</b>
                    </span>
                    <span className={`pn-faollik-vaqt${q.onlayn ? ' onlayn' : ''}`}>{q.matn}</span>
                  </span>
                  <span className="pn-trek" aria-hidden="true">
                    <span style={{ width: u.minutes > 0 ? `max(3px, ${(u.minutes / eng) * 100}%)` : 0 }} />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      );
    }

    case 'recent_files': {
      if (!bolim?.files) return xato;
      if (!bolim.files.length) return <MalumotYoq />;
      return (
        <ul className="pn-fayllar">
          {bolim.files.map((f) => (
            <li key={f.conversationId}>
              <button type="button" onClick={() => ctx.och(`/crm/suhbatlar/${f.conversationId}`)}>
                <span className="pn-fayl-ikon" aria-hidden="true">
                  <FileAudio />
                </span>
                <span className="pn-fayl-asos">
                  <b>{f.fileName ?? t("Qo'ng'iroq yozuvi")}</b>
                  <small>
                    {[f.contact, f.seat, new Date(f.at).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
                {f.bytes !== null && <span className="pn-sust">{f.bytes >= 1048576 ? `${(f.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.bytes / 1024))} KB`}</span>}
              </button>
            </li>
          ))}
        </ul>
      );
    }

    case 'sales_forecast':
      return bolim?.forecast ? <Prognoz data={bolim.forecast} /> : xato;

    case 'outgoing_messages':
    case 'processed_chats': {
      if (!bolim?.messages) return xato;
      const xabar = w.type === 'outgoing_messages';
      const rows = bolim.messages.bySeat.filter((m) => (xabar ? m.messages : m.chats) > 0);
      const jami = rows.reduce((s, m) => s + (xabar ? m.messages : m.chats), 0);
      return (
        <>
          <RoyxatBoshi qiymat={jami} ctx={ctx} davrRaqami />
          {rows.length ? (
            <Royxat
              qatorlar={[...rows]
                .sort((a, b) => (xabar ? b.messages - a.messages : b.chats - a.chats))
                .map((m) => ({ kalit: m.seatId ?? '-', nom: m.name ?? t("Biriktirilmagan"), son: xabar ? m.messages : m.chats }))}
            />
          ) : (
            <MalumotYoq matn={t("Tanlangan davrda yozishma yo'q")} />
          )}
        </>
      );
    }

    case 'incoming_messages': {
      if (!bolim?.messages) return xato;
      const kanal = (k: string) => bolim.messages!.incoming.find((x) => x.channel === k)?.count ?? 0;
      const jami = bolim.messages.incoming.reduce((s, x) => s + x.count, 0);
      const boshqa = jami - kanal('telegram') - kanal('whatsapp') - kanal('instagram');
      return (
        <>
          <RoyxatBoshi qiymat={jami} ctx={ctx} davrRaqami />
          <Royxat
            maks={8}
            qatorlar={[
              ...(['telegram', 'whatsapp', 'instagram'] as const).map((k) => ({
                kalit: k,
                nom: (
                  <span className="pn-kanal">
                    {KANAL[k]!.ikon}
                    {KANAL[k]!.nom}
                  </span>
                ),
                son: kanal(k),
              })),
              { kalit: 'boshqa', nom: t('Boshqalar'), son: Math.max(0, boshqa) },
            ]}
          />
        </>
      );
    }

    case 'response_time': {
      if (!bolim?.responseTime) return xato;
      if (!bolim.responseTime.replies) return <MalumotYoq matn={t("Tanlangan davrda mijoz xabariga javob yo'q")} />;
      return (
        <>
          <p className="pn-izoh tepa">{t("O'rtacha: {v}", { v: davomiylik(bolim.responseTime.avgMinutes ?? 0, t) })}</p>
          <JavobGrafik data={bolim.responseTime} />
        </>
      );
    }

    case 'deals': {
      const r = ctx.bitim;
      if (r === undefined) return <div className="pn-skelet" aria-hidden="true" />;
      if (r === null) return xato;
      const f = w.filter;
      const davrda = f?.dateMode === 'period';
      return (
        <>
          <RoyxatBoshi qiymat={r.count} summa={davrda ? undefined : r.sum} delta={r.delta} ctx={ctx} davrRaqami={davrda} />
          {f?.group !== 'none' &&
            (r.groups.length ? (
              <Royxat
                qatorlar={r.groups.map((g) => {
                  const voronka = f?.group === 'stage' ? ctx.bosqichVoronkasi(g.key) : null;
                  return {
                    kalit: g.key || '-',
                    nom:
                      f?.group === 'stage' ? (
                        <span className="pn-chiplar">
                          <span className="pn-chip">{g.name}</span>
                          <span className="pn-chip rangli" style={{ background: g.color ?? undefined }}>
                            {g.name2}
                          </span>
                        </span>
                      ) : (
                        (g.name || (f?.group === 'manager' ? t("Mas'ulsiz") : t('Manbasiz')))
                      ),
                    son: g.count,
                    summa: g.sum,
                    delta: g.delta,
                    onClick:
                      f?.group === 'stage' && voronka
                        ? () => ctx.och(`/crm/bitimlar?k=jadval&v=${voronka}&stages=${g.key}`)
                        : f?.group === 'manager' && g.key
                          ? () => ctx.och(`/crm/bitimlar?k=jadval&seat=${g.key}`)
                          : undefined,
                  };
                })}
                birlik={f?.group === 'stage' ? (n) => t('{n} bitim', { n: sonFmt(n) }) : undefined}
                maks={5}
              />
            ) : (
              <MalumotYoq matn={t("Filtrga mos bitim yo'q")} />
            ))}
        </>
      );
    }
  }
}
