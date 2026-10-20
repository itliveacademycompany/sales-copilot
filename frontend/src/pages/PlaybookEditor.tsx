import { useEffect, useState } from 'react';
import {
  api,
  ApiError,
  fmtSana,
  type BusinessProfile,
  type PlaybookBody,
  type PlaybookVersion,
  type ValidateResult,
} from '../api';
import { useAuth } from '../auth';
import { PlaybookForm, type PlaybookBolim } from '../components/PlaybookForm';
import { useT } from '../i18n';

/** Sozlamalar ichida har bo'lim alohida ochiladi — sarlavha shunga moslashadi. */
const BOLIM_SARLAVHA: Record<PlaybookBolim, [string, string]> = {
  mezonlar: ['Baholash mezonlari', "Kategoriyalar, mezonlar va qizil bayroqlar — har suhbat shu bo'yicha baholanadi"],
  anketa: ['Anketa savollari', 'Har suhbatdan AI shu savollarga javob qidiradi'],
  xizmat: ["Xizmat yo'nalishlari", "Suhbatlar shu yo'nalishlarga ajratiladi"],
  oilalar: ["Qo'ng'iroq oilalari", 'Murojaat turlari va qaysilari baholanishi'],
  ai: ["AI ko'rsatmalari", "Soha lug'ati va AI tahlilga qo'shiladigan ko'rsatmalar"],
};

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
export function PlaybookEditor({ bolim }: { bolim?: PlaybookBolim } = {}) {
  const t = useT();
  const { business } = useAuth();
  const [playbook, setPlaybook] = useState<PlaybookBody | null>(null);
  const [versions, setVersions] = useState<PlaybookVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [savedOk, setSavedOk] = useState(false);
  const [takliflar, setTakliflar] = useState<string[]>([]);

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
    // Xizmat yo'nalishi takliflari — biznes profilidagi asosiy xizmatlardan
    api
      .get<{ profile: BusinessProfile }>(`${base}/profile`)
      .then((r) => setTakliflar(r.profile.primaryOffers ?? []))
      .catch(() => undefined);
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
      setSavedOk(true);
      setSavedMsg(t('Saqlandi — yangi versiya faollashtirildi'));
      setChangeNote('');
      const vs = await api.get<PlaybookVersion[]>(`${base}/playbook/versions`);
      setVersions(vs);
    } catch (e) {
      setSavedOk(false);
      setSavedMsg(e instanceof ApiError ? e.message : t("Saqlab bo'lmadi"));
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

  if (!playbook) return <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          {bolim ? <h2 className="pe-sarlavha">{t(BOLIM_SARLAVHA[bolim][0])}</h2> : <h1>{t('Baholash mezonlari')}</h1>}
          <div className="izoh">{bolim ? t(BOLIM_SARLAVHA[bolim][1]) : t("Playbook — har suhbat shu bo'yicha baholanadi")}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ikkinchi" onClick={() => setShowVersions((v) => !v)}>
            {t('Versiyalar ({n})', { n: versions.length })}
          </button>
          <button className="btn" onClick={() => void save()} disabled={saving}>
            {saving ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </div>
      </div>

      {showVersions && (
        <div className="card" style={{ marginBottom: 14 }}>
          <table className="jadval">
            <thead>
              <tr>
                <th>{t('Versiya')}</th>
                <th>{t('Manba')}</th>
                <th>{t('Izoh')}</th>
                <th>{t('Sana')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>#{v.version}</td>
                  <td>
                    <span className="badge kul">{v.origin === 'ai_generated' ? 'AI' : t("qo'lda")}</span>
                  </td>
                  <td>{v.changeNote ?? '—'}</td>
                  <td>{fmtSana(v.createdAt)}</td>
                  <td>
                    {v.isActive ? (
                      <span className="badge ok">{t('faol')}</span>
                    ) : (
                      <button className="btn ikkinchi kichik" onClick={() => void activateVersion(v.version)}>
                        {t('Faollashtirish')}
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
          <b style={{ color: 'var(--qizil-dark)' }}>{t('Xatolar topildi:')}</b>
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
            borderLeft: `4px solid ${savedOk ? 'var(--ok)' : 'var(--qizil)'}`,
          }}
        >
          {savedMsg}
        </div>
      )}

      <PlaybookForm value={playbook} onChange={setPlaybook} xizmatTakliflari={takliflar} bolim={bolim} />

      <div className="card" style={{ marginTop: 14 }}>
        <label className="maydon">{t("O'zgarish izohi (ixtiyoriy)")}</label>
        <input
          className="input"
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder={t("Masalan: narx bo'yicha mezon qattiqlashtirildi")}
        />
      </div>
    </>
  );
}
