import { ChevronLeft, ChevronRight, Search, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM SAHIFA SARLAVHASI — Metasell uslubi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har CRM sahifasining tepasidagi bitta qator: sarlavha · (ko'rinish
 * almashtirgichi) · "Qidirish va filtrlash" · "AI yordamchi" · "Jami: N" ·
 * amallar (ko'k "+ Yangi …" tugmasi). Barcha ro'yxat sahifalari bir xil
 * ko'rinishi uchun shu komponent orqali chiziladi.
 */
export function MsBosh({
  sarlavha,
  qidiruv,
  jami,
  chap,
  children,
  ai = true,
}: {
  sarlavha: string;
  qidiruv?: { qiymat: string; onChange: (v: string) => void; placeholder?: string; nom?: string };
  /** "Jami" yonidagi qiymat — son yoki "9111 · 1 105 717 471 so'm". */
  jami?: ReactNode;
  /** Sarlavhadan keyingi joy (masalan, kanban/ro'yxat almashtirgichi). */
  chap?: ReactNode;
  /** O'ng tomondagi amallar. */
  children?: ReactNode;
  /** "AI yordamchi" tugmasi — AI Chat'ni ochadi. */
  ai?: boolean;
}) {
  const t = useT();
  return (
    <header className="ms-bosh">
      <h1 className="ms-bosh-nom">{sarlavha}</h1>
      {chap}
      {qidiruv && (
        <label className="ms-qidiruv">
          <Search aria-hidden="true" />
          <input
            value={qidiruv.qiymat}
            onChange={(e) => qidiruv.onChange(e.target.value)}
            placeholder={qidiruv.placeholder ?? t('Qidirish va filtrlash')}
            aria-label={qidiruv.nom ?? t('Qidirish')}
          />
        </label>
      )}
      <div className="ms-bosh-ong">
        {ai && (
          <Link to="/crm/ai-chat" className="ms-ai-tugma">
            <Sparkles aria-hidden="true" /> {t('AI yordamchi')}
          </Link>
        )}
        {jami !== undefined && jami !== null && (
          <span className="ms-jami">
            {t('Jami')}: <b>{jami}</b>
          </span>
        )}
        {children}
      </div>
    </header>
  );
}

/** Sahifalash: chapda sahifa hajmi, o'ngda raqamli sahifalar (1 2 3 … N). */
export function MsSahifalash({
  sahifa,
  sahifalar,
  onSahifa,
  hajm,
  onHajm,
}: {
  /** 0 dan boshlanadi. */
  sahifa: number;
  sahifalar: number;
  onSahifa: (s: number) => void;
  hajm?: number;
  onHajm?: (h: number) => void;
}) {
  const t = useT();
  if (sahifalar <= 1 && !onHajm) return null;
  // Ko'rinadigan raqamlar: 1, joriy atrofi, oxirgi — oraliqlar "…"
  const raqamlar: (number | '…')[] = [];
  for (let i = 0; i < sahifalar; i++) {
    if (i === 0 || i === sahifalar - 1 || Math.abs(i - sahifa) <= 2 || (sahifa < 4 && i < 5)) raqamlar.push(i);
    else if (raqamlar[raqamlar.length - 1] !== '…') raqamlar.push('…');
  }
  return (
    <nav className="ms-sahifalash" aria-label={t('Sahifalar')}>
      {onHajm && hajm ? (
        <select className="ms-hajm" value={hajm} onChange={(e) => onHajm(Number(e.target.value))} aria-label={t('Sahifadagi qatorlar')}>
          {[25, 50, 100].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      ) : (
        <span />
      )}
      {sahifalar > 1 && (
        <div className="ms-sahifalar">
          <button type="button" disabled={sahifa === 0} onClick={() => onSahifa(sahifa - 1)} aria-label={t('Oldingi')}>
            <ChevronLeft />
          </button>
          {raqamlar.map((r, i) =>
            r === '…' ? (
              <span key={`n${i}`} className="ms-nuqtalar">
                …
              </span>
            ) : (
              <button key={r} type="button" className={r === sahifa ? 'faol' : undefined} aria-current={r === sahifa ? 'page' : undefined} onClick={() => onSahifa(r)}>
                {r + 1}
              </button>
            ),
          )}
          <button type="button" disabled={sahifa + 1 >= sahifalar} onClick={() => onSahifa(sahifa + 1)} aria-label={t('Keyingi')}>
            <ChevronRight />
          </button>
        </div>
      )}
    </nav>
  );
}
