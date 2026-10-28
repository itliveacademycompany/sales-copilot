import { ArrowDownWideNarrow, CalendarDays, ChevronRight, RefreshCw, Sparkles, TriangleAlert, User, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { pul, useCrm } from '../../crm/malumot';
import { MsBosh, MsSahifalash } from '../../crm/MsBosh';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { sanaVaqt } from './Bitimlar';

type Imkoniyat = 'high' | 'medium' | 'low';

interface YoqotilganLid {
  id: string;
  name: string;
  closedAt: string | null;
  seatId: string | null;
  seatName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  reason: string | null;
  lostStage: string | null;
  quality: string | null;
  summary: string | null;
  chance: Imkoniyat;
  score: number;
  recontactDays: string;
}

interface Menejer {
  id: string;
  name: string;
  won: number;
  lost: number;
}

interface Javob {
  total: number;
  counts: Record<Imkoniyat, number>;
  items: YoqotilganLid[];
  managers: Menejer[];
}

const IMKONIYAT: Record<Imkoniyat, { nom: string; klass: string }> = {
  high: { nom: 'Yuqori', klass: 'yashil' },
  medium: { nom: "O'rtacha", klass: 'sariq' },
  low: { nom: 'Past', klass: 'qizil' },
};

const DAVRLAR = [
  { kun: 7, nom: '7 kun' },
  { kun: 30, nom: '30 kun' },
  { kun: 90, nom: '90 kun' },
  { kun: 0, nom: 'Hammasi' },
];

const HAJM = 20;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID XULOSALARI (CRM) — yo'qotilgan lidlar AI tahlili (Metasell)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Lid tarixi va barcha qo'ng'iroqlar asosida AI tahlili": nega yo'qotildi,
 * qaysi bosqichda, qayta yutish imkoniyati va qachon qayta bog'lanish kerak.
 * Rahbar "Imkoniyat bo'yicha" saralab, umidli lidlarni belgilaydi va
 * "CRMda yaratish" bilan boshqa menejerga yangi lid qilib beradi.
 */
export function LidXulosalariCrm() {
  const { holat, base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [sort, setSort] = useState<'date' | 'chance'>('date');
  const [imkoniyat, setImkoniyat] = useState<Imkoniyat | ''>('');
  const [seat, setSeat] = useState('');
  const [sabab, setSabab] = useState('');
  const [davr, setDavr] = useState(30);
  const [sahifa, setSahifa] = useState(0);
  const [data, setData] = useState<Javob | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tanlangan, setTanlangan] = useState<Set<string>>(new Set());
  const [oyna, setOyna] = useState(false);
  const [yangilash, setYangilash] = useState(0);
  const [xabar, setXabar] = useState<string | null>(null);
  const rahbar = holat.canManageAll;

  const sorov = useMemo(() => {
    const p = new URLSearchParams({ sort, limit: String(HAJM), offset: String(sahifa * HAJM) });
    if (imkoniyat) p.set('chance', imkoniyat);
    if (seat) p.set('seat', seat);
    if (sabab) p.set('reason', sabab);
    if (davr) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (davr - 1));
      p.set('from', d.toISOString());
    }
    return p.toString();
  }, [sort, imkoniyat, seat, sabab, davr, sahifa]);

  useEffect(() => {
    let tirik = true;
    api
      .get<Javob>(`${base}/crm-app/lost-leads?${sorov}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [base, sorov, t, yangilash]);

  // Filtr o'zgarsa — birinchi sahifa va tanlov tozalanadi
  useEffect(() => {
    setSahifa(0);
    setTanlangan(new Set());
  }, [sort, imkoniyat, seat, sabab, davr]);

  const filtrBor = Boolean(imkoniyat || seat || sabab || davr !== 30 || sort !== 'date');
  const tozala = () => {
    setSort('date');
    setImkoniyat('');
    setSeat('');
    setSabab('');
    setDavr(30);
  };
  const sahifadagi = data?.items.map((x) => x.id) ?? [];
  const hammasi = sahifadagi.length > 0 && sahifadagi.every((id) => tanlangan.has(id));
  const tanlanganLidlar = data?.items.filter((x) => tanlangan.has(x.id)) ?? [];
  const sahifalar = data ? Math.max(1, Math.ceil(data.total / HAJM)) : 1;

  return (
    <div className="ci-sahifa">
      <MsBosh sarlavha={t('Lid xulosalari')} jami={data ? pul(data.total) : undefined}>
        {rahbar && tanlangan.size > 0 && (
          <button className="btn" onClick={() => setOyna(true)}>
            <RefreshCw /> {t('CRMda yaratish ({n})', { n: tanlangan.size })}
          </button>
        )}
      </MsBosh>

      <section className="card ms-lx">
        <p className="ms-lx-izoh">
          <Sparkles aria-hidden="true" /> {t("Lid tarixi va barcha qo'ng'iroqlar asosida AI tahlili")}
        </p>
        <div className="ms-lx-filtrlar">
          <div className="ms-segment" role="group" aria-label={t('Saralash')}>
            <button type="button" aria-pressed={sort === 'date'} onClick={() => setSort('date')}>
              <CalendarDays aria-hidden="true" /> {t("Sana bo'yicha")}
            </button>
            <button type="button" aria-pressed={sort === 'chance'} onClick={() => setSort('chance')}>
              <ArrowDownWideNarrow aria-hidden="true" /> {t("Imkoniyat bo'yicha")}
            </button>
          </div>
          <select className="ms-kichik-select" value={imkoniyat} onChange={(e) => setImkoniyat(e.target.value as Imkoniyat | '')} aria-label={t('Imkoniyat')}>
            <option value="">{t('Barcha imkoniyatlar')}</option>
            {(Object.keys(IMKONIYAT) as Imkoniyat[]).map((k) => (
              <option key={k} value={k}>
                {t(IMKONIYAT[k].nom)}
                {data ? ` (${data.counts[k]})` : ''}
              </option>
            ))}
          </select>
          <select className="ms-kichik-select" value={sabab} onChange={(e) => setSabab(e.target.value)} aria-label={t('Nega yo‘qotildi')}>
            <option value="">{t('Nega yo‘qotildi: hammasi')}</option>
            {holat.lossReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {t(r.name)}
              </option>
            ))}
          </select>
          {rahbar && data && data.managers.length > 0 && (
            <select className="ms-kichik-select" value={seat} onChange={(e) => setSeat(e.target.value)} aria-label={t('Menejer')}>
              <option value="">{t('Barcha menejerlar')}</option>
              {data.managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <select className="ms-kichik-select" value={davr} onChange={(e) => setDavr(Number(e.target.value))} aria-label={t('Davr')}>
            {DAVRLAR.map((d) => (
              <option key={d.kun} value={d.kun}>
                {t('Sana')}: {t(d.nom)}
              </option>
            ))}
          </select>
          {filtrBor && (
            <button type="button" className="ms-havola-tugma" onClick={tozala}>
              <X aria-hidden="true" /> {t('Filtrlarni tozalash')}
            </button>
          )}
        </div>

        {xabar && (
          <div className="ok-qator" role="status">
            {xabar}
          </div>
        )}
        {xato && <div className="xato-qator">{xato}</div>}
        {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
        {data && data.items.length === 0 && <div className="ci-bosh-holat">{t("Bu davrda yo'qotilgan lid yo'q")}</div>}
        {data && data.items.length > 0 && (
          <div className="ci-jadval-qobiq">
            <table className="jadval ms-jadval ms-lx-jadval">
              <thead>
                <tr>
                  {rahbar && (
                    <th className="ci-belgilash">
                      <input
                        type="checkbox"
                        checked={hammasi}
                        onChange={() =>
                          setTanlangan((s) => {
                            const n = new Set(s);
                            for (const id of sahifadagi) hammasi ? n.delete(id) : n.add(id);
                            return n;
                          })
                        }
                        aria-label={t('Sahifadagilarni tanlash')}
                      />
                    </th>
                  )}
                  <th>{t('Sana')}</th>
                  <th>{t('Menejer')}</th>
                  <th>{t('Lid')}</th>
                  <th>{t('Holat')}</th>
                  <th>{t('Nega yo‘qotildi')}</th>
                  <th>{t('Yo‘qotilgan bosqich')}</th>
                  <th>{t('Qayta yutish / qayta aloqa')}</th>
                  <th aria-label={t('Ochish')} />
                </tr>
              </thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.id} className={`bosiladigan${tanlangan.has(x.id) ? ' tanlangan' : ''}`} onClick={() => navigate(`/crm/bitimlar/${x.id}`)} title={x.summary ?? undefined}>
                    {rahbar && (
                      <td className="ci-belgilash" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={tanlangan.has(x.id)}
                          onChange={() =>
                            setTanlangan((s) => {
                              const n = new Set(s);
                              n.has(x.id) ? n.delete(x.id) : n.add(x.id);
                              return n;
                            })
                          }
                          aria-label={t('Tanlash')}
                        />
                      </td>
                    )}
                    <td className="ms-lx-sana">
                      <b>{sanaVaqt(x.closedAt).slice(-5)}</b>
                      <small>{sanaVaqt(x.closedAt).slice(0, 10)}</small>
                    </td>
                    <td>
                      <span className="ms-lx-menejer">
                        <span className="ms-avatar kichik">{(x.seatName ?? '?').slice(0, 2).toUpperCase()}</span>
                        {x.seatName ?? t('Biriktirilmagan')}
                      </span>
                    </td>
                    <td>
                      <b className="ms-lx-nom">{x.name}</b>
                      {(x.contactName || x.contactPhone) && <small className="ms-lx-kontakt">{x.contactName ?? x.contactPhone}</small>}
                    </td>
                    <td>
                      <span className="ms-holat-chip qizil">{t("Yo'qotilgan")}</span>
                    </td>
                    <td>{x.reason ? <span className="ms-lx-sabab"><TriangleAlert aria-hidden="true" /> {t(x.reason)}</span> : '—'}</td>
                    <td>{x.lostStage ? <span className="ms-lx-bosqich">{x.lostStage}</span> : '—'}</td>
                    <td>
                      <span className="ms-lx-imkoniyat">
                        <span className={`ms-holat-chip ${IMKONIYAT[x.chance].klass}`}>
                          <RefreshCw aria-hidden="true" /> {t(IMKONIYAT[x.chance].nom)}
                        </span>
                        <span className="ms-lx-kun">{t('{d} kun', { d: x.recontactDays })}</span>
                      </span>
                    </td>
                    <td className="ci-ong">
                      <ChevronRight className="ms-lx-strelka" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <MsSahifalash sahifa={sahifa} sahifalar={sahifalar} onSahifa={setSahifa} />}
      </section>

      {oyna && data && (
        <CrmdaYaratish
          lidlar={tanlanganLidlar}
          menejerlar={data.managers}
          onYop={() => setOyna(false)}
          onTayyor={(n) => {
            setOyna(false);
            setTanlangan(new Set());
            setXabar(t('{n} ta yangi lid yaratildi', { n }));
            setYangilash((x) => x + 1);
          }}
        />
      )}
    </div>
  );
}

/** "Qayta aloqa uchun yangi lidlar yaratish" oynasi. */
function CrmdaYaratish({
  lidlar,
  menejerlar,
  onYop,
  onTayyor,
}: {
  lidlar: YoqotilganLid[];
  menejerlar: Menejer[];
  onYop: () => void;
  onTayyor: (n: number) => void;
}) {
  const { holat, base } = useCrm();
  const t = useT();
  const asosiy = holat.pipelines.find((p) => p.isMain) ?? holat.pipelines[0]!;
  const [voronkaId, setVoronkaId] = useState(asosiy.id);
  const voronka = holat.pipelines.find((p) => p.id === voronkaId) ?? asosiy;
  const [stageId, setStageId] = useState(voronka.stages.find((s) => s.kind === 'open')?.id ?? '');
  const [seatId, setSeatId] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    setStageId(voronka.stages.find((s) => s.kind === 'open')?.id ?? '');
  }, [voronka]);

  const yarat = async () => {
    setBand(true);
    setXato(null);
    try {
      const r = await api.post<{ created: number }>(`${base}/crm-app/lost-leads/reactivate`, {
        dealIds: lidlar.map((x) => x.id),
        stageId,
        seatId: seatId || null,
      });
      onTayyor(r.created);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  const nomlar = lidlar.slice(0, 3).map((x) => x.contactName ?? x.name);
  return (
    <Oyna
      sarlavha={t('Qayta aloqa uchun yangi lidlar yaratish')}
      onYop={onYop}
      onSubmit={() => void yarat()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor qilish')}
          </button>
          <button type="submit" className="btn" disabled={band || !stageId}>
            {band ? t('Yaratilmoqda…') : t('CRMda yaratish ({n})', { n: lidlar.length })}
          </button>
        </>
      }
    >
      <p className="yordam">{t('{n} ta lid tanlandi', { n: lidlar.length })}</p>
      <div className="ms-lx-asl">
        <span>{t("Asl yo'qotilgan lidlar")}</span>
        <b>
          {nomlar.join(', ')}
          {lidlar.length > 3 ? ` +${lidlar.length - 3}` : ''}
        </b>
      </div>
      <div className="ms-lx-info">{t("Tanlangan menejer, voronka va bosqichda yangi lid yaratiladi; AI tahlili va tarix bog'lanadi. Asl yo'qotilgan lid o'zgarmaydi.")}</div>
      <div className="maydon-blok">
        <label htmlFor="cy-menejer">
          <User className="ci-label-ikon" aria-hidden="true" /> {t('Menejer')}
        </label>
        <select id="cy-menejer" className="input" value={seatId} onChange={(e) => setSeatId(e.target.value)}>
          <option value="">{t("Asl lidning mas'uli")}</option>
          {menejerlar.map((m, i) => (
            <option key={m.id} value={m.id}>
              #{i + 1} · {m.name} — {t('{w} yutilgan · {l} yo‘qotilgan', { w: m.won, l: m.lost })}
            </option>
          ))}
        </select>
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="cy-voronka">{t('Voronka')}</label>
          <select id="cy-voronka" className="input" value={voronkaId} onChange={(e) => setVoronkaId(e.target.value)}>
            {holat.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor="cy-bosqich">{t('Bosqich')}</label>
          <select id="cy-bosqich" className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {voronka.stages
              .filter((s) => s.kind === 'open')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}
