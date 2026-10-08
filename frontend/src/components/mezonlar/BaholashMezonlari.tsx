import { Check, ChevronDown, ChevronRight, CircleCheck, History, Info, Pencil, Plus, Scale, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type Category, type Criterion, type PlaybookBody, type PlaybookVersion, type RedFlag, type Rubric } from '../../api';
import { useAuth } from '../../auth';
import { useTashqiBosish } from '../qongiroq/Filtrlar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → BAHOLASH MEZONLARI (TZ 3.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kategoriya = suhbat bosqichi (vazni — umumiy bahodagi ulushi), mezon —
 * bosqich ichidagi 0–3 rubrikali tekshiruv. Barcha o'zgarishlar avval
 * QORALAMADA to'planadi; «Nashr qilish» yangi playbook versiyasini yaratadi
 * (eski versiya o'zgarmaydi — FR-22, tarixiy baholar buzilmaydi).
 *
 * Qoidalar backend sxemasi bilan bir xil (playbook/schema.ts) — xato
 * nashrdan OLDIN ko'rinsin.
 */

type Doira = { oila: string; xizmat: string; yonalish: '' | 'inbound' | 'outbound' };
type Panel = { tur: 'mezon'; kod: string } | { tur: 'forma'; kod: string | null; kategoriya: string } | null;
type Oyna = { tur: 'kategoriya'; kod: string | null } | null;

const YONALISH: Record<'inbound' | 'outbound', string> = { inbound: 'Kiruvchi', outbound: 'Chiquvchi' };
const BALLAR: { k: keyof Rubric; savol: string }[] = [
  { k: '3', savol: "Qachon a'lo bajarilgan hisoblanadi?" },
  { k: '2', savol: 'Qachon qoniqarli bajarilgan hisoblanadi?' },
  { k: '1', savol: 'Qachon zaif bajarilgan hisoblanadi?' },
  { k: '0', savol: 'Qachon umuman bajarilmagan hisoblanadi?' },
];

const tartibla = <T extends { order: number }>(a: T[]) => [...a].sort((x, y) => x.order - y.order);
const yaxlit = (n: number) => Math.round(n * 100) / 100;
const harf = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));

/** Mezon tanlangan doiraga tegishlimi (bo'sh filtr = hammasiga). */
function doiraga(c: Criterion, d: Doira) {
  const a = c.appliesTo ?? { callFamilies: [], serviceLines: [], directions: [] };
  if (d.oila && a.callFamilies.length && !a.callFamilies.includes(d.oila)) return false;
  if (d.xizmat && a.serviceLines.length && !a.serviceLines.includes(d.xizmat)) return false;
  if (d.yonalish && a.directions.length && !a.directions.includes(d.yonalish)) return false;
  return true;
}
const asosiymi = (c: Criterion) => !c.appliesTo || (!c.appliesTo.callFamilies.length && !c.appliesTo.serviceLines.length && !c.appliesTo.directions.length);

/** Backend sxemasidagi qoidalar — nashrdan oldin ko'rsatish uchun. */
function tekshir(pb: PlaybookBody): string[] {
  const x: string[] = [];
  const { categories, criteria } = pb.criteria;
  if (!categories.length) x.push('Kamida bitta bosqich kerak');
  if (!criteria.length) x.push('Kamida bitta mezon kerak');
  const jami = categories.reduce((s, c) => s + c.weightPct, 0);
  if (categories.length && Math.abs(jami - 100) > 0.01) x.push(`Ulushlar jami 100% bo'lishi kerak — hozir ${yaxlit(jami)}%`);
  for (const k of categories) {
    if (k.name.trim().length < 2) x.push(`${k.code}: bosqich nomi juda qisqa`);
    if (!criteria.some((c) => c.categoryCode === k.code && c.isActive)) x.push(`«${k.name}» bosqichida faol mezon yo'q`);
  }
  for (const c of criteria) {
    const n = `«${c.name || c.code}»`;
    if (c.name.trim().length < 3) x.push(`${c.code}: mezon nomi kamida 3 belgi`);
    if (c.description.trim().length < 10) x.push(`${n}: «Nima kutiladi» kamida 10 belgi`);
    if ((['0', '1', '2', '3'] as const).some((b) => (c.rubric[b] ?? '').trim().length < 5)) x.push(`${n}: rubrikaning har bir bali kamida 5 belgi`);
  }
  for (const f of pb.classificationPolicy.redFlags) if (f.description.trim().length < 5) x.push("Qizil bayroq tavsifi kamida 5 belgi bo'lsin");
  return [...new Set(x)];
}

/** Server faqat shu maydonlarni kutadi — GET javobidagi qo'shimchalarni tashlaymiz. */
const tozaBody = (p: PlaybookBody): PlaybookBody => ({
  criteria: p.criteria,
  questionnaire: p.questionnaire,
  classificationPolicy: p.classificationPolicy,
  promptNotes: p.promptNotes,
  leadQuality: p.leadQuality ?? {},
});

export function BaholashMezonlari() {
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yozaOladi = business?.permissions.includes('playbook:write') ?? false;

  const [asl, setAsl] = useState<PlaybookBody | null>(null);
  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [yoq, setYoq] = useState(false);
  const [versiyalar, setVersiyalar] = useState<PlaybookVersion[]>([]);
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [doira, setDoira] = useState<Doira>({ oila: '', xizmat: '', yonalish: '' });
  const [panel, setPanel] = useState<Panel>(null);
  const [oyna, setOyna] = useState<Oyna>(null);
  const [nashr, setNashr] = useState<'tinch' | 'ketmoqda'>('tinch');
  const [xabar, setXabar] = useState<{ ton: 'ok' | 'xato'; matn: string } | null>(null);
  const [serverXato, setServerXato] = useState<string[]>([]);

  const yukla = useCallback(async () => {
    if (!base) return;
    try {
      const [p, vs] = await Promise.all([api.get<PlaybookBody>(`${base}/playbook`), api.get<PlaybookVersion[]>(`${base}/playbook/versions`).catch(() => [])]);
      const t = tozaBody(p);
      setAsl(t);
      setPb(t);
      setVersiyalar(vs);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setYoq(true);
      else setXabar({ ton: 'xato', matn: "Playbookni yuklab bo'lmadi" });
    }
  }, [base]);
  useEffect(() => void yukla(), [yukla]);

  const ozgargan = !!pb && !!asl && JSON.stringify(pb) !== JSON.stringify(asl);
  // Nashr qilinmagan o'zgarish bilan sahifadan chiqishda ogohlantirish
  useEffect(() => {
    if (!ozgargan) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [ozgargan]);

  const bildir = (ton: 'ok' | 'xato', matn: string) => {
    setXabar({ ton, matn });
    setTimeout(() => setXabar((x) => (x?.matn === matn ? null : x)), 3500);
  };

  const kategoriyalar = useMemo(() => (pb ? tartibla(pb.criteria.categories) : []), [pb]);
  const joriy = kategoriyalar.find((k) => k.code === tanlangan) ?? kategoriyalar[0] ?? null;
  const xatolar = useMemo(() => (pb ? tekshir(pb) : []), [pb]);
  const jami = kategoriyalar.reduce((s, c) => s + c.weightPct, 0);

  /** Global harf tartibi: bosqichlar tartibi bo'yicha barcha ko'rinadigan mezonlar. */
  const harflar = useMemo(() => {
    const m = new Map<string, string>();
    if (!pb) return m;
    let i = 0;
    for (const k of kategoriyalar)
      for (const c of tartibla(pb.criteria.criteria.filter((x) => x.categoryCode === k.code && doiraga(x, doira)))) m.set(c.code, harf(i++));
    return m;
  }, [pb, kategoriyalar, doira]);

  if (yoq)
    return (
      <section className="card bm-karta bm-bosh-holat">
        <Scale />
        <b>Playbook hali yaratilmagan</b>
        <span>Baholash mezonlari onboarding jarayonida AI yordamida yaratiladi.</span>
      </section>
    );
  if (!pb || !asl) return <div className="card skelet" style={{ height: 520 }} aria-busy="true" />;

  // ─── Qoralamani o'zgartiruvchilar ───
  const ozgar = (f: (p: PlaybookBody) => PlaybookBody) => setPb((p) => (p ? f(p) : p));
  const kategoriyalarniYoz = (cats: Category[]) => ozgar((p) => ({ ...p, criteria: { ...p.criteria, categories: cats } }));
  const mezonlarniYoz = (cr: Criterion[]) => ozgar((p) => ({ ...p, criteria: { ...p.criteria, criteria: cr } }));
  const vaznlar = (o: Record<string, number>) => kategoriyalarniYoz(pb.criteria.categories.map((c) => (c.code in o ? { ...c, weightPct: o[c.code]! } : c)));

  const oilalar = pb.classificationPolicy.callFamilies;
  const xizmatlar = pb.classificationPolicy.serviceLines;
  const faolVersiya = versiyalar.find((v) => v.isActive)?.version;
  const joriyMezonlar = joriy ? tartibla(pb.criteria.criteria.filter((c) => c.categoryCode === joriy.code && doiraga(c, doira))) : [];
  const doiraNomi = [
    doira.oila && `«${oilalar.find((f) => f.key === doira.oila)?.name ?? doira.oila}»`,
    doira.xizmat && `«${doira.xizmat}»`,
    doira.yonalish && YONALISH[doira.yonalish].toLowerCase(),
  ]
    .filter(Boolean)
    .join(', ');

  async function nashrQil() {
    if (!pb) return;
    setNashr('ketmoqda');
    setServerXato([]);
    try {
      const body = tozaBody(pb);
      const v = await api.post<{ valid: boolean; errors?: Record<string, string[]> }>(`${base}/playbook/validate`, body);
      if (!v.valid) {
        setServerXato(Object.values(v.errors ?? {}).flat());
        bildir('xato', 'Server tekshiruvi xato topdi — o\'ng paneldagi ro\'yxatni ko\'ring');
        return;
      }
      await api.post(`${base}/playbook`, { ...body, changeNote: 'Baholash mezonlari yangilandi' });
      await yukla();
      bildir('ok', 'Nashr qilindi — yangi versiya faollashtirildi');
    } catch (e) {
      bildir('xato', e instanceof ApiError ? e.message : "Nashr qilinmadi — qayta urinib ko'ring");
    } finally {
      setNashr('tinch');
    }
  }

  async function versiyaniFaollashtir(v: number) {
    if (ozgargan && !window.confirm("Nashr qilinmagan o'zgarishlar yo'qoladi. Davom etasizmi?")) return;
    try {
      await api.post(`${base}/playbook/versions/${v}/activate`);
      await yukla();
      bildir('ok', `v${v} faollashtirildi`);
    } catch (e) {
      bildir('xato', e instanceof ApiError ? e.message : 'Faollashtirilmadi');
    }
  }

  function kategoriyaniOchir(k: Category) {
    const soni = pb!.criteria.criteria.filter((c) => c.categoryCode === k.code).length;
    if (!window.confirm(`«${k.name}» bosqichi${soni ? ` va undagi ${soni} ta mezon` : ''} o'chirilsinmi? Uning ${yaxlit(k.weightPct)}% ulushi qolgan bosqichlarga taqsimlanadi.`)) return;
    const qolgan = pb!.criteria.categories.filter((c) => c.code !== k.code);
    ozgar((p) => ({
      ...p,
      criteria: { categories: moslash(qolgan, 100), criteria: p.criteria.criteria.filter((c) => c.categoryCode !== k.code) },
    }));
    setTanlangan(null);
  }

  const panelMezon = panel?.tur === 'mezon' ? pb.criteria.criteria.find((c) => c.code === panel.kod) ?? null : null;

  return (
    <div className="bm">
      <section className="card bm-karta">
        <header className="bm-bosh">
          <div className="bm-bosh-chap">
            <span className="bm-yuqori">Sozlamalar · Baholash</span>
            <div className="bm-sarlavha">
              <h2>Baholash mezonlari</h2>
              {faolVersiya !== undefined && <span className="bm-versiya">v{faolVersiya}</span>}
              {ozgargan && <span className="bm-qoralama">Nashr qilinmagan o'zgarishlar</span>}
            </div>
          </div>
          <div className="bm-bosh-amal">
            <Versiyalar versiyalar={versiyalar} onFaollashtir={(v) => void versiyaniFaollashtir(v)} yozaOladi={yozaOladi} />
            {ozgargan && (
              <button type="button" className="btn ikkinchi" onClick={() => window.confirm("Barcha o'zgarishlar bekor qilinsinmi?") && setPb(asl)}>
                Bekor qilish
              </button>
            )}
            {yozaOladi && (
              <button
                type="button"
                className="btn"
                disabled={!ozgargan || xatolar.length > 0 || nashr === 'ketmoqda'}
                title={!ozgargan ? "O'zgarish yo'q" : xatolar.length ? 'Avval tekshiruvdagi xatolarni tuzating' : undefined}
                onClick={() => void nashrQil()}
              >
                {nashr === 'ketmoqda' ? 'Nashr qilinmoqda…' : 'Nashr qilish'}
              </button>
            )}
          </div>
          <div className="bm-doira">
            <span>Baholanadi:</span>
            <InlineTanlov
              qiymat={doira.oila}
              hammasi="Barcha qo'ng'iroq turlari"
              variantlar={oilalar.map((f) => ({ qiymat: f.key, nom: f.name, nuqta: f.scored ? 'faol' : 'kul' }))}
              belgi="nuqta"
              onOzgar={(v) => setDoira((d) => ({ ...d, oila: v }))}
              aria="Qo'ng'iroq turi"
            />
            <span>qo'ng'iroqlari,</span>
            <InlineTanlov
              qiymat={doira.xizmat}
              hammasi="Barcha xizmat yo'nalishlari"
              variantlar={xizmatlar.map((s) => ({ qiymat: s, nom: s }))}
              onOzgar={(v) => setDoira((d) => ({ ...d, xizmat: v }))}
              aria="Xizmat yo'nalishi"
              belgi="yoq"
              bosh="Xizmat yo'nalishlari hali kiritilmagan"
            />
            <span>bo'yicha,</span>
            <InlineTanlov
              qiymat={doira.yonalish}
              hammasi="Barcha qo'ng'iroq yo'nalishlari"
              variantlar={[
                { qiymat: 'inbound', nom: 'Kiruvchi qo\'ng\'iroqlar' },
                { qiymat: 'outbound', nom: 'Chiquvchi qo\'ng\'iroqlar' },
              ]}
              onOzgar={(v) => setDoira((d) => ({ ...d, yonalish: v as Doira['yonalish'] }))}
              aria="Qo'ng'iroq yo'nalishi"
            />
          </div>
        </header>

        {xabar && (
          <div className={`bm-xabar ${xabar.ton}`} role={xabar.ton === 'xato' ? 'alert' : 'status'}>
            {xabar.ton === 'ok' ? <Check /> : <TriangleAlert />} {xabar.matn}
          </div>
        )}

        <div className="bm-tana">
          <div className="bm-asosiy">
            <div className="bm-yol-bosh">
              <div>
                <span className="bm-yuqori">Suhbat yo'li</span>
                <p>Mezonlar suhbat bosqichlari bo'yicha guruhlangan. Segment kengligi — bosqichning umumiy bahodagi ulushi; chegarani surib o'zgartiring.</p>
              </div>
              <code className={Math.abs(jami - 100) > 0.01 ? 'bm-jami xato' : 'bm-jami'}>jami {yaxlit(jami)}%</code>
            </div>

            <Segmentlar
              kategoriyalar={kategoriyalar}
              mezonSoni={(k) => pb.criteria.criteria.filter((c) => c.categoryCode === k && doiraga(c, doira)).length}
              tanlangan={joriy?.code ?? null}
              onTanla={setTanlangan}
              onVazn={vaznlar}
              yozaOladi={yozaOladi}
            />

            {yozaOladi && (
              <button type="button" className="bm-qoshish" onClick={() => setOyna({ tur: 'kategoriya', kod: null })} disabled={kategoriyalar.length >= 26}>
                <Plus /> Kategoriya qo'shish
              </button>
            )}

            {joriy && (
              <div className="bm-bosqich">
                <div className="bm-bosqich-bosh">
                  <div>
                    <h3>{joriy.name}</h3>
                    <p>
                      {doiraNomi
                        ? `${doiraNomi} uchun ishlaydigan mezonlar — asosiy va maxsus.`
                        : 'Asosiy mezonlar barcha qo\'ng\'iroqlar uchun ishlaydi.'}
                    </p>
                  </div>
                  <div className="bm-bosqich-amal">
                    <span className="bm-ulush-nom">Ulush</span>
                    <span className="bm-ulush">{yaxlit(joriy.weightPct)}%</span>
                    {yozaOladi && (
                      <>
                        <button type="button" className="bm-ikon" aria-label="Bosqichni tahrirlash" title="Tahrirlash" onClick={() => setOyna({ tur: 'kategoriya', kod: joriy.code })}>
                          <Pencil />
                        </button>
                        <button
                          type="button"
                          className="bm-ikon xavf"
                          aria-label="Bosqichni o'chirish"
                          title={kategoriyalar.length <= 1 ? "Oxirgi bosqichni o'chirib bo'lmaydi" : "O'chirish"}
                          disabled={kategoriyalar.length <= 1}
                          onClick={() => kategoriyaniOchir(joriy)}
                        >
                          <Trash2 />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {joriyMezonlar.length === 0 ? (
                  <div className="bm-bosh-mezon">{doiraNomi ? "Bu doirada mezon yo'q." : "Bu bosqichda hali mezon yo'q."}</div>
                ) : (
                  <ul className="bm-mezonlar">
                    {joriyMezonlar.map((c) => (
                      <li key={c.code}>
                        <button type="button" className={`bm-mezon${c.isActive ? '' : ' nofaol'}`} onClick={() => setPanel({ tur: 'mezon', kod: c.code })}>
                          <span className="bm-harf">{harflar.get(c.code)}</span>
                          <span className="bm-mezon-nom">{c.name}</span>
                          {!c.isActive && <span className="bm-chip">Nofaol</span>}
                          {!asosiymi(c) && <span className="bm-chip maxsus">{doiraMatni(c, oilalar)}</span>}
                          <ChevronRight className="bm-strelka" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {yozaOladi && (
                  <button type="button" className="bm-mezon-qoshish" onClick={() => setPanel({ tur: 'forma', kod: null, kategoriya: joriy.code })}>
                    + Shu bosqichga mezon qo'shish
                  </button>
                )}
              </div>
            )}
          </div>

          <aside className="bm-tekshiruv">
            <span className="bm-yuqori">Tekshiruv</span>
            <p>Nashr qilishdan oldin shu ko'rinish qanday baholanishini tekshiring.</p>
            <div className="bm-stat">
              <div>
                <small>Bosqichlar</small>
                <b>{kategoriyalar.length}</b>
              </div>
              <div>
                <small>Mezon</small>
                <b>{pb.criteria.criteria.filter((c) => doiraga(c, doira)).length}</b>
              </div>
            </div>
            <div className={`bm-jami-karta ${Math.abs(jami - 100) > 0.01 ? 'xato' : ''}`}>
              <span>Ulushlar jami</span>
              <code>{yaxlit(jami)}%</code>
            </div>
            {yozaOladi && Math.abs(jami - 100) > 0.01 && kategoriyalar.length > 0 && (
              <button type="button" className="bm-moslash" onClick={() => kategoriyalarniYoz(moslash(pb.criteria.categories, 100))}>
                <Scale /> Ulushlarni 100% ga moslash
              </button>
            )}

            <span className="bm-yuqori">Tekshiruvlar</span>
            {xatolar.length === 0 && serverXato.length === 0 ? (
              <div className="bm-ok">
                <CircleCheck /> <span>Muammo topilmadi — {ozgargan ? 'bu ko\'rinish nashr qilishga tayyor.' : 'joriy versiya to\'g\'ri.'}</span>
              </div>
            ) : (
              <ul className="bm-xatolar">
                {[...xatolar, ...serverXato].map((x) => (
                  <li key={x}>
                    <TriangleAlert /> {x}
                  </li>
                ))}
              </ul>
            )}
            <div className="bm-izoh">Nashr qilingandan keyin yangi qoidalar faqat yangi qo'ng'iroqlarga qo'llanadi; eski baholar o'zgarmaydi.</div>
            <div className="bm-diqqat">
              Bu sozlamalar AI qo'ng'iroqlar va lidlarni qanday tahlil qilishiga ta'sir qiladi. Katta o'zgarishdan oldin bir nechta suhbatda natijani
              solishtirib ko'ring.
            </div>
          </aside>
        </div>
      </section>

      <QizilBayroqlar
        bayroqlar={pb.classificationPolicy.redFlags}
        yozaOladi={yozaOladi}
        onOzgar={(rf) => ozgar((p) => ({ ...p, classificationPolicy: { ...p.classificationPolicy, redFlags: rf } }))}
      />

      {panel?.tur === 'mezon' && panelMezon && (
        <MezonPanel
          c={panelMezon}
          harfi={harflar.get(panelMezon.code) ?? panelMezon.code}
          kategoriya={kategoriyalar.find((k) => k.code === panelMezon.categoryCode)}
          oilalar={oilalar}
          yozaOladi={yozaOladi}
          onYop={() => setPanel(null)}
          onTahrir={() => setPanel({ tur: 'forma', kod: panelMezon.code, kategoriya: panelMezon.categoryCode })}
          onFaollik={(v) => mezonlarniYoz(pb.criteria.criteria.map((c) => (c.code === panelMezon.code ? { ...c, isActive: v } : c)))}
          onOchir={() => {
            if (!window.confirm(`«${panelMezon.name}» mezoni o'chirilsinmi? (Vaqtincha to'xtatish uchun «Faol» belgisini o'chirish yetarli.)`)) return;
            mezonlarniYoz(pb.criteria.criteria.filter((c) => c.code !== panelMezon.code));
            setPanel(null);
          }}
        />
      )}
      {panel?.tur === 'forma' && (
        <MezonForma
          mezon={panel.kod ? pb.criteria.criteria.find((c) => c.code === panel.kod) ?? null : null}
          boshKategoriya={panel.kategoriya}
          kategoriyalar={kategoriyalar}
          doira={doira}
          doiraNomi={doiraNomi}
          onYop={() => setPanel(null)}
          onSaqla={(m, eskiKod) => {
            const boshqalar = pb.criteria.criteria.filter((c) => c.code !== eskiKod);
            const kod = eskiKod && eskiKod[0] === m.categoryCode ? eskiKod : yangiKod(boshqalar, m.categoryCode);
            const tartib = eskiKod && eskiKod[0] === m.categoryCode ? m.order : boshqalar.filter((c) => c.categoryCode === m.categoryCode).length;
            const yangi = { ...m, code: kod, order: tartib };
            mezonlarniYoz(eskiKod ? pb.criteria.criteria.map((c) => (c.code === eskiKod ? yangi : c)) : [...pb.criteria.criteria, yangi]);
            setTanlangan(m.categoryCode);
            setPanel({ tur: 'mezon', kod });
            bildir('ok', eskiKod ? 'Mezon yangilandi — nashr qilishni unutmang' : "Mezon qo'shildi — nashr qilishni unutmang");
          }}
        />
      )}
      {oyna?.tur === 'kategoriya' && (
        <KategoriyaOynasi
          k={oyna.kod ? kategoriyalar.find((x) => x.code === oyna.kod) ?? null : null}
          jamiBoshqa={kategoriyalar.filter((x) => x.code !== oyna.kod).reduce((s, x) => s + x.weightPct, 0)}
          onYop={() => setOyna(null)}
          onSaqla={(nom, vazn) => {
            if (oyna.kod) {
              kategoriyalarniYoz(pb.criteria.categories.map((c) => (c.code === oyna.kod ? { ...c, name: nom, weightPct: vazn } : c)));
            } else {
              const band = new Set(pb.criteria.categories.map((c) => c.code));
              const kod = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).find((h) => !band.has(h))!;
              kategoriyalarniYoz([...pb.criteria.categories, { code: kod, name: nom, weightPct: vazn, order: Math.max(-1, ...pb.criteria.categories.map((c) => c.order)) + 1 }]);
              setTanlangan(kod);
            }
            setOyna(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Yordamchilar ───────────────────────────────────────────────────────────

/** Vaznlarni nisbatini saqlab `jami` ga keltiradi (butun foizlar, qoldiq eng kattasiga). */
function moslash(cats: Category[], jami: number): Category[] {
  if (!cats.length) return cats;
  const hozir = cats.reduce((s, c) => s + c.weightPct, 0);
  const xom = cats.map((c) => (hozir > 0 ? (c.weightPct / hozir) * jami : jami / cats.length));
  const butun = xom.map(Math.floor);
  let qoldiq = jami - butun.reduce((s, n) => s + n, 0);
  const tartib = xom.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of tartib) {
    if (qoldiq <= 0) break;
    butun[i]!++;
    qoldiq--;
  }
  return cats.map((c, i) => ({ ...c, weightPct: butun[i]! }));
}

function yangiKod(mezonlar: Criterion[], kat: string) {
  const band = new Set(mezonlar.map((c) => c.code));
  for (let n = 1; n < 100; n++) if (!band.has(`${kat}${n}`)) return `${kat}${n}`;
  return `${kat}99`;
}

function doiraMatni(c: Criterion, oilalar: { key: string; name: string }[]) {
  const a = c.appliesTo;
  return [
    ...a.callFamilies.map((k) => oilalar.find((f) => f.key === k)?.name ?? k),
    ...a.serviceLines,
    ...a.directions.map((d) => YONALISH[d as 'inbound' | 'outbound'] ?? d),
  ].join(' · ');
}

// ─── Inline tanlov («Baholanadi: …») ────────────────────────────────────────

function InlineTanlov({
  qiymat,
  hammasi,
  variantlar,
  onOzgar,
  aria,
  bosh,
  belgi = 'check',
}: {
  qiymat: string;
  hammasi: string;
  variantlar: { qiymat: string; nom: string; nuqta?: 'faol' | 'kul' }[];
  /** Chapdagi belgi: tanlov belgisi, holat nuqtasi yoki hech narsa. */
  belgi?: 'check' | 'nuqta' | 'yoq';
  onOzgar: (v: string) => void;
  aria: string;
  bosh?: string;
}) {
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useTashqiBosish(ref, ochiq, () => setOchiq(false));
  const tanlangan = variantlar.find((v) => v.qiymat === qiymat);
  const hammasiV: { qiymat: string; nom: string; nuqta?: 'faol' | 'kul' }[] = [{ qiymat: '', nom: hammasi, nuqta: 'faol' }, ...variantlar];
  return (
    <span className="bm-inline" ref={ref} onKeyDown={(e) => e.key === 'Escape' && setOchiq(false)}>
      <button type="button" className={`bm-inline-tugma${qiymat ? ' tanlangan' : ''}`} aria-haspopup="listbox" aria-expanded={ochiq} aria-label={aria} onClick={() => setOchiq((v) => !v)}>
        {tanlangan?.nom ?? hammasi}
        <ChevronDown aria-hidden="true" />
      </button>
      {ochiq && (
        <ul className={`bm-inline-royxat ${belgi}`} role="listbox" aria-label={aria}>
          {hammasiV.map((v) => (
            <li key={v.qiymat || '_'}>
              <button
                type="button"
                role="option"
                aria-selected={v.qiymat === qiymat}
                title={belgi === 'nuqta' ? (v.nuqta === 'kul' ? 'Baholanmaydi' : 'Baholanadi') : undefined}
                onClick={() => {
                  onOzgar(v.qiymat);
                  setOchiq(false);
                }}
              >
                {belgi === 'check' && <span className="bm-belgi">{v.qiymat === qiymat && <Check />}</span>}
                {belgi === 'nuqta' && <span className={`bm-nuqta ${v.nuqta ?? 'faol'}`} aria-hidden="true" />}
                {v.nom}
              </button>
            </li>
          ))}
          {variantlar.length === 0 && bosh && <li className="bm-inline-bosh">{bosh}</li>}
        </ul>
      )}
    </span>
  );
}

// ─── Segmentlar (surib o'zgartiriladigan ulushlar) ──────────────────────────

function Segmentlar({
  kategoriyalar,
  mezonSoni,
  tanlangan,
  onTanla,
  onVazn,
  yozaOladi,
}: {
  kategoriyalar: Category[];
  mezonSoni: (kod: string) => number;
  tanlangan: string | null;
  onTanla: (k: string) => void;
  onVazn: (o: Record<string, number>) => void;
  yozaOladi: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const surish = useRef<{ x: number; chap: Category; ong: Category; kenglik: number } | null>(null);

  const boshla = (e: RPointerEvent<HTMLDivElement>, i: number) => {
    if (!yozaOladi || !ref.current) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    surish.current = { x: e.clientX, chap: kategoriyalar[i]!, ong: kategoriyalar[i + 1]!, kenglik: ref.current.getBoundingClientRect().width };
  };
  const sur = (e: RPointerEvent<HTMLDivElement>) => {
    const s = surish.current;
    if (!s) return;
    const juft = s.chap.weightPct + s.ong.weightPct;
    const d = Math.round(((e.clientX - s.x) / s.kenglik) * 100);
    const chap = Math.min(juft, Math.max(0, Math.round(s.chap.weightPct) + d));
    onVazn({ [s.chap.code]: chap, [s.ong.code]: yaxlit(juft - chap) });
  };
  const tugat = () => (surish.current = null);
  const klaviatura = (e: RKeyboardEvent<HTMLDivElement>, i: number) => {
    const chap = kategoriyalar[i]!;
    const ong = kategoriyalar[i + 1]!;
    const qadam = e.shiftKey ? 5 : 1;
    const d = e.key === 'ArrowLeft' ? -qadam : e.key === 'ArrowRight' ? qadam : 0;
    if (!d) return;
    e.preventDefault();
    const juft = chap.weightPct + ong.weightPct;
    const yangi = Math.min(juft, Math.max(0, Math.round(chap.weightPct) + d));
    onVazn({ [chap.code]: yangi, [ong.code]: yaxlit(juft - yangi) });
  };

  return (
    <div className="bm-segmentlar" ref={ref}>
      {kategoriyalar.map((k, i) => (
        <div key={k.code} className="bm-seg-oram" style={{ flexGrow: Math.max(k.weightPct, 4) }}>
          <button type="button" className={`bm-seg${k.code === tanlangan ? ' faol' : ''}`} onClick={() => onTanla(k.code)} aria-pressed={k.code === tanlangan} title={k.name}>
            <b>{k.name}</b>
            <code>{yaxlit(k.weightPct)}%</code>
            <small>{mezonSoni(k.code)} mezon</small>
          </button>
          {i < kategoriyalar.length - 1 && (
            <div
              className={`bm-tutqich${yozaOladi ? '' : ' qulf'}`}
              role="separator"
              aria-orientation="vertical"
              aria-label={`${k.name} va ${kategoriyalar[i + 1]!.name} ulushi`}
              aria-valuenow={Math.round(k.weightPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={yozaOladi ? 0 : -1}
              onPointerDown={(e) => boshla(e, i)}
              onPointerMove={sur}
              onPointerUp={tugat}
              onPointerCancel={tugat}
              onKeyDown={(e) => klaviatura(e, i)}
              title={yozaOladi ? 'Surib ulushni o\'zgartiring (← → tugmalari ham ishlaydi)' : undefined}
            >
              <span />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Versiyalar ─────────────────────────────────────────────────────────────

function Versiyalar({ versiyalar, onFaollashtir, yozaOladi }: { versiyalar: PlaybookVersion[]; onFaollashtir: (v: number) => void; yozaOladi: boolean }) {
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useTashqiBosish(ref, ochiq, () => setOchiq(false));
  if (versiyalar.length === 0) return null;
  return (
    <div className="bm-ver" ref={ref} onKeyDown={(e) => e.key === 'Escape' && setOchiq(false)}>
      <button type="button" className="bm-ikon" aria-label="Versiyalar tarixi" title="Versiyalar tarixi" aria-expanded={ochiq} onClick={() => setOchiq((v) => !v)}>
        <History />
      </button>
      {ochiq && (
        <div className="bm-ver-royxat" role="dialog" aria-label="Versiyalar">
          <b>Versiyalar</b>
          <ul>
            {versiyalar.map((v) => (
              <li key={v.id} className={v.isActive ? 'faol' : undefined}>
                <div>
                  <span>
                    v{v.version} <small>{v.origin === 'ai_generated' ? 'AI' : "qo'lda"}</small>
                  </span>
                  <small>
                    {new Date(v.createdAt).toLocaleDateString('uz-UZ')} · {v.changeNote ?? '—'}
                  </small>
                </div>
                {v.isActive ? (
                  <span className="bzl-pill yaxshi">Faol</span>
                ) : (
                  yozaOladi && (
                    <button
                      type="button"
                      className="btn ikkinchi kichik"
                      onClick={() => {
                        setOchiq(false);
                        if (window.confirm(`v${v.version} faollashtirilsinmi? Yangi qo'ng'iroqlar shu versiya bo'yicha baholanadi.`)) onFaollashtir(v.version);
                      }}
                    >
                      Faollashtirish
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Yon panel asosi ────────────────────────────────────────────────────────

function YonPanel({ bosh, onYop, children, past, onSubmit }: { bosh: ReactNode; onYop: () => void; children: ReactNode; past: ReactNode; onSubmit?: (e: FormEvent) => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYop]);
  const Ich = onSubmit ? 'form' : 'div';
  return createPortal(
    <div className="bm-panel-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <Ich className="bm-panel" role="dialog" aria-modal="true" onSubmit={onSubmit} noValidate={onSubmit ? true : undefined}>
        <div className="bm-panel-bosh">
          {bosh}
          <button type="button" className="bm-yop" onClick={onYop} aria-label="Yopish">
            <X />
          </button>
        </div>
        <div className="bm-panel-tana">{children}</div>
        <div className="bm-panel-past">{past}</div>
      </Ich>
    </div>,
    document.body,
  );
}

// ─── Mezon tafsiloti ────────────────────────────────────────────────────────

function MezonPanel({
  c,
  harfi,
  kategoriya,
  oilalar,
  yozaOladi,
  onYop,
  onTahrir,
  onFaollik,
  onOchir,
}: {
  c: Criterion;
  harfi: string;
  kategoriya: Category | undefined;
  oilalar: { key: string; name: string }[];
  yozaOladi: boolean;
  onYop: () => void;
  onTahrir: () => void;
  onFaollik: (v: boolean) => void;
  onOchir: () => void;
}) {
  return (
    <YonPanel
      onYop={onYop}
      bosh={
        <div className="bm-panel-nom">
          <span className="bm-harf katta">{harfi}</span>
          <div>
            <h3>{c.name}</h3>
            <small>
              {kategoriya?.name ?? c.categoryCode} · Ulush {yaxlit(kategoriya?.weightPct ?? 0)}%
            </small>
          </div>
        </div>
      }
      past={
        yozaOladi ? (
          <>
            <button type="button" className="btn ikkinchi" onClick={onTahrir}>
              <Pencil /> Tahrirlash
            </button>
            <button type="button" className="bm-ochir" onClick={onOchir}>
              O'chirish
            </button>
          </>
        ) : (
          <span className="sz-eslatma">Tahrirlash uchun ruxsat yo'q</span>
        )
      }
    >
      <p className="bm-tavsif">{c.description}</p>
      <span className="bm-yuqori">Ball mezoni</span>
      <ol className="bm-rubrika">
        {BALLAR.map((b) => (
          <li key={b.k}>
            <span className={`bm-ball b${b.k}`}>{b.k}</span>
            <span>{c.rubric[b.k]}</span>
          </li>
        ))}
      </ol>
      <div className="bm-meta">
        <div>
          <small>Qo'llanadi</small>
          <span>{asosiymi(c) ? "Barcha qo'ng'iroqlar (asosiy mezon)" : doiraMatni(c, oilalar)}</span>
        </div>
        <div>
          <small>Texnik identifikator</small>
          <code>{c.code}</code>
        </div>
      </div>
      {yozaOladi && (
        <label className="vr-almash bm-faol">
          <input type="checkbox" role="switch" checked={c.isActive} onChange={(e) => onFaollik(e.target.checked)} />
          <span className="vr-almash-yol" aria-hidden="true" />
          <span>
            <b>{c.isActive ? 'Faol' : 'Nofaol'}</b>
            <small>Nofaol mezon baholashda qatnashmaydi, lekin o'chirilmaydi</small>
          </span>
        </label>
      )}
    </YonPanel>
  );
}

// ─── Mezon qo'shish / tahrirlash ────────────────────────────────────────────

function MezonForma({
  mezon,
  boshKategoriya,
  kategoriyalar,
  doira,
  doiraNomi,
  onYop,
  onSaqla,
}: {
  mezon: Criterion | null;
  boshKategoriya: string;
  kategoriyalar: Category[];
  doira: Doira;
  doiraNomi: string;
  onYop: () => void;
  onSaqla: (m: Criterion, eskiKod: string | null) => void;
}) {
  const [nom, setNom] = useState(mezon?.name ?? '');
  const [tavsif, setTavsif] = useState(mezon?.description ?? '');
  const [kat, setKat] = useState(mezon?.categoryCode ?? boshKategoriya);
  const [rubrika, setRubrika] = useState<Rubric>(mezon?.rubric ?? { '0': '', '1': '', '2': '', '3': '' });
  const [urindi, setUrindi] = useState(false);

  // Yangi mezon tanlangan doiraga bog'lanadi; tahrirda o'z doirasi saqlanadi
  const appliesTo = mezon?.appliesTo ?? {
    callFamilies: doira.oila ? [doira.oila] : [],
    serviceLines: doira.xizmat ? [doira.xizmat] : [],
    directions: doira.yonalish ? [doira.yonalish] : [],
  };
  const asosiy = !appliesTo.callFamilies.length && !appliesTo.serviceLines.length && !appliesTo.directions.length;

  const yetishmaydi = [
    nom.trim().length < 3 && 'Nom',
    tavsif.trim().length < 10 && 'Nima kutiladi',
    (['0', '1', '2', '3'] as const).some((b) => rubrika[b].trim().length < 5) && 'Ball mezoni',
  ].filter(Boolean) as string[];

  const saqla = (e: FormEvent) => {
    e.preventDefault();
    setUrindi(true);
    if (yetishmaydi.length) return;
    onSaqla(
      {
        code: mezon?.code ?? '',
        categoryCode: kat,
        name: nom.trim(),
        description: tavsif.trim(),
        rubric: { '0': rubrika['0'].trim(), '1': rubrika['1'].trim(), '2': rubrika['2'].trim(), '3': rubrika['3'].trim() },
        appliesTo,
        isActive: mezon?.isActive ?? true,
        order: mezon?.order ?? 0,
      },
      mezon?.code ?? null,
    );
  };

  return (
    <YonPanel
      onYop={onYop}
      onSubmit={saqla}
      bosh={
        <div className="bm-panel-nom">
          <div>
            <h3>{mezon ? 'Mezonni tahrirlash' : "Mezon qo'shish"}</h3>
            <small>{asosiy ? 'Asosiy mezonlarga saqlanadi' : `Maxsus: ${doiraNomi || 'tanlangan doira'}`}</small>
          </div>
        </div>
      }
      past={
        <>
          <button type="submit" className="btn">
            Saqlash
          </button>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            Bekor qilish
          </button>
          {yetishmaydi.length > 0 && <span className="bm-yetishmaydi">To'ldirilmagan: {yetishmaydi.join(', ')}</span>}
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="bm-nom">Mezon nomi</label>
        <input id="bm-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Aniq keyingi qadam" maxLength={120} autoFocus aria-invalid={urindi && nom.trim().length < 3} />
      </div>
      <div className="maydon-blok">
        <label htmlFor="bm-tavsif">Nima kutiladi</label>
        <textarea
          id="bm-tavsif"
          rows={3}
          value={tavsif}
          onChange={(e) => setTavsif(e.target.value)}
          placeholder="Bu mezon bo'yicha yaxshi xatti-harakat qanday ko'rinishini yozing."
          maxLength={600}
          aria-invalid={urindi && tavsif.trim().length < 10}
        />
      </div>
      <div className="maydon-blok">
        <span className="bm-yorliq">Suhbat bosqichi</span>
        <div className="bm-chiplar" role="radiogroup" aria-label="Suhbat bosqichi">
          {kategoriyalar.map((k) => (
            <button key={k.code} type="button" role="radio" aria-checked={kat === k.code} className={`bm-chip-tugma${kat === k.code ? ' faol' : ''}`} onClick={() => setKat(k.code)}>
              {k.name}
            </button>
          ))}
        </div>
        {mezon && kat !== mezon.categoryCode && (
          <div className="yordam">Bosqich o'zgarsa, texnik identifikator ham yangilanadi ({mezon.code} → yangi kod).</div>
        )}
      </div>
      <div className="bm-doira-izoh">
        <Info /> {asosiy ? "Asosiy mezonlarga saqlanadi — barcha qo'ng'iroqlarda baholanadi." : `Faqat ${doiraMatni({ appliesTo } as Criterion, [])} uchun baholanadi.`}
      </div>
      <span className="bm-yuqori">Rubrika 0–3</span>
      <div className="bm-rubrika-forma">
        {BALLAR.map((b) => (
          <div key={b.k} className="bm-rubrika-qator">
            <span className={`bm-ball b${b.k}`}>{b.k}</span>
            <textarea
              rows={2}
              value={rubrika[b.k]}
              onChange={(e) => setRubrika((r) => ({ ...r, [b.k]: e.target.value }))}
              placeholder={b.savol}
              aria-label={`${b.k} ball — ${b.savol}`}
              aria-invalid={urindi && rubrika[b.k].trim().length < 5}
            />
          </div>
        ))}
      </div>
      <p className="sz-eslatma">N/A alohida maydon emas: imkoniyat bo'lmagan holatni tavsifda yozing — tahlil mezonni o'zi hisobdan chiqaradi.</p>
    </YonPanel>
  );
}

// ─── Kategoriya oynasi ──────────────────────────────────────────────────────

function KategoriyaOynasi({ k, jamiBoshqa, onYop, onSaqla }: { k: Category | null; jamiBoshqa: number; onYop: () => void; onSaqla: (nom: string, vazn: number) => void }) {
  const [nom, setNom] = useState(k?.name ?? '');
  const [vazn, setVazn] = useState(String(k ? yaxlit(k.weightPct) : Math.max(0, yaxlit(100 - jamiBoshqa))));
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYop]);
  const v = Number(vazn);
  const vaznTogri = vazn.trim() !== '' && Number.isFinite(v) && v >= 0 && v <= 100;
  const jami = yaxlit(jamiBoshqa + (vaznTogri ? v : 0));

  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <form
        className="vr-oyna bm-oyna"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bm-k-nom"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (nom.trim().length >= 2 && vaznTogri) onSaqla(nom.trim(), v);
        }}
      >
        <div className="vr-oyna-bosh">
          <h3 id="bm-k-nom">{k ? 'Kategoriyani tahrirlash' : "Kategoriya qo'shish"}</h3>
          <button type="button" className="mj-yop" onClick={onYop} aria-label="Yopish">
            <X />
          </button>
        </div>
        <div className="maydon-blok">
          <label htmlFor="bm-k-nomi">Nom</label>
          <input id="bm-k-nomi" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Masalan: Ehtiyojlarni aniqlash" maxLength={80} autoFocus />
        </div>
        <div className="maydon-blok">
          <label htmlFor="bm-k-vazn">Vazn (%)</label>
          <input id="bm-k-vazn" type="number" min={0} max={100} step={1} inputMode="decimal" value={vazn} onChange={(e) => setVazn(e.target.value)} aria-invalid={!vaznTogri} />
          <div className={`yordam${Math.abs(jami - 100) > 0.01 ? ' bm-ogoh' : ''}`}>
            Saqlangach jami: {jami}%{Math.abs(jami - 100) > 0.01 ? " — nashrdan oldin 100% ga keltiring (segment chegarasini surish yoki «moslash»)" : ' ✓'}
          </div>
        </div>
        <div className="vr-oyna-past">
          <button type="submit" className="btn" disabled={nom.trim().length < 2 || !vaznTogri}>
            Saqlash
          </button>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            Bekor qilish
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// ─── Qizil bayroqlar ────────────────────────────────────────────────────────

function QizilBayroqlar({ bayroqlar, yozaOladi, onOzgar }: { bayroqlar: RedFlag[]; yozaOladi: boolean; onOzgar: (rf: RedFlag[]) => void }) {
  const ozgar = (i: number, o: Partial<RedFlag>) => onOzgar(bayroqlar.map((f, j) => (j === i ? { ...f, ...o } : f)));
  return (
    <section className="card bm-karta bm-bayroqlar">
      <div className="bm-bayroq-bosh">
        <div>
          <h3>Qizil bayroqlar</h3>
          <p>Menejer hech qachon qilmasligi kerak bo'lgan narsalar — topilsa, darhol ogohlantirish yaratiladi.</p>
        </div>
        {yozaOladi && (
          <button
            type="button"
            className="btn ikkinchi"
            onClick={() => onOzgar([...bayroqlar, { key: `rf_${Date.now().toString(36)}`, description: '', severity: 'warning' }])}
          >
            <Plus /> Qo'shish
          </button>
        )}
      </div>
      {bayroqlar.length === 0 ? (
        <div className="bm-bosh-mezon">Qizil bayroq yo'q.</div>
      ) : (
        <ul className="bm-bayroq-royxat">
          {bayroqlar.map((f, i) => (
            <li key={f.key}>
              <input
                value={f.description}
                onChange={(e) => ozgar(i, { description: e.target.value })}
                placeholder="Masalan: mijozga noto'g'ri narx aytish"
                maxLength={400}
                disabled={!yozaOladi}
                aria-label="Qizil bayroq tavsifi"
                aria-invalid={f.description.trim().length < 5}
              />
              <div className="bm-darajalar" role="radiogroup" aria-label="Daraja">
                {(['warning', 'critical'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={f.severity === d}
                    disabled={!yozaOladi}
                    className={`bm-daraja ${d}${f.severity === d ? ' faol' : ''}`}
                    onClick={() => ozgar(i, { severity: d })}
                  >
                    {d === 'warning' ? 'Ogohlantirish' : 'Jiddiy'}
                  </button>
                ))}
              </div>
              {yozaOladi && (
                <button type="button" className="bm-ikon xavf" aria-label="Qizil bayroqni o'chirish" onClick={() => onOzgar(bayroqlar.filter((_, j) => j !== i))}>
                  <Trash2 />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
