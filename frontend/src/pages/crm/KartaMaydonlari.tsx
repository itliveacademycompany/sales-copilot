import { Check, ChevronDown, GripVertical, Lock, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../api';
import { MAYDON_TURI_NOMI, MaydonKiritish, qiymatMatni, useCrm, type Maydon } from '../../crm/malumot';
import { useT } from '../../i18n';
import { MaydonOyna } from './CrmSozlamalar';
import './karta-maydonlari.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID KARTASI MAYDONLARI — amoCRM namunasida, dinamik guruhlar bilan
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tepada: mas'ul, summa va guruhsiz maydonlar. Ostida guruhlar (masalan
 * "Call-Center", "Adminstratsiya") — har biri ochilib-yopiladi, holati
 * brauzerda eslab qolinadi.
 *
 * "Maydonlarni sozlash" (rahbar): guruh qo'shish / nomlash / o'chirish va
 * sudrab tartiblash, maydon qo'shish / tahrirlash / o'chirish va sudrab
 * boshqa guruhga yoki boshqa o'ringa o'tkazish. Tuzilma darhol saqlanadi
 * (`PUT /crm-fields/layout`) — qiymatlar esa odatdagidek avtosaqlash bilan.
 */

const YOPIQ_KALIT = 'sotuvai-bk-yopiq-guruhlar';

interface Blok {
  /** `null` — tepadagi guruhsiz maydonlar. */
  guruh: string | null;
  ids: string[];
}

function yopiqlarniOl(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(YOPIQ_KALIT) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Guruhlar tartibi: sozlamadagi ro'yxat, keyin u yerda yo'q guruhlar (maydon tartibi bo'yicha). */
function bloklarniYasa(maydonlar: Maydon[], guruhTartibi: string[]): Blok[] {
  const tartiblangan = [...maydonlar].sort((a, b) => a.sort - b.sort);
  const guruhlar = [...guruhTartibi];
  for (const m of tartiblangan) {
    const g = m.groupName?.trim();
    if (g && !guruhlar.includes(g)) guruhlar.push(g);
  }
  return [
    { guruh: null, ids: tartiblangan.filter((m) => !m.groupName?.trim()).map((m) => m.id) },
    ...guruhlar.map((g) => ({ guruh: g, ids: tartiblangan.filter((m) => m.groupName?.trim() === g).map((m) => m.id) })),
  ];
}

export function KartaMaydonlari<Q extends { amount: string; responsibleSeatId: string; fields: Record<string, unknown> }>({
  qoralama,
  setQoralama,
  yozaOladi,
  sinx,
  tovarli,
  masul,
}: {
  qoralama: Q;
  setQoralama: (q: Q) => void;
  yozaOladi: boolean;
  /** Tashqi CRM nomi (sinxronlanadigan bitim) — unda tashqi maydonlar faqat o'qiladi. */
  sinx: string | null | undefined;
  tovarli: boolean;
  masul: { id: string; name: string } | null;
}) {
  const { holat, base, seatlar, yangila } = useCrm();
  const t = useT();
  const sozlay = holat.canConfigure;
  const [sozlash, setSozlash] = useState(false);
  const [yopiq, setYopiq] = useState<Set<string>>(yopiqlarniOl);
  const [mahalliy, setMahalliy] = useState<Blok[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [oyna, setOyna] = useState<{ m: Maydon | null; guruh: string | null } | null>(null);
  const [ochirish, setOchirish] = useState<string | null>(null);
  const [guruhOchirish, setGuruhOchirish] = useState<string | null>(null);
  const [nomlash, setNomlash] = useState<{ eski: string | null; nom: string } | null>(null);
  const [band, setBand] = useState(false);

  const asl = useMemo(() => bloklarniYasa(holat.fields, holat.fieldGroups ?? []), [holat.fields, holat.fieldGroups]);
  const bloklar = mahalliy ?? asl;
  useEffect(() => setMahalliy(null), [asl]);
  const maydon = (id: string) => holat.fields.find((m) => m.id === id);

  const almashtir = (g: string) =>
    setYopiq((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      try {
        localStorage.setItem(YOPIQ_KALIT, JSON.stringify([...n]));
      } catch {
        /* ixtiyoriy */
      }
      return n;
    });

  /** Tuzilmani saqlash: guruhlar tartibi va har maydonning guruhi/o'rni. */
  const tuzilmaniSaqla = async (yangi: Blok[]) => {
    setMahalliy(yangi);
    setXato(null);
    try {
      let tartib = 0;
      await api.put(`${base}/crm-fields/layout`, {
        groups: yangi.filter((b) => b.guruh).map((b) => b.guruh),
        fields: yangi.flatMap((b) => b.ids.map((id) => ({ id, groupName: b.guruh, sort: tartib++ }))),
      });
      await yangila();
    } catch (e) {
      setMahalliy(null);
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  // ─── Sudrab tartiblash ───
  const sudralayotgan = useRef<{ tur: 'maydon'; id: string } | { tur: 'guruh'; nom: string } | null>(null);
  const [ustida, setUstida] = useState<string | null>(null);
  const tashla = (maqsad: { guruh: string | null; oldidan?: string }) => {
    const s = sudralayotgan.current;
    sudralayotgan.current = null;
    setUstida(null);
    if (!s) return;
    if (s.tur === 'maydon') {
      if (s.id === maqsad.oldidan) return;
      const yangi = bloklar.map((b) => ({ ...b, ids: b.ids.filter((x) => x !== s.id) }));
      const blok = yangi.find((b) => b.guruh === maqsad.guruh);
      if (!blok) return;
      const i = maqsad.oldidan ? blok.ids.indexOf(maqsad.oldidan) : -1;
      if (i >= 0) blok.ids.splice(i, 0, s.id);
      else blok.ids.push(s.id);
      void tuzilmaniSaqla(yangi);
    } else if (maqsad.guruh && s.nom !== maqsad.guruh) {
      const yangi = [...bloklar];
      const i = yangi.findIndex((b) => b.guruh === s.nom);
      const [b] = yangi.splice(i, 1);
      const j = yangi.findIndex((x) => x.guruh === maqsad.guruh);
      yangi.splice(j, 0, b!);
      void tuzilmaniSaqla(yangi);
    }
  };

  // ─── Guruh amallari ───
  const guruhNomla = async () => {
    if (!nomlash) return;
    const nom = nomlash.nom.trim();
    if (!nom) return setNomlash(null);
    if (bloklar.some((b) => b.guruh === nom && b.guruh !== nomlash.eski)) {
      setXato(t('Bunday guruh bor'));
      return;
    }
    setNomlash(null);
    if (nomlash.eski === null) await tuzilmaniSaqla([...bloklar, { guruh: nom, ids: [] }]);
    else if (nom !== nomlash.eski) await tuzilmaniSaqla(bloklar.map((b) => (b.guruh === nomlash.eski ? { ...b, guruh: nom } : b)));
  };
  const guruhniOchir = async (nom: string) => {
    // Maydonlar o'chmaydi — tepadagi guruhsiz qismga o'tadi
    const blok = bloklar.find((b) => b.guruh === nom);
    const yangi = bloklar.filter((b) => b.guruh !== nom).map((b) => (b.guruh === null ? { ...b, ids: [...b.ids, ...(blok?.ids ?? [])] } : b));
    setGuruhOchirish(null);
    await tuzilmaniSaqla(yangi);
  };

  const maydonniOchir = async (m: Maydon) => {
    setBand(true);
    setXato(null);
    try {
      await api.patch(`${base}/crm-fields/${m.id}`, { archived: true });
      await yangila();
      setOchirish(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("O'chirib bo'lmadi"));
    } finally {
      setBand(false);
    }
  };

  // ─── Bitta maydon qatori ───
  const qator = (m: Maydon, guruh: string | null) => {
    const tashqi = Boolean(sinx && m.external);
    if (sozlash) {
      if (ochirish === m.id) {
        return (
          <div key={m.id} className="km-tasdiq" role="alertdialog" aria-label={t("Maydonni o'chirish")}>
            <p>{t("«{m}» maydoni o'chirilsinmi?", { m: m.label })}</p>
            <small>{t("Kartalardan yo'qoladi; avval kiritilgan qiymatlar bazada saqlanadi va sozlamalardan qaytarish mumkin.")}</small>
            <div className="km-tasdiq-tugmalar">
              <button type="button" className="btn ikkinchi kichik" onClick={() => setOchirish(null)} disabled={band}>
                {t('Bekor qilish')}
              </button>
              <button type="button" className="btn kichik km-xavfli" onClick={() => void maydonniOchir(m)} disabled={band}>
                <Trash2 /> {t("O'chirish")}
              </button>
            </div>
          </div>
        );
      }
      return (
        <div
          key={m.id}
          className={`km-qator sozlash${ustida === m.id ? ' ustida' : ''}`}
          draggable={!m.external}
          onDragStart={(e) => {
            sudralayotgan.current = { tur: 'maydon', id: m.id };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', m.id);
          }}
          onDragOver={(e) => {
            if (sudralayotgan.current?.tur !== 'maydon') return;
            e.preventDefault();
            e.stopPropagation();
            setUstida(m.id);
          }}
          onDragLeave={() => setUstida((x) => (x === m.id ? null : x))}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            tashla({ guruh, oldidan: m.id });
          }}
        >
          <span className="km-tutqich" aria-hidden="true">
            {m.external ? <Lock /> : <GripVertical />}
          </span>
          <span className="km-nom">
            <b>
              {m.label}
              {m.required && <span className="ci-majburiy"> *</span>}
            </b>
            <small>{t(MAYDON_TURI_NOMI[m.type])}</small>
          </span>
          {!m.external ? (
            <span className="km-amallar">
              <button type="button" className="km-amal" onClick={() => setOyna({ m, guruh })} aria-label={t('{m} — tahrirlash', { m: m.label })} title={t('Tahrirlash')}>
                <Pencil />
              </button>
              <button type="button" className="km-amal xavfli" onClick={() => setOchirish(m.id)} aria-label={t('{m} — o‘chirish', { m: m.label })} title={t("O'chirish")}>
                <Trash2 />
              </button>
            </span>
          ) : (
            <small className="km-sinx" title={t('{crm} dan sinxronlanadi', { crm: sinx ?? holat.externalSync ?? 'CRM' })}>
              {sinx ?? holat.externalSync}
            </small>
          )}
        </div>
      );
    }
    return (
      <div className="ms-maydon" key={m.id}>
        <label htmlFor={`bk-${m.id}`} title={m.label}>
          {m.label}
          {m.required && <span className="ci-majburiy"> *</span>}
        </label>
        {tashqi ? (
          <span className="ms-maydon-qiymat" title={t('{crm} da o‘zgartiriladi', { crm: sinx ?? 'CRM' })}>
            {qiymatMatni(m, qoralama.fields[m.id], t, seatlar)}
          </span>
        ) : (
          <MaydonKiritish ixcham id={`bk-${m.id}`} m={m} qiymat={qoralama.fields[m.id]} onChange={(v) => setQoralama({ ...qoralama, fields: { ...qoralama.fields, [m.id]: v } })} />
        )}
      </div>
    );
  };

  const toldirilgan = (ids: string[]) => ids.filter((id) => qoralama.fields[id] !== null && qoralama.fields[id] !== undefined && qoralama.fields[id] !== '').length;
  const qoshTugma = (guruh: string | null) => (
    <button type="button" className="km-qosh" onClick={() => setOyna({ m: null, guruh })}>
      <Plus aria-hidden="true" /> {t("Maydon qo'shish")}
    </button>
  );

  return (
    <div className={`km${sozlash ? ' sozlashda' : ''}`}>
      {sozlay && (
        <div className="km-asboblar">
          {sozlash ? (
            <>
              <span className="km-rejim">{t("Maydonlarni sudrab tartiblang yoki boshqa guruhga o'tkazing")}</span>
              <button type="button" className="btn kichik" onClick={() => (setSozlash(false), setOchirish(null), setNomlash(null))}>
                <Check /> {t('Tayyor')}
              </button>
            </>
          ) : (
            <button type="button" className="km-sozla" onClick={() => setSozlash(true)} title={t('Guruh va maydonlarni qo‘shish, tahrirlash, o‘chirish')}>
              <Settings2 aria-hidden="true" /> {t('Maydonlarni sozlash')}
            </button>
          )}
        </div>
      )}
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}

      {/* Tepa: mas'ul, summa, guruhsiz maydonlar */}
      <fieldset disabled={!yozaOladi && !sozlash} className="ms-maydonlar km-tepa">
        {!sozlash && (
          <>
            <div className="ms-maydon">
              <label htmlFor="bk-masul">{t("Mas'ul xodim")}</label>
              {holat.canManageAll && !sinx ? (
                <select id="bk-masul" className="input" value={qoralama.responsibleSeatId} onChange={(e) => setQoralama({ ...qoralama, responsibleSeatId: e.target.value })}>
                  <option value="">···</option>
                  {seatlar.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                  {masul && !seatlar.some((s) => s.id === masul.id) && <option value={masul.id}>{masul.name}</option>}
                </select>
              ) : (
                <span className="ms-maydon-qiymat">{masul?.name ?? '—'}</span>
              )}
            </div>
            <div className="ms-maydon">
              <label htmlFor="bk-summa">{t('Summa')}</label>
              <input
                id="bk-summa"
                className="input"
                inputMode="decimal"
                value={qoralama.amount}
                placeholder="···"
                readOnly={tovarli || Boolean(sinx)}
                title={tovarli ? t('Summa tovarlardan hisoblanadi') : undefined}
                onChange={(e) => setQoralama({ ...qoralama, amount: e.target.value.replace(/[^\d.,\s]/g, '') })}
              />
            </div>
          </>
        )}
        <div
          className={`km-tepa-ichi${ustida === '__tepa' ? ' ustida' : ''}`}
          onDragOver={(e) => {
            if (!sozlash || sudralayotgan.current?.tur !== 'maydon') return;
            e.preventDefault();
            setUstida('__tepa');
          }}
          onDrop={(e) => {
            e.preventDefault();
            tashla({ guruh: null });
          }}
        >
          {bloklar[0]?.ids.map((id) => {
            const m = maydon(id);
            return m ? qator(m, null) : null;
          })}
          {sozlash && bloklar[0]?.ids.length === 0 && <p className="km-bosh">{t("Guruhsiz maydonlar shu yerda — maydonni sudrab tashlang")}</p>}
        </div>
        {sozlash && qoshTugma(null)}
      </fieldset>

      {/* Guruhlar */}
      {bloklar.slice(1).map((b) => {
        const g = b.guruh!;
        const ochiq = sozlash || !yopiq.has(g);
        if (guruhOchirish === g) {
          return (
            <div key={g} className="km-tasdiq" role="alertdialog" aria-label={t("Guruhni o'chirish")}>
              <p>{t("«{g}» guruhi o'chirilsinmi?", { g })}</p>
              <small>
                {b.ids.length
                  ? t("Ichidagi {n} ta maydon o'chmaydi — tepadagi guruhsiz qismga o'tadi.", { n: b.ids.length })
                  : t("Guruh bo'sh.")}
              </small>
              <div className="km-tasdiq-tugmalar">
                <button type="button" className="btn ikkinchi kichik" onClick={() => setGuruhOchirish(null)}>
                  {t('Bekor qilish')}
                </button>
                <button type="button" className="btn kichik km-xavfli" onClick={() => void guruhniOchir(g)}>
                  <Trash2 /> {t("O'chirish")}
                </button>
              </div>
            </div>
          );
        }
        return (
          <section
            key={g}
            className={`km-guruh${ochiq ? ' ochiq' : ''}${ustida === `g:${g}` ? ' ustida' : ''}`}
            onDragOver={(e) => {
              if (!sozlash || !sudralayotgan.current) return;
              e.preventDefault();
              setUstida(`g:${g}`);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setUstida((x) => (x === `g:${g}` ? null : x));
            }}
            onDrop={(e) => {
              e.preventDefault();
              tashla({ guruh: g });
            }}
          >
            <header className="km-guruh-bosh">
              {sozlash && (
                <span
                  className="km-tutqich"
                  draggable
                  onDragStart={(e) => {
                    sudralayotgan.current = { tur: 'guruh', nom: g };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', g);
                  }}
                  title={t('Sudrab guruh tartibini almashtiring')}
                  aria-hidden="true"
                >
                  <GripVertical />
                </span>
              )}
              {nomlash?.eski === g ? (
                <input
                  className="input km-guruh-input"
                  autoFocus
                  value={nomlash.nom}
                  maxLength={60}
                  onChange={(e) => setNomlash({ eski: g, nom: e.target.value })}
                  onBlur={() => void guruhNomla()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void guruhNomla();
                    if (e.key === 'Escape') setNomlash(null);
                  }}
                  aria-label={t('Guruh nomi')}
                />
              ) : (
                <button type="button" className="km-guruh-tugma" onClick={() => !sozlash && almashtir(g)} aria-expanded={ochiq} disabled={sozlash}>
                  <span className="km-guruh-nom">{g}</span>
                  {!sozlash && b.ids.length > 0 && (
                    <small>
                      {toldirilgan(b.ids)}/{b.ids.length}
                    </small>
                  )}
                  {!sozlash && <ChevronDown className="km-chevron" aria-hidden="true" />}
                </button>
              )}
              {sozlash && nomlash?.eski !== g && (
                <span className="km-amallar">
                  <button type="button" className="km-amal" onClick={() => setNomlash({ eski: g, nom: g })} aria-label={t('{g} — nomini o‘zgartirish', { g })} title={t('Nomini o‘zgartirish')}>
                    <Pencil />
                  </button>
                  <button type="button" className="km-amal xavfli" onClick={() => setGuruhOchirish(g)} aria-label={t('{g} — o‘chirish', { g })} title={t("Guruhni o'chirish")}>
                    <Trash2 />
                  </button>
                </span>
              )}
            </header>
            {ochiq && (
              <fieldset disabled={!yozaOladi && !sozlash} className="ms-maydonlar km-guruh-ichi">
                {b.ids.map((id) => {
                  const m = maydon(id);
                  return m ? qator(m, g) : null;
                })}
                {b.ids.length === 0 && <p className="km-bosh">{sozlash ? t('Bo‘sh guruh — maydon qo‘shing yoki sudrab tashlang') : t("Bu guruhda hali maydon yo'q")}</p>}
                {sozlash && qoshTugma(g)}
              </fieldset>
            )}
          </section>
        );
      })}

      {sozlash &&
        (nomlash?.eski === null ? (
          <div className="km-yangi-guruh">
            <input
              className="input"
              autoFocus
              value={nomlash.nom}
              maxLength={60}
              placeholder={t('Guruh nomi, masalan: Call-Center')}
              onChange={(e) => setNomlash({ eski: null, nom: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void guruhNomla();
                if (e.key === 'Escape') setNomlash(null);
              }}
              aria-label={t('Guruh nomi')}
            />
            <button type="button" className="km-amal asosiy" onClick={() => void guruhNomla()} aria-label={t('Qo‘shish')} title={t('Qo‘shish')} disabled={!nomlash.nom.trim()}>
              <Check />
            </button>
            <button type="button" className="km-amal" onClick={() => setNomlash(null)} aria-label={t('Bekor qilish')} title={t('Bekor qilish')}>
              <X />
            </button>
          </div>
        ) : (
          <button type="button" className="km-guruh-qosh" onClick={() => setNomlash({ eski: null, nom: '' })}>
            <Plus aria-hidden="true" /> {t("Guruh qo'shish")}
          </button>
        ))}

      {oyna && <MaydonOyna m={oyna.m} guruh={oyna.guruh} onYop={() => setOyna(null)} />}
    </div>
  );
}

