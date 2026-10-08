import { CircleCheck, MessagesSquare, Pencil, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type CallFamily, type ConversationRow, type PlaybookBody, type PlaybookVersion, type SeatRow } from '../../api';
import { useAuth } from '../../auth';
import { TanlovMenyu } from '../analitika/Ochiluvchi';
import { tafsilotOl } from '../tafsilotKesh';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → QO'NG'IROQ OILALARI (FR-25)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Server oila uchun `key, name, description, scored` saqlaydi; AI har birini
 * «kalit — nom: tavsif» ko'rinishida o'qiydi. `scored: false` oiladagi
 * suhbatlar haqiqatan baholanmaydi (analyze.ts).
 *
 * Guruh, ish oqimi va suhbat domeni uchun alohida maydon yo'q — ular tavsif
 * oxirida o'qiladigan belgilar bo'lib saqlanadi (AI ularni ham ko'radi):
 *   «… [Guruh: Operatsion] [Oqim: Qayta aloqa] [Domen: Sotuv]»
 *
 * Namuna iboralar — shu oilaga tushgan so'nggi HAQIQIY suhbatlar xulosasi.
 */

const GURUHLAR = ['Baholanadigan', 'Operatsion', 'Biznesga oid emas'] as const;
const OQIMLAR = [
  'Birinchi aloqa',
  'Lidni aniqlashtirish',
  'Qayta aloqa',
  'Qayta faollashtirish',
  'Taklif va yechim taqdimoti',
  'Yopish va muzokara',
  "Bog'lanilmagan aloqa",
  'Sotuvdan keyingi jarayon',
  'Yollash jarayoni',
  'Moliya va hujjatlar',
  "Qo'llab-quvvatlash",
  'Ichki operatsiyalar',
];
const DOMENLAR = ['Sotuv', 'Sotuvdan keyingi jarayon', "Qo'llab-quvvatlash", 'Rekruting', 'Ichki', 'Moliya', "Noma'lum"];
const TAVSIF_MAKS = 500;

interface Oila {
  key: string;
  nom: string;
  tavsif: string;
  scored: boolean;
  guruh: string;
  oqim: string;
  domen: string;
}

const BELGI = /\s*\[(Guruh|Oqim|Domen):\s*([^\]]+)\]/g;

function oqi(f: CallFamily): Oila {
  const m: Record<string, string> = {};
  const tavsif = f.description.replace(BELGI, (_, k: string, v: string) => {
    m[k] = v.trim();
    return '';
  });
  return {
    key: f.key,
    nom: f.name,
    tavsif: tavsif.trim(),
    scored: f.scored,
    guruh: m.Guruh ?? (f.scored ? 'Baholanadigan' : 'Operatsion'),
    oqim: m.Oqim ?? '',
    domen: m.Domen ?? '',
  };
}
const belgilar = (o: Pick<Oila, 'guruh' | 'oqim' | 'domen'>) =>
  [o.guruh && `[Guruh: ${o.guruh}]`, o.oqim && `[Oqim: ${o.oqim}]`, o.domen && `[Domen: ${o.domen}]`].filter(Boolean).join(' ');
const yoz = (o: Oila): CallFamily => ({ key: o.key, name: o.nom.trim(), description: [o.tavsif.trim(), belgilar(o)].filter(Boolean).join(' '), scored: o.scored });

/** Baholanmaydigan oila nega chiqarilgani — guruh/oqimdan. */
const chiqarishSababi = (o: Oila) =>
  o.oqim === "Bog'lanilmagan aloqa" ? "Bog'lanib bo'lmadi" : o.guruh === 'Biznesga oid emas' ? 'Biznesga oid emas' : "Baholashdan chiqarilgan qo'ng'iroq";

/** Nomdan kalit: lotin, kichik harf, pastki chiziq. */
function kalitYasa(nom: string, band: Set<string>) {
  const asos =
    nom
      .toLowerCase()
      .replace(/[ʻʼ'`‘’]/g, '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'oila';
  let k = asos;
  for (let n = 2; band.has(k); n++) k = `${asos}_${n}`;
  return k;
}

const tozaBody = (p: PlaybookBody): PlaybookBody => ({
  criteria: p.criteria,
  questionnaire: p.questionnaire,
  classificationPolicy: p.classificationPolicy,
  promptNotes: p.promptNotes,
  leadQuality: p.leadQuality ?? {},
});
const sanaVaqt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const n = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}.${n(d.getMonth() + 1)}.${n(d.getDate())}, ${n(d.getHours())}:${n(d.getMinutes())}`;
};

type Namuna = { kim: string; matn: string };

export function QongiroqOilalari() {
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yozaOladi = business?.permissions.includes('playbook:write') ?? false;

  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [versiya, setVersiya] = useState<PlaybookVersion | null>(null);
  const [yoq, setYoq] = useState(false);
  const [namunalar, setNamunalar] = useState<Map<string, Namuna[]>>(new Map());
  const [oyna, setOyna] = useState<{ tur: 'forma'; o: Oila | null } | { tur: 'ochir'; o: Oila } | null>(null);
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ ton: 'ok' | 'xato'; matn: string } | null>(null);

  const yukla = useCallback(async () => {
    if (!base) return;
    try {
      const [p, vs] = await Promise.all([api.get<PlaybookBody>(`${base}/playbook`), api.get<PlaybookVersion[]>(`${base}/playbook/versions`).catch(() => [])]);
      setPb(tozaBody(p));
      setVersiya(vs.find((v) => v.isActive) ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setYoq(true);
      else setXabar({ ton: 'xato', matn: "Ma'lumotni yuklab bo'lmadi" });
    }
  }, [base]);
  useEffect(() => void yukla(), [yukla]);

  // So'nggi tahlil qilingan suhbatlardan har oila uchun 2 tadan haqiqiy namuna
  useEffect(() => {
    if (!base) return;
    let tirik = true;
    void (async () => {
      try {
        const [r, seats] = await Promise.all([
          api.get<{ conversations: ConversationRow[] }>(`${base}/conversations?status=done&limit=40`),
          api.get<SeatRow[]>(`${base}/seats`).catch(() => [] as SeatRow[]),
        ]);
        const ism = new Map(seats.map((s) => [s.id, s.displayName]));
        const m = new Map<string, Namuna[]>();
        const navbat = r.conversations.filter((c) => c.summary);
        for (let i = 0; i < navbat.length; i += 6) {
          const d = await Promise.all(navbat.slice(i, i + 6).map((c) => tafsilotOl(base, c.id).catch(() => null)));
          for (const t of d) {
            const k = t?.analysis?.callFamily;
            const matn = t?.analysis?.summary ?? t?.conversation.summary;
            if (!k || !matn) continue;
            const ro = m.get(k) ?? [];
            if (ro.length < 2) ro.push({ kim: t.conversation.managerName ?? (t.conversation.seatId ? ism.get(t.conversation.seatId) : null) ?? 'Menejer', matn });
            m.set(k, ro);
          }
          if (tirik) setNamunalar(new Map(m));
        }
      } catch {
        /* namunasiz ham bo'lim to'liq ishlaydi */
      }
    })();
    return () => {
      tirik = false;
    };
  }, [base]);

  const oilalar = useMemo(() => (pb ? pb.classificationPolicy.callFamilies.map(oqi) : []), [pb]);

  if (yoq)
    return (
      <section className="card bm-karta bm-bosh-holat">
        <MessagesSquare />
        <b>Playbook hali yaratilmagan</b>
        <span>Qo'ng'iroq oilalari playbook bilan birga onboarding jarayonida yaratiladi.</span>
      </section>
    );
  if (!pb) return <div className="card skelet" style={{ height: 380 }} aria-busy="true" />;

  const bildir = (ton: 'ok' | 'xato', matn: string) => {
    setXabar({ ton, matn });
    setTimeout(() => setXabar((x) => (x?.matn === matn ? null : x)), 3500);
  };

  async function nashr(yangi: PlaybookBody, izoh: string, muvaffaqiyat: string) {
    setBand(true);
    try {
      const body = tozaBody(yangi);
      const v = await api.post<{ valid: boolean; errors?: Record<string, string[]> }>(`${base}/playbook/validate`, body);
      if (!v.valid) {
        bildir('xato', Object.values(v.errors ?? {}).flat()[0] ?? 'Server tekshiruvi xato topdi');
        return false;
      }
      await api.post(`${base}/playbook`, { ...body, changeNote: izoh });
      await yukla();
      bildir('ok', muvaffaqiyat);
      return true;
    } catch (e) {
      bildir('xato', e instanceof ApiError ? e.message : "Saqlanmadi — qayta urinib ko'ring");
      return false;
    } finally {
      setBand(false);
    }
  }
  const oilalarniYoz = (os: Oila[]): PlaybookBody => ({ ...pb, classificationPolicy: { ...pb.classificationPolicy, callFamilies: os.map(yoz) } });

  /** Oila o'chirilgandan keyingi playbook: faqat shu oilaga bog'langan mezon «hammaga» aylanib ketmasin — nofaol qilinadi. */
  const ochirilgandan = (k: string): PlaybookBody => {
    const yangi = oilalarniYoz(oilalar.filter((x) => x.key !== k));
    return {
      ...yangi,
      criteria: {
        ...yangi.criteria,
        criteria: yangi.criteria.criteria.map((c) => {
          if (!c.appliesTo.callFamilies.includes(k)) return c;
          const qolgan = c.appliesTo.callFamilies.filter((x) => x !== k);
          return qolgan.length ? { ...c, appliesTo: { ...c.appliesTo, callFamilies: qolgan } } : { ...c, isActive: false };
        }),
      },
    };
  };

  const mezonSoni = (k: string) => pb.criteria.criteria.filter((c) => c.appliesTo.callFamilies.includes(k)).length;
  const baholanadi = oilalar.filter((o) => o.scored);
  const baholanmaydi = oilalar.filter((o) => !o.scored);

  const qator = (o: Oila) => {
    const nm = namunalar.get(o.key) ?? [];
    return (
      <article key={o.key} className="qo-oila" aria-busy={band}>
        <div className="qo-bosh">
          <div className="qo-nom">
            <h3>{o.nom}</h3>
            <span className={`qo-teg ${o.scored ? 'yaxshi' : 'orta'}`}>{o.scored ? "Baholash mezoni bo'yicha baholanadi" : "Baholash mezoni bo'yicha baholanmaydi"}</span>
            <span className="qo-teg info">{o.guruh}</span>
            {mezonSoni(o.key) > 0 && <span className="qo-teg">{mezonSoni(o.key)} ta maxsus mezon</span>}
          </div>
          {yozaOladi && (
            <div className="xy-amallar">
              <button type="button" className="bm-ikon" aria-label={`${o.nom} — tahrirlash`} title="Tahrirlash" disabled={band} onClick={() => setOyna({ tur: 'forma', o })}>
                <Pencil />
              </button>
              <button
                type="button"
                className="bm-ikon xavf"
                aria-label={`${o.nom} — o'chirish`}
                title={oilalar.length <= 1 ? "Oxirgi oilani o'chirib bo'lmaydi" : "O'chirish"}
                disabled={band || oilalar.length <= 1}
                onClick={() => setOyna({ tur: 'ochir', o })}
              >
                <Trash2 />
              </button>
            </div>
          )}
        </div>
        <p className={o.tavsif ? 'xy-tavsif' : 'xy-tavsif bosh'}>{o.tavsif || "Tavsif kiritilmagan — AI faqat nom bo'yicha ajratadi."}</p>
        <div className="qo-qutilar">
          {o.oqim && <Quti nom="Ish oqimi oilasi" qiymat={o.oqim} />}
          {o.domen && <Quti nom="Suhbat domeni" qiymat={o.domen} />}
          {!o.scored && <Quti nom="Chiqarish sababi" qiymat={chiqarishSababi(o)} />}
        </div>
        {nm.length > 0 && (
          <div className="qo-namunalar">
            <span className="bm-yuqori">Namuna iboralar</span>
            <div>
              {nm.map((n, i) => (
                <figure key={i} className="qo-namuna">
                  <figcaption>{n.kim}</figcaption>
                  <p>{n.matn}</p>
                </figure>
              ))}
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="as">
      <section className="card as-karta">
        <h2 className="as-sarlavha">Qo'ng'iroq oilalari</h2>
        <div className="as-meta">
          {versiya && <span className="bm-versiya">Versiya {versiya.version}</span>}
          <span>Yangilangan: {sanaVaqt(versiya?.activatedAt ?? versiya?.createdAt)}</span>
        </div>
        <div className="as-diqqat">
          <TriangleAlert aria-hidden="true" />
          <span>
            Bu sozlamalar AI qo'ng'iroqlar va lidlarni qanday tahlil qilishiga ta'sir qiladi. Har bir saqlash yangi playbook versiyasini yaratadi —
            eski baholar o'zgarmaydi.
          </span>
        </div>
      </section>

      <section className="card as-karta">
        <div className="as-bosh">
          <div>
            <h3>Qo'ng'iroq oilalari</h3>
            <p>AI qo'ng'iroqlarni to'g'ri turga ajratishi va qaysi suhbatlar baholash mezoni bilan baholanishini belgilovchi ro'yxat.</p>
          </div>
          {yozaOladi && (
            <div className="as-bosh-amal">
              <button type="button" className="btn" disabled={band} onClick={() => setOyna({ tur: 'forma', o: null })}>
                <Plus /> Qo'ng'iroq oilasini qo'shish
              </button>
            </div>
          )}
        </div>
        <div className="xy-soni">{oilalar.length ? `${oilalar.length} ta qo'ng'iroq oilasi sozlangan` : "Hali qo'ng'iroq oilasi yo'q"}</div>
        {xabar && (
          <div className={`bm-xabar as-xabar ${xabar.ton}`} role={xabar.ton === 'xato' ? 'alert' : 'status'}>
            {xabar.ton === 'ok' ? <CircleCheck /> : <TriangleAlert />} {xabar.matn}
          </div>
        )}
      </section>

      {oilalar.length > 0 && (
        <section className="card qo-royxat">
          <Guruh ton="yaxshi" nom="Baholanadigan qo'ng'iroqlar" izoh="Baholash mezonlari bilan baholanadigan qo'ng'iroq oilalari shu yerda ko'rinadi." soni={baholanadi.length} />
          {baholanadi.length ? baholanadi.map(qator) : <div className="qo-bosh-guruh">Baholanadigan oila yo'q — hech bir suhbat baholanmaydi.</div>}
          <Guruh nom="Baholanmaydigan qo'ng'iroqlar" izoh="Baholash mezonidan chiqarilgan operatsion yoki boshqa oqimlarga tegishli oilalar shu yerda ko'rinadi." soni={baholanmaydi.length} />
          {baholanmaydi.length ? baholanmaydi.map(qator) : <div className="qo-bosh-guruh">Baholanmaydigan oila yo'q.</div>}
        </section>
      )}

      {oyna?.tur === 'forma' && (
        <OilaOynasi
          o={oyna.o}
          boshqaNomlar={oilalar.filter((x) => x.key !== oyna.o?.key).map((x) => x.nom)}
          band={band}
          onYop={() => setOyna(null)}
          onSaqla={async (yangi) => {
            const eski = oyna.o;
            const os = eski
              ? oilalar.map((x) => (x.key === eski.key ? { ...yangi, key: eski.key } : x))
              : [...oilalar, { ...yangi, key: kalitYasa(yangi.nom, new Set(oilalar.map((x) => x.key))) }];
            const ok = await nashr(
              oilalarniYoz(os),
              eski ? `Qo'ng'iroq oilasi tahrirlandi: ${yangi.nom}` : `Qo'ng'iroq oilasi qo'shildi: ${yangi.nom}`,
              eski ? 'Saqlandi — yangi versiya faollashtirildi' : `«${yangi.nom}» qo'shildi`,
            );
            if (ok) setOyna(null);
          }}
        />
      )}
      {oyna?.tur === 'ochir' && (
        <OchirishOynasi
          o={oyna.o}
          mezonlar={mezonSoni(oyna.o.key)}
          band={band}
          onYop={() => setOyna(null)}
          bosqichlar={bosQolganBosqichlar(ochirilgandan(oyna.o.key))}
          onOchir={async () => {
            const ok = await nashr(ochirilgandan(oyna.o.key), `Qo'ng'iroq oilasi o'chirildi: ${oyna.o.nom}`, `«${oyna.o.nom}» o'chirildi`);
            if (ok) setOyna(null);
          }}
        />
      )}
    </div>
  );
}

function Guruh({ nom, izoh, soni, ton }: { nom: string; izoh: string; soni: number; ton?: string }) {
  return (
    <header className={`qo-guruh${ton ? ` ${ton}` : ''}`}>
      <div>
        <h4>{nom}</h4>
        <p>{izoh}</p>
      </div>
      <span className="qo-soni">{soni} ta oila</span>
    </header>
  );
}

function Quti({ nom, qiymat }: { nom: string; qiymat: string }) {
  return (
    <div className="qo-quti">
      <span className="bm-yuqori">{nom}</span>
      <b>{qiymat}</b>
    </div>
  );
}

// ─── Modal asosi ────────────────────────────────────────────────────────────

function Modal({ children, onYop, sarlavha, keng, onSubmit }: { children: ReactNode; onYop: () => void; sarlavha: string; keng?: boolean; onSubmit?: (e: FormEvent) => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYop]);
  const Ich = onSubmit ? 'form' : 'div';
  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <Ich className={`vr-oyna ${keng ? 'xy-oyna' : 'xy-tasdiq'}`} role={keng ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="qo-oyna-nom" onSubmit={onSubmit} noValidate={onSubmit ? true : undefined}>
        <div className="vr-oyna-bosh">
          <h3 id="qo-oyna-nom">{sarlavha}</h3>
          {keng && (
            <button type="button" className="mj-yop" onClick={onYop} aria-label="Yopish">
              <X />
            </button>
          )}
        </div>
        {children}
      </Ich>
    </div>,
    document.body,
  );
}

// ─── Qo'shish / tahrirlash ──────────────────────────────────────────────────

function OilaOynasi({ o, boshqaNomlar, band, onYop, onSaqla }: { o: Oila | null; boshqaNomlar: string[]; band: boolean; onYop: () => void; onSaqla: (o: Oila) => void }) {
  const [nom, setNom] = useState(o?.nom ?? '');
  const [guruh, setGuruh] = useState(o?.guruh ?? 'Baholanadigan');
  const [scored, setScored] = useState(o?.scored ?? true);
  const [oqim, setOqim] = useState(o?.oqim ?? '');
  const [domen, setDomen] = useState(o?.domen ?? '');
  const [tavsif, setTavsif] = useState(o?.tavsif ?? '');
  const [urindi, setUrindi] = useState(false);

  const maks = TAVSIF_MAKS - (belgilar({ guruh, oqim, domen }).length + 1);
  const n = nom.trim();
  const nomXato = n.length < 2 ? 'Oila nomi kamida 2 belgi' : boshqaNomlar.some((b) => b.toLowerCase() === n.toLowerCase()) ? 'Bunday oila allaqachon bor' : null;
  const tavsifXato = tavsif.trim().length > maks ? `Tavsif ${maks} belgidan oshmasin` : null;
  const xato = nomXato ?? tavsifXato;

  // Guruh tanlanganda baholash rejimi mantiqan moslashadi (foydalanuvchi keyin o'zgartira oladi)
  const guruhniOzgar = (g: string) => {
    setGuruh(g);
    setScored(g === 'Baholanadigan');
  };

  return (
    <Modal
      sarlavha={o ? "Qo'ng'iroq oilasini tahrirlash" : "Qo'ng'iroq oilasini qo'shish"}
      keng
      onYop={onYop}
      onSubmit={(e) => {
        e.preventDefault();
        setUrindi(true);
        if (!xato) onSaqla({ key: o?.key ?? '', nom: n, tavsif: tavsif.trim().replace(/[[\]]/g, ''), scored, guruh, oqim, domen });
      }}
    >
      <div className="qo-forma">
        <div className="maydon-blok">
          <label htmlFor="qo-nom">Oila nomi</label>
          <input id="qo-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Masalan: Yopish" maxLength={120} autoFocus aria-invalid={urindi && !!nomXato} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="qo-guruh">Guruh</label>
          <TanlovMenyu id="qo-guruh" aria="Guruh" qiymat={guruh} variantlar={GURUHLAR.map((g) => ({ qiymat: g, nom: g }))} onOzgar={guruhniOzgar} kenglik="100%" />
        </div>
        <div className="maydon-blok">
          <label htmlFor="qo-rejim">Baholash rejimi</label>
          <TanlovMenyu
            id="qo-rejim"
            aria="Baholash rejimi"
            qiymat={scored ? '1' : '0'}
            variantlar={[
              { qiymat: '1', nom: "Baholash mezoni bo'yicha baholanadi" },
              { qiymat: '0', nom: "Baholash mezoni bo'yicha baholanmaydi" },
            ]}
            onOzgar={(v) => setScored(v === '1')}
            kenglik="100%"
          />
        </div>
        <div className="maydon-blok">
          <label htmlFor="qo-oqim">Ish oqimi oilasi</label>
          <TanlovMenyu id="qo-oqim" aria="Ish oqimi oilasi" qiymat={oqim} variantlar={[{ qiymat: '', nom: 'Tanlash' }, ...OQIMLAR.map((x) => ({ qiymat: x, nom: x }))]} onOzgar={setOqim} kenglik="100%" />
        </div>
        <div className="maydon-blok">
          <label htmlFor="qo-domen">Suhbat domeni</label>
          <TanlovMenyu id="qo-domen" aria="Suhbat domeni" qiymat={domen} variantlar={[{ qiymat: '', nom: 'Tanlash' }, ...DOMENLAR.map((x) => ({ qiymat: x, nom: x }))]} onOzgar={setDomen} kenglik="100%" />
        </div>
      </div>
      {guruh === 'Baholanadigan' && !scored && <div className="yordam bm-ogoh">Guruh «Baholanadigan», lekin rejim «baholanmaydi» — bu oiladagi suhbatlar baholanmaydi.</div>}
      <div className="maydon-blok">
        <label htmlFor="qo-tavsif" className="qo-tavsif-yorliq">
          <span>Tavsif</span>
          <span className={tavsifXato ? 'bzl-xato' : ''}>
            {tavsif.trim().length}/{maks}
          </span>
        </label>
        <textarea id="qo-tavsif" rows={3} value={tavsif} onChange={(e) => setTavsif(e.target.value)} placeholder="AI bu oilaga qo'ng'iroqlarni qachon yo'naltirishi kerak?" aria-invalid={!!tavsifXato} />
        <div className="yordam">Guruh, ish oqimi va domen tavsif oxiriga qo'shib saqlanadi — AI ularni ham ko'radi.</div>
      </div>
      {urindi && xato && <div className="yordam bzl-xato">{xato}</div>}
      <div className="vr-oyna-past">
        <button type="button" className="btn ikkinchi" onClick={onYop} disabled={band}>
          Bekor qilish
        </button>
        <button type="submit" className="btn" disabled={band || (urindi && !!xato)}>
          {band ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </Modal>
  );
}

// ─── O'chirish tasdig'i ─────────────────────────────────────────────────────

function OchirishOynasi({
  o,
  mezonlar,
  bosqichlar,
  band,
  onYop,
  onOchir,
}: {
  o: Oila;
  mezonlar: number;
  bosqichlar: string[];
  band: boolean;
  onYop: () => void;
  onOchir: () => void;
}) {
  return (
    <Modal sarlavha="O'chirmoqchimisiz?" onYop={onYop}>
      <p className="xy-tasdiq-matn">
        <b>«{o.nom}»</b> qo'ng'iroq oilasi faol playbookdan olib tashlanadi. Yangi suhbatlar bu turga ajratilmaydi.
      </p>
      {bosqichlar.length > 0 && <BloklashIzohi bosqichlar={bosqichlar} />}
      <ul className="xy-oqibat">
        {mezonlar > 0 && <li>{mezonlar} ta mezon shu oilaga bog'langan — faqat shu oila uchun bo'lganlari nofaol qilinadi.</li>}
        <li>O'tgan suhbatlarda bu tur nomi o'rniga uning kaliti («{o.key}») ko'rinadi.</li>
        {o.scored && <li>Faqat baholashdan chiqarmoqchi bo'lsangiz, o'chirish o'rniga rejimni «baholanmaydi» qiling.</li>}
      </ul>
      <div className="vr-oyna-past">
        <button type="button" className="btn ikkinchi" onClick={onYop} disabled={band} autoFocus>
          Bekor qilish
        </button>
        <button type="button" className="btn xy-ochir" onClick={onOchir} disabled={band || bosqichlar.length > 0}>
          {band ? "O'chirilmoqda…" : "O'chirish"}
        </button>
      </div>
    </Modal>
  );
}

/** Mezon nofaol qilinganda faol mezonsiz qoladigan bosqichlar (server bunga ruxsat bermaydi). */
export function bosQolganBosqichlar(p: PlaybookBody): string[] {
  return p.criteria.categories.filter((k) => !p.criteria.criteria.some((c) => c.categoryCode === k.code && c.isActive)).map((k) => k.name);
}

export function BloklashIzohi({ bosqichlar }: { bosqichlar: string[] }) {
  return (
    <div className="xy-blok" role="alert">
      <TriangleAlert />
      <span>
        Hozir o'chirib bo'lmaydi: {bosqichlar.map((b) => `«${b}»`).join(', ')} bosqichida birorta faol mezon qolmaydi. Avval «Baholash mezonlari» bo'limida shu
        bosqichga umumiy mezon qo'shing yoki mezonning doirasini o'zgartiring.
      </span>
    </div>
  );
}
