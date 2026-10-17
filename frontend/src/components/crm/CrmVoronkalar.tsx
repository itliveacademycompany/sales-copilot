import { Check, CircleCheck, Info, Pencil, Plus, RefreshCcw, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type PlaybookBody, type PlaybookVersion } from '../../api';
import { useAuth } from '../../auth';
import { leadQualityYoz, natijaniOl, sanaVaqt, tozaBody, voronkalarniOl, type CrmNatijaSozlama, type CrmVoronka } from './crmMalumot';
import { useT } from '../../i18n';

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
  const t = useT();
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
      const toza = tozaBody(p);
      const v = voronkalarniOl(toza).map((x) => ({ ...x, faol: x.faol !== false }));
      const f = !!((toza.leadQuality ?? {}) as Lq).crmFaqatTanlangan;
      setPb(toza);
      setAsl({ faqat: f, v });
      setFaqat(f);
      setVoronkalar(v);
      setNatija(natijaniOl(toza));
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

  if (yoq) return <section className="card bm-karta bm-bosh-holat"><b>{t('Playbook hali yaratilmagan')}</b></section>;
  if (!pb || !natija) return <div className="card skelet" style={{ height: 420 }} aria-busy="true" />;

  const hisobda = (v: CrmVoronka) => !faqat || v.faol !== false;
  const tanlangan = voronkalar.filter(hisobda).length;
  const ochiriladigan = asl.v.filter((a) => !voronkalar.some((v) => v.nom === (nomlar[a.nom] ?? a.nom))).map((a) => a.nom);

  async function saqla() {
    if (!pb || !natija) return;
    if (faqat && tanlangan === 0 && voronkalar.length > 0 && !window.confirm(t('Birorta voronka tanlanmagan — hech bir voronka hisobga olinmaydi. Davom etasizmi?'))) return;
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
        setXabar({ ton: 'xato', matn: Object.values(v.errors ?? {}).flat()[0] ?? t('Server tekshiruvi xato topdi') });
        return;
      }
      await api.post(`${base}/playbook`, { ...body, changeNote: 'Faol CRM voronkalari yangilandi' });
      await yukla();
      setXabar({ ton: 'ok', matn: t('Saqlandi — yangi versiya faollashtirildi') });
      setTimeout(() => setXabar((x) => (x?.ton === 'ok' ? null : x)), 3500);
    } catch (e) {
      setXabar({ ton: 'xato', matn: e instanceof ApiError ? e.message : t("Saqlanmadi — qayta urinib ko'ring") });
    } finally {
      setBand(false);
    }
  }

  const natijadagi = (nom: string) => [...natija.won.bosqichlar, ...natija.lost.bosqichlar].filter((b) => b.voronka === nom).length;

  return (
    <div className="as">
      <section className="card as-karta">
        <h2 className="as-sarlavha">{t('Faol CRM voronkalari')}</h2>
        <div className="as-meta">
          {versiya && <span className="bm-versiya">{t('Versiya {n}', { n: versiya.version })}</span>}
          <span>{t('Yangilangan: {sana}', { sana: sanaVaqt(versiya?.activatedAt ?? versiya?.createdAt) })}</span>
          {ozgargan && <span className="bm-qoralama">{t("Saqlanmagan o'zgarishlar")}</span>}
        </div>
        <div className="as-diqqat">
          <TriangleAlert aria-hidden="true" />
          <span>{t('Bu sozlamalar hisobot va tahlilda qaysi voronkalar hisobga olinishini belgilaydi. Har bir saqlash yangi playbook versiyasini yaratadi.')}</span>
        </div>
      </section>

      <div className="cn-bosh">
        <div>
          <h3>{t('Faol CRM voronkalari')}</h3>
          <p>{t("CRM sahifalari, hisobotlar va qo'ng'iroq tahlilida hisobga olinadigan voronkalarni tanlang.")}</p>
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
                <RefreshCcw /> {t('Bekor qilish')}
              </button>
            )}
            <button type="button" className="btn" disabled={!ozgargan || band} onClick={() => void saqla()}>
              <Check /> {band ? t('Saqlanmoqda…') : t('Saqlash')}
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
          <b>{t("O'chirilgan voronkalar hisobga olinmaydi")}</b>
          <p>
            {t("Saqlagandan keyin bu voronkalardagi lidlar va bog'langan qo'ng'iroqlar CRM sahifalari, hisobotlar va qo'ng'iroq tahlilida ko'rinmaydi. Voronkani istalgan vaqtda qayta yoqish mumkin.")}
          </p>
        </div>
      </div>
      <div className="cn-info">
        <Info aria-hidden="true" />
        <span>
          {t("CRM hali ulanmagan — voronkalar CRM'dan avtomatik kelmaydi, ularni shu yerda qo'shasiz. Bu katalog «CRM natija bosqichlari» bilan umumiy. Lidlar soni CRM ulanganda paydo bo'ladi.")}
        </span>
      </div>

      <section className="cv-sozlama">
        <div className="cv-sozlama-bosh">
          <div>
            <div className="cv-nom">
              <b>{t('Faqat tanlangan voronkalar bilan ishlash')}</b>
              <span className={`qo-teg ${faqat ? 'yaxshi' : ''}`}>{faqat ? t('Faqat tanlanganlar') : t('Barcha voronkalar hisobga olinadi')}</span>
            </div>
            <p>{t("Bu sozlama o'chirilgan bo'lsa, CRMdan kelgan barcha voronkalar hisobga olinadi.")}</p>
          </div>
          <label className="vr-almash bn-almash">
            <input type="checkbox" role="switch" aria-label={t('Faqat tanlangan voronkalar bilan ishlash')} checked={faqat} disabled={!yozaOladi} onChange={(e) => setFaqat(e.target.checked)} />
            <span className="vr-almash-yol" aria-hidden="true" />
          </label>
        </div>
        <div className="cv-statlar">
          <div className="cn-stat">
            <span>{t('Tanlangan voronkalar')}</span>
            <b>
              {tanlangan} / {voronkalar.length}
            </b>
          </div>
          <div className="cn-stat">
            <span>{t('Hisobga olinadigan ochiq lidlar')}</span>
            <b>0</b>
            <small>{t('CRM ulanmagan')}</small>
          </div>
          <div className="cn-stat">
            <span>{t('Hisobotga kirmaydigan ochiq lidlar')}</span>
            <b>0</b>
            <small>{t('CRM ulanmagan')}</small>
          </div>
        </div>
      </section>

      {ochiriladigan.length > 0 && (
        <div className="ls-ogoh">
          <TriangleAlert />{' '}
          {t("Saqlanganda katalogdan olib tashlanadi: {r} — ularga bog'langan CRM natija bosqichlari ham o'chadi.", { r: ochiriladigan.join(', ') })}
        </div>
      )}

      <div className="cv-royxat">
        {voronkalar.length === 0 && <div className="cn-bosh-holat">{t("Hali voronka yo'q — «Voronka qo'shish» orqali CRM voronkalaringizni kiriting.")}</div>}
        {voronkalar.map((v) => {
          const h = hisobda(v);
          return (
            <article key={v.nom} className={`cv-voronka${h ? '' : ' ochiq-emas'}`}>
              <div className="cv-voronka-bosh">
                <label className={`cv-belgi${faqat ? '' : ' qulf'}`} title={faqat ? undefined : t('Avval «Faqat tanlangan voronkalar bilan ishlash»ni yoqing')}>
                  <input
                    type="checkbox"
                    checked={v.faol !== false}
                    disabled={!faqat || !yozaOladi}
                    onChange={(e) => setVoronkalar((arr) => arr.map((x) => (x.nom === v.nom ? { ...x, faol: e.target.checked } : x)))}
                    aria-label={t('{nom} — hisobga olish', { nom: v.nom })}
                  />
                  <span aria-hidden="true">
                    <Check />
                  </span>
                  <b>{v.nom}</b>
                </label>
                <div className="cv-o">
                  <span className={`qo-teg ${h ? 'yaxshi' : ''}`}>{h ? t('Hisobga olinadi') : t('Hisobga olinmaydi')}</span>
                  {yozaOladi && (
                    <>
                      <button type="button" className="bm-ikon" aria-label={t('{nom} — tahrirlash', { nom: v.nom })} title={t('Tahrirlash')} onClick={() => setOyna({ v })}>
                        <Pencil />
                      </button>
                      <button
                        type="button"
                        className="bm-ikon xavf"
                        aria-label={t("{nom} — o'chirish", { nom: v.nom })}
                        title={t("Katalogdan o'chirish")}
                        onClick={() => {
                          const n = natijadagi(v.nom);
                          const savol = n
                            ? t("«{nom}» katalogdan o'chirilsinmi?\n{n} ta CRM natija bosqichi ham o'chadi.\nO'zgarish «Saqlash» bosilganda kuchga kiradi.", { nom: v.nom, n })
                            : t("«{nom}» katalogdan o'chirilsinmi?\nO'zgarish «Saqlash» bosilganda kuchga kiradi.", { nom: v.nom });
                          if (window.confirm(savol))
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
                  <small>{t('Bosqichlar')}</small>
                  <b>{v.bosqichlar.length}</b>
                </div>
                <div>
                  <small>{t('Jami lidlar')}</small>
                  <b>0</b>
                </div>
                <div>
                  <small>{t('Ochiq lidlar')}</small>
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
            <Plus /> {t("Voronka qo'shish")}
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
  const t = useT();
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
  const xato = n.length < 2 ? t('Voronka nomi kamida 2 belgi') : boshqaNomlar.some((x) => x.toLowerCase() === n.toLowerCase()) ? t('Bunday voronka allaqachon bor') : null;
  const qosh = () => {
    const b = yangi.trim().slice(0, 80);
    if (b && !bosqichlar.some((x) => x.toLowerCase() === b.toLowerCase())) setBosqichlar((a) => [...a, b]);
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
          <h3 id="cv-oyna-nom">{v ? t('Voronkani tahrirlash') : t("Voronka qo'shish")}</h3>
          <button type="button" className="mj-yop" onClick={onYop} aria-label={t('Yopish')}>
            <X />
          </button>
        </div>
        <div className="maydon-blok">
          <label htmlFor="cv-nom">{t('Voronka nomi')}</label>
          <input id="cv-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t('Masalan: Call-Center')} maxLength={80} autoFocus aria-invalid={urindi && !!xato} />
        </div>
        <div className="xy-kiritish">
          <label htmlFor="cv-bosqich">{t("Bosqichlar (CRM'dagi tartibda)")}</label>
          <small>{t("Bosqich nomini yozib Enter bosing. Tartib CRM'dagidek bo'lsin.")}</small>
          {bosqichlar.length > 0 && (
            <div className="xy-tahrir-teglar">
              {bosqichlar.map((b, i) => (
                <span key={b} className="as-variant">
                  {i + 1}. {b}
                  <button type="button" aria-label={t('{teg} — olib tashlash', { teg: b })} onClick={() => setBosqichlar((a) => a.filter((x) => x !== b))}>
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
              placeholder={t('Masalan: YANGI MUROJAT')}
              maxLength={80}
            />
            <button type="button" className="btn ikkinchi" onClick={qosh} disabled={!yangi.trim()}>
              {t("Qo'shish")}
            </button>
          </div>
        </div>
        {urindi && xato && <div className="yordam bzl-xato">{xato}</div>}
        <div className="vr-oyna-past">
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor qilish')}
          </button>
          <button type="submit" className="btn">
            {t('Tayyor')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
