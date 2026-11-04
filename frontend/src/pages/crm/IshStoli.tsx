import { ArrowLeft, ArrowRight, CalendarRange, Check, ListChecks, Pencil, Plus, RotateCcw, Send, Settings2, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { useAuth } from '../../auth';
import { davrHisobla, useCrm, type DavrTuri } from '../../crm/malumot';
import { BitimVidjetTahrir, VidjetQoshish } from '../../crm/panel/Sozlash';
import { STANDART_TARTIB, STANDART_TURLAR, VIDJET_META, type BitimVidjetNatija, type PanelJavob, type Vidjet } from '../../crm/panel/turlar';
import { VidjetIchi, type VidjetKontekst } from '../../crm/panel/Vidjetlar';
import '../../crm/panel/panel.css';
import { useT } from '../../i18n';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM BOSH SAHIFASI — amoCRM "Рабочий стол" namunasida, SotuvAI dizaynida
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tepada biznes nomi va "Hodisalar"; ostida AI yordamchiga savol; keyin
 * bitta filtr qatori (davr + kim) — u BARCHA vidjetlarga qo'llanadi.
 * Vidjetlar 6 ustunli to'rda: kichik (1×1), o'rta (2×2), keng (4×2).
 *
 * "Sozlash" — tahrirlash rejimi: vidjet qo'shish, olib tashlash, surib
 * (yoki ←/→ tugmalari bilan) tartibini almashtirish, maxsus bitim vidjeti.
 * Tartib har foydalanuvchiniki alohida serverda saqlanadi.
 */

const DAVR_KALIT = 'sotuvai-crm-panel-davr';
const DAVRLAR: { tur: DavrTuri; nom: string; izoh: string }[] = [
  { tur: 'bugun', nom: 'Bugun', izoh: 'bugun##davr' },
  { tur: 'kecha', nom: 'Kecha', izoh: 'kecha##davr' },
  { tur: 'hafta', nom: 'Hafta', izoh: '7 kunda##davr' },
  { tur: 'oy', nom: 'Oy', izoh: 'shu oyda##davr' },
];
const YANGILASH_MS = 2 * 60_000;

function toza(widgets: Vidjet[]): Vidjet[] {
  const turlar = new Set<string>([...STANDART_TURLAR, 'deals']);
  return widgets.filter((w) => turlar.has(w.type));
}

function yangiId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function IshStoli() {
  const { holat, base, seatlar } = useCrm();
  const { business, user } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const rahbar = holat.scope === 'all';

  // ─── Filtr: davr va kim ───
  const bugun = new Date().toISOString().slice(0, 10);
  const [tur, setTur] = useState<DavrTuri>(() => {
    try {
      const v = localStorage.getItem(DAVR_KALIT) as DavrTuri | null;
      return v && DAVRLAR.some((d) => d.tur === v) ? v : 'bugun';
    } catch {
      return 'bugun';
    }
  });
  const [maxsus, setMaxsus] = useState({ from: bugun.slice(0, 8) + '01', to: bugun });
  const [maxsusOchiq, setMaxsusOchiq] = useState(false);
  const [seat, setSeat] = useState('');
  const davr = useMemo(() => davrHisobla(tur, maxsus), [tur, maxsus]);
  const davrIzoh = tur === 'maxsus' ? t('davrda##davr') : t(DAVRLAR.find((d) => d.tur === tur)?.izoh ?? 'bugun##davr');

  const tanlaDavr = (yangi: DavrTuri) => {
    setTur(yangi);
    setMaxsusOchiq(false);
    try {
      localStorage.setItem(DAVR_KALIT, yangi);
    } catch {
      /* ixtiyoriy */
    }
  };

  // ─── Vidjetlar tartibi ───
  const [widgets, setWidgets] = useState<Vidjet[] | null>(null);
  const [tahrir, setTahrir] = useState<Vidjet[] | null>(null);
  const [qoshish, setQoshish] = useState(false);
  const [bitimOyna, setBitimOyna] = useState<{ w: Vidjet | null } | null>(null);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);

  useEffect(() => {
    let tirik = true;
    api
      .get<{ widgets: Vidjet[] | null }>(`${base}/crm-app/dashboard`)
      .then((r) => tirik && setWidgets(r.widgets ? toza(r.widgets) : STANDART_TARTIB))
      .catch(() => tirik && setWidgets(STANDART_TARTIB));
    return () => {
      tirik = false;
    };
  }, [base]);

  const korinadi = tahrir ?? widgets ?? [];

  // ─── Ma'lumot ───
  const [data, setData] = useState<PanelJavob | null>(null);
  const [bitim, setBitim] = useState<Record<string, BitimVidjetNatija | null>>({});
  const [xato, setXato] = useState<string | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [yangilash, setYangilash] = useState(0);

  useEffect(() => {
    let tirik = true;
    setYuklanmoqda(true);
    const q = new URLSearchParams({ from: davr.from, to: davr.to });
    if (seat) q.set('seat', seat);
    api
      .get<PanelJavob>(`${base}/crm-app/reports/panel?${q}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")))
      .finally(() => tirik && setYuklanmoqda(false));
    return () => {
      tirik = false;
    };
  }, [base, davr, seat, t, yangilash]);

  // Maxsus bitim vidjetlari — filtri o'zgarganda ham qayta so'raladi
  const bitimVidjetlari = korinadi.filter((w) => w.type === 'deals' && w.filter);
  const bitimKalit = JSON.stringify(bitimVidjetlari.map((w) => [w.id, w.filter]));
  useEffect(() => {
    const royxat = JSON.parse(bitimKalit) as [string, Vidjet['filter']][];
    if (!royxat.length) return;
    let tirik = true;
    api
      .post<{ results: Record<string, BitimVidjetNatija | null> }>(`${base}/crm-app/reports/panel/deals`, {
        from: davr.from,
        to: davr.to,
        ...(seat ? { seat } : {}),
        widgets: royxat.map(([id, filter]) => ({ id, filter })),
      })
      .then((r) => tirik && setBitim(r.results))
      .catch(() => tirik && setBitim(Object.fromEntries(royxat.map(([id]) => [id, null]))));
    return () => {
      tirik = false;
    };
  }, [base, davr, seat, bitimKalit, yangilash]);

  // Ochiq turgan sahifa o'zi yangilanib tursin (amoCRM'dagidek)
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && setYangilash((x) => x + 1), YANGILASH_MS);
    return () => clearInterval(id);
  }, []);

  const bosqichVoronkasi = useCallback(
    (stageId: string) => holat.pipelines.find((p) => p.stages.some((s) => s.id === stageId))?.id ?? null,
    [holat.pipelines],
  );

  const och = useCallback(
    (yol: string) => {
      if (tahrir) return;
      // Bitimlar ro'yxatiga o'tganda tanlangan menejer filtri ham ergashadi
      const [p, q = ''] = yol.split('?');
      const s = new URLSearchParams(q);
      if (seat && p === '/crm/bitimlar' && !s.has('seat')) s.set('seat', seat);
      navigate(s.toString() ? `${p}?${s}` : p!);
    },
    [navigate, seat, tahrir],
  );

  const ctxAsos: Omit<VidjetKontekst, 'bitim'> = { data, davrIzoh, och, bosqichVoronkasi };

  // ─── Tahrirlash ───
  const tahrirgaKir = () => {
    setTahrir([...(widgets ?? STANDART_TARTIB)]);
    setXabar(null);
  };
  const saqla = async () => {
    if (!tahrir) return;
    setSaqlanmoqda(true);
    try {
      await api.put(`${base}/crm-app/dashboard`, { widgets: tahrir });
      setWidgets(tahrir);
      setTahrir(null);
    } catch (e) {
      setXabar(e instanceof ApiError ? t(e.message) : t("Saqlab bo'lmadi"));
    } finally {
      setSaqlanmoqda(false);
    }
  };
  const standartga = () => {
    setTahrir([...STANDART_TARTIB, ...(tahrir ?? []).filter((w) => w.type === 'deals')]);
  };
  const surish = (i: number, j: number) => {
    setTahrir((r) => {
      if (!r || j < 0 || j >= r.length || i === j) return r;
      const n = [...r];
      const [w] = n.splice(i, 1);
      n.splice(j, 0, w!);
      return n;
    });
  };
  const olibTashla = (id: string) => setTahrir((r) => (r ? r.filter((w) => w.id !== id) : r));

  const surilayotgan = useRef<number | null>(null);
  const [ustida, setUstida] = useState<number | null>(null);

  // ─── AI savol ───
  const [savol, setSavol] = useState('');
  const sora = (e: FormEvent) => {
    e.preventDefault();
    const q = savol.trim();
    if (q) navigate(`/crm/ai-chat?q=${encodeURIComponent(q)}`);
  };
  const ism = user?.displayName?.split(' ')[0] ?? '';

  return (
    <div className={`pn-sahifa${tahrir ? ' tahrirda' : ''}`}>
      <header className="pn-sarlavha">
        <span aria-hidden="true" />
        <h1>{business?.name}</h1>
        <div className="pn-sarlavha-ong">
          <button type="button" className="btn ikkinchi kichik" onClick={() => navigate('/crm/voronka-tahlili?tab=jurnal')}>
            <ListChecks /> {t('Hodisalar')}
          </button>
        </div>
      </header>

      <form className="pn-ai" onSubmit={sora} aria-label={t('AI yordamchiga savol')}>
        <span className="pn-ai-avatar" aria-hidden="true">
          <Sparkles />
        </span>
        <div className="pn-ai-maydon">
          <textarea
            value={savol}
            onChange={(e) => setSavol(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder={ism ? t('Salom, {ism}! Men SotuvAI yordamchisiman. Nimadan boshlaymiz?', { ism }) : t('Salom! Men SotuvAI yordamchisiman. Nimadan boshlaymiz?')}
            aria-label={t('Savolingizni yozing…')}
          />
          <button type="submit" disabled={!savol.trim()} aria-label={t('Yuborish')} title={t('Yuborish')}>
            <Send />
          </button>
        </div>
      </form>

      <div className="pn-filtr">
        <div className="pn-filtr-markaz">
          <div className="tab-qator" role="tablist" aria-label={t('Davr')}>
            {DAVRLAR.map((d) => (
              <button key={d.tur} type="button" role="tab" aria-selected={tur === d.tur} className={`tab${tur === d.tur ? ' active' : ''}`} onClick={() => tanlaDavr(d.tur)}>
                {t(d.nom)}
              </button>
            ))}
            <div className="pn-davr-qobiq">
              <button
                type="button"
                role="tab"
                aria-selected={tur === 'maxsus'}
                aria-expanded={maxsusOchiq}
                className={`tab${tur === 'maxsus' ? ' active' : ''}`}
                onClick={() => setMaxsusOchiq((v) => !v)}
              >
                <CalendarRange /> {tur === 'maxsus' ? `${maxsus.from.slice(5).split('-').reverse().join('.')} – ${maxsus.to.slice(5).split('-').reverse().join('.')}` : t('Davr')}
              </button>
              {maxsusOchiq && <MaxsusDavr boshlangich={maxsus} onQollash={(m) => (setMaxsus(m), setTur('maxsus'), setMaxsusOchiq(false))} onYop={() => setMaxsusOchiq(false)} />}
            </div>
          </div>

          {rahbar ? (
            <div className="tab-qator" role="tablist" aria-label={t('Kimniki')}>
              <button type="button" role="tab" aria-selected={!seat} className={`tab${!seat ? ' active' : ''}`} onClick={() => setSeat('')}>
                {t('Hammasi')}
              </button>
              {holat.seatId && (
                <button type="button" role="tab" aria-selected={seat === holat.seatId} className={`tab${seat === holat.seatId ? ' active' : ''}`} onClick={() => setSeat(holat.seatId!)}>
                  {t('Meniki')}
                </button>
              )}
              {seatlar.length > 0 && (
                <select
                  className={`pn-menejer${seat && seat !== holat.seatId ? ' active' : ''}`}
                  value={seat && seat !== holat.seatId ? seat : ''}
                  onChange={(e) => setSeat(e.target.value)}
                  aria-label={t('Menejer')}
                >
                  <option value="">{t('Menejer…')}</option>
                  {seatlar.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <span className="pn-meniki">{t("Faqat sizning bitim va vazifalaringiz")}</span>
          )}
        </div>

        <div className="pn-filtr-ong">
          {tahrir ? (
            <>
              <button type="button" className="btn ikkinchi kichik" onClick={standartga} title={t('Standart vidjetlarni qaytarish')}>
                <RotateCcw /> {t('Standart')}
              </button>
              <button type="button" className="btn ikkinchi kichik" onClick={() => setTahrir(null)}>
                <X /> {t('Bekor qilish')}
              </button>
              <button type="button" className="btn kichik" onClick={() => void saqla()} disabled={saqlanmoqda}>
                <Check /> {saqlanmoqda ? t('Saqlanmoqda…') : t('Saqlash')}
              </button>
            </>
          ) : (
            <button type="button" className="btn ikkinchi kichik" onClick={tahrirgaKir} disabled={!widgets}>
              <Settings2 /> {t('Sozlash')}
            </button>
          )}
        </div>
      </div>

      {tahrir && (
        <p className="pn-tahrir-izoh" role="status">
          {xabar ?? t("Vidjetlarni surib joyini almashtiring, keraksizini × bilan olib tashlang. Tugagach — «Saqlash».")}
        </p>
      )}
      {xato && !data && (
        <div className="card xato-qator pn-xato">
          {xato}{' '}
          <button type="button" className="btn ikkinchi kichik" onClick={() => setYangilash((x) => x + 1)}>
            {t('Qayta urinish')}
          </button>
        </div>
      )}

      <div className={`pn-tor${yuklanmoqda && data ? ' yangilanmoqda' : ''}`} aria-busy={yuklanmoqda}>
        {!widgets && Array.from({ length: 8 }, (_, i) => <div key={i} className={`pn-karta ${i % 3 ? 's' : 'm'} skelet`} aria-hidden="true" />)}
        {korinadi.map((w, i) => {
          const meta = VIDJET_META[w.type];
          const nom = w.type === 'deals' ? (w.title ?? t('Bitimlar')) : t(meta.nom);
          return (
            <section
              key={w.id}
              className={`pn-karta ${meta.olcham}${ustida === i ? ' ustida' : ''}`}
              aria-label={nom}
              draggable={Boolean(tahrir)}
              onDragStart={(e) => {
                surilayotgan.current = i;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (!tahrir || surilayotgan.current === null) return;
                e.preventDefault();
                setUstida(i);
              }}
              onDragLeave={() => setUstida((x) => (x === i ? null : x))}
              onDrop={(e) => {
                e.preventDefault();
                if (surilayotgan.current !== null) surish(surilayotgan.current, i);
                surilayotgan.current = null;
                setUstida(null);
              }}
              onDragEnd={() => {
                surilayotgan.current = null;
                setUstida(null);
              }}
            >
              <header className="pn-karta-bosh">
                <h2 title={nom}>{nom}</h2>
                {tahrir && (
                  <span className="pn-karta-amallar">
                    <button type="button" onClick={() => surish(i, i - 1)} disabled={i === 0} aria-label={t('Oldinga surish')} title={t('Oldinga surish')}>
                      <ArrowLeft />
                    </button>
                    <button type="button" onClick={() => surish(i, i + 1)} disabled={i === korinadi.length - 1} aria-label={t('Orqaga surish')} title={t('Orqaga surish')}>
                      <ArrowRight />
                    </button>
                    {w.type === 'deals' && (
                      <button type="button" onClick={() => setBitimOyna({ w })} aria-label={t('Tahrirlash')} title={t('Tahrirlash')}>
                        <Pencil />
                      </button>
                    )}
                    <button type="button" className="xavfli" onClick={() => olibTashla(w.id)} aria-label={t('Olib tashlash')} title={t('Olib tashlash')}>
                      <X />
                    </button>
                  </span>
                )}
              </header>
              <div className="pn-karta-ich">
                <VidjetIchi w={w} ctx={{ ...ctxAsos, bitim: w.type === 'deals' ? bitim[w.id] : null }} />
              </div>
            </section>
          );
        })}
        {tahrir && (
          <button type="button" className="pn-karta s pn-qosh" onClick={() => setQoshish(true)}>
            <Plus />
            <span>{t("Vidjet qo'shish")}</span>
          </button>
        )}
      </div>

      {qoshish && tahrir && (
        <VidjetQoshish
          mavjud={tahrir}
          onYop={() => setQoshish(false)}
          onQosh={(type) => {
            setTahrir((r) => [...(r ?? []), { id: type, type }]);
            setQoshish(false);
          }}
          onBitim={() => {
            setQoshish(false);
            setBitimOyna({ w: null });
          }}
        />
      )}
      {bitimOyna && (
        <BitimVidjetTahrir
          boshlangich={bitimOyna.w}
          voronkalar={holat.pipelines}
          seatlar={seatlar}
          onYop={() => setBitimOyna(null)}
          onSaqla={({ title, filter }) => {
            const eski = bitimOyna.w;
            setTahrir((r) => {
              const asos = r ?? [...(widgets ?? STANDART_TARTIB)];
              return eski ? asos.map((w) => (w.id === eski.id ? { ...w, title, filter } : w)) : [...asos, { id: yangiId(), type: 'deals', title, filter }];
            });
            setBitimOyna(null);
          }}
        />
      )}
    </div>
  );
}

function MaxsusDavr({ boshlangich, onQollash, onYop }: { boshlangich: { from: string; to: string }; onQollash: (m: { from: string; to: string }) => void; onYop: () => void }) {
  const t = useT();
  const [f, setF] = useState(boshlangich.from);
  const [to, setTo] = useState(boshlangich.to);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tashqi = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onYop();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    document.addEventListener('mousedown', tashqi);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', tashqi);
      document.removeEventListener('keydown', esc);
    };
  }, [onYop]);
  return (
    <div className="pn-davr-oyna" ref={ref} role="dialog" aria-label={t('Davr')}>
      <label>
        <span>{t('Boshlanish')}</span>
        <input className="input" type="date" value={f} max={to} onChange={(e) => setF(e.target.value)} />
      </label>
      <label>
        <span>{t('Tugash')}</span>
        <input className="input" type="date" value={to} min={f} onChange={(e) => setTo(e.target.value)} />
      </label>
      <button type="button" className="btn kichik" disabled={!f || !to || f > to} onClick={() => onQollash({ from: f, to })}>
        {t("Qo'llash")}
      </button>
    </div>
  );
}
