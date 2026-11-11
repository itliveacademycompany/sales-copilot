import { Clock, FileText, Lock, Phone, PhoneIncoming, PhoneOutgoing, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { errorText, type SessionListItem, type TrainingApi } from '../../../features/mashq';
import {
  arxetipKarta,
  davomiylik,
  kayfiyatNomi,
  type MashqKarta,
  mmss,
  ssenariyKarta,
} from './yordamchi';

/**
 * Simulyator bosh sahifasi: mashq kartalari (ssenariylar + mijoz turlari),
 * qidiruv, o'ngda "Shu hafta" va "So'nggi mashqlar".
 */

interface Props {
  api: TrainingApi;
  canManage: boolean;
  onBoshlash: (karta: MashqKarta) => void;
  onNatija: (sessionId: string, karta: MashqKarta | null) => void;
  onTarix: () => void;
  onYaratish: () => void;
}

export function Bosh({ api, canManage, onBoshlash, onNatija, onTarix, onYaratish }: Props) {
  const [kartalar, setKartalar] = useState<{ ssenariy: MashqKarta[]; arxetip: MashqKarta[] } | null>(null);
  const [sessiyalar, setSessiyalar] = useState<SessionListItem[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tafsilot, setTafsilot] = useState<MashqKarta | null>(null);

  useEffect(() => {
    let tirik = true;
    Promise.all([api.listScenarios(), api.listArchetypes(), api.listSessions()])
      .then(([ss, aa, sess]) => {
        if (!tirik) return;
        setKartalar({ ssenariy: ss.map(ssenariyKarta), arxetip: aa.map(arxetipKarta) });
        setSessiyalar(sess);
      })
      .catch((e) => tirik && setXato(errorText(e, true)));
    return () => {
      tirik = false;
    };
  }, [api]);

  const arxetipNomi = useMemo(() => {
    const m = new Map<string, string>();
    kartalar?.arxetip.forEach((k) => m.set(k.id, k.sarlavha));
    return m;
  }, [kartalar]);

  /** Sessiya qaysi mashqdan — natijadagi "Qayta urinish" uchun. */
  const sessiyaKartasi = (s: SessionListItem): MashqKarta | null =>
    (s.scenarioId
      ? kartalar?.ssenariy.find((k) => k.id === s.scenarioId)
      : kartalar?.arxetip.find((k) => k.id === s.archetypeKey)) ?? null;

  const mos = (k: MashqKarta): boolean => {
    const s = q.trim().toLowerCase();
    return !s || k.sarlavha.toLowerCase().includes(s) || k.tavsif.toLowerCase().includes(s);
  };
  const ssenariylar = kartalar?.ssenariy.filter(mos) ?? [];
  const arxetiplar = kartalar?.arxetip.filter(mos) ?? [];

  return (
    <div className="sm-bosh">
      <header className="sm-bosh-bosh">
        <h1>Simulyator</h1>
        {canManage ? (
          <button type="button" className="sm-tugma sm-tugma-asosiy" onClick={onYaratish}>
            <Plus size={16} /> Yangi yaratish
          </button>
        ) : null}
      </header>

      <div className="sm-bosh-tur">
        <main className="sm-bosh-asosiy">
          <label className="sm-qidiruv">
            <Search size={16} aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Maqsad yoki vaziyat bo'yicha qidirish"
              aria-label="Mashqlarni qidirish"
            />
            {q ? (
              <button type="button" className="sm-qidiruv-tozala" onClick={() => setQ('')} aria-label="Tozalash">
                <X size={14} />
              </button>
            ) : null}
          </label>

          {xato ? <div className="sm-xabar sm-xabar-xato">{xato}</div> : null}

          {!kartalar && !xato ? (
            <div className="sm-kartalar">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="sm-karta sm-karta-skelet" />
              ))}
            </div>
          ) : null}

          {kartalar ? (
            <>
              {ssenariylar.length > 0 ? (
                <section>
                  <h2 className="sm-bolim">Vaziyatlar</h2>
                  <div className="sm-kartalar">
                    {ssenariylar.map((k) => (
                      <Karta key={k.id} k={k} onBoshlash={onBoshlash} onTafsilot={setTafsilot} />
                    ))}
                  </div>
                </section>
              ) : null}
              {arxetiplar.length > 0 ? (
                <section>
                  <h2 className="sm-bolim">Mijoz turlari</h2>
                  <div className="sm-kartalar">
                    {arxetiplar.map((k) => (
                      <Karta key={k.id} k={k} onBoshlash={onBoshlash} onTafsilot={setTafsilot} />
                    ))}
                  </div>
                </section>
              ) : null}
              {ssenariylar.length + arxetiplar.length === 0 ? (
                <div className="sm-bosh-yoq">"{q}" bo'yicha mashq topilmadi.</div>
              ) : null}
            </>
          ) : null}
        </main>

        <aside className="sm-yon">
          <HaftaPanel sessiyalar={sessiyalar} />
          <OxirgiPanel
            sessiyalar={sessiyalar}
            arxetipNomi={arxetipNomi}
            onNatija={(s) => onNatija(s.id, sessiyaKartasi(s))}
            onTarix={onTarix}
          />
        </aside>
      </div>

      {tafsilot ? (
        <Tafsilot
          k={tafsilot}
          onYop={() => setTafsilot(null)}
          onBoshlash={() => {
            setTafsilot(null);
            onBoshlash(tafsilot);
          }}
        />
      ) : null}
    </div>
  );
}

function Karta({
  k,
  onBoshlash,
  onTafsilot,
}: {
  k: MashqKarta;
  onBoshlash: (k: MashqKarta) => void;
  onTafsilot: (k: MashqKarta) => void;
}) {
  return (
    <article className="sm-karta">
      <h3 className="sm-karta-nom">{k.sarlavha}</h3>
      <div className="sm-karta-meta">
        <Clock size={13} aria-hidden /> {davomiylik(k.qiyinlik) / 60} daqiqa · {kayfiyatNomi(k.qiyinlik)}
        {k.yonalish === 'inbound' ? ' · kiruvchi' : ''}
      </div>
      <p className="sm-karta-tavsif">{k.tavsif}</p>
      <div className="sm-karta-past">
        <button
          type="button"
          className="sm-tugma sm-tugma-belgi"
          onClick={() => onTafsilot(k)}
          aria-label={`${k.sarlavha} — tafsilot`}
          title="Mashq haqida"
        >
          <FileText size={16} />
        </button>
        <button type="button" className="sm-tugma sm-tugma-asosiy sm-tugma-keng" onClick={() => onBoshlash(k)}>
          <Phone size={15} /> Boshlash
        </button>
      </div>
    </article>
  );
}

/** Dushanbadan boshlab joriy hafta. */
function haftaBoshi(): number {
  const d = new Date();
  const kun = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - kun);
  return d.getTime();
}

function davomS(s: SessionListItem): number {
  if (!s.endedAt) return 0;
  return Math.max(0, (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000);
}

function HaftaPanel({ sessiyalar }: { sessiyalar: SessionListItem[] | null }) {
  const bosh = haftaBoshi();
  const hafta = (sessiyalar ?? []).filter((s) => Date.parse(s.startedAt) >= bosh);
  const daqiqa = Math.round(hafta.reduce((n, s) => n + davomS(s), 0) / 60);
  return (
    <section className="sm-panel">
      <h2 className="sm-panel-nom">Shu hafta</h2>
      <div className="sm-hafta">
        <div className="sm-hafta-son">
          <b>{sessiyalar ? hafta.length : '—'}</b>
          <span>mashq qo'ng'iroqlari</span>
        </div>
        <div className="sm-hafta-son">
          <b>{sessiyalar ? `${daqiqa} daq` : '—'}</b>
          <span>suhbat vaqti</span>
        </div>
      </div>
    </section>
  );
}

function holatBelgisi(s: SessionListItem): { matn: string; ton: 'yaxshi' | 'orta' | 'past' | 'neytral' } {
  if (s.status === 'active') return { matn: 'Tugallanmagan', ton: 'neytral' };
  if (s.resultStatus === 'pending') return { matn: 'Tahlil qilinmoqda', ton: 'neytral' };
  if (s.resultQuality === 'insufficient') return { matn: 'Juda qisqa', ton: 'neytral' };
  const ball = s.scenarioScore ?? s.skillScore;
  if (ball !== null && ball !== undefined) {
    const b = Math.round(ball);
    return { matn: `${b} ball`, ton: b >= 70 ? 'yaxshi' : b >= 45 ? 'orta' : 'past' };
  }
  if (s.outcome === 'won') return { matn: 'Erishildi', ton: 'yaxshi' };
  return { matn: 'Tugadi', ton: 'neytral' };
}

const KUNLAR = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

function qachon(iso: string): string {
  const d = new Date(iso);
  const bugun = new Date();
  const farq = Math.floor((new Date(bugun.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (farq === 0) return `Bugun ${d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}`;
  if (farq === 1) return 'Kecha';
  if (farq < 7) return KUNLAR[d.getDay()] ?? '';
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });
}

function OxirgiPanel({
  sessiyalar,
  arxetipNomi,
  onNatija,
  onTarix,
}: {
  sessiyalar: SessionListItem[] | null;
  arxetipNomi: Map<string, string>;
  onNatija: (s: SessionListItem) => void;
  onTarix: () => void;
}) {
  const royxat = (sessiyalar ?? []).slice(0, 5);
  return (
    <section className="sm-panel">
      <div className="sm-panel-bosh">
        <h2 className="sm-panel-nom">So'nggi mashqlar</h2>
        {sessiyalar && sessiyalar.length > 0 ? (
          <button type="button" className="sm-havola" onClick={onTarix}>
            Hammasi
          </button>
        ) : null}
      </div>
      {!sessiyalar ? <div className="sm-skelet-qator" /> : null}
      {sessiyalar && royxat.length === 0 ? (
        <p className="sm-yon-bosh">Hali mashq yo'q. Birinchi qo'ng'iroqni boshlang.</p>
      ) : null}
      <ul className="sm-oxirgi">
        {royxat.map((s) => {
          const b = holatBelgisi(s);
          const nom = s.scenarioTitle ?? arxetipNomi.get(s.archetypeKey) ?? 'Mashq';
          return (
            <li key={s.id}>
              <button
                type="button"
                className="sm-oxirgi-qator"
                // Tugallanmagan mashqning tahlili yo'q.
                disabled={s.status === 'active'}
                onClick={() => onNatija(s)}
              >
                <span className="sm-oxirgi-nom">{nom}</span>
                <span className={`sm-belgi sm-belgi-${b.ton}`}>{b.matn}</span>
                <span className="sm-oxirgi-vaqt">
                  {qachon(s.startedAt)}
                  {s.endedAt ? ` · ${mmss(davomS(s))}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="sm-maxfiy">
        <Lock size={12} aria-hidden /> Mashq tarixini faqat siz va rahbaringiz ko'radi.
      </p>
    </section>
  );
}

function Tafsilot({ k, onYop, onBoshlash }: { k: MashqKarta; onYop: () => void; onBoshlash: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onYop();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onYop]);
  return (
    <div className="sm-qoplama" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <div className="sm-oyna" role="dialog" aria-modal="true" aria-labelledby="sm-tafsilot-nom">
        <div className="sm-oyna-bosh">
          <h2 id="sm-tafsilot-nom">{k.sarlavha}</h2>
          <button type="button" className="sm-yopish" onClick={onYop} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>
        <div className="sm-oyna-tana">
          <p className="sm-tafsilot-matn">{k.tavsif}</p>
          <dl className="sm-tafsilot-royxat">
            <div>
              <dt>Mijoz kayfiyati</dt>
              <dd>{kayfiyatNomi(k.qiyinlik)}</dd>
            </div>
            <div>
              <dt>Qo'ng'iroq</dt>
              <dd>
                {k.yonalish === 'inbound' ? (
                  <>
                    <PhoneIncoming size={14} /> Mijoz o'zi qo'ng'iroq qiladi
                  </>
                ) : (
                  <>
                    <PhoneOutgoing size={14} /> Siz qo'ng'iroq qilasiz
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Davomiylik</dt>
              <dd>{davomiylik(k.qiyinlik) / 60} daqiqa, pauzasiz</dd>
            </div>
          </dl>
          {k.ogohlantirish ? <div className="sm-xabar sm-xabar-ogoh">{k.ogohlantirish}</div> : null}
        </div>
        <div className="sm-oyna-past">
          <button type="button" className="sm-tugma" onClick={onYop}>
            Yopish
          </button>
          <button type="button" className="sm-tugma sm-tugma-asosiy" onClick={onBoshlash}>
            <Phone size={15} /> Boshlash
          </button>
        </div>
      </div>
    </div>
  );
}
