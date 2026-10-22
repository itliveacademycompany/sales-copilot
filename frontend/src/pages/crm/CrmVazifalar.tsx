import { CalendarClock, CheckCircle2, Circle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, fmtSana } from '../../api';
import { muddatHolati, useCrm } from '../../crm/malumot';
import { useT } from '../../i18n';

interface VazifaQator {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  seatName: string | null;
  dealId: string;
  dealName: string;
  stageName: string;
  stageColor: string;
}

const HAJM = 50;

/**
 * Bitimlarga biriktirilgan vazifalar. Muddati o'tgani tepada qizil —
 * menejer kunni shu ro'yxatdan boshlaydi.
 */
export function CrmVazifalar() {
  const { base } = useCrm();
  const t = useT();
  const [holat, setHolat] = useState<'open' | 'done'>('open');
  const [sahifa, setSahifa] = useState(0);
  const [data, setData] = useState<{ total: number; items: VazifaQator[] } | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    try {
      setData(await api.get(`${base}/crm-app/tasks?status=${holat}&limit=${HAJM}&offset=${sahifa * HAJM}`));
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, holat, sahifa, t]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  const almashtir = async (v: VazifaQator) => {
    try {
      await api.patch(`${base}/tasks/${v.id}`, { status: holat === 'open' ? 'done' : 'pending' });
      await yukla();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  const sahifalar = data ? Math.max(1, Math.ceil(data.total / HAJM)) : 1;

  return (
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <h1>{t('Vazifalar')}</h1>
        <div className="tab-qator" role="tablist" aria-label={t('Holat')}>
          {(
            [
              ['open', 'Ochiq'],
              ['done', 'Bajarilgan'],
            ] as const
          ).map(([k, nom]) => (
            <button
              key={k}
              role="tab"
              aria-selected={holat === k}
              className={`tab${holat === k ? ' active' : ''}`}
              onClick={() => {
                setHolat(k);
                setSahifa(0);
                setData(null);
              }}
            >
              {t(nom)}
            </button>
          ))}
        </div>
      </div>

      <div className="card ci-jadval-karta">
        {xato && <div className="xato-qator">{xato}</div>}
        {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
        {data && data.items.length === 0 && (
          <div className="ci-bosh-holat">{holat === 'open' ? t("Ochiq vazifa yo'q") : t("Bajarilgan vazifa yo'q")}</div>
        )}
        {data && data.items.length > 0 && (
          <ul className="ci-vazifalar keng">
            {data.items.map((v) => {
              const m = holat === 'open' ? muddatHolati(v.dueAt) : null;
              return (
                <li key={v.id} className={holat === 'done' ? 'yopiq' : ''}>
                  <button
                    className="ci-vazifa-belgi"
                    onClick={() => void almashtir(v)}
                    aria-label={holat === 'open' ? t('Bajarildi deb belgilash') : t('Qayta ochish')}
                    aria-pressed={holat === 'done'}
                  >
                    {holat === 'open' ? <Circle /> : <CheckCircle2 />}
                  </button>
                  <div className="ci-vazifa-matn">
                    <b>{v.title}</b>
                    {v.description && <span>{v.description}</span>}
                    <small>
                      <Link to={`/crm/bitimlar/${v.dealId}`} className="ci-havola">
                        {v.dealName}
                      </Link>
                      <span className="ci-bosqich-belgi" style={{ ['--bosqich' as string]: v.stageColor }}>
                        {v.stageName}
                      </span>
                      {v.seatName && <span>{v.seatName}</span>}
                    </small>
                  </div>
                  <span className={`ci-vazifa-muddat ${m === 'otgan' ? 'xavf' : m === 'bugun' ? 'ogoh' : ''}`}>
                    <CalendarClock aria-hidden="true" />
                    {holat === 'done' ? fmtSana(v.completedAt) : v.dueAt ? fmtSana(v.dueAt) : t('Muddatsiz')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {data && sahifalar > 1 && (
          <div className="ci-sahifalash">
            <button className="btn ikkinchi kichik" disabled={sahifa === 0} onClick={() => setSahifa((s) => s - 1)}>
              {t('Oldingi')}
            </button>
            <span>
              {sahifa + 1} / {sahifalar}
            </span>
            <button className="btn ikkinchi kichik" disabled={sahifa + 1 >= sahifalar} onClick={() => setSahifa((s) => s + 1)}>
              {t('Keyingi')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
