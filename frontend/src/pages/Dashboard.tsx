import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Muammolar, Ogohlar, SonggiTahlillar } from '../components/bosh/Bolimlar';
import { Issiqlik } from '../components/bosh/Issiqlik';
import { BiznesPulsi, SifatKorinishi } from '../components/bosh/Korsatkichlar';
import { davrYasash, useBoshMalumot, type Davr, type DavrTuri } from '../components/bosh/malumot';
import { Reyting } from '../components/bosh/Reyting';
import { DavrPanel, TepaPanel } from '../components/bosh/TepaPanel';

/**
 * Rahbar bosh sahifasi — "30 soniyada holatni tushunish" (TZ 8.1 #1).
 *
 * Tartib ataylab: avval biznes holati (puls), keyin sifat, keyin kim va
 * qachon (issiqlik xaritasi), keyin harakat talab qiladigan narsa
 * (ogohlantirishlar), keyin odamlar (reyting), keyin qayerda yo'qotilmoqda
 * (muammolar), oxirida real suhbatlar.
 *
 * Har bo'lim alohida komponent (`components/bosh/`), ma'lumot bir joyda
 * yuklanadi (`useBoshMalumot`) — bo'limlar bir-biridan mustaqil.
 */

const DAVR_KALIT = 'sotuvai-bosh-davr';

function boshlangichDavr(): Davr {
  try {
    const t = localStorage.getItem(DAVR_KALIT) as DavrTuri | null;
    if (t === 'bugun' || t === 'hafta' || t === 'oy') return davrYasash(t);
  } catch {
    /* xotira yopiq — standart davr */
  }
  return davrYasash('oy');
}

export function Dashboard() {
  const { business, user } = useAuth();
  const navigate = useNavigate();
  const [davr, setDavr] = useState<Davr>(boshlangichDavr);
  const { data, loading, xato } = useBoshMalumot(business, davr);

  if (!business) return null;

  const tanla = (t: Exclude<DavrTuri, 'maxsus'>) => {
    setDavr(davrYasash(t));
    try {
      localStorage.setItem(DAVR_KALIT, t);
    } catch {
      /* e'tiborsiz */
    }
  };

  return (
    <div className="bosh-sahifa">
      <TepaPanel
        biznesNomi={business.name}
        foydalanuvchi={user?.displayName ?? ''}
        ogohSoni={data?.ogohSoni ?? 0}
        ogohKoradi={business.permissions.includes('alert:read')}
        suhbatlar={data?.suhbatlar ?? []}
      />

      <DavrPanel
        biznesNomi={business.name}
        davr={davr}
        onTanla={tanla}
        onMaxsus={(from, to) => setDavr(davrYasash('maxsus', { from, to }))}
        onSozlama={() => navigate('/sozlamalar')}
      />

      {xato ? (
        <div className="card hech-narsa">
          <div className="katta-ikon">
            <RefreshCw />
          </div>
          {xato}
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setDavr({ ...davr })}>
              Qayta urinish
            </button>
          </div>
        </div>
      ) : !data ? (
        <BoshSkelet />
      ) : (
        <div className={`bosh-bolimlar${loading ? ' yangilanmoqda' : ''}`} aria-busy={loading}>
          <BiznesPulsi data={data} davr={davr} />
          <SifatKorinishi data={data} davr={davr} />
          <Issiqlik data={data} davr={davr} />
          <Ogohlar data={data} />
          <Reyting data={data} davr={davr} />
          <Muammolar data={data} />
          <SonggiTahlillar data={data} />
        </div>
      )}
    </div>
  );
}

/** Birinchi yuklanishda bo'limlar shakli — sahifa "sakramasin". */
function BoshSkelet() {
  return (
    <div className="bosh-bolimlar" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="card skelet" style={{ height: 300 }} />
      <div className="card skelet" style={{ height: 200 }} />
      <div className="card skelet" style={{ height: 240 }} />
    </div>
  );
}
