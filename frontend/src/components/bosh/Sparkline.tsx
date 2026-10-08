import { useId } from 'react';

/**
 * Kichik chiziqli grafik — trend bir qarashda. Qiymatlar `title` orqali ham
 * o'qiladi. Bo'sh yoki bitta nuqta bo'lsa tekis chiziq chiziladi.
 */
export function Sparkline({
  qiymatlar,
  balandlik = 44,
  kenglik = 160,
  rang = 'var(--ia)',
  maydon = true,
  nom,
}: {
  qiymatlar: (number | null)[];
  balandlik?: number;
  kenglik?: number;
  rang?: string;
  maydon?: boolean;
  nom?: string;
}) {
  const gradId = `sp${useId().replace(/:/g, '')}`;
  const nuqtalar = qiymatlar.filter((v): v is number => v !== null);
  const max = nuqtalar.length ? Math.max(...nuqtalar) : 1;
  const min = nuqtalar.length ? Math.min(...nuqtalar) : 0;
  const oraliq = max - min || 1;
  const n = qiymatlar.length;
  const x = (i: number) => (n <= 1 ? kenglik : (i / (n - 1)) * kenglik);
  const y = (v: number) =>
    nuqtalar.length <= 1 || max === min
      ? balandlik / 2
      : balandlik - 5 - ((v - min) / oraliq) * (balandlik - 10);

  let coords = qiymatlar
    .map((v, i) => (v === null ? null : ([x(i), y(v)] as const)))
    .filter((c): c is readonly [number, number] => c !== null);
  if (coords.length === 0) coords = [[0, balandlik / 2], [kenglik, balandlik / 2]];
  if (coords.length === 1) coords = [[0, coords[0]![1]], coords[0]!];

  const chiziq = `M${coords.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' L')}`;
  const [ox, oy] = coords[coords.length - 1]!;
  const [bx] = coords[0]!;

  return (
    <svg
      className="sparkline"
      width={kenglik}
      height={balandlik}
      viewBox={`0 0 ${kenglik} ${balandlik}`}
      role="img"
      aria-label={nom ?? 'Trend grafigi'}
    >
      <title>{nom ?? nuqtalar.map((v) => Math.round(v * 10) / 10).join(', ')}</title>
      {maydon && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={rang} stopOpacity="0.3" />
              <stop offset="100%" stopColor={rang} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${chiziq} L${ox},${balandlik} L${bx},${balandlik} Z`} fill={`url(#${gradId})`} />
        </>
      )}
      <path
        d={chiziq}
        fill="none"
        stroke={rang}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={ox} cy={oy} r="3.4" fill={rang} />
    </svg>
  );
}
