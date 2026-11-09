import { Clock, FileText, Lock, Mic, Pencil, PhoneCall, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { useCrm } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import {
  haftaBoshi,
  KAYFIYAT_NOMI,
  kunNomi,
  mmss,
  QISQA_SEK,
  YAKUN_SEK,
  type Jins,
  type Kayfiyat,
  type Mashq,
  type SimulyatorHolat,
  type Ssenariy,
} from '../../crm/simulyator';
import { tarjima, useT } from '../../i18n';
import { QongiroqEkran } from './SimulyatorQongiroq';
import './simulyator.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULYATOR — menejer AI "mijoz" bilan mashq qo'ng'irog'i qiladi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ssenariy kartalari (tayyor + biznesniki), qidiruv, "Shu hafta" va
 * "So'nggi mashqlar" paneli. Boshlash → "Boshlashdan oldin" oynasi →
 * qo'ng'iroq ekrani → natija sahifasi (`/crm/simulyator/mashq/:id`).
 */
export function Simulyator() {
  const { base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [holat, setHolat] = useState<SimulyatorHolat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tahrir, setTahrir] = useState<Ssenariy | 'yangi' | null>(null);
  const [tafsilot, setTafsilot] = useState<Ssenariy | null>(null);
  const [boshla, setBoshla] = useState<Ssenariy | null>(null);
  const [qongiroq, setQongiroq] = useState<{ mashq: Mashq; ssenariy: Ssenariy } | null>(null);

  const yukla = useCallback(async () => {
    try {
      const h = await api.get<SimulyatorHolat>(`${base}/simulyator?haftaDan=${encodeURIComponent(haftaBoshi().toISOString())}`);
      setHolat(h);
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? tarjima(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, t]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  // Natija sahifasidagi "Qayta urinish" → ?boshla=<ssenariy> — darhol "Boshlashdan oldin" oynasi
  useEffect(() => {
    const kalit = params.get('boshla');
    if (!kalit || !holat) return;
    const s = holat.ssenariylar.find((x) => x.id === kalit);
    if (s) setBoshla(s);
    setParams({}, { replace: true });
  }, [params, holat, setParams]);

  const royxat = useMemo(() => {
    const soz = q.trim().toLocaleLowerCase();
    const hammasi = holat?.ssenariylar ?? [];
    if (!soz) return hammasi;
    return hammasi.filter((s) => `${s.nom} ${s.vaziyat} ${s.maqsad} ${s.mijozIsmi}`.toLocaleLowerCase().includes(soz));
  }, [holat, q]);

  if (qongiroq) {
    return (
      <QongiroqEkran
        base={base}
        mashq={qongiroq.mashq}
        onTugadi={(id) => {
          setQongiroq(null);
          if (id) navigate(`/crm/simulyator/mashq/${id}`);
          else void yukla();
        }}
      />
    );
  }

  return (
    <div className="sim">
      <header className="sim-bosh">
        <div>
          <h1>{t('Simulyator')}</h1>
          <p>{t("AI mijoz bilan qo'ng'iroqni mashq qiling — haqiqiy mijozdan oldin xato qilib oling.")}</p>
        </div>
        {holat?.yarataOladi && (
          <button type="button" className="btn" onClick={() => setTahrir('yangi')}>
            <Plus size={18} /> {t('Yangi yaratish')}
          </button>
        )}
      </header>

      {xato && (
        <div className="xato-banner" role="alert">
          {xato}
        </div>
      )}

      <div className="sim-tana">
        <section className="sim-asosiy" aria-label={t('Ssenariylar')}>
          <label className="sim-qidiruv">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">{t('Qidirish')}</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Maqsad yoki vaziyat bo'yicha qidirish")}
            />
          </label>

          {!holat && !xato ? (
            <div className="sim-tor">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="sim-karta sim-skelet" aria-hidden="true" />
              ))}
            </div>
          ) : royxat.length === 0 ? (
            <div className="sim-bosh-holat">{q ? t('Hech narsa topilmadi') : t("Ssenariylar yo'q")}</div>
          ) : (
            <div className="sim-tor">
              {royxat.map((s) => (
                <article key={s.id} className="sim-karta">
                  <h3>{s.nom}</h3>
                  <div className="sim-meta">
                    <Clock size={14} aria-hidden="true" />
                    {t('{n} daqiqa', { n: s.davomiylikDaq })} · {s.tayyor ? 'Dill Mind AI' : s.muallif ?? t('Kompaniya')}
                  </div>
                  <p className="sim-vaziyat">{s.vaziyat}</p>
                  <div className="sim-karta-past">
                    <button
                      type="button"
                      className="sim-ikon-tugma"
                      onClick={() => setTafsilot(s)}
                      aria-label={t('{nom} — ssenariy tafsilotlari', { nom: s.nom })}
                      title={t('Ssenariy tafsilotlari')}
                    >
                      <FileText size={17} />
                    </button>
                    <button type="button" className="btn sim-boshlash" onClick={() => setBoshla(s)}>
                      <PhoneCall size={16} /> {t('Boshlash')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="sim-yon" aria-label={t('Mashqlaringiz')}>
          <section className="sim-panel">
            <h2>{t('Shu hafta')}</h2>
            <div className="sim-stat-qator">
              <div className="sim-stat">
                <b>{holat?.hafta.soni ?? '—'}</b>
                <span>{t("mashq qo'ng'iroqlari")}</span>
              </div>
              <div className="sim-stat">
                <b>
                  {holat ? Math.ceil(holat.hafta.sek / 60) : '—'} <small>{t('daq')}</small>
                </b>
                <span>{t('suhbat vaqti')}</span>
              </div>
            </div>
          </section>

          <section className="sim-panel">
            <h2>{t("So'nggi mashqlar")}</h2>
            {holat && holat.songgi.length === 0 ? (
              <p className="sim-bosh-kichik">{t("Hali mashq qilmadingiz. Ssenariyni tanlab, «Boshlash»ni bosing.")}</p>
            ) : (
              <ul className="sim-songgi">
                {holat?.songgi.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => navigate(`/crm/simulyator/mashq/${m.id}`)}>
                      <span className="sim-songgi-matn">
                        <b>{m.nom}</b>
                        <span>
                          {t(kunNomi(m.boshlangan))} · {mmss(m.davomiylikSek)}
                        </span>
                      </span>
                      {m.davomiylikSek < QISQA_SEK ? (
                        <span className="sim-belgi">{t('Juda qisqa')}</span>
                      ) : m.maqsadgaErishildi === true ? (
                        <span className="sim-belgi yashil">{t('Erishildi')}</span>
                      ) : m.maqsadgaErishildi === false ? (
                        <span className="sim-belgi sariq">{t('Erishilmadi')}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="sim-maxfiy">
              <Lock size={14} aria-hidden="true" /> {t('Mashq tarixingizni faqat siz ko\'rasiz.')}
            </p>
          </section>
        </aside>
      </div>

      {tafsilot && (
        <TafsilotOyna
          s={tafsilot}
          tahrirlayOladi={Boolean(holat?.yarataOladi) && !tafsilot.tayyor}
          onYop={() => setTafsilot(null)}
          onBoshla={() => {
            setBoshla(tafsilot);
            setTafsilot(null);
          }}
          onTahrir={() => {
            setTahrir(tafsilot);
            setTafsilot(null);
          }}
          onOchir={async () => {
            await api.del(`${base}/simulyator/ssenariylar/${tafsilot.id}`);
            setTafsilot(null);
            await yukla();
          }}
        />
      )}

      {tahrir && (
        <SsenariyOyna
          base={base}
          s={tahrir === 'yangi' ? null : tahrir}
          onYop={() => setTahrir(null)}
          onSaqlandi={async () => {
            setTahrir(null);
            await yukla();
          }}
        />
      )}

      {boshla && holat && (
        <BoshlashOyna
          base={base}
          s={boshla}
          aiBor={holat.ai.matn}
          ovozBor={holat.ai.ovoz}
          onYop={() => setBoshla(null)}
          onBoshlandi={(mashq) => {
            setQongiroq({ mashq, ssenariy: boshla });
            setBoshla(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Ssenariy tafsilotlari (📄) ─────────────────────────────────────────────

function TafsilotOyna({
  s,
  tahrirlayOladi,
  onYop,
  onBoshla,
  onTahrir,
  onOchir,
}: {
  s: Ssenariy;
  tahrirlayOladi: boolean;
  onYop: () => void;
  onBoshla: () => void;
  onTahrir: () => void;
  onOchir: () => Promise<void>;
}) {
  const t = useT();
  const [tasdiq, setTasdiq] = useState(false);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');

  return (
    <Oyna
      sarlavha={s.nom}
      onYop={onYop}
      past={
        <>
          {tahrirlayOladi && (
            <div className="sim-oyna-chap">
              {tasdiq ? (
                <>
                  <span className="sim-tasdiq-matn">{t("O'chirilsinmi?")}</span>
                  <button
                    type="button"
                    className="btn ikkinchi kichik sim-xavf"
                    disabled={band}
                    onClick={async () => {
                      setBand(true);
                      setXato('');
                      try {
                        await onOchir();
                      } catch (e) {
                        setXato(e instanceof ApiError ? tarjima(e.message) : t("O'chirib bo'lmadi"));
                        setBand(false);
                      }
                    }}
                  >
                    {t("Ha, o'chirish")}
                  </button>
                  <button type="button" className="btn ikkinchi kichik" onClick={() => setTasdiq(false)}>
                    {t("Yo'q")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn ikkinchi kichik" onClick={onTahrir}>
                    <Pencil size={15} /> {t('Tahrirlash')}
                  </button>
                  <button type="button" className="btn ikkinchi kichik sim-xavf" onClick={() => setTasdiq(true)} aria-label={t("O'chirish")}>
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          )}
          <button type="button" className="btn" onClick={onBoshla}>
            <PhoneCall size={16} /> {t('Boshlash')}
          </button>
        </>
      }
    >
      <div className="sim-tafsilot">
        <div className="sim-meta">
          <Clock size={14} aria-hidden="true" />
          {t('{n} daqiqa', { n: s.davomiylikDaq })} · {t('Mijoz kayfiyati')}: {t(KAYFIYAT_NOMI[s.kayfiyat])}
        </div>
        <dl>
          <dt>{t('Vaziyat')}</dt>
          <dd>{s.vaziyat}</dd>
          <dt>{t("Qo'ng'iroq maqsadi")}</dt>
          <dd>{s.maqsad}</dd>
          <dt>{t('Mijoz')}</dt>
          <dd>
            {s.mijozIsmi} · {s.mijozJinsi === 'erkak' ? t('Erkak') : t('Ayol')}
          </dd>
          {s.etirozlar.length > 0 && (
            <>
              <dt>{t('Mijoz aytishi mumkin')}</dt>
              <dd>
                <ul className="sim-etirozlar">
                  {s.etirozlar.map((e) => (
                    <li key={e}>«{e}»</li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          {s.mijozHaqida && (
            <>
              <dt>
                {t('Mijoz xulqi')} <span className="sim-yashirin">{t("menejerlarga ko'rinmaydi")}</span>
              </dt>
              <dd>{s.mijozHaqida}</dd>
            </>
          )}
        </dl>
        {xato && (
          <div className="xato-banner" role="alert">
            {xato}
          </div>
        )}
      </div>
    </Oyna>
  );
}

// ─── Yangi / tahrirlash ─────────────────────────────────────────────────────

function Segment<T extends string | number>({
  nom,
  qiymat,
  variantlar,
  onChange,
}: {
  nom: string;
  qiymat: T;
  variantlar: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="sim-segment" role="radiogroup" aria-label={nom}>
      {variantlar.map(([v, yorliq]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={qiymat === v} className={qiymat === v ? 'faol' : ''} onClick={() => onChange(v)}>
          {yorliq}
        </button>
      ))}
    </div>
  );
}

function SsenariyOyna({
  base,
  s,
  onYop,
  onSaqlandi,
}: {
  base: string;
  s: Ssenariy | null;
  onYop: () => void;
  onSaqlandi: () => Promise<void>;
}) {
  const t = useT();
  const [f, setF] = useState({
    nom: s?.nom ?? '',
    vaziyat: s?.vaziyat ?? '',
    maqsad: s?.maqsad ?? '',
    mijozIsmi: s?.mijozIsmi ?? '',
    mijozHaqida: s?.mijozHaqida ?? '',
    etirozlar: (s?.etirozlar ?? []).join('\n'),
  });
  const [jins, setJins] = useState<Jins>(s?.mijozJinsi ?? 'ayol');
  const [kayfiyat, setKayfiyat] = useState<Kayfiyat>(s?.kayfiyat ?? 'ortacha');
  const [daq, setDaq] = useState<number>(s?.davomiylikDaq ?? 5);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');

  const tayyor = f.nom.trim().length >= 2 && f.vaziyat.trim().length >= 2 && f.maqsad.trim().length >= 2 && f.mijozIsmi.trim().length >= 1;

  async function saqla() {
    if (!tayyor || band) return;
    setBand(true);
    setXato('');
    const tana = {
      nom: f.nom.trim(),
      vaziyat: f.vaziyat.trim(),
      maqsad: f.maqsad.trim(),
      mijozIsmi: f.mijozIsmi.trim(),
      mijozJinsi: jins,
      mijozHaqida: f.mijozHaqida.trim(),
      etirozlar: f.etirozlar
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 10),
      kayfiyat,
      davomiylikDaq: daq,
    };
    try {
      if (s) await api.patch(`${base}/simulyator/ssenariylar/${s.id}`, tana);
      else await api.post(`${base}/simulyator/ssenariylar`, tana);
      await onSaqlandi();
    } catch (e) {
      setXato(e instanceof ApiError ? tarjima(e.message) : t("Saqlab bo'lmadi"));
      setBand(false);
    }
  }

  const maydon = (kalit: keyof typeof f, nom: string, opts: { uzun?: boolean; max: number; placeholder?: string; majburiy?: boolean; izoh?: string }) => (
    <div className="maydon-blok">
      <label htmlFor={`sim-${kalit}`}>
        {t(nom)} {opts.majburiy && <span className="ci-majburiy">*</span>}
      </label>
      {opts.uzun ? (
        <textarea
          id={`sim-${kalit}`}
          className="input"
          rows={3}
          value={f[kalit]}
          maxLength={opts.max}
          placeholder={opts.placeholder ? t(opts.placeholder) : undefined}
          onChange={(e) => setF({ ...f, [kalit]: e.target.value })}
        />
      ) : (
        <input
          id={`sim-${kalit}`}
          className="input"
          value={f[kalit]}
          maxLength={opts.max}
          placeholder={opts.placeholder ? t(opts.placeholder) : undefined}
          onChange={(e) => setF({ ...f, [kalit]: e.target.value })}
        />
      )}
      {opts.izoh && <div className="yordam">{t(opts.izoh)}</div>}
    </div>
  );

  return (
    <Oyna
      keng
      sarlavha={s ? t('Ssenariyni tahrirlash') : t('Yangi ssenariy')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={!tayyor || band}>
            {band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </>
      }
    >
      <div className="sim-forma">
        {maydon('nom', 'Ssenariy nomi', { max: 120, majburiy: true, placeholder: "Masalan: Narxga arzishini ko'rsating", izoh: 'Kartada sarlavha bo\'lib chiqadi — menejer erishishi kerak bo\'lgan natija.' })}
        {maydon('vaziyat', 'Vaziyat', { max: 400, majburiy: true, placeholder: 'Masalan: Dilnoza uyi yaqinida arzonroq taklif topgan.', izoh: 'Kartada ko\'rinadi — menejer qo\'ng\'iroqdan oldin biladigan narsa.' })}
        {maydon('maqsad', "Qo'ng'iroq maqsadi", { uzun: true, max: 400, majburiy: true, placeholder: "Masalan: Taklifingiz mijoz uchun nega qimmatliroq ekanini ko'rsatish.", izoh: 'Natijada «maqsadga erishildimi» shunga qarab baholanadi.' })}

        <div className="vr-oyna-ikki">
          {maydon('mijozIsmi', 'Mijoz ismi', { max: 40, majburiy: true, placeholder: 'Masalan: Dilnoza' })}
          <div className="maydon-blok">
            <span className="sim-yorliq">{t('Mijoz jinsi')}</span>
            <Segment nom={t('Mijoz jinsi')} qiymat={jins} onChange={setJins} variantlar={[['ayol', t('Ayol')], ['erkak', t('Erkak')]]} />
          </div>
        </div>

        <div className="vr-oyna-ikki">
          <div className="maydon-blok">
            <span className="sim-yorliq">{t('Mijoz kayfiyati')}</span>
            <Segment
              nom={t('Mijoz kayfiyati')}
              qiymat={kayfiyat}
              onChange={setKayfiyat}
              variantlar={(['yumshoq', 'ortacha', 'qattiq'] as Kayfiyat[]).map((k) => [k, t(KAYFIYAT_NOMI[k])])}
            />
          </div>
          <div className="maydon-blok">
            <span className="sim-yorliq">{t('Davomiylik')}</span>
            <Segment nom={t('Davomiylik')} qiymat={daq} onChange={setDaq} variantlar={[3, 5, 7, 10].map((n) => [n, t('{n} daq', { n })])} />
          </div>
        </div>

        {maydon('mijozHaqida', 'Mijoz xulqi (AI uchun)', {
          uzun: true,
          max: 2000,
          placeholder: "Masalan: Narx bo'yicha shubhasi bor, lekin buni o'zi aytmaydi. Bosim o'tkazilsa yopilib qoladi; ochiq savol berilsa — haqiqiy sababni aytadi.",
          izoh: "AI mijoz o'zini shunday tutadi. Menejerlarga ko'rinmaydi.",
        })}
        {maydon('etirozlar', "E'tirozlar", {
          uzun: true,
          max: 2000,
          placeholder: "Har birini yangi qatordan:\nQimmat ekan\nO'ylab ko'raman",
          izoh: "Har qatorda bitta e'tiroz — mijoz suhbatda shulardan foydalanadi.",
        })}

        {xato && (
          <div className="xato-banner" role="alert">
            {xato}
          </div>
        )}
      </div>
    </Oyna>
  );
}

// ─── Boshlashdan oldin ──────────────────────────────────────────────────────

function BoshlashOyna({
  base,
  s,
  aiBor,
  ovozBor,
  onYop,
  onBoshlandi,
}: {
  base: string;
  s: Ssenariy;
  aiBor: boolean;
  ovozBor: boolean;
  onYop: () => void;
  onBoshlandi: (m: Mashq) => void;
}) {
  const t = useT();
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const jami = s.davomiylikDaq * 60;
  const yakunFoiz = ((jami - YAKUN_SEK) / jami) * 100;

  async function boshla() {
    if (!aiBor || band) return;
    setBand(true);
    setXato('');
    try {
      const m = await api.post<Mashq>(`${base}/simulyator/mashqlar`, { ssenariy: s.id });
      onBoshlandi(m);
    } catch (e) {
      setXato(e instanceof ApiError ? tarjima(e.message) : t("Qo'ng'iroqni boshlab bo'lmadi"));
      setBand(false);
    }
  }

  return (
    <Oyna
      sarlavha={t('Boshlashdan oldin')}
      onYop={onYop}
      onSubmit={() => void boshla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Hozir emas')}
          </button>
          <button type="submit" className="btn" disabled={!aiBor || band}>
            <PhoneCall size={16} /> {band ? t('Ulanmoqda…') : t("Qo'ng'iroqni boshlash · {n} daqiqa", { n: s.davomiylikDaq })}
          </button>
        </>
      }
    >
      <div className="sim-oldin">
        <div className="sim-oldin-ssenariy">
          <span className="sim-avatar kichik" aria-hidden="true">
            {s.mijozIsmi.charAt(0).toUpperCase()}
          </span>
          <div>
            <b>{s.nom}</b>
            <p>{s.vaziyat}</p>
          </div>
        </div>

        <dl className="sim-oldin-jadval">
          <div>
            <dt>{t('Maqsad')}</dt>
            <dd>{s.maqsad}</dd>
          </div>
          <div>
            <dt>{t('Mijoz kayfiyati')}</dt>
            <dd>
              <span className={`sim-kayfiyat ${s.kayfiyat}`}>{t(KAYFIYAT_NOMI[s.kayfiyat])}</span>
            </dd>
          </div>
        </dl>

        <div className="sim-vaqt-chizig">
          <div className="sim-vaqt-sarlavha">
            <b>{t('{n} daqiqa, pauzasiz', { n: s.davomiylikDaq })}</b>
            <span>{t('Vaqt tugaganda qo\'ng\'iroq o\'zi yakunlanadi')}</span>
          </div>
          <div className="sim-chiziq" aria-hidden="true">
            <div className="sim-chiziq-yakun" style={{ left: `${yakunFoiz}%` }} />
          </div>
          <div className="sim-chiziq-yorliq">
            <span>0:00</span>
            <span style={{ left: `${yakunFoiz}%` }} className="sim-chiziq-belgi">
              {t('{v} — mijoz yakunlay boshlaydi', { v: mmss(jami - YAKUN_SEK) })}
            </span>
            <span>{mmss(jami)}</span>
          </div>
        </div>

        {ovozBor ? (
          <MikrofonTekshiruv />
        ) : (
          <div className="sim-rejim">
            <Mic size={18} aria-hidden="true" />
            <div>
              <b>{t('Yozma rejim')}</b>
              <p>{t("Ovozli rejim AI ovoz provayderi ulangach yoqiladi. Hozircha mijoz bilan yozib gaplashasiz — u xuddi telefondagidek javob beradi.")}</p>
            </div>
          </div>
        )}

        {!aiBor && (
          <div className="xato-banner" role="alert">
            {t('AI provayder ulanmagan — administrator ulagach mashq qilish mumkin')}
          </div>
        )}
        {xato && (
          <div className="xato-banner" role="alert">
            {xato}
          </div>
        )}
      </div>
    </Oyna>
  );
}

/** Mikrofon tekshiruvi: qurilma tanlash va jonli ovoz darajasi (ovozli rejim uchun). */
function MikrofonTekshiruv() {
  const t = useT();
  const [qurilmalar, setQurilmalar] = useState<MediaDeviceInfo[]>([]);
  const [tanlangan, setTanlangan] = useState('');
  const [daraja, setDaraja] = useState(0);
  const [holat, setHolat] = useState<'kutish' | 'ishlayapti' | 'rad' | 'yoq'>('kutish');
  const oqim = useRef<MediaStream | null>(null);
  const kadr = useRef(0);
  const kontekst = useRef<AudioContext | null>(null);

  const toxta = useCallback(() => {
    cancelAnimationFrame(kadr.current);
    oqim.current?.getTracks().forEach((tr) => tr.stop());
    oqim.current = null;
    void kontekst.current?.close();
    kontekst.current = null;
  }, []);

  const tekshir = useCallback(
    async (deviceId?: string) => {
      toxta();
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
        oqim.current = s;
        const royxat = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        setQurilmalar(royxat);
        setTanlangan(deviceId ?? s.getAudioTracks()[0]?.getSettings().deviceId ?? '');
        const ctx = new AudioContext();
        kontekst.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tsikl = () => {
          an.getByteTimeDomainData(buf);
          let yig = 0;
          for (const v of buf) yig += ((v - 128) / 128) ** 2;
          setDaraja(Math.min(1, Math.sqrt(yig / buf.length) * 4));
          kadr.current = requestAnimationFrame(tsikl);
        };
        tsikl();
        setHolat('ishlayapti');
      } catch (e) {
        setHolat(e instanceof DOMException && e.name === 'NotAllowedError' ? 'rad' : 'yoq');
      }
    },
    [toxta],
  );

  useEffect(() => toxta, [toxta]);

  return (
    <div className="sim-mikrofon">
      <div className="sim-mikrofon-bosh">
        <Mic size={18} aria-hidden="true" />
        <b>{t('Mikrofon tekshiruvi')}</b>
      </div>
      {holat === 'kutish' ? (
        <button type="button" className="btn ikkinchi kichik" onClick={() => void tekshir()}>
          {t('Mikrofonni tekshirish')}
        </button>
      ) : holat === 'ishlayapti' ? (
        <>
          <div className="sim-daraja" role="meter" aria-label={t('Ovoz darajasi')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(daraja * 100)}>
            <div style={{ width: `${Math.round(daraja * 100)}%` }} />
          </div>
          <p className="yordam">{t("Gapirib ko'ring — chiziq harakatlansa, mikrofon ishlayapti.")}</p>
          {qurilmalar.length > 1 && (
            <select className="input" value={tanlangan} onChange={(e) => void tekshir(e.target.value)} aria-label={t('Mikrofon')}>
              {qurilmalar.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || t('Mikrofon {n}', { n: i + 1 })}
                </option>
              ))}
            </select>
          )}
        </>
      ) : (
        <p className="sim-mikrofon-xato">
          {holat === 'rad'
            ? t("Mikrofonga ruxsat berilmadi. Brauzer manzil satridagi qulf belgisidan ruxsat bering.")
            : t('Mikrofon topilmadi.')}
        </p>
      )}
    </div>
  );
}
