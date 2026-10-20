import { useState } from 'react';
import type { PlaybookBody } from '../api';
import { kontekstniAjrat, kontekstniYig } from './xizmat/kontekstBlok';
import { bahoniAjrat, bahoniYig, blokniAjrat, blokniYig } from './ai/blok';
import { useT } from '../i18n';

/**
 * Playbook tahrirlagichi. Bosh sahifada ham (mavjudini o'zgartirish),
 * onboarding ichida ham (AI qoralamasini ko'rib chiqish) ishlatiladi —
 * shuning uchun faqat `value`/`onChange` orqali ishlaydi, o'zi hech
 * narsa saqlamaydi (saqlash chaqiruvchi tomonda).
 */

interface Props {
  value: PlaybookBody;
  onChange: (v: PlaybookBody) => void;
  /** Biznes profilidagi asosiy xizmatlar — xizmat yo'nalishi uchun bir bosishda qo'shiladigan takliflar. */
  xizmatTakliflari?: string[];
  /** Faqat shu bo'limni ko'rsatish (Sozlamalar ichida). Berilmasa — hammasi. */
  bolim?: PlaybookBolim;
}

export type PlaybookBolim = 'mezonlar' | 'anketa' | 'xizmat' | 'oilalar' | 'ai';

let idCounter = 0;
const nextId = () => `tmp${++idCounter}`;

export function TagList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {items.map((it, i) => (
          <span key={i} className="badge navy" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {it}
            <span
              style={{ cursor: 'pointer', fontWeight: 900 }}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ×
            </span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn ikkinchi kichik" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={add}>
          {t("+ Qo'shish")}
        </button>
      </div>
    </div>
  );
}

export function PlaybookForm({ value, onChange, xizmatTakliflari = [], bolim }: Props) {
  const t = useT();
  const kor = (b: PlaybookBolim) => !bolim || bolim === b;
  const totalWeight = value.criteria.categories.reduce((s, c) => s + c.weightPct, 0);
  const weightOk = Math.abs(totalWeight - 100) < 0.5;

  const setCategories = (categories: typeof value.criteria.categories) =>
    onChange({ ...value, criteria: { ...value.criteria, categories } });
  const setCriteria = (criteria: typeof value.criteria.criteria) =>
    onChange({ ...value, criteria: { ...value.criteria, criteria } });

  function addCategory() {
    const code = String.fromCharCode(65 + value.criteria.categories.length);
    setCategories([
      ...value.criteria.categories,
      { code, name: t('Yangi kategoriya'), weightPct: 0, order: value.criteria.categories.length },
    ]);
  }

  function removeCategory(code: string) {
    setCategories(value.criteria.categories.filter((c) => c.code !== code));
    setCriteria(value.criteria.criteria.filter((c) => c.categoryCode !== code));
  }

  function normalizeWeights() {
    const total = value.criteria.categories.reduce((s, c) => s + c.weightPct, 0);
    if (total <= 0) return;
    const scaled = value.criteria.categories.map((c) => ({
      ...c,
      weightPct: Math.round(((c.weightPct / total) * 100) * 100) / 100,
    }));
    const diff = Math.round((100 - scaled.reduce((s, c) => s + c.weightPct, 0)) * 100) / 100;
    if (scaled.length > 0) scaled[scaled.length - 1]!.weightPct += diff;
    setCategories(scaled);
  }

  function addCriterion(categoryCode: string) {
    const n = value.criteria.criteria.filter((c) => c.categoryCode === categoryCode).length + 1;
    setCriteria([
      ...value.criteria.criteria,
      {
        code: `${categoryCode}${n}`,
        categoryCode,
        name: t('Yangi mezon'),
        description: '',
        rubric: { '0': '', '1': '', '2': '', '3': '' },
        appliesTo: { callFamilies: [], serviceLines: [], directions: [] },
        isActive: true,
        order: value.criteria.criteria.length,
      },
    ]);
  }

  function removeCriterion(code: string) {
    setCriteria(value.criteria.criteria.filter((c) => c.code !== code));
  }

  function updateCriterion(code: string, patch: Partial<(typeof value.criteria.criteria)[number]>) {
    setCriteria(value.criteria.criteria.map((c) => (c.code === code ? { ...c, ...patch } : c)));
  }

  const setCallFamilies = (callFamilies: typeof value.classificationPolicy.callFamilies) =>
    onChange({ ...value, classificationPolicy: { ...value.classificationPolicy, callFamilies } });
  const setRedFlags = (redFlags: typeof value.classificationPolicy.redFlags) =>
    onChange({ ...value, classificationPolicy: { ...value.classificationPolicy, redFlags } });
  /**
   * Xizmat yo'nalishlari: bo'sh joylar olib tashlanadi, takrorlar
   * qo'shilmaydi (katta-kichik harf farq qilmaydi), uzunlik serverdagi
   * cheklov bilan bir xil (120) — aks holda saqlashda xato chiqardi.
   */
  const setServiceLines = (royxat: string[]) => {
    const korilgan = new Set<string>();
    const serviceLines = royxat
      .map((s) => s.trim().slice(0, 120))
      .filter((s) => {
        const k = s.toLowerCase();
        if (!s || korilgan.has(k)) return false;
        korilgan.add(k);
        return true;
      });
    onChange({ ...value, classificationPolicy: { ...value.classificationPolicy, serviceLines } });
  };
  const mavjudXizmat = new Set(value.classificationPolicy.serviceLines.map((s) => s.toLowerCase()));
  const qolganTakliflar = [...new Set(xizmatTakliflari.map((s) => s.trim()).filter(Boolean))].filter(
    (s) => !mavjudXizmat.has(s.toLowerCase()),
  );
  const setQuestions = (questions: typeof value.questionnaire.questions) =>
    onChange({ ...value, questionnaire: { ...value.questionnaire, questions } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {kor('mezonlar') && (
      <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <b>{t("Vaznlar yig'indisi:")} </b>
          <span style={{ color: weightOk ? 'var(--ok)' : 'var(--qizil)', fontWeight: 900 }}>
            {totalWeight.toFixed(1)}%
          </span>
          {!weightOk && <span style={{ color: 'var(--kul-dark)' }}> — {t("100% bo'lishi kerak")}</span>}
        </div>
        {!weightOk && (
          <button type="button" className="btn ikkinchi kichik" onClick={normalizeWeights}>
            {t("Avtomatik to'g'rilash")}
          </button>
        )}
      </div>

      {value.criteria.categories.map((cat) => (
        <div className="card" key={cat.code}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <span className="badge navy">{cat.code}</span>
            <input
              className="input"
              style={{ flex: 1 }}
              value={cat.name}
              onChange={(e) =>
                setCategories(
                  value.criteria.categories.map((c) =>
                    c.code === cat.code ? { ...c, name: e.target.value } : c,
                  ),
                )
              }
            />
            <input
              className="input"
              type="number"
              style={{ width: 90 }}
              value={cat.weightPct}
              onChange={(e) =>
                setCategories(
                  value.criteria.categories.map((c) =>
                    c.code === cat.code ? { ...c, weightPct: Number(e.target.value) } : c,
                  ),
                )
              }
            />
            <span style={{ color: 'var(--kul-dark)' }}>%</span>
            <button type="button" className="btn ikkinchi kichik" onClick={() => removeCategory(cat.code)}>
              {t("O'chirish")}
            </button>
          </div>

          {value.criteria.criteria
            .filter((c) => c.categoryCode === cat.code)
            .map((crit) => (
              <div
                key={crit.code}
                style={{ borderTop: '1px solid var(--krem)', paddingTop: 10, marginTop: 10 }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 900, fontSize: 12, color: 'var(--text-secondary)', width: 30 }}>
                    {crit.code}
                  </span>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={crit.name}
                    onChange={(e) => updateCriterion(crit.code, { name: e.target.value })}
                    placeholder={t('Mezon nomi')}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={crit.isActive}
                      onChange={(e) => updateCriterion(crit.code, { isActive: e.target.checked })}
                    />
                    {t('faol')}
                  </label>
                  <button
                    type="button"
                    className="btn ikkinchi kichik"
                    onClick={() => removeCriterion(crit.code)}
                  >
                    ×
                  </button>
                </div>
                <textarea
                  className="input"
                  style={{ marginBottom: 6, minHeight: 44 }}
                  value={crit.description}
                  onChange={(e) => updateCriterion(crit.code, { description: e.target.value })}
                  placeholder={t('Bu mezon nimani baholaydi?')}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {(['0', '1', '2', '3'] as const).map((lvl) => (
                    <div key={lvl}>
                      <label className="maydon">{t('{n} ball', { n: lvl })}</label>
                      <input
                        className="input"
                        value={crit.rubric[lvl]}
                        onChange={(e) =>
                          updateCriterion(crit.code, { rubric: { ...crit.rubric, [lvl]: e.target.value } })
                        }
                        placeholder={t('{n} ball uchun aniq xatti-harakat', { n: lvl })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

          <button
            type="button"
            className="btn ikkinchi kichik"
            style={{ marginTop: 10 }}
            onClick={() => addCriterion(cat.code)}
          >
            {t("+ Mezon qo'shish")}
          </button>
        </div>
      ))}

      <button type="button" className="btn ikkinchi" onClick={addCategory}>
        {t("+ Kategoriya qo'shish")}
      </button>
      </>
      )}

      {(kor('oilalar') || kor('mezonlar')) && (
      <div className={bolim ? 'pf-yakka' : 'grid-2'}>
        {kor('oilalar') && (
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>{t('Murojaat turlari')}</h2>
          <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
            {t('Baholanmaydiganlarini ("scored" o\'chirilgan) belgilang — masalan spam yoki ichki masalalar')}
          </div>
          {value.classificationPolicy.callFamilies.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input
                className="input"
                style={{ width: 120 }}
                value={f.name}
                onChange={(e) =>
                  setCallFamilies(
                    value.classificationPolicy.callFamilies.map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                className="input"
                style={{ flex: 1 }}
                value={f.description}
                onChange={(e) =>
                  setCallFamilies(
                    value.classificationPolicy.callFamilies.map((x, j) =>
                      j === i ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={f.scored}
                  onChange={(e) =>
                    setCallFamilies(
                      value.classificationPolicy.callFamilies.map((x, j) =>
                        j === i ? { ...x, scored: e.target.checked } : x,
                      ),
                    )
                  }
                />
                {t('baholanadi')}
              </label>
              <button
                type="button"
                className="btn ikkinchi kichik"
                onClick={() => setCallFamilies(value.classificationPolicy.callFamilies.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn ikkinchi kichik"
            onClick={() =>
              setCallFamilies([
                ...value.classificationPolicy.callFamilies,
                { key: nextId(), name: t('Yangi tur'), description: '', scored: true },
              ])
            }
          >
            {t("+ Qo'shish")}
          </button>
        </div>
        )}

        {kor('mezonlar') && (
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>{t('Qizil bayroqlar')}</h2>
          <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
            {t("Sotuvchi hech qachon qilmasligi kerak bo'lgan narsalar")}
          </div>
          {value.classificationPolicy.redFlags.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                value={f.description}
                onChange={(e) =>
                  setRedFlags(
                    value.classificationPolicy.redFlags.map((x, j) =>
                      j === i ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
              />
              <select
                className="input"
                style={{ width: 110 }}
                value={f.severity}
                onChange={(e) =>
                  setRedFlags(
                    value.classificationPolicy.redFlags.map((x, j) =>
                      j === i ? { ...x, severity: e.target.value as 'warning' | 'critical' } : x,
                    ),
                  )
                }
              >
                <option value="warning">{t('ogohlantirish')}</option>
                <option value="critical">{t('jiddiy')}</option>
              </select>
              <button
                type="button"
                className="btn ikkinchi kichik"
                onClick={() => setRedFlags(value.classificationPolicy.redFlags.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn ikkinchi kichik"
            onClick={() =>
              setRedFlags([
                ...value.classificationPolicy.redFlags,
                { key: nextId(), description: '', severity: 'warning' },
              ])
            }
          >
            {t("+ Qo'shish")}
          </button>
        </div>
        )}
      </div>
      )}

      {kor('xizmat') && (
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>{t("Xizmat yo'nalishlari")}</h2>
        <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
          {t('Kompaniya sotadigan xizmat yoki mahsulot yo\'nalishlari — masalan "Web dasturlash", "IT Kids". AI har suhbat qaysi yo\'nalishga tegishli ekanini aniqlaydi; Qo\'ng\'iroqlar sahifasida shu bo\'yicha filtrlash mumkin bo\'ladi.')}
        </div>
        <TagList
          items={value.classificationPolicy.serviceLines}
          onChange={setServiceLines}
          placeholder={t("Yo'nalish nomi va Enter")}
        />
        {qolganTakliflar.length > 0 && (
          <div className="xizmat-takliflar">
            <span>{t('Biznes profilidan:')}</span>
            {qolganTakliflar.map((s) => (
              <button
                key={s}
                type="button"
                className="chip-tugma"
                onClick={() => setServiceLines([...value.classificationPolicy.serviceLines, s])}
              >
                + {s}
              </button>
            ))}
            {qolganTakliflar.length > 1 && (
              <button
                type="button"
                className="chip-tugma faol"
                onClick={() => setServiceLines([...value.classificationPolicy.serviceLines, ...qolganTakliflar])}
              >
                {t("Hammasini qo'shish")}
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {kor('anketa') && (
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>{t('Savolnoma')}</h2>
        <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
          {t('Har suhbatdan AI shu savollarga javob qidiradi (FR-28) — masalan "O\'quvchining yoshi nechada?" Topilmasa bo\'sh qoladi, o\'ylab topilmaydi.')}
        </div>
        {value.questionnaire.questions.map((q, i) => (
          <div key={q.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={q.question}
              onChange={(e) =>
                setQuestions(
                  value.questionnaire.questions.map((x, j) =>
                    j === i ? { ...x, question: e.target.value } : x,
                  ),
                )
              }
              placeholder={t('Savol matni')}
            />
            <select
              className="input"
              style={{ width: 110 }}
              value={q.answerType}
              onChange={(e) =>
                setQuestions(
                  value.questionnaire.questions.map((x, j) =>
                    j === i ? { ...x, answerType: e.target.value } : x,
                  ),
                )
              }
            >
              <option value="text">{t('matn')}</option>
              <option value="boolean">{t("ha/yo'q")}</option>
              <option value="number">{t('son')}</option>
              <option value="date">{t('sana')}</option>
            </select>
            <button
              type="button"
              className="btn ikkinchi kichik"
              onClick={() => setQuestions(value.questionnaire.questions.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn ikkinchi kichik"
          onClick={() =>
            setQuestions([
              ...value.questionnaire.questions,
              { id: nextId(), question: '', answerType: 'text', required: false },
            ])
          }
        >
          {t("+ Savol qo'shish")}
        </button>
      </div>
      )}

      {kor('ai') && (
      <>
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>{t("Soha lug'ati")}</h2>
        <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
          {t("Nutqni matnga aylantirishda aniqlik uchun — mahsulot nomlari, brend so'zlari")}
        </div>
        <TagList
          items={value.promptNotes.stage1.vocabulary}
          placeholder={t('Atama kiriting va Enter bosing')}
          onChange={(vocabulary) =>
            onChange({
              ...value,
              promptNotes: { ...value.promptNotes, stage1: { ...value.promptNotes.stage1, vocabulary } },
            })
          }
        />
      </div>
      <AiKorsatmalar value={value} onChange={onChange} />
      </>
      )}
    </div>
  );
}

/**
 * AI ko'rsatmalari — faqat AI tahlilda haqiqatan ishlatiladigan maydonlar:
 * biznes konteksti va ma'lumot ajratish (2-bosqich), baholash ko'rsatmasi
 * (3-bosqich — ballar va lid sifati shu yerda aniqlanadi).
 */
function AiKorsatmalar({ value, onChange }: { value: PlaybookBody; onChange: (v: PlaybookBody) => void }) {
  const t = useT();
  const pn = value.promptNotes;
  const set2 = (k: 'businessContext' | 'extractionHints', v: string) =>
    onChange({ ...value, promptNotes: { ...pn, stage2: { ...pn.stage2, [k]: v } } });
  // Xizmat yo'nalishlari bloki shu yerda ko'rinmaydi va buzilmaydi — saqlashda avtomatik qayta qo'shiladi
  const [kontekst, xizmatBlok] = kontekstniAjrat(pn.stage2.businessContext);
  // AI ko'rsatmalari bo'limi qo'shgan avtomatik bloklar ham shu yerda ko'rinmaydi
  const [ajratish, ajratishBlok] = blokniAjrat(pn.stage2.extractionHints);
  const [bahoMatn, bahoBlok, lidBlok] = bahoniAjrat(pn.stage3.scoringGuidance);
  const setBaho = (v: string) => onChange({ ...value, promptNotes: { ...pn, stage3: { ...pn.stage3, scoringGuidance: bahoniYig(v, bahoBlok, lidBlok) } } });
  const maydonlar: { id: string; nom: string; izoh: string; qiymat: string; max: number; set: (v: string) => void; misol: string }[] = [
    {
      id: 'ai-kontekst',
      nom: 'Biznes konteksti',
      izoh: "AI har suhbatni o'qishdan oldin biladigan narsa: nima sotasiz, kimga, qanday sharoitda.",
      qiymat: kontekst,
      max: 3000 - (xizmatBlok ? xizmatBlok.length + 2 : 0),
      set: (v) => set2('businessContext', kontekstniYig(v, xizmatBlok)),
      misol: "Masalan: IT o'quv markazi, 7–17 yoshli bolalar uchun kurslar. Mijoz odatda ota-ona.",
    },
    {
      id: 'ai-ajratish',
      nom: "Ma'lumot ajratish ko'rsatmasi",
      izoh: "Suhbatdan mijoz ma'lumoti, va'dalar va anketa javoblarini ajratishda nimaga e'tibor berish kerak.",
      qiymat: ajratish,
      max: 2000 - (ajratishBlok ? ajratishBlok.length + 2 : 0),
      set: (v) => set2('extractionHints', blokniYig(v, ajratishBlok)),
      misol: "Masalan: «ertaga kelaman» — mijoz va'dasi; yoshni faqat aniq aytilgan bo'lsa yozing.",
    },
    {
      id: 'ai-baho',
      nom: "Baholash ko'rsatmasi",
      izoh: "Ball qo'yish va lid sifatini (issiq / iliq / sovuq) aniqlashda qo'shimcha qoidalar.",
      qiymat: bahoMatn,
      max: 3000 - (bahoBlok ? bahoBlok.length + 2 : 0) - (lidBlok ? lidBlok.length + 2 : 0),
      set: setBaho,
      misol: "Masalan: sinov darsiga yozilgan mijoz — issiq; narxni so'rab, javobsiz ketgan — sovuq.",
    },
  ];
  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}>{t("AI ko'rsatmalari")}</h2>
      <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 14 }}>
        {t("AI tahlilga qo'shiladigan erkin matnli ko'rsatmalar. Qisqa va aniq yozing — har saqlash yangi playbook versiyasi bo'ladi.")}
      </div>
      {maydonlar.map((m) => (
        <div className="maydon-blok" key={m.id}>
          <label htmlFor={m.id}>{t(m.nom)}</label>
          <textarea id={m.id} rows={3} value={m.qiymat} maxLength={m.max} placeholder={t(m.misol)} onChange={(e) => m.set(e.target.value)} />
          <div className="yordam">
            {t(m.izoh)} <span style={{ float: 'right' }}>{m.qiymat.length} / {m.max}</span>
            {m.id === 'ai-kontekst' && xizmatBlok && (
              <div>
                {t("Xizmat yo'nalishlari tavsifi, aliaslar va iboralar ({n} belgi) avtomatik qo'shiladi — ularni «Xizmat yo'nalishlari» bo'limida tahrirlang.", { n: xizmatBlok.length })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
