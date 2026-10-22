import { Archive, ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { guruhla, MAYDON_TURI_NOMI, useCrm, type BosqichTuri, type Maydon, type MaydonTuri } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';

/** CRM sozlamalari (rahbar): voronka va bosqichlar, qo'shimcha maydonlar. */
export function CrmSozlamalar() {
  const t = useT();
  const [tab, setTab] = useState<'voronka' | 'maydon'>('voronka');
  return (
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <h1>{t('CRM sozlamalari')}</h1>
        <div className="tab-qator" role="tablist">
          <button role="tab" aria-selected={tab === 'voronka'} className={`tab${tab === 'voronka' ? ' active' : ''}`} onClick={() => setTab('voronka')}>
            {t('Voronkalar')}
          </button>
          <button role="tab" aria-selected={tab === 'maydon'} className={`tab${tab === 'maydon' ? ' active' : ''}`} onClick={() => setTab('maydon')}>
            {t('Maydonlar')}
          </button>
        </div>
      </div>
      {tab === 'voronka' ? <Voronkalar /> : <Maydonlar />}
    </div>
  );
}

// ─── Voronka va bosqichlar ───────────────────────────────────────────────────

interface BosqichQoralama {
  id?: string;
  kalit: string;
  name: string;
  color: string;
  kind: BosqichTuri;
}

const TUR_NOMI: Record<BosqichTuri, string> = { open: 'Ochiq', won: 'Muvaffaqiyatli', lost: "Yo'qotilgan" };

function Voronkalar() {
  const { holat, base, yangila } = useCrm();
  const t = useT();
  const [tanlangan, setTanlangan] = useState(holat.pipelines[0]?.id ?? '');
  const voronka = holat.pipelines.find((p) => p.id === tanlangan) ?? holat.pipelines[0]!;
  const [nom, setNom] = useState(voronka.name);
  const [bosqichlar, setBosqichlar] = useState<BosqichQoralama[]>([]);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const [band, setBand] = useState(false);
  const [yangiOyna, setYangiOyna] = useState(false);

  useEffect(() => {
    setNom(voronka.name);
    setBosqichlar(voronka.stages.map((s) => ({ id: s.id, kalit: s.id, name: s.name, color: s.color, kind: s.kind })));
    setXabar(null);
  }, [voronka]);

  const qatorniOzgartir = (i: number, o: Partial<BosqichQoralama>) => setBosqichlar((b) => b.map((x, j) => (j === i ? { ...x, ...o } : x)));
  const siljit = (i: number, d: -1 | 1) =>
    setBosqichlar((b) => {
      const n = [...b];
      const j = i + d;
      if (j < 0 || j >= n.length) return b;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  const saqla = async () => {
    setBand(true);
    setXabar(null);
    try {
      if (nom.trim() && nom.trim() !== voronka.name) await api.patch(`${base}/pipelines/${voronka.id}`, { name: nom.trim() });
      await api.put(`${base}/pipelines/${voronka.id}/stages`, {
        stages: bosqichlar.map((b) => ({ id: b.id, name: b.name.trim(), color: b.color, kind: b.kind })),
      });
      await yangila();
      setXabar({ ok: true, matn: t('Saqlandi') });
    } catch (e) {
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    } finally {
      setBand(false);
    }
  };

  const arxivla = async () => {
    setXabar(null);
    try {
      await api.patch(`${base}/pipelines/${voronka.id}`, { archived: true });
      setTanlangan('');
      await yangila();
    } catch (e) {
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    }
  };

  return (
    <div className="ci-soz-ish">
      <nav className="card ci-soz-royxat" aria-label={t('Voronkalar')}>
        {holat.pipelines.map((p) => (
          <button key={p.id} className={`ci-soz-band${p.id === voronka.id ? ' faol' : ''}`} onClick={() => setTanlangan(p.id)} aria-current={p.id === voronka.id}>
            <span>{p.name}</span>
            <small>{t('{n} ta bosqich', { n: p.stages.length })}</small>
          </button>
        ))}
        <button className="btn ikkinchi kichik" onClick={() => setYangiOyna(true)}>
          <Plus /> {t('Yangi voronka')}
        </button>
      </nav>

      <section className="card ci-blok" aria-labelledby="soz-v">
        <div className="ci-blok-bosh">
          <h2 id="soz-v">{t('Voronka')}</h2>
          {holat.pipelines.length > 1 && (
            <button className="btn ikkinchi kichik" onClick={() => void arxivla()} title={t("Bitimlari saqlanadi, ro'yxatdan yashiriladi")}>
              <Archive /> {t('Arxivlash')}
            </button>
          )}
        </div>
        <div className="maydon-blok">
          <label htmlFor="soz-v-nom">{t('Nomi')}</label>
          <input id="soz-v-nom" className="input" value={nom} maxLength={100} onChange={(e) => setNom(e.target.value)} />
        </div>

        <h3 className="ci-kichik-sarlavha">{t('Bosqichlar')}</h3>
        <p className="yordam">{t("Tartib — Kanban ustunlari tartibi. Kamida bitta ochiq, bitta muvaffaqiyatli va bitta yo'qotilgan bosqich kerak.")}</p>
        <ol className="ci-bosqich-tahrir">
          {bosqichlar.map((b, i) => (
            <li key={b.kalit}>
              <input
                type="color"
                value={b.color}
                onChange={(e) => qatorniOzgartir(i, { color: e.target.value })}
                aria-label={t('Rang')}
                className="ci-rang"
              />
              <input className="input" value={b.name} maxLength={100} onChange={(e) => qatorniOzgartir(i, { name: e.target.value })} aria-label={t('Bosqich nomi')} />
              <select className="input ci-tor" value={b.kind} onChange={(e) => qatorniOzgartir(i, { kind: e.target.value as BosqichTuri })} aria-label={t('Turi')}>
                {(Object.keys(TUR_NOMI) as BosqichTuri[]).map((k) => (
                  <option key={k} value={k}>
                    {t(TUR_NOMI[k])}
                  </option>
                ))}
              </select>
              <span className="ci-qator-amallar">
                <button type="button" className="vr-amal" onClick={() => siljit(i, -1)} disabled={i === 0} aria-label={t('Yuqoriga')}>
                  <ArrowUp />
                </button>
                <button type="button" className="vr-amal" onClick={() => siljit(i, 1)} disabled={i === bosqichlar.length - 1} aria-label={t('Pastga')}>
                  <ArrowDown />
                </button>
                <button
                  type="button"
                  className="vr-amal"
                  onClick={() => setBosqichlar((x) => x.filter((_, j) => j !== i))}
                  disabled={bosqichlar.length <= 2}
                  aria-label={t("O'chirish")}
                >
                  <Trash2 />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <button
          className="btn ikkinchi kichik"
          onClick={() => {
            // Yangi ochiq bosqich — yutuq/yo'qotishdan oldin
            const i = bosqichlar.findIndex((b) => b.kind !== 'open');
            const yangi: BosqichQoralama = { kalit: crypto.randomUUID(), name: t('Yangi bosqich'), color: '#c2e9fb', kind: 'open' };
            setBosqichlar((b) => (i < 0 ? [...b, yangi] : [...b.slice(0, i), yangi, ...b.slice(i)]));
          }}
        >
          <Plus /> {t("Bosqich qo'shish")}
        </button>

        {xabar && (
          <div className={xabar.ok ? 'ok-qator' : 'xato-qator'} role={xabar.ok ? 'status' : 'alert'}>
            {xabar.matn}
          </div>
        )}
        <div className="ci-saqlash-qator">
          <button className="btn" onClick={() => void saqla()} disabled={band}>
            {band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </div>
      </section>

      {yangiOyna && (
        <YangiVoronka
          onYop={() => setYangiOyna(false)}
          onSaqlandi={async (id) => {
            await yangila();
            setTanlangan(id);
          }}
        />
      )}
    </div>
  );
}

function YangiVoronka({ onYop, onSaqlandi }: { onYop: () => void; onSaqlandi: (id: string) => Promise<void> }) {
  const { base } = useCrm();
  const t = useT();
  const [nom, setNom] = useState('');
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const saqla = async () => {
    if (!nom.trim()) return setXato(t('Voronka nomini kiriting'));
    setBand(true);
    try {
      const r = await api.post<{ id: string }>(`${base}/pipelines`, { name: nom.trim() });
      await onSaqlandi(r.id);
      onYop();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };
  return (
    <Oyna
      sarlavha={t('Yangi voronka')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {t('Yaratish')}
          </button>
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="yv-nom">{t('Nomi')}</label>
        <input id="yv-nom" className="input" value={nom} maxLength={100} onChange={(e) => setNom(e.target.value)} />
      </div>
      <p className="vr-oyna-eslatma">{t("Standart bosqichlar bilan yaratiladi — keyin o'zgartirasiz.")}</p>
      {xato && <div className="xato-qator">{xato}</div>}
    </Oyna>
  );
}

// ─── Maydonlar ───────────────────────────────────────────────────────────────

function Maydonlar() {
  const { holat, base, yangila } = useCrm();
  const t = useT();
  const [oyna, setOyna] = useState<Maydon | 'yangi' | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const arxivla = async (m: Maydon) => {
    setXato(null);
    try {
      await api.patch(`${base}/crm-fields/${m.id}`, { archived: true });
      await yangila();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  return (
    <section className="card ci-blok">
      <div className="ci-blok-bosh">
        <h2>{t("Bitimning qo'shimcha maydonlari")}</h2>
        <button className="btn kichik" onClick={() => setOyna('yangi')}>
          <Plus /> {t('Maydon')}
        </button>
      </div>
      {xato && <div className="xato-qator">{xato}</div>}
      {holat.fields.length === 0 && <p className="yordam">{t("Hali maydon yo'q.")}</p>}
      {guruhla(holat.fields).map((g) => (
        <div key={g.nom} className="ci-maydon-guruh">
          <h3 className="ci-kichik-sarlavha">{t(g.nom)}</h3>
          <ul className="ci-royxat">
            {g.maydonlar.map((m) => (
              <li key={m.id} className="ci-royxat-band">
                <span>
                  <b>
                    {m.label}
                    {m.required && <span className="ci-majburiy"> *</span>}
                  </b>
                  <small>
                    {t(MAYDON_TURI_NOMI[m.type])}
                    {m.options.length > 0 && ` · ${t('{n} ta variant', { n: m.options.length })}`}
                  </small>
                </span>
                <span className="ci-qator-amallar">
                  <button className="vr-amal" onClick={() => setOyna(m)} aria-label={t('Tahrirlash')}>
                    <Pencil />
                  </button>
                  <button className="vr-amal" onClick={() => void arxivla(m)} aria-label={t('Arxivlash')} title={t('Arxivlash — eski qiymatlar saqlanadi')}>
                    <Archive />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {oyna && <MaydonOyna m={oyna === 'yangi' ? null : oyna} onYop={() => setOyna(null)} />}
    </section>
  );
}

function MaydonOyna({ m, onYop }: { m: Maydon | null; onYop: () => void }) {
  const { holat, base, yangila } = useCrm();
  const t = useT();
  const [label, setLabel] = useState(m?.label ?? '');
  const [type, setType] = useState<MaydonTuri>(m?.type ?? 'text');
  const [group, setGroup] = useState(m?.groupName ?? '');
  const [required, setRequired] = useState(m?.required ?? false);
  const [variantlar, setVariantlar] = useState<{ id?: string; label: string }[]>(m?.options ?? [{ label: '' }]);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const royxatli = type === 'select' || type === 'multiselect';
  const guruhlar = [...new Set(holat.fields.map((f) => f.groupName).filter(Boolean))] as string[];

  const saqla = async () => {
    if (!label.trim()) return setXato(t('Maydon nomini kiriting'));
    const options = royxatli ? variantlar.filter((v) => v.label.trim()).map((v) => ({ id: v.id, label: v.label.trim() })) : undefined;
    if (royxatli && (!options || options.length === 0)) return setXato(t('Kamida bitta variant kiriting'));
    setBand(true);
    try {
      const body = { label: label.trim(), groupName: group.trim() || null, required, options };
      if (m) await api.patch(`${base}/crm-fields/${m.id}`, body);
      else await api.post(`${base}/crm-fields`, { ...body, type });
      await yangila();
      onYop();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  return (
    <Oyna
      sarlavha={m ? t('Maydonni tahrirlash') : t('Yangi maydon')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="mo-nom">{t('Nomi')}</label>
        <input id="mo-nom" className="input" value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="mo-tur">{t('Turi')}</label>
          <select id="mo-tur" className="input" value={type} disabled={Boolean(m)} onChange={(e) => setType(e.target.value as MaydonTuri)}>
            {(Object.keys(MAYDON_TURI_NOMI) as MaydonTuri[]).map((k) => (
              <option key={k} value={k}>
                {t(MAYDON_TURI_NOMI[k])}
              </option>
            ))}
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor="mo-guruh">{t('Guruh')}</label>
          <input id="mo-guruh" className="input" list="mo-guruhlar" value={group} maxLength={60} onChange={(e) => setGroup(e.target.value)} placeholder={t('Umumiy')} />
          <datalist id="mo-guruhlar">
            {guruhlar.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
      </div>
      {m && <p className="vr-oyna-eslatma">{t("Turi o'zgarmaydi — eski qiymatlar buzilmasligi uchun.")}</p>}
      <label className="ci-belgi">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        <span>{t('Majburiy maydon')}</span>
      </label>
      {royxatli && (
        <div className="maydon-blok">
          <label>{t('Variantlar')}</label>
          <ol className="ci-variantlar">
            {variantlar.map((v, i) => (
              <li key={v.id ?? `y${i}`}>
                <input
                  className="input"
                  value={v.label}
                  maxLength={100}
                  onChange={(e) => setVariantlar((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))}
                  aria-label={t('Variant {n}', { n: i + 1 })}
                />
                <button type="button" className="vr-amal" onClick={() => setVariantlar((x) => x.filter((_, j) => j !== i))} aria-label={t("O'chirish")}>
                  <Trash2 />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn ikkinchi kichik" onClick={() => setVariantlar((x) => [...x, { label: '' }])}>
            <Plus /> {t('Variant')}
          </button>
        </div>
      )}
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}
