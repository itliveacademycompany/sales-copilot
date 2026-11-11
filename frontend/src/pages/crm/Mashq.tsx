import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import {
  createTrainingApi,
  errorText,
  NatijaPage,
  ScenarioBuilderPage,
  SessionPage,
  TarixPage,
  type ApiRequestInit,
  type SellerProfile,
  type StartSessionResponse,
} from '../../features/mashq';
import '../../features/mashq/styles.css';
import '../../features/mashq/deal-mind.css';
import { Bosh } from './simulyator/Bosh';
import { type BoshlashTanlovi, BoshlashOyna } from './simulyator/BoshlashOyna';
import { Qongiroq } from './simulyator/Qongiroq';
import { Xulosa } from './simulyator/Xulosa';
import { iziniOqi, type MashqKarta, profilniSaqla, type QongiroqIzi } from './simulyator/yordamchi';
import './simulyator/simulyator.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM → SIMULYATOR: AI mijoz bilan mashq qo'ng'irog'i
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Oqim: Bosh (mashq kartalari) → "Boshlashdan oldin" (mikrofon, kayfiyat,
 * vaqt) → Qo'ng'iroq (qo'lsiz suhbat, jonli matn) → Xulosa (AI tahlili,
 * keyingi safar maslahati) → To'liq tahlil (modulning batafsil sahifasi).
 *
 * Server bilan aloqa — Mijoz-AI modulining `TrainingApi` si (cookie sessiya).
 * Tarix, batafsil tahlil va ssenariy yaratish modulning sahifalari (`mq-*`).
 * Ovoz yoqilmagan bo'lsa (`ovoz-holati`) — matn bilan yozishib mashq qilinadi.
 */

async function sorov<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const raw = init.rawBody;
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(raw !== undefined ? { 'content-type': init.contentType ?? 'application/octet-stream' } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(raw !== undefined ? { body: raw } : {}),
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    ...(init.signal ? { signal: init.signal } : {}),
  });

  if (!response.ok) {
    const matn = await response.text().catch(() => '');
    let body: unknown = null;
    let tafsilot = matn;
    try {
      body = JSON.parse(matn);
      const b = body as { error?: string; message?: string; title?: string };
      tafsilot = b.message ? `${b.error ?? 'xato'}: ${b.message}` : (b.title ?? matn);
    } catch {
      /* JSON emas — matnning o'zi */
    }
    throw Object.assign(new Error(`${response.status} ${tafsilot.slice(0, 400)}`), { status: response.status, body });
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text.length > 0 ? JSON.parse(text) : undefined) as T;
}

type Korinish =
  | { nom: 'bosh' }
  | { nom: 'qongiroq'; karta: MashqKarta; tanlov: BoshlashTanlovi; kalit: number }
  | { nom: 'matn'; sessionId: string; karta: MashqKarta }
  | { nom: 'xulosa'; sessionId: string; karta: MashqKarta | null; iz: QongiroqIzi | null }
  | { nom: 'toliq'; sessionId: string; karta: MashqKarta | null }
  | { nom: 'tarix' }
  | { nom: 'yaratish' };

export function Mashq() {
  const { business, user } = useAuth();
  const businessId = business?.businessId;
  const asos = businessId ? `/api/v1/businesses/${businessId}/trening` : '';
  const api = useMemo(() => (asos ? createTrainingApi(sorov, asos) : null), [asos]);

  const [ovoz, setOvoz] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [korinish, setKorinish] = useState<Korinish>({ nom: 'bosh' });
  const [oyna, setOyna] = useState<MashqKarta | null>(null);
  const [band, setBand] = useState(false);
  const [oynaXato, setOynaXato] = useState<string | null>(null);

  useEffect(() => {
    if (!asos || !api) return undefined;
    let tirik = true;
    setOvoz(false);
    sorov<{ enabled: boolean }>(`${asos}/ovoz-holati`)
      .then((h) => tirik && setOvoz(h.enabled === true))
      .catch(() => tirik && setOvoz(false));
    api
      .me()
      .then((m) => tirik && setCanManage(m.canManageScenarios))
      .catch(() => undefined);
    return () => {
      tirik = false;
    };
  }, [asos, api]);

  // Har ekran almashganda — sahifa boshiga.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [korinish.nom]);

  const sessiyaOch = useCallback(
    (karta: MashqKarta, t: BoshlashTanlovi): Promise<StartSessionResponse> => {
      if (!api) return Promise.reject(new Error('API tayyor emas'));
      if (t.sotuvchi) profilniSaqla(t.sotuvchi);
      return karta.tur === 'ssenariy'
        ? api.startSession({ scenarioId: karta.id, seller: t.sotuvchi as SellerProfile, level: t.daraja })
        : api.startSession({ archetypeKey: karta.id });
    },
    [api],
  );

  const oynaniOch = (karta: MashqKarta): void => {
    setOynaXato(null);
    setOyna(karta);
    // Nutqni tanish modeli oldindan yuklansin (birinchi gapda kutilmasin).
    if (ovoz) void sorov(`${asos}/ovoz-isit`, { method: 'POST', body: {} }).catch(() => undefined);
  };

  const boshla = async (t: BoshlashTanlovi): Promise<void> => {
    const karta = oyna;
    if (!karta) return;
    if (t.rejim === 'ovoz') {
      // Qo'ng'iroq ekrani darhol ochiladi; sessiya gudok paytida yaratiladi.
      setOyna(null);
      setKorinish({ nom: 'qongiroq', karta, tanlov: t, kalit: Date.now() });
      return;
    }
    setBand(true);
    setOynaXato(null);
    try {
      const r = await sessiyaOch(karta, t);
      setOyna(null);
      setKorinish({ nom: 'matn', sessionId: r.sessionId, karta });
    } catch (err) {
      setOynaXato(errorText(err, true));
    } finally {
      setBand(false);
    }
  };

  const bosh = (): void => setKorinish({ nom: 'bosh' });

  if (!business || !api) return null;
  const rahbar = business.permissions.includes('analytics:read:all');

  const modulSahifa = (sarlavha: string, orqaga: () => void, tana: JSX.Element, qoshimcha?: JSX.Element) => (
    <div className="sm-modul">
      <div className="sm-modul-bosh">
        <button type="button" className="sm-orqaga" onClick={orqaga}>
          <ArrowLeft size={16} /> {sarlavha}
        </button>
        {qoshimcha}
      </div>
      <div className="mq-root">
        <div className="mq-wrap">{tana}</div>
      </div>
    </div>
  );

  let tana: JSX.Element;
  switch (korinish.nom) {
    case 'qongiroq': {
      const { karta, tanlov } = korinish;
      tana = (
        <Qongiroq
          key={korinish.kalit}
          api={api}
          karta={karta}
          qurilmaId={tanlov.qurilmaId}
          boshla={() => sessiyaOch(karta, tanlov)}
          onTugadi={(sessionId, iz) => setKorinish({ nom: 'xulosa', sessionId, karta, iz })}
          onBekor={bosh}
          sttHolati={() =>
            sorov<{ tayyor: boolean }>(`${asos}/ovoz-isit`, { method: 'POST', body: {} }).then((h) => h.tayyor === true)
          }
        />
      );
      break;
    }
    case 'matn':
      tana = modulSahifa(
        'Simulyator',
        bosh,
        <SessionPage
          api={api}
          sessionId={korinish.sessionId}
          onFinished={(sessionId) =>
            setKorinish({ nom: 'xulosa', sessionId, karta: korinish.karta, iz: iziniOqi(sessionId) })
          }
          onExit={bosh}
        />,
      );
      break;
    case 'xulosa': {
      const { sessionId, karta, iz } = korinish;
      tana = (
        <Xulosa
          key={sessionId}
          api={api}
          sessionId={sessionId}
          iz={iz ?? iziniOqi(sessionId)}
          karta={karta}
          onQaytaUrinish={oynaniOch}
          onToliq={() => setKorinish({ nom: 'toliq', sessionId, karta })}
          onQaytish={bosh}
          onFikr={(realism) => sorov(`${asos}/sessions/${sessionId}/fikr`, { method: 'POST', body: { realism } })}
        />
      );
      break;
    }
    case 'toliq': {
      const { sessionId, karta } = korinish;
      tana = modulSahifa(
        'Xulosaga qaytish',
        () => setKorinish({ nom: 'xulosa', sessionId, karta, iz: iziniOqi(sessionId) }),
        <NatijaPage
          api={api}
          sessionId={sessionId}
          onRetrySame={() => (karta ? oynaniOch(karta) : bosh())}
          onAnotherCustomer={bosh}
        />,
      );
      break;
    }
    case 'tarix':
      tana = modulSahifa(
        'Simulyator',
        bosh,
        <TarixPage
          api={api}
          canViewAll={rahbar}
          onOpenResult={(sessionId) => setKorinish({ nom: 'xulosa', sessionId, karta: null, iz: iziniOqi(sessionId) })}
        />,
        <Link to="/crm/simulyator/eski" className="sm-havola">
          Eski mashqlar tarixi
        </Link>,
      );
      break;
    case 'yaratish':
      tana = modulSahifa('Simulyator', bosh, <ScenarioBuilderPage api={api} />);
      break;
    default:
      tana = (
        <Bosh
          api={api}
          canManage={canManage}
          onBoshlash={oynaniOch}
          onNatija={(sessionId, karta) =>
            setKorinish({ nom: 'xulosa', sessionId, karta, iz: iziniOqi(sessionId) })
          }
          onTarix={() => setKorinish({ nom: 'tarix' })}
          onYaratish={() => setKorinish({ nom: 'yaratish' })}
        />
      );
  }

  return (
    <div className={`sm-ilova${korinish.nom === 'qongiroq' || korinish.nom === 'xulosa' ? ' sm-ilova-tun' : ''}`}>
      {tana}
      {oyna ? (
        <BoshlashOyna
          karta={oyna}
          ovozBor={ovoz}
          foydalanuvchiIsmi={user?.displayName ?? ''}
          band={band}
          xato={oynaXato}
          onYop={() => !band && setOyna(null)}
          onBoshla={(t) => void boshla(t)}
        />
      ) : null}
    </div>
  );
}
