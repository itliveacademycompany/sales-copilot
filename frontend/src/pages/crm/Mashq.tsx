import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { createTrainingApi, TrainingApp, type ApiRequestInit } from '../../features/mashq';
import '../../features/mashq/styles.css';
import '../../features/mashq/deal-mind.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM → SIMULYATOR: AI mijoz bilan mashq (Mijoz-AI moduli)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Modul (`features/mashq/`) host'dan faqat so'rov yuboruvchini oladi. Bu
 * yerda u platformaning cookie sessiyasi bilan ishlaydi; xato bo'lsa server
 * tanasi xatoga biriktiriladi — modul UI'si xato qaysi BOSQICHDA (AI, sessiya,
 * server) bo'lganini o'zbekcha ko'rsatadi, foydalanuvchi xom JSON ko'rmaydi.
 *
 * Ovozli rejim keyingi bosqichda ulanadi (`voiceEnabled`). Eski simulyator
 * mashqlari tarixi `/crm/simulyator/eski` da saqlanadi.
 */

async function sorov<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const raw = init.rawBody;
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(raw !== undefined ? { 'content-type': init.contentType ?? 'application/octet-stream' } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(raw !== undefined ? { body: raw } : {}),
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    ...(init.signal ? { signal: init.signal } : {}),
  });

  if (!response.ok) {
    const matn = await response.text().catch(() => '');
    let body: unknown = null;
    let tafsilot = matn;
    try {
      body = JSON.parse(matn);
      const b = body as { error?: string; message?: string; title?: string };
      tafsilot = b.message ? `${b.error ?? 'xato'}: ${b.message}` : (b.title ?? matn);
    } catch {
      /* JSON emas — matnning o'zi */
    }
    throw Object.assign(new Error(`${response.status} ${tafsilot.slice(0, 400)}`), { status: response.status, body });
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text.length > 0 ? JSON.parse(text) : undefined) as T;
}

export function Mashq() {
  const { business } = useAuth();
  const api = useMemo(
    () => (business ? createTrainingApi(sorov, `/api/v1/businesses/${business.businessId}/trening`) : null),
    [business],
  );
  if (!business || !api) return null;

  const rahbar = business.permissions.includes('analytics:read:all');
  return (
    <div className="mashq-sahifa">
      <div className="mq-eski-havola">
        <Link to="/crm/simulyator/eski">Eski mashqlar tarixi</Link>
      </div>
      <TrainingApp api={api} canViewAll={rahbar} voiceEnabled={false} />
    </div>
  );
}
