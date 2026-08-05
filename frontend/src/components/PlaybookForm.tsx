import { useState } from 'react';
import type { PlaybookBody } from '../api';

/**
 * Playbook tahrirlagichi. Bosh sahifada ham (mavjudini o'zgartirish),
 * onboarding ichida ham (AI qoralamasini ko'rib chiqish) ishlatiladi —
 * shuning uchun faqat `value`/`onChange` orqali ishlaydi, o'zi hech
 * narsa saqlamaydi (saqlash chaqiruvchi tomonda).
 */

interface Props {
  value: PlaybookBody;
  onChange: (v: PlaybookBody) => void;
}

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
        <button type="button" className="btn ikkinchi kichik" onClick={add}>
          + Qo'shish
        </button>
      </div>
    </div>
  );
}

export function PlaybookForm({ value, onChange }: Props) {
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
      { code, name: 'Yangi kategoriya', weightPct: 0, order: value.criteria.categories.length },
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
        name: 'Yangi mezon',
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
  const setQuestions = (questions: typeof value.questionnaire.questions) =>
    onChange({ ...value, questionnaire: { ...value.questionnaire, questions } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <b>Vaznlar yig'indisi: </b>
          <span style={{ color: weightOk ? 'var(--ok)' : 'var(--qizil)', fontWeight: 900 }}>
            {totalWeight.toFixed(1)}%
          </span>
          {!weightOk && <span style={{ color: 'var(--kul-dark)' }}> — 100% bo'lishi kerak</span>}
        </div>
        {!weightOk && (
          <button type="button" className="btn ikkinchi kichik" onClick={normalizeWeights}>
            Avtomatik to'g'rilash
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
              O'chirish
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
                    placeholder="Mezon nomi"
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={crit.isActive}
                      onChange={(e) => updateCriterion(crit.code, { isActive: e.target.checked })}
                    />
                    faol
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
                  placeholder="Bu mezon nimani baholaydi?"
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {(['0', '1', '2', '3'] as const).map((lvl) => (
                    <div key={lvl}>
                      <label className="maydon">{lvl} ball</label>
                      <input
                        className="input"
                        value={crit.rubric[lvl]}
                        onChange={(e) =>
                          updateCriterion(crit.code, { rubric: { ...crit.rubric, [lvl]: e.target.value } })
                        }
                        placeholder={`${lvl} ball uchun aniq xatti-harakat`}
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
            + Mezon qo'shish
          </button>
        </div>
      ))}

      <button type="button" className="btn ikkinchi" onClick={addCategory}>
        + Kategoriya qo'shish
      </button>

      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Murojaat turlari</h2>
          <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
            Baholanmaydiganlarini ("scored" o'chirilgan) belgilang — masalan spam yoki ichki masalalar
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
                baholanadi
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
                { key: nextId(), name: 'Yangi tur', description: '', scored: true },
              ])
            }
          >
            + Qo'shish
          </button>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Qizil bayroqlar</h2>
          <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
            Sotuvchi hech qachon qilmasligi kerak bo'lgan narsalar
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
                <option value="warning">ogohlantirish</option>
                <option value="critical">jiddiy</option>
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
            + Qo'shish
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Savolnoma</h2>
        <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
          Har suhbatdan AI shu savollarga javob qidiradi (FR-28) — masalan
          "O'quvchining yoshi nechada?" Topilmasa bo'sh qoladi, o'ylab topilmaydi.
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
              placeholder="Savol matni"
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
              <option value="text">matn</option>
              <option value="boolean">ha/yo'q</option>
              <option value="number">son</option>
              <option value="date">sana</option>
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
          + Savol qo'shish
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Soha lug'ati</h2>
        <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
          Nutqni matnga aylantirishda aniqlik uchun — mahsulot nomlari, brend so'zlari
        </div>
        <TagList
          items={value.promptNotes.stage1.vocabulary}
          placeholder="Atama kiriting va Enter bosing"
          onChange={(vocabulary) =>
            onChange({
              ...value,
              promptNotes: { ...value.promptNotes, stage1: { ...value.promptNotes.stage1, vocabulary } },
            })
          }
        />
      </div>
    </div>
  );
}
