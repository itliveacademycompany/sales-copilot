import { useEffect, useState } from 'react';
import { api, ApiError, fmtSana, type PlaybookBody, type PlaybookVersion, type ValidateResult } from '../api';
import { useAuth } from '../auth';
import { PlaybookForm } from '../components/PlaybookForm';

const EMPTY_PLAYBOOK: PlaybookBody = {
  criteria: { categories: [], criteria: [] },
  questionnaire: { title: 'Anketa', questions: [] },
  classificationPolicy: { callFamilies: [], redFlags: [], serviceLines: [] },
  promptNotes: {
    stage1: { vocabulary: [], contextHint: '' },
    stage2: { businessContext: '', extractionHints: '', taskGuidance: '' },
    stage3: { scoringGuidance: '', coachingNotes: '', complianceNotes: '' },
  },
  leadQuality: {},
};

/**
 * TZ 3.3: baholash metodologiyasi muharriri. Mavjud faol versiyani
 * tahrirlaydi va YANGI versiya sifatida saqlaydi (eskisi o'zgarmaydi —
 * FR-22, tarixni buzmaslik uchun).
 */
export function PlaybookEditor() {
  const { business } = useAuth();
  const [playbook, setPlaybook] = useState<PlaybookBody | null>(null);
  const [versions, setVersions] = useState<PlaybookVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  useEffect(() => {
    if (!base) return;
    api
      .get<PlaybookBody & { id: string }>(`${base}/playbook`)
      .then((p) => setPlaybook(p))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setPlaybook(EMPTY_PLAYBOOK);
      });
    api.get<PlaybookVersion[]>(`${base}/playbook/versions`).then(setVersions).catch(() => undefined);
  }, [base]);

  async function validate(pb: PlaybookBody) {
    const result = await api.post<ValidateResult>(`${base}/playbook/validate`, pb);
    setValidation(result);
    return result;
  }

  async function save() {
    if (!playbook) return;
    setSaving(true);
    setSavedMsg('');
    try {
      const check = await validate(playbook);
      if (!check.valid) return;
      await api.post(`${base}/playbook`, { ...playbook, changeNote: changeNote || undefined });
      setSavedMsg('Saqlandi — yangi versiya faollashtirildi');
      setChangeNote('');
      const vs = await api.get<PlaybookVersion[]>(`${base}/playbook/versions`);
      setVersions(vs);
    } catch (e) {
      setSavedMsg(e instanceof ApiError ? e.message : 'Saqlab bo\'lmadi');
    } finally {
      setSaving(false);
    }
  }

  async function activateVersion(version: number) {
    await api.post(`${base}/playbook/versions/${version}/activate`);
    const [p, vs] = await Promise.all([
      api.get<PlaybookBody & { id: string }>(`${base}/playbook`),
      api.get<PlaybookVersion[]>(`${base}/playbook/versions`),
    ]);
    setPlaybook(p);
    setVersions(vs);
  }

  if (!playbook) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Baholash mezonlari</h1>
          <div className="izoh">Playbook — har suhbat shu bo'yicha baholanadi</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ikkinchi" onClick={() => setShowVersions((v) => !v)}>
            Versiyalar ({versions.length})
          </button>
          <button className="btn" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>

      {showVersions && (
        <div className="card" style={{ marginBottom: 14 }}>
          <table className="jadval">
            <thead>
              <tr>
                <th>Versiya</th>
                <th>Manba</th>
                <th>Izoh</th>
                <th>Sana</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>#{v.version}</td>
                  <td>
                    <span className="badge kul">{v.origin === 'ai_generated' ? 'AI' : 'qo\'lda'}</span>
                  </td>
                  <td>{v.changeNote ?? '—'}</td>
                  <td>{fmtSana(v.createdAt)}</td>
                  <td>
                    {v.isActive ? (
                      <span className="badge ok">faol</span>
                    ) : (
                      <button className="btn ikkinchi kichik" onClick={() => void activateVersion(v.version)}>
                        Faollashtirish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {validation && !validation.valid && validation.errors && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--qizil)' }}>
          <b style={{ color: 'var(--qizil-dark)' }}>Xatolar topildi:</b>
          <ul style={{ margin: '6px 0 0' }}>
            {Object.entries(validation.errors).map(([field, msgs]) => (
              <li key={field}>
                {field}: {msgs.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {savedMsg && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            borderLeft: `4px solid ${savedMsg.startsWith('Saqlandi') ? 'var(--ok)' : 'var(--qizil)'}`,
          }}
        >
          {savedMsg}
        </div>
      )}

      <PlaybookForm value={playbook} onChange={setPlaybook} />

      <div className="card" style={{ marginTop: 14 }}>
        <label className="maydon">O'zgarish izohi (ixtiyoriy)</label>
        <input
          className="input"
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder="Masalan: narx bo'yicha mezon qattiqlashtirildi"
        />
      </div>
    </>
  );
}
