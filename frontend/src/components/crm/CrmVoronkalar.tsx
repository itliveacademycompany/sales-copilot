import { Check, CircleCheck, Info, Pencil, Plus, RefreshCcw, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type PlaybookBody, type PlaybookVersion } from '../../api';
import { useAuth } from '../../auth';
import { leadQualityYoz, natijaniOl, sanaVaqt, tozaBody, voronkalarniOl, type CrmNatijaSozlama, type CrmVoronka } from './crmMalumot';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → FAOL CRM VORONKALARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qaysi voronkalar hisobot va tahlilda hisobga olinishi. Katalog
 * (`leadQuality.crmVoronkalar`) CRM natija bosqichlari bilan umumiy.
 * CRM integratsiyasi backend'da yo'q — voronkalar shu yerda qo'lda
 * yuritiladi, lidlar soni CRM ulanmaguncha 0.
 */

type Lq = { crmFaqatTanlangan?: boolean };

export function CrmVoronkalar() {
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yozaOladi = business?.permissions.includes('playbook:write') ?? false;

  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [versiya, setVersiya] = useState<PlaybookVersion | null>(null);
  const [yoq, setYoq] = useState(false);
  const [asl, setAsl] = useState<{ faqat: boolean; v: CrmVoronka[] }>({ faqat: false, v: [] });
  const [faqat, setFaqat] = useState(false);
  const [voronkalar, setVoronkalar] = useState<CrmVoronka[]>([]);
  const [natija, setNatija] = useState<CrmNatijaSozlama | null>(null);
  /** Saqlanmagan qayta nomlashlar: eski nom → yangi (o'chirilgan deb ko'rsatilmasin). */
  const [nomlar, setNomlar] = useState<Record<string, string>>({});
  const [oyna, setOyna] = useState<{ v: CrmVoronka | null } | null>(null);
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ ton: 'ok' | 'xato'; matn: string } | null>(null);

  const yukla = useCallback(async () => {
    if (!base) return;
    try {
      const [p, vs] = await Promise.all([api.get<PlaybookBody>(`${base}/playbook`), api.get<PlaybookVersion[]>(`${base}/playbook/versions`).catch(() => [])]);
      const t = tozaBody(p);
      const v = voronkalarniOl(t).map((x) => ({ ...x, faol: x.faol !== false }));
      const f = !!((t.leadQuality ?? {}) as Lq).crmFaqatTanlangan;
      setPb(t);
      setAsl({ faqat: f, v });
      setFaqat(f);
      setVoronkalar(v);
      setNatija(natijaniOl(t));
      setNomlar({});
      setVersiya(vs.find((x) => x.isActive) ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setYoq(true);
    }
  }, [base]);
  useEffect(() => void yukla(), [yukla]);

  const ozgargan = faqat !== asl.faqat || JSON.stringify(voronkalar) !== JSON.stringify(asl.v);
  useEffect(() => {
    if (!ozgargan) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [ozgargan]);

  if (yoq) return <section className="card bm-karta bm-bosh-holat"><b>Playbook hali yaratilmagan</b></section>;
  if (!pb || !natija) return <div className="card skelet" style={{ height: 420 }} aria-busy="true" />;

  const hisobda = (v: CrmVoronka) => !faqat || v.faol !== false;
  const tanlangan = voronkalar.filter(hisobda).length;
  const ochiriladigan = asl.v.filter((a) => !voronkalar.some((v) => v.nom === (nomlar[a.nom] ?? a.nom))).map((a) => a.nom);

  async function saqla() {
    if (!pb || !natija) return;
    if (faqat && tanlangan === 0 && voronkalar.length > 0 && !window.confirm("Birorta voronka tanlanmagan — hech bir voronka hisobga olinmaydi. Davom etasizmi?")) return;
    setBand(true);
    try {
      // O'chirilgan voronkalar CRM natija sozlamalaridan ham olib tashlanadi
      const nomlar = new Set(voronkalar.map((v) => v.nom));
      const n: CrmNatijaSozlama = {
        won: { ...natija.won, bosqichlar: natija.won.bosqichlar.filter((b) => nomlar.has(b.voronka)) },
        lost: { ...natija.lost, bosqichlar: natija.lost.bosqichlar.filter((b) => nomlar.has(b.voronka)) },
      };
      const body = tozaBody(leadQualityYoz(pb, { crmVoronkalar: voronkalar, crmNatija: n, crmFaqatTanlangan: faqat }));
      const v = await api.post<{ valid: boolean; errors?: Record<string, string[]> }>(`${base}/playbook/validate`, body);
      if (!v.valid) {
        setXabar({ ton: 'xato', matn: Object.values(v.errors ?? {}).flat()[0] ?? 'Server tekshiruvi xato topdi' });
        return;
      }
      await api.post(`${base}/playbook`, { ...body, changeNote: 'Faol CRM voronkalari yangilandi' });
      await yukla();
      setXabar({ ton: 'ok', matn: 'Saqlandi — yangi versiya faollashtirildi' });
      setTimeout(() => setXabar((x) => (x?.ton === 'ok' ? null : x)), 3500);
    } catch (e) {
      setXabar({ ton: 'xato', matn: e instanceof ApiError ? e.message : "Saqlanmadi — qayta urinib ko'ring" });
    } finally {
      setBand(false);
    }
  }

  const natijadagi = (nom: string) => [...natija.won.bosqichlar, ...natija.lost.bosqichlar].filter((b) => b.voronka === nom).length;

  return (
    <div className="as">
      <section className="card as-karta">
        <h2 className="as-sarlavha">Faol CRM voronkalari</h2>
        <div className="as-meta">
          {versiya && <span className="bm-versiya">Versiya {versiya.version}</span>}
          <span>Yangilangan: {sanaVaqt(versiya?.activatedAt ?? versiya?.createdAt)}</span>
          {ozgargan && <span className="bm-qoralama">Saqlanmagan o'zgarishlar</span>}
        </div>
        <div className="as-diqqat">
          <TriangleAlert aria-hidden="true" />
          <span>Bu sozlamalar hisobot va tahlilda qaysi voronkalar hisobga olinishini belgilaydi. Har bir saqlash yangi playbook versiyasini yaratadi.</span>
        </div>
      </section>

      <div className="cn-bosh">
        <div>
          <h3>Faol CRM voronkalari</h3>
          <p>CRM sahifalari, hisobotlar va qo'ng'iroq tahlilida hisobga olinadigan voronkalarni tanlang.</p>
        </div>
        {yozaOladi && (
          <div className="as-bosh-amal">
            {ozgargan && (
              <button
                type="button"
                className="btn ikkinchi"
                disabled={band}
                onClick={() => {
                  setFaqat(asl.faqat);
                  setVoronkalar(asl.v);
                  setNatija(natijaniOl(pb));
                  setNomlar({});
                }}
              >
                <RefreshCcw /> Bekor qilish
              </button>
            )}
            <button type="button" className="btn" disabled={!ozgargan || band} onClick={() => void saqla()}>
              <Check /> {band ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
          </div>
        )}
      </div>
      {xabar && (
        <div className={`bm-xabar as-xabar ${xabar.ton}`} role={xabar.ton === 'xato' ? 'alert' : 'status'}>
          {xabar.ton === 'ok' ? <CircleCheck /> : <TriangleAlert />} {xabar.matn}
        </div>
      )}

      <div className="cn-ogoh">
        <TriangleAlert aria-hidden="true" />
        <div>
          <b>O'chirilgan voronkalar hisobga olinmaydi</b>
          <p>
            Saqlagandan keyin bu voronkalardagi lidlar va bog'langan qo'ng'iroqlar CRM sahifalari, hisobotlar va qo'ng'iroq tahlilida ko'rinmaydi. Voronkani
            istalgan vaqtda qayta yoqish mumkin.
          </p>
        </div>
      </div>
      <div className="cn-info">
        <Info aria-hidden="true" />
        <span>
          CRM hali ulanmagan — voronkalar CRM'dan avtomatik kelmaydi, ularni shu yerda qo'shasiz. Bu katalog «CRM natija bosqichlari» bilan umumiy. Lidlar
          soni CRM ulanganda paydo bo'ladi.
        </span>
      </div>

      <section className="cv-sozlama">
        <div className="cv-sozlama-bosh">
          <div>
            <div className="cv-nom">
              <b>Faqat tanlangan voronkalar bilan ishlash</b>
              <span className={`qo-teg ${faqat ? 'yaxshi' : ''}`}>{faqat ? 'Faqat tanlanganlar' : 'Barcha voronkalar hisobga olinadi'}</span>
            </div>
            <p>Bu sozlama o'chirilgan bo'lsa, CRMdan kelgan barcha voronkalar hisobga olinadi.</p>
          </div>
          <label className="vr-almash bn-almash">
            <input type="checkbox" role="switch" aria-label="Faqat tanlangan voronkalar bilan ishlash" checked={faqat} disabled={!yozaOladi} onChange={(e) => setFaqat(e.target.checked)} />
            <span className="vr-almash-yol" aria-hidden="true" />
          </label>
        </div>
        <div className="cv-statlar">
          <div className="cn-stat">
            <span>Tanlangan voronkalar</span>
            <b>
              {tanlangan} / {voronkalar.length}
            </b>
          </div>
          <div className="cn-stat">
            <span>Hisobga olinadigan ochiq lidlar</span>
            <b>0</b>
            <small>CRM ulanmagan</small>
          </div>
          <div className="cn-stat">
            <span>Hisobotga kirmaydigan ochiq lidlar</span>
            <b>0</b>
            <small>CRM ulanmagan</small>
          </div>
        </div>
      </section>

      {ochiriladigan.length > 0 && (
        <div className="ls-ogoh">
          <TriangleAlert /> Saqlanganda katalogdan olib tashlanadi: {ochiriladigan.join(', ')} — ularga bog'langan CRM natija bosqichlari ham o'chadi.
        </div>
      )}

      <div className="cv-royxat">
        {voronkalar.length === 0 && <div className="cn-bosh-holat">Hali voronka yo'q — «Voronka qo'shish» orqali CRM voronkalaringizni kiriting.</div>}
        {voronkalar.map((v) => {
          const h = hisobda(v);
          return (
            <article key={v.nom} className={`cv-voronka${h ? '' : ' ochiq-emas'}`}>
              <div className="cv-voronka-bosh">
                <label className={`cv-belgi${faqat ? '' : ' qulf'}`} title={faqat ? undefined : "Avval «Faqat tanlangan voronkalar bilan ishlash»ni yoqing"}>
                  <input
                    type="checkbox"
                    checked={v.faol !== false}
                    disabled={!faqat || !yozaOladi}
                    onChange={(e) => setVoronkalar((arr) => arr.map((x) => (x.nom === v.nom ? { ...x, faol: e.target.checked } : x)))}
                    aria-label={`${v.nom} — hisobga olish`}
                  />
                  <span aria-hidden="true">
                    <Check />
                  </span>
                  <b>{v.nom}</b>
                </label>
                <div className="cv-o">
                  <span className={`qo-teg ${h ? 'yaxshi' : ''}`}>{h ? 'Hisobga olinadi' : 'Hisobga olinmaydi'}</span>
                  {yozaOladi && (
                    <>
                      <button type="button" className="bm-ikon" aria-label={`${v.nom} — tahrirlash`} title="Tahrirlash" onClick={() => setOyna({ v })}>
                        <Pencil />
                      </button>
                      <button
                        type="button"
                        className="bm-ikon xavf"
                        aria-label={`${v.nom} — o'chirish`}
                        title="Katalogdan o'chirish"
                        onClick={() => {
                          const n = natijadagi(v.nom);
                          if (window.confirm(`«${v.nom}» katalogdan o'chirilsinmi?${n ? `\n${n} ta CRM natija bosqichi ham o'chadi.` : ''}\nO'zgarish «Saqlash» bosilganda kuchga kiradi.`))
                            setVoronkalar((arr) => arr.filter((x) => x.nom !== v.nom));
                        }}
                      >
                        <Trash2 />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="cv-qiymatlar">
                <div>
                  <small>Bosqichlar</small>
                  <b>{v.bosqichlar.length}</b>
                </div>
                <div>
                  <small>Jami lidlar</small>
                  <b>0</b>
                </div>
                <div>
                  <small>Ochiq lidlar</small>
                  <b>0</b>
                </div>
              </div>
              {v.bosqichlar.length > 0 && (
                <div className="cv-bosqichlar">
                  {v.bosqichlar.map((b, i) => (
                    <span key={b} className="xy-teg">
                      <small>{i + 1}.</small> {b}
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        {yozaOladi && (
          <button type="button" className="cn-qoshish" onClick={() => setOyna({ v: null })}>
            <Plus /> Voronka qo'shish
          </button>
        )}
      </div>

      {oyna && (
        <VoronkaOynasi
          v={oyna.v}
          boshqaNomlar={voronkalar.filter((x) => x.nom !== oyna.v?.nom).map((x) => x.nom)}
          onYop={() => setOyna(null)}
          onSaqla={(yangi) => {
            setVoronkalar((arr) => (oyna.v ? arr.map((x) => (x.nom === oyna.v!.nom ? yangi : x)) : [...arr, yangi]));
            // Nom o'zgarsa — natija sozlamalaridagi havolalar ham yangilansin
            if (oyna.v && oyna.v.nom !== yangi.nom) {
              const eski = oyna.v.nom;
              // Asl nomni topib, zanjirli qayta nomlashni ham to'g'ri kuzatamiz
              setNomlar((m) => {
                const asli = Object.keys(m).find((k) => m[k] === eski) ?? eski;
                return { ...m, [asli]: yangi.nom };
              });
            }
            if (oyna.v && oyna.v.nom !== yangi.nom)
              setNatija((n) =>
                n
                  ? {
                      won: { ...n.won, bosqichlar: n.won.bosqichlar.map((b) => (b.voronka === oyna.v!.nom ? { ...b, voronka: yangi.nom } : b)) },
                      lost: { ...n.lost, bosqichlar: n.lost.bosqichlar.map((b) => (b.voronka === oyna.v!.nom ? { ...b, voronka: yangi.nom } : b)) },
                    }
                  : n,
              );
            setOyna(null);
          }}
        />
      )}
    </div>
  );
}

function VoronkaOynasi({ v, boshqaNomlar, onYop, onSaqla }: { v: CrmVoronka | null; boshqaNomlar: string[]; onYop: () => void; onSaqla: (v: CrmVoronka) => void }) {
  const [nom, setNom] = useState(v?.nom ?? '');
  const [bosqichlar, setBosqichlar] = useState<string[]>(v?.bosqichlar ?? []);
  const [yangi, setYangi] = useState('');
  const [urindi, setUrindi] = useState(false);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYop]);

  const n = nom.trim();
  const xato = n.length < 2 ? 'Voronka nomi kamida 2 belgi' : boshqaNomlar.some((x) => x.toLowerCase() === n.toLowerCase()) ? 'Bunday voronka allaqachon bor' : null;
  const qosh = () => {
    const t = yangi.trim().slice(0, 80);
    if (t && !bosqichlar.some((x) => x.toLowerCase() === t.toLowerCase())) setBosqichlar((a) => [...a, t]);
    setYangi('');
  };

  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <form
        className="vr-oyna xy-oyna"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-oyna-nom"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setUrindi(true);
          if (!xato) onSaqla({ nom: n, bosqichlar, faol: v?.faol !== false });
        }}
      >
        <div className="vr-oyna-bosh">
          <h3 id="cv-oyna-nom">{v ? 'Voronkani tahrirlash' : "Voronka qo'shish"}</h3>
          <button type="button" className="mj-yop" onClick={onYop} aria-label="Yopish">
            <X />
          </button>
        </div>
        <div className="maydon-blok">
          <label htmlFor="cv-nom">Voronka nomi</label>
          <input id="cv-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Masalan: Call-Center" maxLength={80} autoFocus aria-invalid={urindi && !!xato} />
        </div>
        <div className="xy-kiritish">
          <label htmlFor="cv-bosqich">Bosqichlar (CRM'dagi tartibda)</label>
          <small>Bosqich nomini yozib Enter bosing. Tartib CRM'dagidek bo'lsin.</small>
          {bosqichlar.length > 0 && (
            <div className="xy-tahrir-teglar">
              {bosqichlar.map((b, i) => (
                <span key={b} className="as-variant">
                  {i + 1}. {b}
                  <button type="button" aria-label={`${b} — olib tashlash`} onClick={() => setBosqichlar((a) => a.filter((x) => x !== b))}>
                    <X />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="xy-kiritish-qator">
            <input
              id="cv-bosqich"
              value={yangi}
              onChange={(e) => setYangi(e.target.value)}
              onKeyDown={(e: RKeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  qosh();
                }
              }}
              placeholder="Masalan: YANGI MUROJAT"
              maxLength={80}
            />
            <button type="button" className="btn ikkinchi" onClick={qosh} disabled={!yangi.trim()}>
              Qo'shish
            </button>
          </div>
        </div>
        {urindi && xato && <div className="yordam bzl-xato">{xato}</div>}
        <div className="vr-oyna-past">
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            Bekor qilish
          </button>
          <button type="submit" className="btn">
            Tayyor
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
