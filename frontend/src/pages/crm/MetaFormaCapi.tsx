import { ArrowRightLeft, CircleAlert, CircleCheck, Plus, RotateCcw, Send, Settings2, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, fmtSana } from '../../api';
import { useT } from '../../i18n';
import './meta-forma-capi.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META: FORMALAR va CONVERSIONS API — amoCRM bilan tenglik
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * amoCRM'da Facebook forma oynasi: savol → kontakt/bitim maydoni, boshlang'ich
 * voronka, teg; "Taqsimot" Salesbot'i mas'ulni tayinlaydi. Natijani Meta'ga
 * qaytarish — tashqi CAPI vidjeti (Conversions API). Bu yerda ikkalasi ham —
 * Make yo'li uchun ham, bevosita ulanish uchun ham bitta joyda.
 */

interface Bosqich {
  id: string;
  name: string;
  kind: string;
}
interface Voronka {
  id: string;
  name: string;
  isMain: boolean;
  stages: Bosqich[];
}
interface Maydon {
  id: string;
  label: string;
  type: string;
}
interface Seat {
  id: string;
  displayName: string;
  isActive: boolean;
}
interface Forma {
  id: string;
  formId: string;
  formName: string | null;
  pageName: string | null;
  questions: string[];
  pipelineId: string | null;
  stageId: string | null;
  mapping: Record<string, string>;
  tags: string[];
  sourceName: string | null;
  autoAccept: boolean;
  seatIds: string[];
  leadCount: number;
  lastLeadAt: string | null;
}
interface Qoida {
  id: string;
  pipelineId: string;
  pipelineName: string | null;
  stageId: string;
  stageName: string | null;
  eventName: string;
  sendValue: boolean;
  currency: string;
  active: boolean;
}
interface CapiHolat {
  sozlama: {
    datasetId: string;
    datasetName: string | null;
    tokenHint: string;
    testEventCode: string | null;
    enabled: boolean;
    lastCheckAt: string | null;
    lastCheckOk: boolean | null;
    lastError: string | null;
  } | null;
  qoidalar: Qoida[];
  holatlar: { status: string; reason: string | null; n: number }[];
  oxirgi: { id: string; dealId: string; dealName: string | null; eventName: string; status: string; reason: string | null; matchKeys: string[]; testMode: boolean; eventTime: string; sentAt: string | null }[];
  standartHodisalar: string[];
}

const xatoMatni = (e: unknown, z: string) => (e instanceof ApiError || e instanceof Error ? e.message : z);

/** `qaysi_kurs_sizni_qiziqtiradi?` → `Qaysi kurs sizni qiziqtiradi?` (backend `savolNomi` bilan bir xil). */
const savolNomi = (s: string) => {
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Jurnal sababi — odam tushunadigan matn (Meta xabari bo'lsa — o'zi). */
const SABAB: Record<string, string> = {
  not_configured: 'Conversions API ulanmagan',
  disabled: "Yuborish o'chirilgan",
  no_contact: "Kontaktda telefon, email yoki Meta lead ID yo'q",
  too_old: "7 kundan eski — Meta qabul qilmaydi",
};

export function MetaFormaCapi({ base }: { base: string }) {
  const [voronkalar, setVoronkalar] = useState<Voronka[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  useEffect(() => {
    void api
      .get<{ enabled?: boolean; pipelines?: Voronka[] }>(`${base}/crm-app`)
      .then((h) => setVoronkalar(h.enabled ? (h.pipelines ?? []) : []))
      .catch(() => setVoronkalar([]));
    void api
      .get<Seat[]>(`${base}/seats`)
      .then((r) => setSeats(r.filter((s) => s.isActive)))
      .catch(() => setSeats([]));
  }, [base]);
  return (
    <>
      <FormaBolim base={base} voronkalar={voronkalar} seats={seats} />
      <CapiBolim base={base} voronkalar={voronkalar} />
    </>
  );
}

// ─── Formalar ────────────────────────────────────────────────────────────────

function FormaBolim({ base, voronkalar, seats }: { base: string; voronkalar: Voronka[]; seats: Seat[] }) {
  const t = useT();
  const [d, setD] = useState<{ formalar: Forma[]; maydonlar: Maydon[] } | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [ochiq, setOchiq] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    try {
      setD(await api.get<{ formalar: Forma[]; maydonlar: Maydon[] }>(`${base}/meta-lead-ads/forms`));
      setXato(null);
    } catch (e) {
      setXato(xatoMatni(e, t("Ma'lumotni yuklab bo'lmadi")));
    }
  }, [base, t]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  return (
    <details className="mla-bevosita mfc">
      <summary>
        <b>{t('Formalar: yo‘nalish, maydonlar va taqsimot')}</b>
        <span className="yordam">{t('Har forma qaysi voronkaga tushadi, savollar qaysi maydonga yoziladi, kimga tayinlanadi')}</span>
      </summary>
      <div className="mla-bevosita-ichi">
        {xato && <div className="xato-qator">{xato}</div>}
        {!d ? (
          <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>
        ) : d.formalar.length === 0 ? (
          <div className="yordam">{t('Forma birinchi lid kelganda shu yerda o‘zi paydo bo‘ladi — keyin uni sozlaysiz. Avvalgi lidlarga ta’sir qilmaydi.')}</div>
        ) : (
          <ul className="mfc-royxat">
            {d.formalar.map((f) => (
              <li key={f.id}>
                <div className="mfc-qator">
                  <div className="mfc-nom">
                    <b>{f.formName ?? f.formId}</b>
                    <small>
                      {f.pageName ? `${f.pageName} · ` : ''}
                      {t('{n} ta lid', { n: f.leadCount })}
                      {f.lastLeadAt ? ` · ${t('oxirgisi')} ${fmtSana(f.lastLeadAt)}` : ''}
                    </small>
                    <span className="mfc-belgilar">
                      <span className={`badge ${f.pipelineId ? 'ok' : 'kul'}`}>{voronkalar.find((v) => v.id === f.pipelineId)?.name ?? t('standart voronka')}</span>
                      {f.autoAccept && <span className="badge ok">{t('avto-taqsimot')}</span>}
                      {Object.keys(f.mapping).length > 0 && <span className="badge">{t('{n} ta maydon xaritasi', { n: Object.keys(f.mapping).length })}</span>}
                      {f.tags.map((tg) => (
                        <span key={tg} className="badge kul">
                          #{tg}
                        </span>
                      ))}
                    </span>
                  </div>
                  <button type="button" className="btn ikkinchi kichik" aria-expanded={ochiq === f.id} onClick={() => setOchiq(ochiq === f.id ? null : f.id)}>
                    <Settings2 aria-hidden="true" /> {ochiq === f.id ? t('Yopish') : t('Sozlash')}
                  </button>
                </div>
                {ochiq === f.id && (
                  <FormaTahrir
                    base={base}
                    f={f}
                    maydonlar={d.maydonlar}
                    voronkalar={voronkalar}
                    seats={seats}
                    onSaqlandi={async () => {
                      setOchiq(null);
                      await yukla();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function FormaTahrir({
  base,
  f,
  maydonlar,
  voronkalar,
  seats,
  onSaqlandi,
}: {
  base: string;
  f: Forma;
  maydonlar: Maydon[];
  voronkalar: Voronka[];
  seats: Seat[];
  onSaqlandi: () => Promise<void>;
}) {
  const t = useT();
  const [pipelineId, setPipelineId] = useState(f.pipelineId ?? '');
  const [stageId, setStageId] = useState(f.stageId ?? '');
  const [mapping, setMapping] = useState<Record<string, string>>(f.mapping);
  const [teglar, setTeglar] = useState(f.tags.join(', '));
  const [manba, setManba] = useState(f.sourceName ?? '');
  const [avto, setAvto] = useState(f.autoAccept);
  const [masullar, setMasullar] = useState<string[]>(f.seatIds);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const bosqichlar = voronkalar.find((v) => v.id === pipelineId)?.stages.filter((b) => b.kind === 'open') ?? [];

  const saqla = async () => {
    setBand(true);
    setXato(null);
    try {
      await api.put(`${base}/meta-lead-ads/forms/${f.id}`, {
        pipelineId: pipelineId || null,
        stageId: pipelineId && stageId ? stageId : null,
        mapping,
        tags: teglar
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        sourceName: manba.trim() || null,
        autoAccept: avto,
        seatIds: avto ? masullar : [],
      });
      await onSaqlandi();
    } catch (e) {
      setXato(xatoMatni(e, t('Saqlanmadi')));
      setBand(false);
    }
  };

  return (
    <div className="mfc-tahrir">
      <div className="mfc-panjara">
        <label className="maydon-blok">
          <span>{t('Voronka')}</span>
          <select
            value={pipelineId}
            onChange={(e) => {
              setPipelineId(e.target.value);
              setStageId('');
            }}
          >
            <option value="">{t('Standart (ulanish sozlamasidagi)')}</option>
            {voronkalar.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="maydon-blok">
          <span>{t('Manba nomi')}</span>
          <input value={manba} onChange={(e) => setManba(e.target.value)} placeholder={f.formName ?? ''} maxLength={120} />
        </label>
        <label className="maydon-blok">
          <span>{t('Teglar (vergul bilan)')}</span>
          <input value={teglar} onChange={(e) => setTeglar(e.target.value)} placeholder="IT KIDS, Facebook" />
        </label>
      </div>

      <div className="mfc-blok">
        <b>{t('Savollar → CRM')}</b>
        <span className="yordam">{t('Ism, telefon va email standart savollari o‘zi taniladi; o‘zbekcha «Ismingiz?», «Telefon raqamingiz?» ham. Qolgan javoblar doim izohda ham saqlanadi.')}</span>
        {f.questions.length === 0 ? (
          <span className="yordam">{t('Savollar birinchi lid bilan keladi.')}</span>
        ) : (
          <div className="mfc-xarita">
            {f.questions.map((q) => (
              <label key={q} className="mfc-xarita-qator">
                <span>{savolNomi(q)}</span>
                <ArrowRightLeft aria-hidden="true" />
                <select
                  value={mapping[q] ?? 'note'}
                  onChange={(e) =>
                    setMapping((m) => {
                      const n = { ...m };
                      if (e.target.value === 'note') delete n[q];
                      else n[q] = e.target.value;
                      return n;
                    })
                  }
                >
                  <option value="note">{t('Izohga (avtomatik aniqlash)')}</option>
                  <option value="contact:name">{t('Kontakt: ism')}</option>
                  <option value="contact:phone">{t('Kontakt: telefon')}</option>
                  <option value="contact:email">{t('Kontakt: email')}</option>
                  {maydonlar.length > 0 && (
                    <optgroup label={t('Bitim maydonlari')}>
                      {maydonlar.map((m) => (
                        <option key={m.id} value={`field:${m.id}`}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mfc-blok">
        <label className="mfc-belgi">
          <input type="checkbox" checked={avto} onChange={(e) => setAvto(e.target.checked)} />
          <span>
            <b>{t('Kelishi bilan bitim yaratish va mas’ul tayinlash')}</b>
            <small>{t('amoCRM’dagi «Taqsimot» boti kabi: lid «Saralanmagan»da kutmaydi, mas’ullar navbat bilan beriladi.')}</small>
          </span>
        </label>
        {avto && (
          <div className="mfc-panjara">
            <label className="maydon-blok">
              <span>{t('Bosqich')}</span>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} disabled={!pipelineId}>
                <option value="">{pipelineId ? t('Voronkaning birinchi bosqichi') : t('Avval voronka tanlang')}</option>
                {bosqichlar.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="maydon-blok mfc-keng">
              <span>{t('Mas’ullar navbati')}</span>
              <div className="mfc-masullar">
                {seats.length === 0 && <span className="yordam">{t('Menejerlar yo‘q')}</span>}
                {seats.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={masullar.includes(s.id)}
                      onChange={(e) => setMasullar((m) => (e.target.checked ? [...m, s.id] : m.filter((x) => x !== s.id)))}
                    />
                    {s.displayName}
                  </label>
                ))}
              </div>
              <span className="yordam">{t('Hech kim tanlanmasa — CRM’ning umumiy navbati.')}</span>
            </div>
          </div>
        )}
      </div>

      {xato && <div className="xato-qator">{xato}</div>}
      <div className="crm-tugmalar">
        <button type="button" className="btn" disabled={band} onClick={() => void saqla()}>
          {band ? t('Saqlanmoqda…') : t('Saqlash')}
        </button>
      </div>
    </div>
  );
}

// ─── Conversions API ─────────────────────────────────────────────────────────

function CapiBolim({ base, voronkalar }: { base: string; voronkalar: Voronka[] }) {
  const t = useT();
  const [h, setH] = useState<CapiHolat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const [band, setBand] = useState(false);
  const [tahrir, setTahrir] = useState(false);
  const [dataset, setDataset] = useState('');
  const [token, setToken] = useState('');
  const [testKod, setTestKod] = useState('');
  const [yangi, setYangi] = useState({ pipelineId: '', stageId: '', eventName: 'Purchase', sendValue: true, currency: 'UZS' });

  const yukla = useCallback(async () => {
    try {
      const r = await api.get<CapiHolat>(`${base}/meta-capi`);
      setH(r);
      setDataset(r.sozlama?.datasetId ?? '');
      setTestKod(r.sozlama?.testEventCode ?? '');
      setXato(null);
    } catch (e) {
      setXato(xatoMatni(e, t("Ma'lumotni yuklab bo'lmadi")));
    }
  }, [base, t]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  const amal = async (fn: () => Promise<unknown>, ok?: string) => {
    setBand(true);
    setXabar(null);
    try {
      await fn();
      if (ok) setXabar({ ok: true, matn: ok });
      await yukla();
      return true;
    } catch (e) {
      setXabar({ ok: false, matn: xatoMatni(e, t('Bajarilmadi')) });
      return false;
    } finally {
      setBand(false);
    }
  };

  const sozla = (enabled: boolean, yangiToken?: string) =>
    amal(
      () => api.put(`${base}/meta-capi`, { datasetId: dataset.trim(), token: yangiToken?.trim() || null, testEventCode: testKod.trim() || null, enabled }),
      t('Saqlandi — token va dataset Meta’da tekshirildi.'),
    );

  const sanoq = useMemo(() => {
    const s = { sent: 0, skipped: 0, failed: 0, queued: 0 };
    for (const x of h?.holatlar ?? []) if (x.status in s) s[x.status as keyof typeof s] += x.n;
    return s;
  }, [h]);

  const yangiBosqichlar = voronkalar.find((v) => v.id === yangi.pipelineId)?.stages ?? [];
  const tanlanganBosqich = yangiBosqichlar.find((b) => b.id === yangi.stageId);
  const leadTolovda = yangi.eventName === 'Lead' && tanlanganBosqich?.kind === 'won';
  const s = h?.sozlama;

  return (
    <details className="mla-bevosita mfc">
      <summary>
        <b>{t('Natijani Meta’ga qaytarish (Conversions API)')}</b>
        <span className="yordam">{t('Bitim bosqichga kirganda Meta’ga hodisa yuboriladi — reklama sifatli lid va to‘lov bo‘yicha optimallashadi')}</span>
      </summary>
      <div className="mla-bevosita-ichi">
        {xato && <div className="xato-qator">{xato}</div>}
        {xabar && (
          <div className={xabar.ok ? 'ok-qator' : 'xato-qator'} role={xabar.ok ? 'status' : 'alert'}>
            {xabar.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />} {xabar.matn}
          </div>
        )}
        {!h ? (
          <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>
        ) : (
          <>
            {s && !tahrir ? (
              <div className="mfc-qator">
                <div className="mfc-nom">
                  <b>{s.datasetName ?? t('Dataset')}</b>
                  <small>
                    ID {s.datasetId} · {t('token')} {s.tokenHint}
                    {s.testEventCode ? ` · ${t('sinov rejimi')} (${s.testEventCode})` : ''}
                  </small>
                  {s.lastCheckOk === false && s.lastError && <small className="mla-qizil">{s.lastError}</small>}
                </div>
                <span className={`badge ${!s.enabled ? 'kul' : s.lastCheckOk === false ? 'qizil' : 'ok'}`}>{!s.enabled ? t('o‘chiq') : s.lastCheckOk === false ? t('xato') : t('ulangan')}</span>
                <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => void sozla(!s.enabled)}>
                  {s.enabled ? t('O‘chirish##holat') : t('Yoqish')}
                </button>
                <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => setTahrir(true)}>
                  {t('Almashtirish')}
                </button>
                <button
                  type="button"
                  className="bzl-amal bn-uz"
                  disabled={band}
                  aria-label={t('Uzish')}
                  onClick={() => {
                    if (window.confirm(t('Conversions API uzilsinmi? Qoidalar va jurnal saqlanadi.'))) void amal(() => api.del(`${base}/meta-capi`));
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ) : (
              <form
                className="mfc-tahrir"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sozla(true, token).then((ok) => {
                    if (ok) {
                      setToken('');
                      setTahrir(false);
                    }
                  });
                }}
              >
                <span className="yordam">{t('Events Manager → Data sources → dataset (Pixel) → Settings → Conversions API → «Generate access token». Token shifrlangan saqlanadi va qayta ko‘rsatilmaydi.')}</span>
                <div className="mfc-panjara">
                  <label className="maydon-blok">
                    <span>{t('Dataset (Pixel) ID')}</span>
                    <input value={dataset} onChange={(e) => setDataset(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="123456789012345" />
                  </label>
                  <label className="maydon-blok">
                    <span>{s ? t('Yangi token (bo‘sh — eskisi qoladi)') : t('Access token')}</span>
                    <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
                  </label>
                  <label className="maydon-blok">
                    <span>{t('Test event code (ixtiyoriy)')}</span>
                    <input value={testKod} onChange={(e) => setTestKod(e.target.value)} placeholder="TEST12345" />
                  </label>
                </div>
                <div className="crm-tugmalar">
                  <button type="submit" className="btn" disabled={band || dataset.length < 5 || (!s && token.trim().length < 20)}>
                    {band ? t('Tekshirilmoqda…') : t('Saqlash va tekshirish')}
                  </button>
                  {s && (
                    <button type="button" className="btn ikkinchi" onClick={() => setTahrir(false)}>
                      {t('Bekor qilish')}
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="mfc-blok">
              <b>{t('Qoidalar: bosqich → hodisa')}</b>
              {h.qoidalar.length === 0 ? (
                <span className="yordam">{t('Qoida yo‘q — hech narsa yuborilmaydi.')}</span>
              ) : (
                <ul className="mfc-qoidalar">
                  {h.qoidalar.map((q) => (
                    <li key={q.id} className={q.active ? undefined : 'ochiq-emas'}>
                      <span>
                        {q.pipelineName} → <b>{q.stageName}</b>
                      </span>
                      <Send aria-hidden="true" />
                      <b>{q.eventName}</b>
                      {q.sendValue && <span className="badge">{t('summa')} {q.currency}</span>}
                      <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => void amal(() => api.patch(`${base}/meta-capi/rules/${q.id}`, { active: !q.active }))}>
                        {q.active ? t('O‘chirish##holat') : t('Yoqish')}
                      </button>
                      <button type="button" className="bzl-amal bn-uz" disabled={band} aria-label={t('O‘chirish')} onClick={() => void amal(() => api.del(`${base}/meta-capi/rules/${q.id}`))}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mfc-panjara mfc-qoida-qosh">
                <label className="maydon-blok">
                  <span>{t('Voronka')}</span>
                  <select value={yangi.pipelineId} onChange={(e) => setYangi({ ...yangi, pipelineId: e.target.value, stageId: '' })}>
                    <option value="">—</option>
                    {voronkalar.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="maydon-blok">
                  <span>{t('Bosqich')}</span>
                  <select value={yangi.stageId} onChange={(e) => setYangi({ ...yangi, stageId: e.target.value })} disabled={!yangi.pipelineId}>
                    <option value="">—</option>
                    {yangiBosqichlar.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="maydon-blok">
                  <span>{t('Meta hodisasi')}</span>
                  <input list="mfc-hodisalar" value={yangi.eventName} onChange={(e) => setYangi({ ...yangi, eventName: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} />
                  <datalist id="mfc-hodisalar">
                    {h.standartHodisalar.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </label>
                <label className="mfc-belgi">
                  <input type="checkbox" checked={yangi.sendValue} onChange={(e) => setYangi({ ...yangi, sendValue: e.target.checked })} />
                  <span>{t('Bitim summasini yuborish')}</span>
                </label>
                <button
                  type="button"
                  className="btn ikkinchi"
                  disabled={band || !yangi.stageId || yangi.eventName.length < 2}
                  onClick={() =>
                    void amal(() => api.post(`${base}/meta-capi/rules`, yangi), t('Qoida qo‘shildi. Bundan oldin bosqichga kirgan bitimlar yuborilmaydi.')).then((ok) => {
                      if (ok) setYangi({ ...yangi, stageId: '' });
                    })
                  }
                >
                  <Plus aria-hidden="true" /> {t('Qo‘shish')}
                </button>
              </div>
              {leadTolovda && (
                <div className="bzl-izoh" role="status">
                  <TriangleAlert aria-hidden="true" />
                  <span>{t('To‘lov (yutuq) bosqichi uchun odatda «Purchase» tanlanadi. «Lead» — ariza bosqichlari uchun; aks holda Meta to‘lovni yangi lid deb hisoblaydi.')}</span>
                </div>
              )}
            </div>

            <div className="mfc-blok">
              <b>{t('Jurnal (30 kun)')}</b>
              <div className="mfc-sanoq">
                <span className="badge ok">{t('yuborildi')}: {sanoq.sent}</span>
                <span className="badge kul">{t('o‘tkazildi')}: {sanoq.skipped}</span>
                <span className={`badge ${sanoq.failed ? 'qizil' : 'kul'}`}>{t('xato')}: {sanoq.failed}</span>
                {sanoq.queued > 0 && <span className="badge">{t('navbatda')}: {sanoq.queued}</span>}
                {(sanoq.failed > 0 || sanoq.skipped > 0) && (
                  <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => void amal(async () => {
                    const r = await api.post<{ qaytarildi: number }>(`${base}/meta-capi/resend`);
                    setXabar({ ok: true, matn: t('{n} ta hodisa qayta navbatga qo‘yildi', { n: r.qaytarildi }) });
                  })}>
                    <RotateCcw aria-hidden="true" /> {t('Qayta yuborish')}
                  </button>
                )}
              </div>
              {h.oxirgi.length > 0 && (
                <table className="mfc-jadval">
                  <thead>
                    <tr>
                      <th>{t('Bitim')}</th>
                      <th>{t('Hodisa')}</th>
                      <th>{t('Holat')}</th>
                      <th>{t('Vaqt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.oxirgi.map((e) => (
                      <tr key={e.id}>
                        <td>{e.dealName ?? '—'}</td>
                        <td>
                          {e.eventName}
                          {e.testMode && <small> · {t('sinov')}</small>}
                        </td>
                        <td>
                          <span className={`badge ${e.status === 'sent' ? 'ok' : e.status === 'failed' ? 'qizil' : 'kul'}`}>
                            {e.status === 'sent' ? t('yuborildi') : e.status === 'failed' ? t('xato') : e.status === 'skipped' ? t('o‘tkazildi') : t('navbatda')}
                          </span>
                          {e.reason && <small className="mfc-sabab">{t(SABAB[e.reason] ?? e.reason)}</small>}
                          {e.status === 'sent' && e.matchKeys.length > 0 && <small className="mfc-sabab">{e.matchKeys.join(', ')}</small>}
                        </td>
                        <td>{fmtSana(e.sentAt ?? e.eventTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="yordam">
              {t('Telefon, email va ism Meta’ga faqat SHA-256 xeshi bilan ketadi. Lead Ads orqali kelgan bitimlarda Meta lead ID ham yuboriladi — moslash eng aniq bo‘ladi.')}
            </p>
          </>
        )}
      </div>
    </details>
  );
}
