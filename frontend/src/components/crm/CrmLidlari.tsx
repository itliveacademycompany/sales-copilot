import { ExternalLink, PhoneCall, RefreshCw, Search, Sparkles, Workflow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtPul, fmtSana } from '../../api';
import { useAuth } from '../../auth';
import { useT } from '../../i18n';
import './crmLidlari.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM LIDLARI — ulangan CRM dagi sdelkalar (Lid xulosalari → "CRM lidlari")
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ma'lumot `GET /crm-leads` dan: CRM dan har daqiqada import qilinadi.
 * Har lid yonida SotuvAI tomoni — shu mijoz bilan qo'ng'iroqlar soni va
 * oxirgi tahlil bahosi (telefon bo'yicha bog'langan). Sotuvchi faqat o'z
 * lidlarini ko'radi — cheklov serverda.
 */

type BosqichTuri = 'ochiq' | 'muvaffaqiyat' | 'yopilgan';

interface Lid {
  id: string;
  crmId: string;
  name: string | null;
  pipelineId: string | null;
  pipelineName: string | null;
  stageId: string | null;
  stageName: string | null;
  stageType: BosqichTuri;
  amount: number | null;
  responsibleName: string | null;
  seatId: string | null;
  seatName: string | null;
  contactId: string | null;
  contactName: string | null;
  phone: string | null;
  url: string | null;
  crmUpdatedAt: string;
  closedAt: string | null;
  calls: { count: number; lastAt: string | null };
  lastAnalysis: { conversationId: string; score: number | null; quality: string | null } | null;
}

interface Javob {
  crm: { kind: string; name: string; status: string } | null;
  sync: { birinchiTugadi: boolean; oxirgi: string | null; xato: string | null } | null;
  total: number;
  items: Lid[];
  facets: { pipelines: { id: string; name: string; count: number; stages: { id: string; name: string; type: BosqichTuri; count: number }[] }[] };
}

const SAHIFA = 50;

const HOLATLAR: { key: BosqichTuri | ''; nom: string }[] = [
  { key: '', nom: 'Hammasi' },
  { key: 'ochiq', nom: 'Jarayonda' },
  { key: 'muvaffaqiyat', nom: 'Sotildi' },
  { key: 'yopilgan', nom: 'Yopilgan' },
];

/** AI xulosalari ↔ CRM lidlari almashtirgichi (sahifa sarlavhasida). */
export function LidKorinishi({ crm, onChange }: { crm: boolean; onChange: (crm: boolean) => void }) {
  const t = useT();
  return (
    <div className="tab-qator crml-korinish" role="tablist" aria-label={t("Lidlar ko'rinishi")}>
      <button type="button" role="tab" aria-selected={!crm} className={`tab${crm ? '' : ' active'}`} onClick={() => onChange(false)}>
        <Sparkles aria-hidden="true" /> {t('AI xulosalari')}
      </button>
      <button type="button" role="tab" aria-selected={crm} className={`tab${crm ? ' active' : ''}`} onClick={() => onChange(true)}>
        <Workflow aria-hidden="true" /> {t('CRM lidlari')}
      </button>
    </div>
  );
}

export function CrmLidlari({ almash }: { almash: ReactNode }) {
  const t = useT();
  const { business } = useAuth();
  const rahbar = business?.permissions.includes('analytics:read:all') ?? false;
  const crmBoshqaradi = business?.permissions.includes('integration:manage') ?? false;

  const [q, setQ] = useState('');
  const [qKechikkan, setQKechikkan] = useState('');
  const [voronka, setVoronka] = useState('');
  const [bosqich, setBosqich] = useState('');
  const [holat, setHolat] = useState<BosqichTuri | ''>('');
  const [d, setD] = useState<Javob | null>(null);
  const [items, setItems] = useState<Lid[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [xato, setXato] = useState<string | null>(null);

  // Qidiruv — har harfda emas, yozish to'xtagach
  useEffect(() => {
    const tm = setTimeout(() => setQKechikkan(q.trim()), 350);
    return () => clearTimeout(tm);
  }, [q]);

  const sorov = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({ limit: String(SAHIFA), offset: String(offset) });
      if (qKechikkan) p.set('q', qKechikkan);
      if (voronka) p.set('pipeline', voronka);
      if (bosqich) p.set('stage', bosqich);
      if (holat) p.set('type', holat);
      return api.get<Javob>(`/api/v1/businesses/${business?.businessId}/crm-leads?${p.toString()}`);
    },
    [business?.businessId, qKechikkan, voronka, bosqich, holat],
  );

  useEffect(() => {
    let tirik = true;
    setYuklanmoqda(true);
    setXato(null);
    sorov(0)
      .then((r) => {
        if (!tirik) return;
        setD(r);
        setItems(r.items);
      })
      .catch((e: unknown) => {
        if (tirik) setXato(e instanceof ApiError ? t(e.message) : t("Lidlarni yuklab bo'lmadi"));
      })
      .finally(() => {
        if (tirik) setYuklanmoqda(false);
      });
    return () => {
      tirik = false;
    };
  }, [sorov, t]);

  const koproq = () => {
    setYuklanmoqda(true);
    sorov(items.length)
      .then((r) => setItems((eski) => [...eski, ...r.items]))
      .catch(() => undefined)
      .finally(() => setYuklanmoqda(false));
  };

  const tanlanganVoronka = useMemo(() => d?.facets.pipelines.find((p) => p.id === voronka) ?? null, [d, voronka]);
  const jami = d?.facets.pipelines.reduce((n, p) => n + p.count, 0) ?? 0;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>{t('Lid xulosalari')}</h1>
          <div className="izoh">
            {d?.crm
              ? t('{crm} dagi sdelkalar — har daqiqada yangilanadi', { crm: d.crm.name })
              : t('Ulangan CRM dagi sdelkalar')}
          </div>
          {almash}
        </div>
      </div>

      {xato && <div className="card xato-qator">{xato}</div>}

      {/* CRM ulanmagan */}
      {d && !d.crm && (
        <div className="card crml-bosh-holat">
          <span className="crml-bosh-ikon" aria-hidden="true">
            <Workflow />
          </span>
          <b>{t('CRM ulanmagan')}</b>
          <span>{t('CRM ni ulang — sdelkalar shu yerga avtomatik tushadi va har qo‘ng‘iroq o‘z lidiga bog‘lanadi.')}</span>
          {crmBoshqaradi ? (
            <Link to="/crm" className="btn">
              {t('CRM ni ulash')}
            </Link>
          ) : (
            <span className="yordam">{t("Rahbaringizdan CRM ni ulashni so'rang.")}</span>
          )}
        </div>
      )}

      {d?.crm && (
        <>
          {/* Import holati */}
          {d.sync && !d.sync.birinchiTugadi && (
            <div className="crml-ogoh info" role="status">
              <RefreshCw aria-hidden="true" className="aylan" />
              <span>{t("Lidlar {crm} dan import qilinmoqda — hozircha {n} ta. Birinchi import bir necha daqiqa olishi mumkin.", { crm: d.crm.name, n: jami })}</span>
            </div>
          )}
          {d.sync?.xato && (
            <div className="crml-ogoh xato" role="alert">
              <span>
                {t('Oxirgi importda xato: {xato}', { xato: t(d.sync.xato) })}{' '}
                {crmBoshqaradi && <Link to="/crm">{t('CRM sozlamalari')}</Link>}
              </span>
            </div>
          )}

          {/* Filtrlar */}
          <div className="crml-filtrlar">
            <label className="crml-qidiruv">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={q}
                placeholder={t('Ism, sdelka yoki telefon')}
                aria-label={t('Lidlarni qidirish')}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <select
              value={voronka}
              aria-label={t('Voronka')}
              onChange={(e) => {
                setVoronka(e.target.value);
                setBosqich('');
              }}
            >
              <option value="">{t('Barcha voronkalar')}</option>
              {d.facets.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.count}
                </option>
              ))}
            </select>
            <select value={bosqich} aria-label={t('Bosqich')} disabled={!tanlanganVoronka} onChange={(e) => setBosqich(e.target.value)}>
              <option value="">{tanlanganVoronka ? t('Barcha bosqichlar') : t('Avval voronkani tanlang')}</option>
              {tanlanganVoronka?.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.count}
                </option>
              ))}
            </select>
            <div className="tab-qator" role="group" aria-label={t('Holat')}>
              {HOLATLAR.map((h) => (
                <button key={h.key} type="button" className={`tab${holat === h.key ? ' active' : ''}`} aria-pressed={holat === h.key} onClick={() => setHolat(h.key)}>
                  {t(h.nom)}
                </button>
              ))}
            </div>
          </div>

          <div className="crml-soni">
            {t('{n} ta lid', { n: d.total })}
            {d.sync?.oxirgi && <span> · {t('yangilandi: {vaqt}', { vaqt: fmtSana(d.sync.oxirgi) })}</span>}
          </div>

          {/* Ro'yxat */}
          {items.length === 0 && !yuklanmoqda ? (
            <div className="card crml-bosh-holat">
              <b>{t('Lid topilmadi')}</b>
              <span>{qKechikkan || voronka || holat ? t("Filtrlarni o'zgartirib ko'ring.") : t("CRM dan hali lid kelmadi — import tugashini kuting.")}</span>
            </div>
          ) : (
            <div className="card crml-jadval-oramasi">
              <table className="crml-jadval">
                <thead>
                  <tr>
                    <th scope="col">{t('Lid')}</th>
                    <th scope="col">{t('Bosqich')}</th>
                    <th scope="col">{t('Summa')}</th>
                    {rahbar && <th scope="col">{t("Mas'ul")}</th>}
                    <th scope="col">{t('SotuvAI')}</th>
                    <th scope="col">{t('Yangilangan')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="crml-nom">
                          {l.url ? (
                            <a href={l.url} target="_blank" rel="noopener noreferrer" title={t('CRM da ochish')}>
                              {l.name || t('Nomsiz sdelka')} <ExternalLink aria-hidden="true" />
                            </a>
                          ) : (
                            l.name || t('Nomsiz sdelka')
                          )}
                        </div>
                        <div className="crml-kichik">
                          {[l.contactName, l.phone ? `+${l.phone}` : null].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td>
                        <span className={`crml-bosqich ${l.stageType}`}>{l.stageName ?? '—'}</span>
                        <div className="crml-kichik">{l.pipelineName}</div>
                      </td>
                      <td className="crml-summa">{l.amount ? fmtPul(l.amount) : '—'}</td>
                      {rahbar && (
                        <td>
                          {l.seatName ?? l.responsibleName ?? '—'}
                          {!l.seatId && l.responsibleName && <div className="crml-kichik" title={t("Menejer kartochkasida CRM ID kiritilmagan")}>{t("SotuvAI ga bog'lanmagan")}</div>}
                        </td>
                      )}
                      <td>
                        {l.calls.count > 0 ? (
                          <div className="crml-sotuvai">
                            {l.lastAnalysis && l.lastAnalysis.score !== null && (
                              <Link to={`/suhbatlar/${l.lastAnalysis.conversationId}`} className={`ball ${ballKlass(l.lastAnalysis.score)}`} title={t('Oxirgi tahlil')}>
                                {Math.round(l.lastAnalysis.score)}%
                              </Link>
                            )}
                            <span className="crml-kichik">
                              <PhoneCall aria-hidden="true" /> {t("{n} ta qo'ng'iroq", { n: l.calls.count })}
                            </span>
                          </div>
                        ) : (
                          <span className="crml-kichik">{t("Qo'ng'iroq yo'q")}</span>
                        )}
                      </td>
                      <td className="crml-kichik">{fmtSana(l.crmUpdatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {items.length < d.total && (
            <div className="crml-koproq">
              <button type="button" className="btn ikkinchi" disabled={yuklanmoqda} onClick={koproq}>
                {yuklanmoqda ? t('Yuklanmoqda…') : t("Yana ko'rsatish ({n})", { n: d.total - items.length })}
              </button>
            </div>
          )}
        </>
      )}

      {!d && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
    </>
  );
}
