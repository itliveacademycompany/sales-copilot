import { Check, CircleCheck, Info, Plus, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type PlaybookBody, type PlaybookVersion } from '../../api';
import { useAuth } from '../../auth';
import { TanlovMenyu } from '../analitika/Ochiluvchi';
import { useT } from '../../i18n';
import {
  BOSH_NATIJA,
  leadQualityYoz,
  natijaniOl,
  sanaVaqt,
  tozaBody,
  voronkalarniOl,
  type CrmNatijaSozlama,
  type CrmVoronka,
  type NatijaBosqich,
} from './crmMalumot';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → CRM NATIJA BOSQICHLARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CRM'da yopilmay qoladigan bosqichlarni analitikada won/lost sifatida
 * hisoblash qoidalari. Sozlamalar serverda (playbook.leadQuality) saqlanadi;
 * CRM integratsiyasi backend'da hali yo'q — buni sahifa ochiq aytadi.
 */

type Tur = 'won' | 'lost';
const YANGI = '__yangi__';
const TUR: Record<Tur, { nom: string; sarlavha: string; izoh: string; ton: string }> = {
  won: {
    nom: 'Yutilgan (won)',
    sarlavha: 'Yutilgan (won) sifatida hisoblanadigan bosqichlar',
    izoh: "CRMdagi rasmiy yutilgan (won) lidlar doim hisoblanadi. Quyidagi bosqichlarda turgan faol lidlar ham analitikada yutilgan (won) sifatida qo'shiladi.",
    ton: 'yaxshi',
  },
  lost: {
    nom: 'Yutqazilgan (lost)',
    sarlavha: 'Yutqazilgan (lost) sifatida hisoblanadigan bosqichlar',
    izoh: "CRMdagi rasmiy yutqazilgan (lost) lidlar doim hisoblanadi. Quyidagi bosqichlarda turgan faol lidlar ham analitikada yutqazilgan (lost) sifatida qo'shiladi.",
    ton: 'xavf',
  },
};
const tengmi = (a: NatijaBosqich, b: NatijaBosqich) => a.voronka.toLowerCase() === b.voronka.toLowerCase() && a.bosqich.toLowerCase() === b.bosqich.toLowerCase();

export function CrmNatija() {
  const t = useT();
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yozaOladi = business?.permissions.includes('playbook:write') ?? false;

  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [versiya, setVersiya] = useState<PlaybookVersion | null>(null);
  const [yoq, setYoq] = useState(false);
  const [asl, setAsl] = useState<CrmNatijaSozlama>(BOSH_NATIJA);
  const [s, setS] = useState<CrmNatijaSozlama>(BOSH_NATIJA);
  const [katalog, setKatalog] = useState<CrmVoronka[]>([]);
  const [aslKatalog, setAslKatalog] = useState<CrmVoronka[]>([]);
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ ton: 'ok' | 'xato'; matn: string } | null>(null);

  const yukla = useCallback(async () => {
    if (!base) return;
    try {
      const [p, vs] = await Promise.all([api.get<PlaybookBody>(`${base}/playbook`), api.get<PlaybookVersion[]>(`${base}/playbook/versions`).catch(() => [])]);
      const toza = tozaBody(p);
      setPb(toza);
      const n = natijaniOl(toza);
      setAsl(n);
      setS(n);
      const k = voronkalarniOl(toza);
      setKatalog(k);
      setAslKatalog(k);
      setVersiya(vs.find((v) => v.isActive) ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setYoq(true);
    }
  }, [base]);
  useEffect(() => void yukla(), [yukla]);

  const ozgargan = JSON.stringify(s) !== JSON.stringify(asl) || JSON.stringify(katalog) !== JSON.stringify(aslKatalog);
  useEffect(() => {
    if (!ozgargan) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [ozgargan]);

  if (yoq) return <section className="card bm-karta bm-bosh-holat"><b>{t('Playbook hali yaratilmagan')}</b></section>;
  if (!pb) return <div className="card skelet" style={{ height: 420 }} aria-busy="true" />;

  async function saqla() {
    if (!pb) return;
    setBand(true);
    try {
      const body = tozaBody(leadQualityYoz(pb, { crmNatija: s, crmVoronkalar: katalog }));
      const v = await api.post<{ valid: boolean; errors?: Record<string, string[]> }>(`${base}/playbook/validate`, body);
      if (!v.valid) {
        setXabar({ ton: 'xato', matn: Object.values(v.errors ?? {}).flat()[0] ?? t('Server tekshiruvi xato topdi') });
        return;
      }
      await api.post(`${base}/playbook`, { ...body, changeNote: 'CRM natija bosqichlari yangilandi' });
      await yukla();
      setXabar({ ton: 'ok', matn: t('Saqlandi — yangi versiya faollashtirildi') });
      setTimeout(() => setXabar((x) => (x?.ton === 'ok' ? null : x)), 3500);
    } catch (e) {
      setXabar({ ton: 'xato', matn: e instanceof ApiError ? e.message : t("Saqlanmadi — qayta urinib ko'ring") });
    } finally {
      setBand(false);
    }
  }

  /** Yangi yozilgan voronka/bosqich katalogga ham qo'shiladi. */
  const katalogga = (b: NatijaBosqich) =>
    setKatalog((k) => {
      const v = k.find((x) => x.nom.toLowerCase() === b.voronka.toLowerCase());
      if (!v) return [...k, { nom: b.voronka, bosqichlar: [b.bosqich], faol: true }];
      if (v.bosqichlar.some((x) => x.toLowerCase() === b.bosqich.toLowerCase())) return k;
      return k.map((x) => (x === v ? { ...x, bosqichlar: [...x.bosqichlar, b.bosqich] } : x));
    });

  const ozgar = (tur: Tur, o: Partial<CrmNatijaSozlama[Tur]>) => setS((x) => ({ ...x, [tur]: { ...x[tur], ...o } }));

  return (
    <div className="as">
      <section className="card as-karta">
        <h2 className="as-sarlavha">{t('CRM natija bosqichlari')}</h2>
        <div className="as-meta">
          {versiya && <span className="bm-versiya">{t('Versiya {n}', { n: versiya.version })}</span>}
          <span>{t('Yangilangan: {sana}', { sana: sanaVaqt(versiya?.activatedAt ?? versiya?.createdAt) })}</span>
          {ozgargan && <span className="bm-qoralama">{t("Saqlanmagan o'zgarishlar")}</span>}
        </div>
        <div className="as-diqqat">
          <TriangleAlert aria-hidden="true" />
          <span>{t("Bu sozlamalar hisobot va analitikadagi natija raqamlariga ta'sir qiladi. Har bir saqlash yangi playbook versiyasini yaratadi.")}</span>
        </div>
      </section>

      <div className="cn-bosh">
        <div>
          <h3>{t('CRM natija bosqichlari')}</h3>
          <p>
            {t("CRMda yopilmay qoladigan bosqichlarni analitikada yutilgan (won) yoki yutqazilgan (lost) sifatida hisoblashni sozlang. CRMdagi lid statusi o'zgarmaydi.")}
          </p>
        </div>
        {yozaOladi && (
          <div className="as-bosh-amal">
            {ozgargan && (
              <button
                type="button"
                className="btn ikkinchi"
                disabled={band}
                onClick={() => {
                  setS(asl);
                  setKatalog(aslKatalog);
                }}
              >
                {t('Bekor qilish')}
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
          <b>{t('Lidlar CRMda yopilmay qolsa ishlating')}</b>
          <p>
            {t("Agar jamoangiz lidlarni CRMda to'g'ri yutilgan (won) yoki yutqazilgan (lost) qilib yopsa, bu sozlamalarni yoqmang. Tanlangan bosqichlar faqat hisobot, analitika va konversiya raqamlariga ta'sir qiladi.")}
          </p>
        </div>
      </div>
      <div className="cn-info">
        <Info aria-hidden="true" />
        <span>
          {t("CRM hali ulanmagan — voronka va bosqichlar CRM'dan avtomatik kelmaydi, ularni shu yerda yozib qo'shasiz. Sozlamalar saqlanadi va CRM ulanganda hisobotlarga qo'llanadi.")}
        </span>
      </div>

      <div className="cn-statlar">
        <Stat nom={t('Yutilgan (won) bosqichlari: {n}', { n: s.won.yoqilgan ? s.won.bosqichlar.length : 0 })} />
        <Stat nom={t('Yutqazilgan (lost) bosqichlari: {n}', { n: s.lost.yoqilgan ? s.lost.bosqichlar.length : 0 })} />
        <Stat nom={t('CRMdagi rasmiy yutilgan (won) lidlar')} />
        <Stat nom={t('CRMdagi rasmiy yutqazilgan (lost) lidlar')} />
      </div>

      <div className="cn-kartalar">
        {(['won', 'lost'] as const).map((tur) => (
          <NatijaKarta
            key={tur}
            tur={tur}
            q={s[tur]}
            boshqa={s[tur === 'won' ? 'lost' : 'won']}
            katalog={katalog}
            yozaOladi={yozaOladi}
            onYoq={(v) => ozgar(tur, { yoqilgan: v })}
            onQosh={(b) => {
              katalogga(b);
              ozgar(tur, { bosqichlar: [...s[tur].bosqichlar, b] });
            }}
            onOlib={(b) => ozgar(tur, { bosqichlar: s[tur].bosqichlar.filter((x) => !tengmi(x, b)) })}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ nom }: { nom: string }) {
  const t = useT();
  return (
    <div className="cn-stat">
      <span>{nom}</span>
      <b>0</b>
      <small>{t('CRM ulanmagan — lidlar kelmayapti')}</small>
    </div>
  );
}

function NatijaKarta({
  tur,
  q,
  boshqa,
  katalog,
  yozaOladi,
  onYoq,
  onQosh,
  onOlib,
}: {
  tur: Tur;
  q: CrmNatijaSozlama[Tur];
  boshqa: CrmNatijaSozlama[Tur];
  katalog: CrmVoronka[];
  yozaOladi: boolean;
  onYoq: (v: boolean) => void;
  onQosh: (b: NatijaBosqich) => void;
  onOlib: (b: NatijaBosqich) => void;
}) {
  const t = useT();
  const m = TUR[tur];
  const [forma, setForma] = useState(false);
  return (
    <section className={`cn-karta${q.yoqilgan ? ' yoq' : ''}`}>
      <div className="cn-karta-bosh">
        <div>
          <b>{t(m.sarlavha)}</b>
          <span className={`qo-teg ${m.ton}`}>
            {t(m.nom)}: {q.bosqichlar.length}
          </span>
          <p>{t(m.izoh)}</p>
        </div>
        <label className="vr-almash bn-almash" title={q.yoqilgan ? t("O'chirish") : t('Yoqish')}>
          <input type="checkbox" role="switch" aria-label={t(m.sarlavha)} checked={q.yoqilgan} disabled={!yozaOladi} onChange={(e) => onYoq(e.target.checked)} />
          <span className="vr-almash-yol" aria-hidden="true" />
        </label>
      </div>
      {q.yoqilgan && (
        <div className="cn-karta-tana">
          {q.bosqichlar.length === 0 ? (
            <div className="cn-bosh-holat">{t('{nom} uchun bosqich tanlanmagan.', { nom: t(m.nom) })}</div>
          ) : (
            <ul className="cn-royxat">
              {q.bosqichlar.map((b) => (
                <li key={`${b.voronka}|${b.bosqich}`}>
                  <span className={`cn-nuqta ${m.ton}`} aria-hidden="true" />
                  <div>
                    <small>{b.voronka}</small>
                    <b>{b.bosqich}</b>
                  </div>
                  {yozaOladi && (
                    <button type="button" className="bm-ikon xavf" aria-label={t('{teg} — olib tashlash', { teg: `${b.voronka} · ${b.bosqich}` })} title={t('Olib tashlash')} onClick={() => onOlib(b)}>
                      <X />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {yozaOladi &&
            (forma ? (
              <BosqichForma
                katalog={katalog}
                band={[...q.bosqichlar, ...boshqa.bosqichlar]}
                boshqaNom={t(TUR[tur === 'won' ? 'lost' : 'won'].nom)}
                boshqadami={(b) => boshqa.bosqichlar.some((x) => tengmi(x, b))}
                onBekor={() => setForma(false)}
                onQosh={(b) => {
                  onQosh(b);
                  setForma(false);
                }}
              />
            ) : (
              <button type="button" className="cn-qoshish" onClick={() => setForma(true)}>
                <Plus /> {t("{nom} bosqich qo'shish", { nom: t(m.nom) })}
              </button>
            ))}
        </div>
      )}
    </section>
  );
}

function BosqichForma({
  katalog,
  band,
  boshqaNom,
  boshqadami,
  onBekor,
  onQosh,
}: {
  katalog: CrmVoronka[];
  band: NatijaBosqich[];
  boshqaNom: string;
  boshqadami: (b: NatijaBosqich) => boolean;
  onBekor: () => void;
  onQosh: (b: NatijaBosqich) => void;
}) {
  const t = useT();
  const [voronka, setVoronka] = useState(katalog[0]?.nom ?? YANGI);
  const [yangiVoronka, setYangiVoronka] = useState('');
  const vObj = katalog.find((v) => v.nom === voronka);
  const [bosqich, setBosqich] = useState(vObj?.bosqichlar[0] ?? YANGI);
  const [yangiBosqich, setYangiBosqich] = useState('');

  const vNom = (voronka === YANGI ? yangiVoronka : voronka).trim();
  const bNom = (bosqich === YANGI ? yangiBosqich : bosqich).trim();
  const juft = { voronka: vNom, bosqich: bNom };
  const xato = !vNom
    ? t('Voronkani tanlang yoki nomini yozing')
    : !bNom
      ? t('Bosqichni tanlang yoki nomini yozing')
      : boshqadami(juft)
        ? t("Bu bosqich allaqachon «{nom}» ro'yxatida — bir bosqich ikkalasida bo'lolmaydi", { nom: boshqaNom })
        : band.some((x) => tengmi(x, juft))
          ? t("Bu bosqich allaqachon qo'shilgan")
          : null;

  const voronkaTanla = (v: string) => {
    setVoronka(v);
    setBosqich(katalog.find((x) => x.nom === v)?.bosqichlar[0] ?? YANGI);
  };

  return (
    <div className="cn-forma">
      <div className="cn-forma-panjara">
        <div className="maydon-blok">
          <label htmlFor="cn-voronka">{t('Sotuv voronkasi')}</label>
          <TanlovMenyu
            id="cn-voronka"
            aria={t('Sotuv voronkasi')}
            qiymat={voronka}
            variantlar={[...katalog.map((v) => ({ qiymat: v.nom, nom: v.nom })), { qiymat: YANGI, nom: t('+ Yangi voronka…') }]}
            onOzgar={voronkaTanla}
            kenglik="100%"
          />
          {voronka === YANGI && <input value={yangiVoronka} onChange={(e) => setYangiVoronka(e.target.value)} placeholder={t('Voronka nomi, masalan: Call-Center')} maxLength={80} autoFocus />}
        </div>
        <div className="maydon-blok">
          <label htmlFor="cn-bosqich">{t('Bosqich')}</label>
          <TanlovMenyu
            id="cn-bosqich"
            aria={t('Bosqich')}
            qiymat={bosqich}
            variantlar={[...(vObj?.bosqichlar ?? []).map((b) => ({ qiymat: b, nom: b })), { qiymat: YANGI, nom: t('+ Yangi bosqich…') }]}
            onOzgar={setBosqich}
            kenglik="100%"
          />
          {bosqich === YANGI && (
            <input value={yangiBosqich} onChange={(e) => setYangiBosqich(e.target.value)} placeholder={t('Bosqich nomi, masalan: Kelmadi')} maxLength={80} autoFocus={voronka !== YANGI} />
          )}
        </div>
      </div>
      {xato && (vNom || bNom) && <div className="yordam bzl-xato">{xato}</div>}
      <div className="cn-forma-past">
        <button type="button" className="cn-bekor" onClick={onBekor}>
          <X /> {t('Bekor qilish')}
        </button>
        <button type="button" className="btn" disabled={!!xato} onClick={() => onQosh(juft)}>
          <Plus /> {t("Qo'shish")}
        </button>
      </div>
    </div>
  );
}
