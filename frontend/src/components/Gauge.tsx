import { ballRang } from '../api';

/** Doiraviy foiz ko'rsatkichi — suhbat sifati uchun. */
export function Gauge({ value, size = 96 }: { value: number | null; size?: number }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  const rang = ballRang(value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={value === null ? 'Ball aniqlanmadi' : `Ball: ${Math.round(pct)} foiz`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={8} />
      {value !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={rang}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s' }}
        />
      )}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.24}
        fontWeight={900}
        fill={rang}
      >
        {value === null ? '—' : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}
