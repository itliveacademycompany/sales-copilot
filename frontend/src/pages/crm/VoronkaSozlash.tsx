import {
  ArrowRight,
  Ban,
  ChevronDown,
  CircleCheck,
  Copy,
  FileText,
  GripVertical,
  Info,
  Pencil,
  Phone,
  Plus,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { pul, useCrm, type BosqichTuri } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { kechikishMatni, QoidaOyna, RadSabablariSozlama, type Amal, type Qoida } from './SozlamaQismlari';
import './voronka-sozlash.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VORONKANI SOZLASH — amoCRM "Настроить" ekrani namunasida (Deal Mind dizayni)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   • Tepada: voronka nomi (almashtirish ro'yxati, nomini o'zgartirish),
 *     "Orqaga" va "Saqlash".
 *   • Chapda — bitim manbalari: qo'ng'iroqlar shu voronkaga qanday tushadi,
 *     shu voronkaning veb-formalari, dublikatlar nazorati.
 *   • O'ngda — ustunlar: "Saralanmagan" va bosqichlar. Bosqich nomi va rangi
 *     joyida tahrirlanadi, ochiq bosqichlar sudrab tartiblanadi, ustunlar
 *     orasidagi (+) yangi bosqich qo'shadi, savat o'chiradi. Har ustun ostida
 *     — ko'rsatma (menejerga eslatma) va triggerlar (avtomatika qoidalari).
 *
 * Bosqich o'zgarishlari "Saqlash" bilan birga yoziladi (bitta tranzaksiya);
 * triggerlar, ko'rsatmalar va manbalar darhol saqlanadi — ular bosqich
 * ro'yxatiga bog'liq emas.
 */

interface Qoralama {
  /** Saqlanmagan yangi bosqichda `id` yo'q — kalit vaqtinchalik. */
  kalit: string;
  id?: string;
  name: string;
  color: string;
  kind: BosqichTuri;
}

interface Sozlamalar {
  lossReasonRequired: boolean;
  callIntake: { enabled: boolean; pipelineId: string | null; autoAccept: boolean };
}

interface FormaQisqa {
  id: string;
  name: string;
  pipelineId: string | null;
  active: boolean;
  autoAccept: boolean;
  submissions: number;
}

/** amoCRM'dagidek och ranglar — matn ustida o'qiladi (ikkala mavzuda). */
const RANGLAR = [
  '#99ccff', '#8ab4f8', '#c2e9fb', '#a5d8ff', '#ffd59e', '#fde68a', '#fff59d', '#e6ee9c',
  '#c5e1a5', '#a7f3d0', '#b2ebf2', '#ccff66', '#f9c0c0', '#fca5a5', '#ffb3c7', '#f0abfc',
  '#d8b4fe', '#c7d2fe', '#e5e7eb', '#d6d3d1',
];

let yangiKalit = 0;

export function VoronkaSozlash() {
  const { holat, base, yangila } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const voronka = holat.pipelines.find((p) => p.id === params.get('v')) ?? holat.pipelines.find((p) => p.isMain) ?? holat.pipelines[0]!;
  const tashqi = voronka.external ? (holat.externalSync ?? 'CRM') : null;

  // ─── Bosqichlar qoralamasi ───
  // Kalit — bosqichlarning o'zi: CRM holati boshqa sabab bilan yangilansa (masalan,
  // rad sababi sozlamasi) saqlanmagan tahrirlar yo'qolmasin
  const bosqichKaliti = voronka.id + JSON.stringify(voronka.stages.map((s) => [s.id, s.name, s.color, s.kind]));
  const asl = useMemo<Qoralama[]>(
    () => voronka.stages.map((s) => ({ kalit: s.id, id: s.id, name: s.name, color: s.color, kind: s.kind })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bosqichKaliti],
  );
  const [bosqichlar, setBosqichlar] = useState<Qoralama[]>(asl);
  const [nom, setNom] = useState(voronka.name);
  const [nomTahrir, setNomTahrir] = useState(false);
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const [fokus, setFokus] = useState<string | null>(null);
  /** O'chirilgan bosqich (ID) bitimlari qaysi bosqichga (kalit) o'tadi — "Saqlash" bilan yuboriladi. */
  const [kochirish, setKochirish] = useState<Record<string, string>>({});
  const [ochirishOyna, setOchirishOyna] = useState<{ kalit: string; nom: string; soni: number } | null>(null);

  useEffect(() => {
    setBosqichlar(asl);
    setKochirish({});
    setNom(voronka.name);
    setNomTahrir(false);
    setXabar(null);
  }, [asl, voronka.name]);

  const ozgardi = nom.trim() !== voronka.name || JSON.stringify(bosqichlar.map(({ kalit: _k, ...b }) => b)) !== JSON.stringify(asl.map(({ kalit: _k, ...b }) => b));

  /** Saqlanmagan o'zgarish bilan chiqish (Orqaga, boshqa voronka) — avval so'raladi. */
  const chiqish = (fn: () => void) => {
    if (!ozgardi || window.confirm(t("Saqlanmagan o'zgarishlar bor. Ularsiz davom etilsinmi?"))) fn();
  };
  // Sahifa yangilansa yoki yopilsa — brauzer o'zi ogohlantiradi
  useEffect(() => {
    if (!ozgardi) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [ozgardi]);

  // ─── Qo'shimcha ma'lumot: bitim soni, qoidalar, sozlamalar, formalar ───
  const [sonlar, setSonlar] = useState<Record<string, number>>({});
  const [qoidalar, setQoidalar] = useState<Qoida[] | null>(null);
  const [soz, setSoz] = useState<Sozlamalar | null>(null);
  const [formalar, setFormalar] = useState<FormaQisqa[] | null>(null);

  const qoidalarniYukla = useCallback(async () => {
    const r = await api.get<{ items: Qoida[] }>(`${base}/crm-app/automations`).catch(() => null);
    setQoidalar(r?.items ?? []);
  }, [base]);
  const sozlamaniYukla = useCallback(async () => {
    const r = await api.get<Sozlamalar>(`${base}/crm-app/settings`).catch(() => null);
    if (r) setSoz(r);
  }, [base]);

  useEffect(() => {
    void qoidalarniYukla();
    void sozlamaniYukla();
    void api
      .get<{ items: FormaQisqa[] }>(`${base}/crm-app/forms`)
      .then((r) => setFormalar(r.items))
      .catch(() => setFormalar([]));
  }, [base, qoidalarniYukla, sozlamaniYukla]);

  useEffect(() => {
    let tirik = true;
    void api
      .get<{ stages: { id: string; count: number }[] }>(`${base}/deals/board?pipeline=${voronka.id}`)
      .then((r) => tirik && setSonlar(Object.fromEntries(r.stages.map((s) => [s.id, s.count]))))
      .catch(() => undefined);
    return () => {
      tirik = false;
    };
  }, [base, voronka.id]);

  // ─── Bosqich amallari ───
  const ochiqlar = bosqichlar.filter((b) => b.kind === 'open');
  const yakuniylar = bosqichlar.filter((b) => b.kind !== 'open');
  const tartiblangan = [...ochiqlar, ...yakuniylar];

  const ozgartir = (kalit: string, o: Partial<Qoralama>) => setBosqichlar((b) => b.map((x) => (x.kalit === kalit ? { ...x, ...o } : x)));
  /** `joy` — shu ochiq bosqichdan keyin (−1: eng boshiga). */
  const qosh = (joy: number) => {
    const k = `yangi-${++yangiKalit}`;
    const rang = RANGLAR[(ochiqlar.length + 3) % RANGLAR.length]!;
    setBosqichlar(() => {
      const ochiq = [...ochiqlar];
      ochiq.splice(joy + 1, 0, { kalit: k, name: '', color: rang, kind: 'open' });
      return [...ochiq, ...yakuniylar];
    });
    setFokus(k);
  };
  const ochir = (kalit: string) => setBosqichlar((b) => b.filter((x) => x.kalit !== kalit));
  /** Bosqichdagi bitimlar: o'zinikilari + boshqa o'chirilgan bosqichlardan unga yo'naltirilganlari. */
  const bitimSoni = (b: Qoralama) =>
    (b.id ? (sonlar[b.id] ?? 0) : 0) + Object.entries(kochirish).reduce((n, [from, to]) => n + (to === b.kalit ? (sonlar[from] ?? 0) : 0), 0);
  const ochirishniBoshla = (b: Qoralama) => {
    const n = bitimSoni(b);
    if (n === 0) {
      ochir(b.kalit);
      return;
    }
    setOchirishOyna({ kalit: b.kalit, nom: b.name || t('Nomsiz bosqich'), soni: n });
  };
  const kochirIbOchir = (kalit: string, maqsad: string) => {
    setKochirish((k) => {
      const n: Record<string, string> = {};
      // Shu bosqichga yo'naltirilganlar ham yangi manzilga o'tadi
      for (const [from, to] of Object.entries(k)) n[from] = to === kalit ? maqsad : to;
      const b = bosqichlar.find((x) => x.kalit === kalit);
      if (b?.id && (sonlar[b.id] ?? 0) > 0) n[b.id] = maqsad;
      return n;
    });
    ochir(kalit);
    setOchirishOyna(null);
  };

  // Sudrab tartiblash — faqat ochiq bosqichlar orasida (yakuniylari doim oxirida)
  const sudralayotgan = useRef<string | null>(null);
  const [ustida, setUstida] = useState<string | null>(null);
  const tushdi = (maqsad: string) => {
    const k = sudralayotgan.current;
    sudralayotgan.current = null;
    setUstida(null);
    if (!k || k === maqsad) return;
    setBosqichlar(() => {
      const ochiq = [...ochiqlar];
      const i = ochiq.findIndex((x) => x.kalit === k);
      const j = ochiq.findIndex((x) => x.kalit === maqsad);
      if (i < 0 || j < 0) return bosqichlar;
      const [b] = ochiq.splice(i, 1);
      ochiq.splice(j, 0, b!);
      return [...ochiq, ...yakuniylar];
    });
  };

  const saqla = async () => {
    setXabar(null);
    const bosh = tartiblangan.find((b) => !b.name.trim());
    if (bosh) {
      setFokus(bosh.kalit);
      return setXabar({ ok: false, matn: t('Bosqich nomini kiriting') });
    }
    if (!nom.trim()) return setXabar({ ok: false, matn: t('Voronka nomini kiriting') });
    setBand(true);
    try {
      if (nom.trim() !== voronka.name) await api.patch(`${base}/pipelines/${voronka.id}`, { name: nom.trim() });
      if (!tashqi) {
        await api.put(`${base}/pipelines/${voronka.id}/stages`, {
          stages: tartiblangan.map((b) => ({ ...(b.id ? { id: b.id } : { key: b.kalit }), name: b.name.trim(), color: b.color, kind: b.kind })),
          moves: Object.entries(kochirish).map(([from, to]) => ({ from, to })),
        });
      }
      await yangila();
      setNomTahrir(false);
      setXabar({ ok: true, matn: t('Saqlandi') });
    } catch (e) {
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    } finally {
      setBand(false);
    }
  };

  // ─── Ko'rsatma, qoida, rad sabablari oynalari ───
  const [korsatma, setKorsatma] = useState<{ id: string; nom: string } | null>(null);
  const [qoidaOyna, setQoidaOyna] = useState<{ q: Qoida | null; bosqichId?: string } | null>(null);
  const [sabablarOyna, setSabablarOyna] = useState(false);

  const sozlamaniSaqla = async (body: Record<string, unknown>) => {
    try {
      await api.patch(`${base}/crm-app/settings`, body);
      await Promise.all([sozlamaniYukla(), yangila()]);
    } catch (e) {
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    }
  };

  const qoidaniAlmashtir = async (q: Qoida) => {
    try {
      const { id: _i, runs: _r, errors: _e, lastRunAt: _l, pipelineId: _p, ...qolgan } = q;
      await api.put(`${base}/crm-app/automations/${q.id}`, { ...qolgan, active: !q.active });
      await qoidalarniYukla();
    } catch (e) {
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    }
  };

  const birinchiBosqich = ochiqlar[0];
  const qoidaBosqichda = (id: string | undefined) => (id ? (qoidalar ?? []).filter((q) => q.stageId === id) : []);
  const bosqichNomi = (id: string) => {
    for (const p of holat.pipelines) {
      const s = p.stages.find((x) => x.id === id);
      if (s) return p.id === voronka.id ? s.name : `${p.name} → ${s.name}`;
    }
    return '—';
  };

  return (
    <div className="vs-sahifa">
      <header className="vs-tepa">
        <VoronkaTanlash
          nom={nom}
          tahrir={nomTahrir}
          onNom={setNom}
          onTahrir={() => setNomTahrir(true)}
          onTanla={(id) => chiqish(() => setParams({ v: id }, { replace: false }))}
          tashqi={Boolean(tashqi)}
        />
        <div className="vs-tepa-ong">
          {xabar && (
            <span className={`vs-xabar${xabar.ok ? ' ok' : ''}`} role={xabar.ok ? 'status' : 'alert'}>
              {xabar.matn}
            </span>
          )}
          <button type="button" className="btn ikkinchi" onClick={() => chiqish(() => navigate(`/crm/bitimlar?v=${voronka.id}`))}>
            {t('Orqaga')}
          </button>
          <button type="button" className="btn" onClick={() => void saqla()} disabled={band || !ozgardi}>
            {band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </div>
      </header>

      {tashqi && (
        <div className="card ci-sinx-qator" role="note">
          <Info aria-hidden="true" />
          {t("Bu voronka {crm} dan sinxronlanadi — bosqichlari {crm} da boshqariladi. Bu yerda triggerlar va ko'rsatmalarni sozlash mumkin.", { crm: tashqi })}
        </div>
      )}

      <div className="vs-ish">
        {/* ─── Chap panel: bitim manbalari ─── */}
        <aside className="vs-manbalar" aria-label={t('Bitim manbalari')}>
          <h2>{t('Bitim manbalari')}</h2>
          <QongiroqManbasi voronkaId={voronka.id} asosiy={voronka.isMain} soz={soz} tashqiSinx={holat.externalSync} onSaqla={sozlamaniSaqla} />
          <section className="vs-manba-karta">
            <div className="vs-manba-bosh">
              <span>
                <b>{t('Dublikatlar nazorati')}</b>
                <small>{t("Bir xil telefon yoki emaildagi kontaktlarni toping va birlashtiring")}</small>
              </span>
              <Users aria-hidden="true" />
            </div>
            <Link className="vs-havola" to="/crm/kontaktlar?tab=dublikat">
              {t('Dublikatlarni ko‘rish')}
            </Link>
          </section>
          <ul className="vs-formalar">
            {(formalar ?? [])
              .filter((f) => f.pipelineId === voronka.id || (!f.pipelineId && voronka.isMain))
              .map((f) => (
                <li key={f.id}>
                  <Link to="/crm/sozlamalar?tab=forma" className="vs-forma">
                    <span className="vs-forma-ikon" aria-hidden="true">
                      <FileText />
                    </span>
                    <span>
                      <b>{f.name}</b>
                      <small>
                        {t('Veb-forma')} · {t('{n} ta murojaat', { n: pul(f.submissions) })}
                        {!f.active && ` · ${t("o'chiq")}`}
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
          <Link className="vs-manba-qosh" to="/crm/sozlamalar?tab=forma">
            <Plus aria-hidden="true" /> {t("Veb-forma qo'shish")}
          </Link>
        </aside>

        {/* ─── Ustunlar ─── */}
        <div className="vs-doska" role="list" aria-label={t('Bosqichlar')}>
          <section className="vs-ustun saralanmagan" role="listitem">
            <header className="vs-ustun-bosh">
              <div className="vs-bosh-qator">
                <h3>{t('Saralanmagan')}</h3>
              </div>
              <span className="vs-chiziq" />
            </header>
            <div className="vs-korsatma-joy" />
            <div className="vs-triggerlar">
              <div className="vs-trigger tizim">
                <span className="vs-trigger-ikon" aria-hidden="true">
                  <ArrowRight />
                </span>
                <span>
                  <small>{t('Murojaat qabul qilinganda')}</small>
                  <b>{t('Bitim «{b}» bosqichiga tushadi', { b: birinchiBosqich?.name || '—' })}</b>
                </span>
              </div>
            </div>
            {!tashqi && <QoshishNuqtasi onClick={() => qosh(-1)} />}
          </section>

          {tartiblangan.map((b, i) => {
            const son = b.id ? (sonlar[b.id] ?? 0) : 0;
            const yagona = b.kind !== 'open' && bosqichlar.filter((x) => x.kind === b.kind).length === 1;
            const oxirgiOchiq = b.kind === 'open' && ochiqlar.length <= 1;
            const ochiradi = !tashqi && !yagona && !oxirgiOchiq;
            const sabab = yagona
              ? t("Voronkada kamida bitta «{t}» bosqichi bo'lishi kerak — nomini o'zgartirishingiz mumkin", { t: b.kind === 'won' ? t('Muvaffaqiyatli') : t("Yo'qotilgan") })
              : oxirgiOchiq
                ? t("Voronkada kamida bitta ochiq bosqich bo'lishi kerak")
                : son > 0
                  ? t("O'chirish — {n} ta bitim boshqa bosqichga o'tkaziladi", { n: pul(son) })
                  : '';
            const ochiqIndeks = ochiqlar.findIndex((x) => x.kalit === b.kalit);
            const hint = b.id ? holat.stageHints?.[b.id] : undefined;
            return (
              <section
                key={b.kalit}
                role="listitem"
                className={`vs-ustun ${b.kind}${ustida === b.kalit ? ' ustida' : ''}`}
                style={{ ['--bosqich' as string]: b.color }}
                onDragOver={(e: DragEvent) => {
                  if (b.kind !== 'open' || !sudralayotgan.current) return;
                  e.preventDefault();
                  setUstida(b.kalit);
                }}
                onDragLeave={() => setUstida((x) => (x === b.kalit ? null : x))}
                onDrop={(e) => {
                  e.preventDefault();
                  tushdi(b.kalit);
                }}
              >
                <BosqichBoshi
                  b={b}
                  tashqi={Boolean(tashqi)}
                  fokus={fokus === b.kalit}
                  onFokusOldi={() => setFokus(null)}
                  onNom={(name) => ozgartir(b.kalit, { name })}
                  onRang={(color) => ozgartir(b.kalit, { color })}
                  ochiradi={ochiradi}
                  ochirishSababi={sabab}
                  onOchir={() => ochirishniBoshla(b)}
                  onSudrashBoshi={() => {
                    sudralayotgan.current = b.kalit;
                  }}
                  onSudrashOxiri={() => {
                    sudralayotgan.current = null;
                    setUstida(null);
                  }}
                />
                <div className="vs-korsatma-joy">
                  {b.id ? (
                    <button type="button" className={`vs-korsatma${hint ? ' bor' : ''}`} onClick={() => setKorsatma({ id: b.id!, nom: b.name })} title={hint}>
                      {hint ? (
                        <>
                          <Info aria-hidden="true" /> <span>{hint}</span>
                        </>
                      ) : (
                        t("Ko'rsatma qo'shish")
                      )}
                    </button>
                  ) : (
                    <span className="vs-izoh">{t('Saqlangandan keyin ko‘rsatma va trigger qo‘shiladi')}</span>
                  )}
                </div>
                <div className="vs-triggerlar">
                  {qoidaBosqichda(b.id).map((q) => (
                    <TriggerKarta key={q.id} q={q} bosqichNomi={bosqichNomi} onOch={() => setQoidaOyna({ q })} onAlmashtir={() => void qoidaniAlmashtir(q)} />
                  ))}
                  {b.kind === 'lost' && (
                    <RadSabablariKarta
                      soni={holat.lossReasons.length}
                      majburiy={soz?.lossReasonRequired ?? holat.lossReasonRequired}
                      onMajburiy={(v) => void sozlamaniSaqla({ lossReasonRequired: v })}
                      onSozla={() => setSabablarOyna(true)}
                    />
                  )}
                  {b.id && (
                    <button type="button" className="vs-trigger-qosh" onClick={() => setQoidaOyna({ q: null, bosqichId: b.id })}>
                      <Plus aria-hidden="true" /> {t("Trigger qo'shish")}
                    </button>
                  )}
                </div>
                {!tashqi && b.kind === 'open' && <QoshishNuqtasi onClick={() => qosh(ochiqIndeks)} />}
                {i === tartiblangan.length - 1 && <span className="vs-oxir" aria-hidden="true" />}
              </section>
            );
          })}
        </div>
      </div>

      {korsatma && (
        <KorsatmaOyna
          bosqich={korsatma.nom}
          matn={holat.stageHints?.[korsatma.id] ?? ''}
          onYop={() => setKorsatma(null)}
          onSaqla={async (text) => {
            await sozlamaniSaqla({ stageHint: { stageId: korsatma.id, text } });
            setKorsatma(null);
          }}
        />
      )}
      {qoidaOyna && (
        <QoidaOyna
          q={qoidaOyna.q}
          bosqichId={qoidaOyna.bosqichId}
          onYop={() => setQoidaOyna(null)}
          onSaqlandi={() => {
            setQoidaOyna(null);
            void qoidalarniYukla();
          }}
        />
      )}
      {ochirishOyna && (
        <OchirishOyna
          nom={ochirishOyna.nom}
          soni={ochirishOyna.soni}
          variantlar={tartiblangan.filter((x) => x.kalit !== ochirishOyna.kalit)}
          onYop={() => setOchirishOyna(null)}
          onTasdiq={(maqsad) => kochirIbOchir(ochirishOyna.kalit, maqsad)}
        />
      )}
      {sabablarOyna && (
        <Oyna sarlavha={t('Rad sabablari')} onYop={() => setSabablarOyna(false)} keng>
          <RadSabablariSozlama />
        </Oyna>
      )}
    </div>
  );
}

// ─── Tepa: voronka nomi va almashtirish ──────────────────────────────────────

function VoronkaTanlash({
  nom,
  tahrir,
  onNom,
  onTahrir,
  onTanla,
  tashqi,
}: {
  nom: string;
  tahrir: boolean;
  onNom: (v: string) => void;
  onTahrir: () => void;
  onTanla: (id: string) => void;
  tashqi: boolean;
}) {
  const { holat } = useCrm();
  const t = useT();
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ochiq) return;
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOchiq(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [ochiq]);

  return (
    <div className="vs-voronka" ref={ref}>
      {tahrir ? (
        <input className="input vs-voronka-input" autoFocus value={nom} maxLength={100} onChange={(e) => onNom(e.target.value)} aria-label={t('Voronka nomi')} />
      ) : (
        <h1>{nom}</h1>
      )}
      {!tahrir && !tashqi && (
        <button type="button" className="vs-ikon" onClick={onTahrir} aria-label={t('Nomini o‘zgartirish')} title={t('Nomini o‘zgartirish')}>
          <Pencil />
        </button>
      )}
      {holat.pipelines.length > 1 && (
        <button type="button" className="vs-ikon" onClick={() => setOchiq((v) => !v)} aria-expanded={ochiq} aria-label={t('Boshqa voronka')} title={t('Boshqa voronka')}>
          <ChevronDown />
        </button>
      )}
      {ochiq && (
        <ul className="vs-voronka-royxat" role="menu">
          {holat.pipelines.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOchiq(false);
                  onTanla(p.id);
                }}
              >
                {p.name}
                <small>{t('{n} ta bosqich', { n: p.stages.length })}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Bosqich ustuni boshi: nom, rang, o'chirish, sudrash ─────────────────────

function BosqichBoshi({
  b,
  tashqi,
  fokus,
  onFokusOldi,
  onNom,
  onRang,
  ochiradi,
  ochirishSababi,
  onOchir,
  onSudrashBoshi,
  onSudrashOxiri,
}: {
  b: Qoralama;
  tashqi: boolean;
  fokus: boolean;
  onFokusOldi: () => void;
  onNom: (v: string) => void;
  onRang: (v: string) => void;
  ochiradi: boolean;
  ochirishSababi: string;
  onOchir: () => void;
  onSudrashBoshi: () => void;
  onSudrashOxiri: () => void;
}) {
  const t = useT();
  const [tahrir, setTahrir] = useState(!b.id);
  const [palitra, setPalitra] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const palitraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fokus) return;
    setTahrir(true);
    requestAnimationFrame(() => inputRef.current?.focus());
    onFokusOldi();
  }, [fokus, onFokusOldi]);
  useEffect(() => {
    if (!palitra) return;
    const f = (e: MouseEvent) => !palitraRef.current?.contains(e.target as Node) && setPalitra(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [palitra]);

  const turNomi = b.kind === 'won' ? t('Muvaffaqiyatli') : b.kind === 'lost' ? t("Yo'qotilgan") : null;

  return (
    <header className="vs-ustun-bosh">
      <div className="vs-bosh-qator">
        {b.kind === 'open' && !tashqi && (
          <span
            className="vs-sudrash"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', b.kalit);
              onSudrashBoshi();
            }}
            onDragEnd={onSudrashOxiri}
            title={t('Sudrab tartibini almashtiring')}
            aria-hidden="true"
          >
            <GripVertical />
          </span>
        )}
        {tahrir && !tashqi ? (
          <input
            ref={inputRef}
            className="vs-nom-input"
            value={b.name}
            maxLength={100}
            placeholder={t('Bosqich nomi')}
            aria-label={t('Bosqich nomi')}
            onChange={(e) => onNom(e.target.value)}
            onBlur={() => b.name.trim() && setTahrir(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && b.name.trim()) setTahrir(false);
            }}
          />
        ) : (
          <h3
            // Tur (muvaffaqiyatli / yo'qotilgan) izohda — ustun chiziqlari bir qatorda tursin
            title={[turNomi, tashqi ? b.name : t('Nomini o‘zgartirish uchun bosing')].filter(Boolean).join(' · ')}
            onClick={() => !tashqi && setTahrir(true)}
            onKeyDown={(e) => e.key === 'Enter' && !tashqi && setTahrir(true)}
            tabIndex={tashqi ? undefined : 0}
          >
            {b.name || t('Nomsiz bosqich')}
          </h3>
        )}
        {!tashqi && (
          <span className="vs-bosh-amallar">
            <span className="vs-rang-qobiq" ref={palitraRef}>
              <button type="button" className="vs-rang" style={{ background: b.color }} onClick={() => setPalitra((v) => !v)} aria-label={t('Bosqich rangi')} title={t('Bosqich rangi')} aria-expanded={palitra} />
              {palitra && (
                <div className="vs-palitra" role="listbox" aria-label={t('Bosqich rangi')}>
                  {RANGLAR.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="option"
                      aria-selected={r === b.color}
                      className={r === b.color ? 'tanlangan' : undefined}
                      style={{ background: r }}
                      onClick={() => {
                        onRang(r);
                        setPalitra(false);
                      }}
                      aria-label={r}
                    />
                  ))}
                </div>
              )}
            </span>
            <button
              type="button"
              className="vs-ochir"
              onClick={onOchir}
              disabled={!ochiradi}
              aria-label={t("Bosqichni o'chirish")}
              title={ochiradi ? t("Bosqichni o'chirish") : ochirishSababi}
            >
              <Trash2 />
            </button>
          </span>
        )}
      </div>
      <span className="vs-chiziq" />
    </header>
  );
}

/** Ustunlar orasidagi (+): shu joyga yangi ochiq bosqich. */
function QoshishNuqtasi({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" className="vs-plus" onClick={onClick} aria-label={t("Shu yerga bosqich qo'shish")} title={t("Shu yerga bosqich qo'shish")}>
      <Plus />
    </button>
  );
}

// ─── Trigger (avtomatika qoidasi) kartasi ────────────────────────────────────

const AMAL_IKON: Record<Amal['type'], LucideIcon> = {
  task: CircleCheck,
  responsible: UserRound,
  move: ArrowRight,
  tag: Tag,
  note: FileText,
  copy: Copy,
};

function TriggerKarta({ q, bosqichNomi, onOch, onAlmashtir }: { q: Qoida; bosqichNomi: (id: string) => string; onOch: () => void; onAlmashtir: () => void }) {
  const { holat } = useCrm();
  const t = useT();
  const birinchi = q.actions[0];
  const Ikon = birinchi ? AMAL_IKON[birinchi.type] : CircleCheck;
  const qachon = (() => {
    if (q.conditions.trigger === 'date') {
      const m = holat.fields.find((f) => f.id === q.conditions.dateFieldId);
      const n = q.conditions.daysBefore ?? 0;
      return n > 0 ? t('«{m}» gacha {n} kun qolganda', { m: m?.label ?? '—', n }) : t('«{m}» kuni', { m: m?.label ?? '—' });
    }
    return q.delayMinutes === 0 ? t("Bosqichga o'tganda yoki shu bosqichda yaratilganda") : t("Bosqichga o'tgandan {v}", { v: kechikishMatni(q.delayMinutes, t) });
  })();
  const amalMatni = (a: Amal): { bosh: string; tafsilot?: string } => {
    if (a.type === 'task') return { bosh: t('Vazifa yaratish: {v}', { v: holat.taskTypes.find((x) => x.id === a.taskType)?.name ?? t('Vazifa') }), tafsilot: a.title };
    if (a.type === 'responsible') return { bosh: a.mode === 'seat' ? t("Mas'ulni almashtirish") : t("Mas'ul: navbat bilan") };
    if (a.type === 'move') return { bosh: t('Bosqichni o‘zgartirish'), tafsilot: bosqichNomi(a.stageId) };
    if (a.type === 'tag') return { bosh: t("Teg qo'shish"), tafsilot: a.tag };
    if (a.type === 'copy') return { bosh: t('Boshqa voronkada nusxa'), tafsilot: bosqichNomi(a.stageId) };
    return { bosh: t("Izoh qo'shish"), tafsilot: a.text };
  };
  const asosiy = birinchi ? amalMatni(birinchi) : { bosh: q.name };
  return (
    <div className={`vs-trigger${q.active ? '' : ' ochiq-emas'}`}>
      <button type="button" className="vs-trigger-asos" onClick={onOch} title={q.name}>
        <span className="vs-trigger-ikon" aria-hidden="true">
          <Ikon />
        </span>
        <span className="vs-trigger-matn">
          <small>
            {qachon}
            {q.conditions.onlyIfNoOpenTasks && ` · ${t('vazifasi bo‘lmasa')}`}
          </small>
          <b>{asosiy.bosh}</b>
          {asosiy.tafsilot && <span>{asosiy.tafsilot}</span>}
          {q.actions.length > 1 && <span className="vs-izoh">{t('+{n} ta amal', { n: q.actions.length - 1 })}</span>}
          {q.errors > 0 && <span className="vs-xato-son">{t('{n} xato', { n: q.errors })}</span>}
        </span>
      </button>
      <label className="vs-almash" title={q.active ? t("O'chirish") : t('Yoqish')}>
        <input type="checkbox" checked={q.active} onChange={onAlmashtir} aria-label={t('Faol')} />
        <span />
      </label>
    </div>
  );
}

function RadSabablariKarta({ soni, majburiy, onMajburiy, onSozla }: { soni: number; majburiy: boolean; onMajburiy: (v: boolean) => void; onSozla: () => void }) {
  const t = useT();
  return (
    <section className="vs-blok">
      <div className="vs-blok-bosh">
        <span>
          <Ban aria-hidden="true" /> {t('Rad sabablari')}
        </span>
        <label className="vs-almash" title={t('Yo‘qotishda sabab majburiy')}>
          <input type="checkbox" checked={majburiy} onChange={(e) => onMajburiy(e.target.checked)} aria-label={t('Yo‘qotishda sabab majburiy')} />
          <span />
        </label>
      </div>
      <p>{t("Rad sabablarini sozlang va zaif joylarni aniqlang — sotuv samaradorligi oshadi.")}</p>
      <p className="vs-izoh">
        {t('{n} ta sabab', { n: soni })} · {majburiy ? t('tanlash majburiy') : t('tanlash ixtiyoriy')}
      </p>
      <button type="button" className="vs-havola" onClick={onSozla}>
        {t('Sozlash')}
      </button>
    </section>
  );
}

// ─── Manba: qo'ng'iroqlar ───────────────────────────────────────────────────

function QongiroqManbasi({
  voronkaId,
  asosiy,
  soz,
  tashqiSinx,
  onSaqla,
}: {
  voronkaId: string;
  asosiy: boolean;
  soz: Sozlamalar | null;
  tashqiSinx: string | null | undefined;
  onSaqla: (body: Record<string, unknown>) => Promise<void>;
}) {
  const { holat } = useCrm();
  const t = useT();
  const [band, setBand] = useState(false);
  const ci = soz?.callIntake;
  const nishon = ci ? (ci.pipelineId ?? holat.pipelines.find((p) => p.isMain)?.id ?? null) : null;
  const shuyerga = Boolean(ci?.enabled && nishon === voronkaId);
  const boshqa = ci?.enabled && nishon && nishon !== voronkaId ? holat.pipelines.find((p) => p.id === nishon)?.name : null;
  const yoz = async (o: Partial<Sozlamalar['callIntake']>) => {
    if (!ci) return;
    setBand(true);
    await onSaqla({ callIntake: { enabled: ci.enabled, pipelineId: ci.pipelineId, autoAccept: ci.autoAccept, ...o } });
    setBand(false);
  };
  return (
    <section className="vs-manba-karta">
      <div className="vs-manba-bosh">
        <span>
          <b>{t("Qo'ng'iroqlar")}</b>
          <small>
            {tashqiSinx
              ? t("{crm} sinxronlanayotgani uchun qo'ng'iroqlardan qabul o'chiq", { crm: tashqiSinx })
              : shuyerga
                ? t("Yangi qo'ng'iroqlar shu voronkaga tushadi")
                : boshqa
                  ? t("Hozir «{v}» voronkasiga tushadi", { v: boshqa })
                  : t("Qo'ng'iroqlardan qabul o'chiq")}
          </small>
        </span>
        <label className="vs-almash" title={t('Shu voronkaga')}>
          <input
            type="checkbox"
            checked={shuyerga}
            disabled={!ci || band || Boolean(tashqiSinx)}
            onChange={(e) =>
              void yoz(e.target.checked ? { enabled: true, pipelineId: asosiy ? null : voronkaId } : { enabled: false })
            }
            aria-label={t("Qo'ng'iroqlar shu voronkaga tushsin")}
          />
          <span />
        </label>
      </div>
      {shuyerga && ci && (
        <label className="vs-ichki">
          <span>
            <b>{t('Saralanmagan')}</b>
            <small>{t("Kelgan murojaatlar avval «Saralanmagan»ga tushadi; o'chirilsa — darhol bitim yaratiladi")}</small>
          </span>
          <span className="vs-almash">
            <input type="checkbox" checked={!ci.autoAccept} disabled={band} onChange={(e) => void yoz({ autoAccept: !e.target.checked })} aria-label={t('Saralanmagan orqali')} />
            <span />
          </span>
        </label>
      )}
      <span className="vs-manba-belgi" aria-hidden="true">
        <Phone />
      </span>
    </section>
  );
}

// ─── Bitimli bosqichni o'chirish: bitimlar qayerga ────────────────────────────

function OchirishOyna({
  nom,
  soni,
  variantlar,
  onYop,
  onTasdiq,
}: {
  nom: string;
  soni: number;
  variantlar: Qoralama[];
  onYop: () => void;
  onTasdiq: (kalit: string) => void;
}) {
  const t = useT();
  // Odatda — birinchi ochiq bosqich (amoCRM'dagidek "Неразобранное"dan keyingi)
  const [maqsad, setMaqsad] = useState(variantlar.find((v) => v.kind === 'open')?.kalit ?? variantlar[0]?.kalit ?? '');
  const tur = (k: BosqichTuri) => (k === 'won' ? t('Muvaffaqiyatli') : k === 'lost' ? t("Yo'qotilgan") : null);
  return (
    <Oyna
      sarlavha={t('«{b}» bosqichini o‘chirish', { b: nom })}
      onYop={onYop}
      onSubmit={() => maqsad && onTasdiq(maqsad)}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor qilish')}
          </button>
          <button type="submit" className="btn xavfli" disabled={!maqsad}>
            <Trash2 /> {t("O'tkazish va o'chirish")}
          </button>
        </>
      }
    >
      <p className="yordam">{t("Bu bosqichda {n} ta bitim bor. Ular qaysi bosqichga o'tkazilsin? Har bitim tarixida bosqich o'zgargani yoziladi.", { n: pul(soni) })}</p>
      <div className="vs-maqsadlar" role="radiogroup" aria-label={t('Qaysi bosqichga')}>
        {variantlar.map((v) => (
          <label key={v.kalit} className={`vs-maqsad${maqsad === v.kalit ? ' tanlangan' : ''}`} style={{ ['--bosqich' as string]: v.color }}>
            <input type="radio" name="vs-maqsad" checked={maqsad === v.kalit} onChange={() => setMaqsad(v.kalit)} />
            <span className="vs-maqsad-rang" aria-hidden="true" />
            <span className="vs-maqsad-nom">{v.name || t('Nomsiz bosqich')}</span>
            {tur(v.kind) && <small className={`vs-maqsad-tur ${v.kind}`}>{tur(v.kind)}</small>}
          </label>
        ))}
      </div>
      <p className="yordam">{t("O'chirish «Saqlash» bosilgandan keyin bajariladi — ungacha bekor qilish mumkin.")}</p>
    </Oyna>
  );
}

// ─── Ko'rsatma oynasi ───────────────────────────────────────────────────────

function KorsatmaOyna({ bosqich, matn, onYop, onSaqla }: { bosqich: string; matn: string; onYop: () => void; onSaqla: (v: string) => Promise<void> }) {
  const t = useT();
  const [v, setV] = useState(matn);
  const [band, setBand] = useState(false);
  return (
    <Oyna
      sarlavha={t('«{b}» bosqichi uchun ko‘rsatma', { b: bosqich })}
      onYop={onYop}
      onSubmit={async () => {
        setBand(true);
        await onSaqla(v.trim());
        setBand(false);
      }}
      past={
        <>
          {matn && (
            <button
              type="button"
              className="btn ikkinchi"
              disabled={band}
              onClick={async () => {
                setBand(true);
                await onSaqla('');
                setBand(false);
              }}
            >
              <X /> {t("O'chirish")}
            </button>
          )}
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor qilish')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </>
      }
    >
      <p className="yordam">{t("Menejer shu bosqichda nima qilishi kerak — qisqa eslatma. Kanbanda ustun boshida ko'rinadi.")}</p>
      <div className="maydon-blok">
        <label htmlFor="vs-korsatma">{t("Ko'rsatma")}</label>
        <textarea id="vs-korsatma" rows={5} maxLength={1000} value={v} onChange={(e) => setV(e.target.value)} placeholder={t('Masalan: 24 soat ichida qo‘ng‘iroq qiling, ehtiyojni aniqlang va uchrashuv belgilang')} />
      </div>
    </Oyna>
  );
}
