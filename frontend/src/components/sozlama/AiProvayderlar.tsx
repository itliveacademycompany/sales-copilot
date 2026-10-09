import { Check, KeyRound, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, fmtSana } from '../../api';
import './aiProvayderlar.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → AI PROVAYDERLAR (faqat super-admin)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Platforma darajasi: bu yerdagi kalitlar butun tizimga — barcha bizneslar
 * tahliliga ishlatiladi. Shuning uchun faqat `super_admin` ko'radi (server
 * boshqalarga 404 qaytaradi).
 *
 * Zaxira zanjiri: faol provayder birinchi, keyin «Zaxira #1, #2…». Faol
 * provayder limitga (429/kvota) urilsa, so'rov o'zi keyingisiga o'tadi va
 * limitdagi provayder 15 daqiqa chetlab o'tiladi. Bepul kvotalar shu tarzda
 * qo'shiladi — bitta kalit tugashi butun baholashni to'xtatmaydi.
 *
 * Kalit faqat yuboriladi: server uni shifrlaydi va qaytib hech qachon
 * ko'rsatmaydi (faqat `…a1b2` ko'rinishidagi belgi).
 */

interface Provayder {
  id: string;
  purpose: 'llm' | 'stt';
  kind: string;
  label: string;
  apiKeyHint: string | null;
  models: Record<string, string | number>;
  baseUrl: string | null;
  isActive: boolean;
  fallbackOrder: number | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
}

interface TekshiruvNatija {
  ok: boolean;
  problems: string[];
  model: string | null;
  ms: number | null;
  note: string;
}

/**
 * Tayyor sozlamalar. Model nomlari — sinalgan yoki rasmiy hujjatdagi;
 * provayder modelni o'zgartirsa, «Model» maydonida qo'lda tuzatiladi.
 */
const PRESETLAR = {
  gemini: {
    nom: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    split: '',
    kalitJoyi: 'aistudio.google.com → Get API key',
    izoh: "Sinalgan: o'zbekcha suhbatlarda yaxshi natija. Bepul tarifda kunlik kvota kichik; to'lov ulansa limit amalda yo'qoladi.",
  },
  groq: {
    nom: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    split: '',
    kalitJoyi: 'console.groq.com/keys',
    izoh: 'Juda tez. Bepul tarifda daqiqalik va kunlik token limiti bor (taxminan kuniga ~20 ta qo\'ng\'iroq).',
  },
  openrouter: {
    nom: 'OpenRouter (bepul modellar)',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemma-4-26b-a4b-it:free',
    split: '4',
    kalitJoyi: 'openrouter.ai/keys',
    izoh: "«:free» modellar tekin: daqiqasiga 20 so'rov, kuniga 50 so'rov (hisobga bir marta $10 kredit tushirilgan bo'lsa — kuniga 1000). Zaif bepul modellar uchun «Bo'lib so'rash» = 4 tavsiya qilinadi.",
  },
  boshqa: {
    nom: 'Boshqa (OpenAI-uyg\'un)',
    baseUrl: '',
    model: '',
    split: '',
    kalitJoyi: 'provayder kabineti',
    izoh: 'Together, Cerebras va boshqa OpenAI-uyg\'un API: bazaviy URL va model nomini qo\'lda kiriting.',
  },
} as const;
type PresetKalit = keyof typeof PRESETLAR;

const xatoMatni = (e: unknown, z: string) => (e instanceof ApiError || e instanceof Error ? e.message : z);
const asosiyModel = (p: Provayder) => String(p.models.stage2 ?? p.models.stage3 ?? Object.values(p.models).find((v) => typeof v === 'string') ?? '—');
const host = (u: string | null) => {
  try {
    return u ? new URL(u).host : 'standart';
  } catch {
    return u ?? 'standart';
  }
};

export function AiProvayderlar() {
  const [royxat, setRoyxat] = useState<Provayder[] | null>(null);
  const [yuklashXato, setYuklashXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [yangiOchiq, setYangiOchiq] = useState(false);

  const yukla = useCallback(async () => {
    try {
      setRoyxat(await api.get<Provayder[]>('/api/v1/admin/providers'));
      setYuklashXato(null);
    } catch (e) {
      setYuklashXato(xatoMatni(e, "Ro'yxatni yuklab bo'lmadi"));
    }
  }, []);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  const amal = async (id: string, fn: () => Promise<unknown>, muvaffaqiyat?: string) => {
    setBand(id);
    setXabar(null);
    try {
      await fn();
      if (muvaffaqiyat) setXabar({ ok: true, matn: muvaffaqiyat });
      await yukla();
    } catch (e) {
      setXabar({ ok: false, matn: xatoMatni(e, 'Bajarilmadi') });
    } finally {
      setBand(null);
    }
  };

  const tekshir = (p: Provayder) =>
    amal(p.id, async () => {
      const r = await api.post<TekshiruvNatija>(`/api/v1/admin/providers/${p.id}/test`);
      setXabar({ ok: r.ok, matn: r.ok ? `${p.label}: ${r.note}` : `${p.label}: ${r.problems.join('; ')}` });
    });

  if (yuklashXato) {
    return (
      <section className="card sz-karta">
        <div className="yordam bzl-xato">{yuklashXato}</div>
      </section>
    );
  }
  if (!royxat) return <div className="card skelet" style={{ height: 320 }} aria-busy="true" />;

  const llm = royxat.filter((p) => p.purpose === 'llm');
  const keyingiNavbat = Math.max(0, ...llm.map((p) => p.fallbackOrder ?? 0)) + 1;
  const faolBor = llm.some((p) => p.isActive);

  return (
    <section className="card sz-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>AI provayderlar</h2>
          <p>
            Suhbatlarni baholaydigan AI modellar. Faol provayder limitga yetsa, so'rov o'zi zaxiradagi keyingi provayderga o'tadi — bitta kalit
            tugashi baholashni to'xtatmaydi.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setYangiOchiq((v) => !v)} aria-expanded={yangiOchiq}>
          <Plus /> {yangiOchiq ? 'Yopish' : 'Provayder qo\'shish'}
        </button>
      </div>

      {yangiOchiq && (
        <YangiProvayder
          keyingiNavbat={faolBor ? keyingiNavbat : null}
          onQoshildi={async (matn, ok) => {
            setYangiOchiq(false);
            setXabar({ ok, matn });
            await yukla();
          }}
        />
      )}

      {xabar && (
        <div className={`bzl-izoh${xabar.ok ? '' : ' xato'}`} role="status" style={{ marginBottom: 12 }}>
          {xabar.ok ? <Check aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
          <span>{xabar.matn}</span>
        </div>
      )}

      {!faolBor && (
        <div className="bzl-izoh xato" role="alert" style={{ marginBottom: 12 }}>
          <TriangleAlert aria-hidden="true" />
          <span>Faol LLM provayderi yo'q — tahlil ishlamaydi. Provayderlardan birini «Faol qilish» bilan yoqing.</span>
        </div>
      )}

      <div className="ai-prov-royxat">
        {llm.length === 0 && <div className="bn-bosh-holat">Hali provayder qo'shilmagan.</div>}
        {llm.map((p) => (
          <ProvayderQatori
            key={p.id}
            p={p}
            band={band === p.id}
            onTekshir={() => void tekshir(p)}
            onFaol={() => void amal(p.id, () => api.post(`/api/v1/admin/providers/${p.id}/activate`), `${p.label} endi faol provayder.`)}
            onZaxira={(order) =>
              void amal(
                p.id,
                () => api.patch(`/api/v1/admin/providers/${p.id}`, { fallbackOrder: order }),
                order ? `${p.label} zaxiraga qo'shildi (#${order}).` : `${p.label} zaxiradan chiqarildi.`,
              )
            }
            keyingiNavbat={keyingiNavbat}
            onKalit={(kalit) =>
              void amal(p.id, async () => {
                await api.patch(`/api/v1/admin/providers/${p.id}`, { apiKey: kalit });
                const r = await api.post<TekshiruvNatija>(`/api/v1/admin/providers/${p.id}/test`);
                setXabar({ ok: r.ok, matn: r.ok ? `Kalit almashtirildi va ishlayapti: ${r.note}` : `Kalit saqlandi, lekin tekshiruv o'tmadi: ${r.problems.join('; ')}` });
              })
            }
            onModel={(model, split) =>
              void amal(p.id, async () => {
                await api.patch(`/api/v1/admin/providers/${p.id}`, {
                  models: { stage2: model, stage3: model, playbookBuilder: model, ...(split ? { splitFields: split } : {}) },
                });
                const r = await api.post<TekshiruvNatija>(`/api/v1/admin/providers/${p.id}/test`);
                setXabar({ ok: r.ok, matn: r.ok ? `Model almashtirildi va ishlayapti: ${r.note}` : `Model saqlandi, lekin tekshiruv o'tmadi: ${r.problems.join('; ')}` });
              })
            }
            onOchir={() => {
              if (!window.confirm(`«${p.label}» o'chirilsinmi? Kaliti ham o'chadi.${p.isActive ? ' DIQQAT: bu faol provayder — tahlil to\'xtaydi.' : ''}`)) return;
              void amal(p.id, () => api.del(`/api/v1/admin/providers/${p.id}`), `${p.label} o'chirildi.`);
            }}
          />
        ))}
      </div>

      <p className="sz-eslatma">
        Kalitlar shifrlangan holda saqlanadi va qayta ko'rsatilmaydi — faqat oxirgi belgilari. «Tekshirish» provayderga haqiqiy kichik so'rov yuboradi
        (kalit, manzil va model nomi birga tekshiriladi). Bepul tariflarda suhbat matnlari provayder tomonidan o'z maqsadlarida ishlatilishi mumkin —
        mijozlar ma'lumoti uchun pullik tarif xavfsizroq.
      </p>
    </section>
  );
}

function ProvayderQatori({
  p,
  band,
  keyingiNavbat,
  onTekshir,
  onFaol,
  onZaxira,
  onKalit,
  onModel,
  onOchir,
}: {
  p: Provayder;
  band: boolean;
  keyingiNavbat: number;
  onTekshir: () => void;
  onFaol: () => void;
  onZaxira: (order: number | null) => void;
  onKalit: (kalit: string) => void;
  onModel: (model: string, split: number | null) => void;
  onOchir: () => void;
}) {
  const [kalitOchiq, setKalitOchiq] = useState(false);
  const [kalit, setKalit] = useState('');
  const [modelOchiq, setModelOchiq] = useState(false);
  const [model, setModel] = useState(asosiyModel(p));
  const [split, setSplit] = useState(p.models.splitFields ? String(p.models.splitFields) : '');
  const splitTogri = split.trim() === '' || (/^\d+$/.test(split.trim()) && Number(split) >= 1 && Number(split) <= 50);
  const holat = p.isActive ? { nom: 'Faol', ton: 'ok' } : p.fallbackOrder ? { nom: `Zaxira #${p.fallbackOrder}`, ton: 'info' } : { nom: "Ishlatilmaydi", ton: '' };

  return (
    <div className="ai-prov-qator">
      <div className="ai-prov-asosiy">
        <div className="ai-prov-nom">
          <b>{p.label}</b>
          <span className={`bzl-pill ${holat.ton}`}>{holat.nom}</span>
        </div>
        <small>
          {host(p.baseUrl)} · model <code>{asosiyModel(p)}</code>
          {p.models.splitFields ? ` · bo'lib so'rash: ${p.models.splitFields}` : ''} · kalit {p.apiKeyHint ?? <b>kiritilmagan</b>}
        </small>
        {p.lastCheckAt && (
          <small className={p.lastCheckOk ? 'bn-ok' : 'bzl-xato'}>
            {p.lastCheckOk ? '✓ Ishlayapti' : `✗ ${p.lastCheckError ?? 'Tekshiruv o\'tmadi'}`} · {fmtSana(p.lastCheckAt)}
          </small>
        )}
      </div>
      <div className="ai-prov-amallar">
        <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={onTekshir}>
          <RefreshCw /> {band ? '…' : 'Tekshirish'}
        </button>
        {!p.isActive && (
          <button type="button" className="btn ikkinchi kichik" disabled={band || !p.apiKeyHint} onClick={onFaol}>
            Faol qilish
          </button>
        )}
        {!p.isActive &&
          (p.fallbackOrder ? (
            <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => onZaxira(null)}>
              Zaxiradan chiqarish
            </button>
          ) : (
            <button type="button" className="btn ikkinchi kichik" disabled={band || !p.apiKeyHint} onClick={() => onZaxira(keyingiNavbat)}>
              Zaxiraga qo'shish
            </button>
          ))}
        <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => setModelOchiq((v) => !v)} aria-expanded={modelOchiq}>
          Model
        </button>
        <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => setKalitOchiq((v) => !v)} aria-expanded={kalitOchiq}>
          <KeyRound /> Kalit
        </button>
        <button type="button" className="bzl-amal bn-uz" disabled={band} onClick={onOchir} aria-label={`${p.label} — o'chirish`}>
          <Trash2 />
        </button>
      </div>
      {modelOchiq && (
        <form
          className="ai-prov-kalit"
          onSubmit={(e) => {
            e.preventDefault();
            if (!model.trim() || !splitTogri) return;
            onModel(model.trim(), split.trim() ? Number(split) : null);
            setModelOchiq(false);
          }}
        >
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} aria-label={`${p.label} — model`} placeholder="model nomi" autoFocus />
          <input className="input" style={{ maxWidth: 170 }} value={split} onChange={(e) => setSplit(e.target.value)} inputMode="numeric" aria-invalid={!splitTogri} aria-label="Bo'lib so'rash" placeholder="bo'lib so'rash" />
          <button type="submit" className="btn kichik" disabled={!model.trim() || !splitTogri}>
            Saqlash va tekshirish
          </button>
        </form>
      )}
      {kalitOchiq && (
        <form
          className="ai-prov-kalit"
          onSubmit={(e) => {
            e.preventDefault();
            if (kalit.trim().length < 8) return;
            onKalit(kalit.trim());
            setKalit('');
            setKalitOchiq(false);
          }}
        >
          <input
            type="password"
            autoComplete="off"
            className="input"
            placeholder="Yangi API kalit"
            value={kalit}
            onChange={(e) => setKalit(e.target.value)}
            aria-label={`${p.label} — yangi API kalit`}
            autoFocus
          />
          <button type="submit" className="btn kichik" disabled={kalit.trim().length < 8}>
            Saqlash va tekshirish
          </button>
        </form>
      )}
    </div>
  );
}

function YangiProvayder({ keyingiNavbat, onQoshildi }: { keyingiNavbat: number | null; onQoshildi: (matn: string, ok: boolean) => Promise<void> }) {
  const [preset, setPreset] = useState<PresetKalit>('groq');
  const [nom, setNom] = useState<string>(PRESETLAR.groq.nom);
  const [kalit, setKalit] = useState('');
  const [baseUrl, setBaseUrl] = useState<string>(PRESETLAR.groq.baseUrl);
  const [model, setModel] = useState<string>(PRESETLAR.groq.model);
  const [split, setSplit] = useState<string>(PRESETLAR.groq.split);
  const [zaxiraga, setZaxiraga] = useState(true);
  const [holat, setHolat] = useState<'tinch' | 'ketmoqda'>('tinch');
  const [xato, setXato] = useState<string | null>(null);

  const tanla = (k: PresetKalit) => {
    const p = PRESETLAR[k];
    setPreset(k);
    setNom(p.nom);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setSplit(p.split);
  };

  const urlTogri = /^https?:\/\/\S+$/.test(baseUrl.trim());
  const splitTogri = split.trim() === '' || (/^\d+$/.test(split.trim()) && Number(split) >= 1 && Number(split) <= 50);
  const tayyor = nom.trim().length >= 2 && kalit.trim().length >= 8 && urlTogri && model.trim().length > 0 && splitTogri;

  const saqla = async () => {
    setHolat('ketmoqda');
    setXato(null);
    try {
      const m = model.trim();
      const yaratildi = await api.post<{ id: string }>('/api/v1/admin/providers', {
        purpose: 'llm',
        kind: 'openai',
        label: nom.trim(),
        apiKey: kalit.trim(),
        baseUrl: baseUrl.trim(),
        models: { stage2: m, stage3: m, playbookBuilder: m, ...(split.trim() ? { splitFields: Number(split) } : {}) },
      });
      setKalit('');
      const t = await api.post<TekshiruvNatija>(`/api/v1/admin/providers/${yaratildi.id}/test`);
      if (t.ok && zaxiraga && keyingiNavbat) {
        await api.patch(`/api/v1/admin/providers/${yaratildi.id}`, { fallbackOrder: keyingiNavbat });
      }
      await onQoshildi(
        t.ok
          ? `${nom.trim()} qo'shildi va ishlayapti (${t.note})${zaxiraga && keyingiNavbat ? ` — zaxira #${keyingiNavbat}` : ''}.`
          : `${nom.trim()} saqlandi, lekin tekshiruv o'tmadi: ${t.problems.join('; ')}. Kalit yoki model nomini tekshirib, «Kalit» orqali almashtiring.`,
        t.ok,
      );
    } catch (e) {
      setXato(xatoMatni(e, 'Saqlanmadi'));
    } finally {
      setHolat('tinch');
    }
  };

  return (
    <form
      className="bn-ulash"
      style={{ marginBottom: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (tayyor) void saqla();
      }}
    >
      <div className="bn-turlar" role="radiogroup" aria-label="Provayder turi">
        {(Object.keys(PRESETLAR) as PresetKalit[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={preset === k} className={`bn-tur${preset === k ? ' faol' : ''}`} onClick={() => tanla(k)}>
            {PRESETLAR[k].nom}
          </button>
        ))}
      </div>
      <div className="yordam">
        {PRESETLAR[preset].izoh} Kalit: <b>{PRESETLAR[preset].kalitJoyi}</b>.
      </div>

      <div className="bzl-forma-panjara bn-ulash-panjara">
        <div className="maydon-blok">
          <label htmlFor="aip-nom">Nomi</label>
          <input id="aip-nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="aip-kalit">API kalit</label>
          <input id="aip-kalit" type="password" autoComplete="off" value={kalit} onChange={(e) => setKalit(e.target.value)} placeholder="Shu yerga joylang" />
        </div>
        <div className="maydon-blok">
          <label htmlFor="aip-model">Model</label>
          <input id="aip-model" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} placeholder="masalan: openai/gpt-oss-120b" />
        </div>
      </div>
      <div className="bzl-forma-panjara bn-ulash-panjara">
        <div className="maydon-blok" style={{ gridColumn: 'span 2' }}>
          <label htmlFor="aip-url">Bazaviy URL</label>
          <input id="aip-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} aria-invalid={!!baseUrl && !urlTogri} placeholder="https://…/v1" />
        </div>
        <div className="maydon-blok">
          <label htmlFor="aip-split">Bo'lib so'rash (ixtiyoriy)</label>
          <input id="aip-split" value={split} onChange={(e) => setSplit(e.target.value)} inputMode="numeric" aria-invalid={!splitTogri} placeholder="zaif modellar uchun 4" />
        </div>
      </div>
      {keyingiNavbat && (
        <label className="ai-prov-belgi">
          <input type="checkbox" checked={zaxiraga} onChange={(e) => setZaxiraga(e.target.checked)} /> Ishlasa, zaxira zanjiriga qo'shish (#{keyingiNavbat})
        </label>
      )}
      {xato && (
        <div className="bzl-izoh xato" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{xato}</span>
        </div>
      )}
      <div>
        <button type="submit" className="btn" disabled={!tayyor || holat === 'ketmoqda'}>
          {holat === 'ketmoqda' ? 'Saqlanmoqda va tekshirilmoqda…' : 'Saqlash va tekshirish'}
        </button>
      </div>
    </form>
  );
}
