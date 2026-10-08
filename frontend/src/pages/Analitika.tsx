import { CalendarDays, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type AlertRow } from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';
import { useAnalitikaQoshimcha } from '../components/analitika/qoshimcha';
import {
  FaoliyatTahlili,
  JamoaMalakasi,
  LidAnalitikasi,
  MijozTahlili,
  SifatNazorati,
  UmumiyKorinish,
  VazifalarTahlili,
  type TabProps,
} from '../components/analitika/Tablar';
import { oraliqda, useBoshMalumot, type Davr } from '../components/bosh/malumot';
import { TepaPanel } from '../components/bosh/TepaPanel';
import { FiltrTugma, SanaTanlagich, kunBoshi, sanaMatn, type SanaTuri } from '../components/qongiroq/Filtrlar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANALITIKA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bir davr, yetti nuqtai nazar. Davr va tab URL'da (`?tab=lid&davr=hafta`) —
 * havolani ulashsa hamkasbi aynan shu ko'rinishni ochadi.
 *
 * Ma'lumot bosh sahifa bilan bir xil qatlamdan (`useBoshMalumot`) olinadi,
 * shuning uchun bir xil ko'rsatkich ikki sahifada ikki xil chiqmaydi.
 */

const TABLAR = [
  { kalit: 'umumiy', nom: 'Umumiy ko\'rinish', Komponent: UmumiyKorinish },
  { kalit: 'sifat', nom: 'Sifat nazorati', Komponent: SifatNazorati },
  { kalit: 'jamoa', nom: 'Jamoa malakasini oshirish', Komponent: JamoaMalakasi },
  { kalit: 'vazifa', nom: 'Vazifalar tahlili', Komponent: VazifalarTahlili },
  { kalit: 'mijoz', nom: 'Mijoz tahlili', Komponent: MijozTahlili },
  { kalit: 'faoliyat', nom: 'Faoliyat tahlili', Komponent: FaoliyatTahlili },
  { kalit: 'lid', nom: 'Lid analitikasi', Komponent: LidAnalitikasi },
] as const;

type Tayyor = 'bugun' | '3kun' | 'hafta' | 'oy';
const TAYYOR: { kalit: Tayyor; nom: string; kun: number }[] = [
  { kalit: 'bugun', nom: 'Bugun', kun: 0 },
  { kalit: '3kun', nom: '3 kun', kun: 3 },
  { kalit: 'hafta', nom: 'Hafta', kun: 7 },
  { kalit: 'oy', nom: 'Oy', kun: 30 },
];

const KUN = 86400_000;
const sanaInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Analitika() {
  const { business, user } = useAuth();
  const tr = useT();
  const [params, setParams] = useSearchParams();
  const [ogohSoni, setOgohSoni] = useState(0);

  const tab = TABLAR.find((t) => t.kalit === params.get('tab')) ?? TABLAR[0];
  const davrKalit = params.get('davr') ?? 'oy';

  const davr: Davr = useMemo(() => {
    const now = new Date();
    if (davrKalit === 'boshqa') {
      const f = params.get('from');
      const t = params.get('to');
      if (f && t) {
        const from = kunBoshi(new Date(f));
        const to = new Date(kunBoshi(new Date(t)).getTime() + KUN);
        if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()))
          return { turi: 'maxsus', from, to: to > now ? now : to };
      }
    }
    const tayyor = TAYYOR.find((x) => x.kalit === davrKalit) ?? TAYYOR[3]!;
    if (tayyor.kalit === 'bugun') return { turi: 'bugun', from: kunBoshi(now), to: now };
    return { turi: tayyor.kalit === 'hafta' ? 'hafta' : tayyor.kalit === 'oy' ? 'oy' : 'maxsus', from: new Date(now.getTime() - tayyor.kun * KUN), to: now };
    // Daqiqa sayin qayta hisoblanmasin — faqat tanlov o'zgarganda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [davrKalit, params.get('from'), params.get('to')]);

  const yangila = (o: Record<string, string | null>) =>
    setParams(
      (eski) => {
        const p = new URLSearchParams(eski);
        for (const [k, v] of Object.entries(o)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  const { data, loading, xato, qaytaYukla } = useBoshMalumot(business, davr);
  const joriyRows = useMemo(
    () => (data ? oraliqda(data.suhbatlar, davr.from, davr.to) : null),
    [data, davr],
  );
  const q = useAnalitikaQoshimcha(business, davr, joriyRows);

  useEffect(() => {
    if (!business?.permissions.includes('alert:read')) return;
    void api
      .get<{ alerts: AlertRow[]; unseenCount: number }>(`/api/v1/businesses/${business.businessId}/alerts?limit=1`)
      .then((r) => setOgohSoni(r.unseenCount))
      .catch(() => undefined);
  }, [business]);

  if (!business) return null;
  const Komponent = tab.Komponent as (p: TabProps) => JSX.Element;

  return (
    <div className="an-sahifa">
      <TepaPanel
        biznesNomi={business.name}
        foydalanuvchi={user?.displayName ?? ''}
        ogohSoni={ogohSoni}
        ogohKoradi={business.permissions.includes('alert:read')}
        suhbatlar={data?.suhbatlar ?? []}
      />

      <div className="an-bosh">
        <h1>{tr('Analitika')}</h1>
        <div className="an-davr">
          <div className="tab-qator" role="tablist" aria-label="Davr">
            {TAYYOR.map((t) => (
              <button
                key={t.kalit}
                role="tab"
                aria-selected={davrKalit === t.kalit}
                className={`tab${davrKalit === t.kalit ? ' active' : ''}`}
                onClick={() => yangila({ davr: t.kalit === 'oy' ? null : t.kalit, from: null, to: null })}
              >
                {tr(t.nom)}
              </button>
            ))}
          </div>
          <FiltrTugma ikon={<CalendarDays />} nom={tr('Boshqa')} qiymat={sanaMatn(davr.from, davr.to)} faol={davrKalit === 'boshqa'} ong>
            {(yop) => (
              <SanaTanlagich
                turi={(davrKalit === 'boshqa' ? 'maxsus' : '30kun') as SanaTuri}
                from={davr.from}
                to={davr.to}
                onTanla={(_t, f, tt) => {
                  yangila({ davr: 'boshqa', from: sanaInput(f), to: sanaInput(new Date(tt.getTime() - 1)) });
                  yop();
                }}
              />
            )}
          </FiltrTugma>
        </div>
      </div>

      <nav className="an-tablar" role="tablist" aria-label="Analitika bo'limlari">
        {TABLAR.map((t) => (
          <button
            key={t.kalit}
            role="tab"
            aria-selected={tab.kalit === t.kalit}
            className={`an-tab${tab.kalit === t.kalit ? ' faol' : ''}`}
            onClick={() => yangila({ tab: t.kalit === 'umumiy' ? null : t.kalit })}
          >
            {tr(t.nom)}
          </button>
        ))}
      </nav>

      {xato ? (
        <div className="card hech-narsa">
          <div className="katta-ikon">
            <RefreshCw />
          </div>
          {xato}
        </div>
      ) : !data ? (
        <div className="an-bolim" aria-busy="true">
          <div className="card skelet" style={{ height: 300 }} />
          <div className="card skelet" style={{ height: 180 }} />
        </div>
      ) : (
        <div className={loading ? 'an-yangilanmoqda' : ''} aria-busy={loading}>
          <Komponent data={data} davr={davr} q={q} qaytaYukla={qaytaYukla} yuklanmoqda={loading} />
        </div>
      )}
    </div>
  );
}
