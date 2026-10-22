import { Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../../api';
import { useCrm } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';

/** CSV o'quvchi: qo'shtirnoqli kataklar, ajratuvchi avtomatik (`,` `;` tab). */
export function csvOqi(matn: string): string[][] {
  const toza = matn.replace(/^﻿/, '');
  const birinchi = toza.split(/\r?\n/, 1)[0] ?? '';
  const ajratuvchi = [';', '\t', ','].map((a) => ({ a, n: birinchi.split(a).length })).sort((x, y) => y.n - x.n)[0]!.a;
  const qatorlar: string[][] = [];
  let qator: string[] = [];
  let katak = '';
  let qoshtirnoq = false;
  for (let i = 0; i < toza.length; i++) {
    const c = toza[i]!;
    if (qoshtirnoq) {
      if (c === '"' && toza[i + 1] === '"') {
        katak += '"';
        i++;
      } else if (c === '"') qoshtirnoq = false;
      else katak += c;
    } else if (c === '"') qoshtirnoq = true;
    else if (c === ajratuvchi) {
      qator.push(katak);
      katak = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && toza[i + 1] === '\n') i++;
      qator.push(katak);
      if (qator.some((x) => x.trim())) qatorlar.push(qator);
      qator = [];
      katak = '';
    } else katak += c;
  }
  qator.push(katak);
  if (qator.some((x) => x.trim())) qatorlar.push(qator);
  return qatorlar;
}

const ASOSIY_MAQSADLAR = [
  { kalit: 'name', nom: 'Bitim nomi', soz: ['bitim', 'sdelka', 'сделка', 'nomi', 'name', 'название'] },
  { kalit: 'contactName', nom: 'Mijoz ismi', soz: ['ism', 'mijoz', 'kontakt', 'контакт', 'имя', 'fio', 'f.i.sh', 'клиент'] },
  { kalit: 'phone', nom: 'Telefon', soz: ['telefon', 'phone', 'тел', 'raqam', 'номер'] },
  { kalit: 'email', nom: 'Email', soz: ['email', 'e-mail', 'почта'] },
  { kalit: 'amount', nom: 'Summa', soz: ['summa', 'бюджет', 'сумма', 'amount', 'budjet'] },
  { kalit: 'stage', nom: 'Bosqich', soz: ['bosqich', 'этап', 'статус', 'stage', 'status'] },
  { kalit: 'responsible', nom: "Mas'ul", soz: ["mas'ul", 'masul', 'ответственный', 'responsible', 'menejer'] },
  { kalit: 'tags', nom: 'Teglar', soz: ['teg', 'тег', 'tag'] },
  { kalit: 'source', nom: 'Manba', soz: ['manba', 'источник', 'source'] },
];

export function ImportOyna({ voronkaId, onYop, onTugadi }: { voronkaId: string; onYop: () => void; onTugadi: () => void }) {
  const { holat, base } = useCrm();
  const t = useT();
  const [pipelineId, setPipelineId] = useState(voronkaId);
  const [qatorlar, setQatorlar] = useState<string[][] | null>(null);
  const [moslash, setMoslash] = useState<string[]>([]);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [natija, setNatija] = useState<{ created: number; failed: number; results: { row: number; ok: boolean; xato?: string }[] } | null>(null);

  const maqsadlar = useMemo(
    () => [
      ...ASOSIY_MAQSADLAR.map((m) => ({ kalit: m.kalit, nom: t(m.nom), soz: m.soz })),
      ...holat.fields.map((f) => ({ kalit: `field:${f.id}`, nom: f.label, soz: [f.label.toLowerCase(), f.code] })),
    ],
    [holat.fields, t],
  );

  const faylniOqi = async (f: File) => {
    setXato(null);
    setNatija(null);
    if (f.size > 5 * 1024 * 1024) return setXato(t('Fayl juda katta (ko‘pi bilan 5 MB)'));
    const q = csvOqi(await f.text());
    if (q.length < 2) return setXato(t('Faylda sarlavha va kamida bitta qator bo‘lishi kerak'));
    if (q.length - 1 > 2000) return setXato(t('Bir martada ko‘pi bilan 2000 qator'));
    setQatorlar(q);
    // Sarlavha nomidan avtomatik moslash
    setMoslash(
      q[0]!.map((s) => {
        const k = s.trim().toLowerCase();
        return maqsadlar.find((m) => m.soz.some((x) => k === x || k.includes(x)))?.kalit ?? '';
      }),
    );
  };

  const yubor = async () => {
    if (!qatorlar) return;
    if (!moslash.some((m) => m === 'name' || m === 'contactName' || m === 'phone')) return setXato(t('Bitim nomi, ism yoki telefon ustunini moslang'));
    setBand(true);
    setXato(null);
    try {
      const rows = qatorlar.slice(1).map((q) => {
        const r: Record<string, string> = {};
        moslash.forEach((m, i) => {
          if (m && q[i]?.trim()) r[m] = q[i]!.trim().slice(0, 5000);
        });
        return r;
      });
      const r = await api.post<{ created: number; failed: number; results: { row: number; ok: boolean; xato?: string }[] }>(`${base}/deals/import`, { pipelineId, rows });
      setNatija(r);
      if (r.created > 0) onTugadi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Import qilib bo‘lmadi'));
    } finally {
      setBand(false);
    }
  };

  return (
    <Oyna
      keng
      sarlavha={t('Bitimlarni import qilish')}
      onYop={onYop}
      onSubmit={() => void yubor()}
      past={
        natija ? (
          <button type="button" className="btn" onClick={onYop}>
            {t('Yopish')}
          </button>
        ) : (
          <>
            <button type="button" className="btn ikkinchi" onClick={onYop}>
              {t('Bekor')}
            </button>
            <button type="submit" className="btn" disabled={!qatorlar || band}>
              {band ? t('Import qilinmoqda…') : t('{n} ta qatorni import qilish', { n: qatorlar ? qatorlar.length - 1 : 0 })}
            </button>
          </>
        )
      }
    >
      {!natija && (
        <>
          <p className="ci-oyna-matn">{t('CSV fayl (Excel → «CSV UTF-8» sifatida saqlang). Birinchi qator — ustun nomlari. Bir xil telefonli kontakt qayta yaratilmaydi.')}</p>
          <div className="vr-oyna-ikki">
            <div className="maydon-blok">
              <label htmlFor="im-fayl">{t('Fayl')}</label>
              <label className="btn ikkinchi ci-fayl-tugma">
                <Upload /> {t('CSV tanlash')}
                <input id="im-fayl" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && void faylniOqi(e.target.files[0])} />
              </label>
            </div>
            <div className="maydon-blok">
              <label htmlFor="im-voronka">{t('Voronka')}</label>
              <select id="im-voronka" className="input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                {holat.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {qatorlar && (
            <div className="ci-jadval-qobiq ci-import-preview">
              <table className="jadval">
                <thead>
                  <tr>
                    {qatorlar[0]!.map((s, i) => (
                      <th key={i}>
                        <div className="ci-import-sarlavha">{s || t('{n}-ustun', { n: i + 1 })}</div>
                        <select className="input" value={moslash[i] ?? ''} onChange={(e) => setMoslash((m) => m.map((x, j) => (j === i ? e.target.value : x)))} aria-label={t('«{n}» ustuni', { n: s })}>
                          <option value="">{t('— o‘tkazib yuborish —')}</option>
                          {maqsadlar.map((m) => (
                            <option key={m.kalit} value={m.kalit} disabled={moslash.includes(m.kalit) && moslash[i] !== m.kalit}>
                              {m.nom}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qatorlar.slice(1, 6).map((q, i) => (
                    <tr key={i}>
                      {qatorlar[0]!.map((_, j) => (
                        <td key={j} className={moslash[j] ? '' : 'yordam'}>
                          {q[j] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {qatorlar.length > 6 && <p className="yordam">{t('… yana {n} ta qator', { n: qatorlar.length - 6 })}</p>}
            </div>
          )}
          <p className="yordam">{t('Bosqich va mas’ul — nomi bo‘yicha moslanadi; topilmasa qator xato bilan qaytadi. Bosqich bo‘sh bo‘lsa — birinchi bosqich.')}</p>
        </>
      )}
      {natija && (
        <div className="ci-import-natija" role="status">
          <p>
            <b>{t('{n} ta bitim yaratildi', { n: natija.created })}</b>
            {natija.failed > 0 && <span className="xavf"> · {t('{n} ta qator xato', { n: natija.failed })}</span>}
          </p>
          {natija.failed > 0 && (
            <ul className="ci-xato-royxat">
              {natija.results
                .filter((r) => !r.ok)
                .slice(0, 50)
                .map((r) => (
                  <li key={r.row}>
                    {t('{n}-qator', { n: r.row })}: {t(r.xato ?? '')}
                  </li>
                ))}
            </ul>
          )}
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
