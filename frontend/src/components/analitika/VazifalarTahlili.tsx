import { Check, ChevronRight, Save } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TaskRow } from '../../api';
import { useAuth } from '../../auth';
import { MalumotIkon } from '../bosh/Korsatkichlar';
import { GuruhliUstunGrafik } from './grafiklar';
import { bolaklar } from './qoshimcha';
import { VazifaRoyxati, type MuddatTuri } from './VazifaRoyxati';
import type { TabProps } from './Tablar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VAZIFALAR TAHLILI — jamoa va'dalariga ulguryaptimi?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ikki xil savol aralashmasin: "hozir" (ayni damdagi holat — davrga bog'liq
 * emas) va "davr bo'yicha" (tanlangan davrda nima yaratildi va bajarildi).
 *
 * Davr bajarilishi = davrda bajarilgan / (davrda bajarilgan + hozir ochiq).
 * Ya'ni jamoa qo'lidagi butun yukning qancha qismi yopilgani — faqat
 * yaratilganlarga bo'lish eski, to'planib qolgan vazifalarni yashirardi.
 */

type Manba = 'hammasi' | 'ai' | 'qolda' | 'crm';
const MANBA_NOMI: Record<Manba, string> = {
  hammasi: 'Barchasi',
  ai: 'SotuvAI yaratgan',
  qolda: "Qo'lda yaratilgan",
  crm: 'CRM bilan bog\'langan',
};
const OCHIQ = new Set(['pending', 'in_progress', 'blocked']);
const KUN = 86400_000;

function manbasi(t: TaskRow): Exclude<Manba, 'hammasi'> {
  if (t.crmTaskId) return 'crm';
  return t.source === 'manual' ? 'qolda' : 'ai';
}

function vaqtMatn(ms: number | null): string {
  if (ms === null) return '—';
  const soat = ms / 3600_000;
  if (soat < 1) return `${Math.max(1, Math.round(soat * 60))} daq`;
  if (soat < 24) return `${Math.round(soat)} soat`;
  return `${Math.round(soat / 24)} kun`;
}

function ichida(iso: string | null, from: number, to: number) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from && t < to;
}

function hisobla(v: TaskRow[], from: number, to: number) {
  const ochiq = v.filter((t) => OCHIQ.has(t.status));
  const bugunBosh = new Date();
  bugunBosh.setHours(0, 0, 0, 0);
  const bajarildi = v.filter((t) => t.status === 'done' && ichida(t.completedAt, from, to));
  const vaqtlar = bajarildi
    .map((t) => new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime())
    .filter((x) => x >= 0);
  const yuk = bajarildi.length + ochiq.length;
  return {
    ochiq: ochiq.length,
    kechikkan: ochiq.filter((t) => t.isOverdue).length,
    bugun: ochiq.filter((t) => ichida(t.dueAt, bugunBosh.getTime(), bugunBosh.getTime() + KUN)).length,
    yaratildi: v.filter((t) => ichida(t.createdAt, from, to)).length,
    bajarildi: bajarildi.length,
    ortachaVaqt: vaqtlar.length ? vaqtlar.reduce((s, x) => s + x, 0) / vaqtlar.length : null,
    yuk,
    foiz: yuk > 0 ? Math.round((bajarildi.length / yuk) * 100) : null,
  };
}

const manbaKalit = (biz: string) => `sotuvai-vazifa-manba-${biz}`;
function saqlanganManba(biz: string): Manba {
  try {
    const v = localStorage.getItem(manbaKalit(biz));
    return v && v in MANBA_NOMI ? (v as Manba) : 'hammasi';
  } catch {
    return 'hammasi';
  }
}

export function VazifalarTahlili({ data, davr, q }: TabProps) {
  // Ro'yxat (drill-down) holati URL'da: brauzerning "orqaga" tugmasi ham ishlaydi
  const [params, setParams] = useSearchParams();
  const royxatOchiq = params.has('royxat');
  const ochish = (muddat: MuddatTuri, seat = '') =>
    setParams((eski) => {
      const p = new URLSearchParams(eski);
      p.set('royxat', muddat || 'ochiq');
      if (seat) p.set('rm', seat);
      else p.delete('rm');
      return p;
    });
  const yopish = () =>
    setParams((eski) => {
      const p = new URLSearchParams(eski);
      p.delete('royxat');
      p.delete('rm');
      return p;
    });
  const { business } = useAuth();
  // Tanlov har biznes uchun alohida eslab qolinadi
  const kalit = business?.businessId ?? '-';
  const [saqlangan, setSaqlangan] = useState<Manba>(() => saqlanganManba(kalit));
  const [manba, setManba] = useState<Manba>(saqlangan);
  const [yangiSaqlandi, setYangiSaqlandi] = useState(false);

  const barcha = q.vazifalar;
  const from = davr.from.getTime();
  const to = davr.to.getTime();
  const v = useMemo(() => (barcha ?? []).filter((t) => manba === 'hammasi' || manbasi(t) === manba), [barcha, manba]);
  const h = useMemo(() => hisobla(v, from, to), [v, from, to]);

  const ism = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data.seats) m.set(s.id, s.displayName);
    for (const r of data.board) if (!m.has(r.seatId)) m.set(r.seatId, r.displayName);
    return m;
  }, [data.seats, data.board]);

  function saqla() {
    try {
      localStorage.setItem(manbaKalit(kalit), manba);
    } catch {
      /* brauzer xotirasi yopiq — tanlov shu sahifada amal qiladi */
    }
    setSaqlangan(manba);
    setYangiSaqlandi(true);
    setTimeout(() => setYangiSaqlandi(false), 2500);
  }

  if (royxatOchiq && barcha !== null) {
    const m = params.get('royxat');
    const rm = params.get('rm') ?? '';
    return (
      <div className="an-bolim">
        <VazifaRoyxati
          key={`${m}-${rm}`}
          data={data}
          q={q}
          boshMuddat={m === 'kechikkan' || m === 'bugun' || m === 'hafta' || m === 'muddatsiz' ? m : ''}
          boshMenejer={rm === '' ? null : rm === '-' ? '' : rm}
          onOrqaga={yopish}
        />
      </div>
    );
  }

  if (barcha === null) {
    return (
      <div className="an-bolim" aria-busy="true">
        <div className="card skelet" style={{ height: 120 }} />
        <div className="card skelet" style={{ height: 160 }} />
      </div>
    );
  }

  const holat =
    h.foiz === null
      ? { nom: "Vazifa yo'q", klass: 'neytral' }
      : h.foiz >= 70
        ? { nom: 'Jamoa ulgurmoqda', klass: 'yaxshi' }
        : h.foiz >= 40
          ? { nom: "Sur'at o'rtacha", klass: 'orta' }
          : { nom: 'Jamoa ulgurmayapti', klass: 'past' };

  // Manba bo'yicha — tanlovdan qat'i nazar hammasi
  const manbalar = (['crm', 'ai', 'qolda'] as const).map((m) => ({
    m,
    h: hisobla((barcha ?? []).filter((t) => manbasi(t) === m), from, to),
  }));

  // Yaratilishi va bajarilishi
  const { royxat } = bolaklar(davr);
  const ustunlar = royxat.map((b) => ({
    nom: b.nom,
    qiymatlar: {
      yaratildi: v.filter((t) => ichida(t.createdAt, b.from, b.to)).length,
      bajarildi: v.filter((t) => t.status === 'done' && ichida(t.completedAt, b.from, b.to)).length,
    },
  }));

  // Menejerlar
  const menejerlar = [...new Set(v.map((t) => t.seatId ?? ''))]
    .map((s) => {
      const x = hisobla(
        v.filter((t) => (t.seatId ?? '') === s),
        from,
        to,
      );
      return { s, nom: s ? ism.get(s) ?? 'Menejer' : 'Biriktirilmagan', ...x };
    })
    .filter((x) => x.ochiq + x.bajarildi + x.yaratildi > 0)
    .sort((a, b) => b.kechikkan - a.kechikkan || b.ochiq - a.ochiq);

  // CRM bosqichlari bo'yicha ochiq vazifalar
  const bosqich = new Map<string, { ochiq: number; kechikkan: number }>();
  for (const t of v) {
    if (!OCHIQ.has(t.status) || !t.crmStageName) continue;
    const x = bosqich.get(t.crmStageName) ?? { ochiq: 0, kechikkan: 0 };
    x.ochiq++;
    if (t.isOverdue) x.kechikkan++;
    bosqich.set(t.crmStageName, x);
  }
  const bosqichlar = [...bosqich.entries()].sort((a, b) => b[1].ochiq - a[1].ochiq);
  const bosqichMax = Math.max(1, ...bosqichlar.map(([, x]) => x.ochiq));

  const R = 46;
  const AYLANA = 2 * Math.PI * R;

  return (
    <div className="an-bolim">
      {q.vazifaCheklangan && (
        <div className="an-eslatma">Vazifalar ko'p — ba'zi holatlar bo'yicha birinchi 200 tasi olindi, raqamlar "kamida" ma'nosida.</div>
      )}

      {/* ─── Manba tanlovi ─── */}
      <section className="card an-karta vt-manba">
        <div>
          <h2>Vazifalar manbasi</h2>
          <p className="vt-izoh">Manbani tanlang — tanlov shu bo'limdagi barcha raqamlarga qo'llanadi. "Saqlash" uni keyingi safar uchun eslab qoladi.</p>
        </div>
        <div className="vt-manba-ong">
          <div className="vt-manba-qator">
            <select className="input vt-select" value={manba} onChange={(e) => setManba(e.target.value as Manba)} aria-label="Vazifalar manbasi">
              {(Object.keys(MANBA_NOMI) as Manba[]).map((m) => (
                <option key={m} value={m}>
                  {MANBA_NOMI[m]}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={saqla} disabled={manba === saqlangan && !yangiSaqlandi}>
              <Save /> Saqlash
            </button>
          </div>
          <small className={`vt-saqlandi${manba !== saqlangan ? ' ozgargan' : ''}`}>
            {manba !== saqlangan ? (
              'Saqlanmagan tanlov'
            ) : (
              <>
                <Check /> Saqlangan: {MANBA_NOMI[saqlangan]}
              </>
            )}
          </small>
        </div>
      </section>

      {/* ─── Davr bajarilishi ─── */}
      <section className="card an-karta vt-qahramon">
        <div className="vt-halqa-qism">
          <div className="vt-halqa" role="img" aria-label={`Davr bajarilishi ${h.foiz ?? 0}%`}>
            <svg width="112" height="112" viewBox="0 0 112 112">
              <circle cx="56" cy="56" r={R} fill="none" stroke="var(--bg-sunken)" strokeWidth="10" />
              <circle
                cx="56"
                cy="56"
                r={R}
                fill="none"
                className={`vt-halqa-tola ${holat.klass}`}
                opacity={h.foiz ? 1 : 0}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${((h.foiz ?? 0) / 100) * AYLANA} ${AYLANA}`}
                transform="rotate(-90 56 56)"
              />
            </svg>
            <b className={holat.klass}>{h.foiz === null ? '—' : `${h.foiz}%`}</b>
          </div>
          <div>
            <h2 className={`vt-holat ${holat.klass}`}>{holat.nom}</h2>
            <span className="vt-izoh">
              Davr bajarilishi <MalumotIkon matn="Davrda bajarilgan / (davrda bajarilgan + hozir ochiq). Jamoa qo'lidagi butun yukning yopilgan qismi" />
            </span>
          </div>
        </div>
        <div className="vt-qahramon-ong">
          <p>
            Tanlangan davrda {h.yuk} tadan <b>{h.bajarildi}</b> ta vazifa bajarildi.
          </p>
          {h.kechikkan > 0 ? (
            <span className="sd-pill xavf">Hozir {h.kechikkan} ta kechikkan</span>
          ) : (
            <span className="sd-pill yaxshi">Kechikkan vazifa yo'q</span>
          )}
        </div>
      </section>

      {/* ─── Hozir / Davr bo'yicha ─── */}
      <div className="vt-ikki-guruh">
        <div>
          <h3 className="vt-guruh-nom">
            Hozir <MalumotIkon matn="Ayni damdagi holat — tanlangan davrga bog'liq emas" />
          </h3>
          <small className="vt-guruh-izoh">ayni damda</small>
          <div className="vt-kartalar">
            <Son qiymat={h.ochiq} nom="Ochiq" izoh="Kutilmoqda, jarayonda yoki to'xtatilgan" onOch={() => ochish('')} />
            <Son qiymat={h.kechikkan} nom="Muddati o'tgan" izoh="Muddati o'tgan, hali yopilmagan" rang={h.kechikkan > 0 ? 'past' : undefined} onOch={() => ochish('kechikkan')} />
            <Son qiymat={h.bugun} nom="Bugun uchun" izoh="Muddati bugun tugaydigan ochiq vazifalar" rang={h.bugun > 0 ? 'orta' : undefined} onOch={() => ochish('bugun')} />
          </div>
        </div>
        <div>
          <h3 className="vt-guruh-nom">
            Davr bo'yicha <MalumotIkon matn="Yuqorida tanlangan davr uchun" />
          </h3>
          <small className="vt-guruh-izoh">yuqorida tanlangan davr uchun</small>
          <div className="vt-kartalar">
            <Son qiymat={h.yaratildi} nom="Yaratildi" izoh="Davrda yaratilgan vazifalar" />
            <Son qiymat={h.bajarildi} nom="Bajarildi" izoh="Davrda bajarilgan vazifalar" rang="yuqori" />
            <Son qiymat={vaqtMatn(h.ortachaVaqt)} nom="O'rtacha bajarilish vaqti" izoh="Yaratilgandan bajarilguncha o'rtacha vaqt (davrda bajarilganlar)" />
          </div>
        </div>
      </div>

      {/* ─── Manba bo'yicha ─── */}
      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>Vazifalar manbasi bo'yicha</h2>
        </div>
        <p className="vt-izoh vt-izoh-past">CRM bilan bog'langan, SotuvAI yaratgan va qo'lda qo'shilgan vazifalarning joriy hamda tanlangan davrdagi holati.</p>
        <div className="vt-manbalar">
          {manbalar.map(({ m, h: x }) => (
            <div key={m} className={`vt-manba-karta${manba === m ? ' tanlangan' : ''}`}>
              <b>{m === 'crm' ? "CRM bilan bog'langan" : MANBA_NOMI[m]}</b>
              <div className="vt-uchlik">
                <span>
                  <small>Ochiq</small>
                  <strong>{x.ochiq}</strong>
                </span>
                <span>
                  <small>Yaratildi</small>
                  <strong>{x.yaratildi}</strong>
                </span>
                <span>
                  <small>Bajarildi</small>
                  <strong>{x.bajarildi}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Yaratilishi va bajarilishi ─── */}
      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            Vazifalar yaratilishi va bajarilishi <MalumotIkon matn="Har bo'lakda yaratilgan va bajarilgan vazifalar soni" />
          </h2>
        </div>
        <p className="vt-izoh vt-izoh-past">Agar «Bajarildi» «Yaratildi»dan ortda qolsa, vazifalar to'planadi.</p>
        {h.yaratildi + h.bajarildi === 0 ? (
          <div className="jm-bosh">Bu davrda vazifa yaratilmagan va bajarilmagan.</div>
        ) : (
          <GuruhliUstunGrafik
            ustunlar={ustunlar}
            seriyalar={[
              { kalit: 'yaratildi', nom: 'Yaratildi', rang: 'var(--s1)' },
              { kalit: 'bajarildi', nom: 'Bajarildi', rang: 'var(--s3)' },
            ]}
            nom="Vazifalar yaratilishi va bajarilishi"
            birlik=" ta"
          />
        )}
      </section>

      {/* ─── Menejerlar ─── */}
      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            Menejerlar bo'yicha vazifalar <MalumotIkon matn="Davr bajarilishi = davrda bajarilgan / (davrda bajarilgan + hozir ochiq)" />
          </h2>
        </div>
        <p className="vt-izoh vt-izoh-past">Kim qancha vazifa olib boryapti va kim ortda qolyapti. Eng ko'p kechikkani yuqorida.</p>
        {menejerlar.length === 0 ? (
          <div className="jm-bosh">Vazifa yo'q.</div>
        ) : (
          <div className="sn-jadval-qobiq">
            <table className="vt-jadval">
              <thead>
                <tr>
                  <th>Menejer</th>
                  <th>Ochiq</th>
                  <th>Muddati o'tgan</th>
                  <th>Davrda bajarildi</th>
                  <th>Davr bajarilishi</th>
                  <th aria-label="Ochish" />
                </tr>
              </thead>
              <tbody>
                {menejerlar.map((m) => (
                  <tr key={m.s || '—'}>
                    <td>
                      <b>{m.nom}</b>
                    </td>
                    <td className="an-son">{m.ochiq}</td>
                    <td className="an-son">
                      <span className={m.kechikkan > 0 ? 'vt-kech' : ''}>{m.kechikkan}</span>
                    </td>
                    <td className="an-son vt-bajar">{m.bajarildi}</td>
                    <td>
                      <span className="vt-foiz">
                        <span className="vt-foiz-chiziq">
                          <span className={m.foiz === null ? '' : m.foiz >= 70 ? 'yaxshi' : m.foiz >= 40 ? 'orta' : 'past'} style={{ width: `${m.foiz ?? 0}%` }} />
                        </span>
                        <span>{m.foiz === null ? '—' : `${m.foiz}%`}</span>
                      </span>
                    </td>
                    <td>
                      {(
                        <button type="button" className="vt-ochish" onClick={() => ochish('', m.s || '-')} aria-label={`${m.nom} — ochiq vazifalar`} title="Ochiq vazifalarni ko'rish">
                          <ChevronRight />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── CRM bosqichlari ─── */}
      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            Bitim bosqichlari bo'yicha ochiq vazifalar <MalumotIkon matn="CRM bilan bog'langan ochiq vazifalar — bitim qaysi bosqichda turgani bo'yicha" />
          </h2>
        </div>
        <p className="vt-izoh vt-izoh-past">Voronkaning qayerida ochiq vazifalar to'plangani. Kechikkanlar qizil rangda.</p>
        {bosqichlar.length === 0 ? (
          <div className="jm-bosh">CRM bosqichiga bog'langan ochiq vazifa yo'q. CRM ulanganda vazifalar bitim bosqichi bilan birga keladi.</div>
        ) : (
          <>
            <ul className="vt-bosqichlar">
              {bosqichlar.map(([nom, x]) => (
                <li key={nom} title={`${nom}: ${x.ochiq} ochiq, ${x.kechikkan} kechikkan`}>
                  <span className="vt-bosqich-nom">{nom}</span>
                  <span className="vt-bosqich-chiziq">
                    <span className="ochiq" style={{ width: `${(x.ochiq / bosqichMax) * 100}%` }} />
                    <span className="kech" style={{ width: `${(x.kechikkan / bosqichMax) * 100}%` }} />
                  </span>
                  <span className="vt-bosqich-son">
                    {x.ochiq} <em>/ {x.kechikkan}</em>
                  </span>
                </li>
              ))}
            </ul>
            <div className="g-legenda g-legenda-doira g-legenda-chap">
              <span>
                <i style={{ background: 'var(--text-muted)' }} /> Ochiq
              </span>
              <span>
                <i style={{ background: 'var(--past)' }} /> Muddati o'tgan
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Son({
  qiymat,
  nom,
  izoh,
  rang,
  onOch,
}: {
  qiymat: ReactNode;
  nom: string;
  izoh: string;
  rang?: 'past' | 'orta' | 'yuqori';
  /** Bosilganda shu bo'yicha vazifalar ro'yxati ochiladi. */
  onOch?: () => void;
}) {
  const ichki = (
    <>
      <span className="vt-son-ichi">
        <b className={rang ?? ''}>{qiymat}</b>
        <small>
          {nom} <MalumotIkon matn={izoh} />
        </small>
      </span>
      {onOch && (
        <span className="vt-ochish" aria-hidden="true">
          <ChevronRight />
        </span>
      )}
    </>
  );
  return onOch ? (
    <button type="button" className="vt-son havolali" onClick={onOch}>
      {ichki}
    </button>
  ) : (
    <div className="vt-son">{ichki}</div>
  );
}
