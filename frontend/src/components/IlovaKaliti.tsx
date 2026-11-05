import { BriefcaseBusiness, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useT } from '../i18n';
import { useIlovaYollari } from './IlovaAlmashtirgich';
import './ilova-kaliti.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SotuvAI ↔ CRM KALITI — "odamcha chuqurga tushadi" animatsiyasi bilan
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Neumorfik kapsula: chapda tugma (✨ SotuvAI / 💼 CRM), o'ngda chuqur.
 * Bosilganda tugma botadi, yonidan odamcha chiqadi, chuqurgacha yuradi,
 * sakrab unga tushadi — chuqur ochiladi, kapsula ikkinchi ilova rangiga
 * o'tadi (SotuvAI — yorug', CRM — to'q) va o'sha ilovaning oxirgi ochilgan
 * sahifasi ochiladi.
 *
 * "Harakatni kamaytirish" yoqilgan bo'lsa — animatsiyasiz, darhol o'tadi.
 */

type Bosqich = 'tinch' | 'bosildi' | 'yurish' | 'tushish' | 'almashish';

/** Bosqichlar davomiyligi (ms) — CSS bilan bir xil. */
const VAQT = { bosildi: 160, yurish: 1150, tushish: 520, almashish: 520 } as const;

export function IlovaKaliti() {
  const { business } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const yollar = useIlovaYollari();
  const [bosqich, setBosqich] = useState<Bosqich>('tinch');
  const taymerlar = useRef<number[]>([]);

  useEffect(() => () => taymerlar.current.forEach((x) => window.clearTimeout(x)), []);

  // CRM ilovasiga kirish huquqi (Layout'dagi logo almashtirgichi bilan bir xil shart)
  const p = business?.permissions ?? [];
  const crmBor = p.includes('analytics:read:all') || p.includes('task:read:all') || Boolean(business?.seatId);
  if (!crmBor) return null;

  const crmda = yollar.crm;
  const manzil = crmda ? yollar.sotuvYol : yollar.crmYol;
  const nomi = crmda ? t('SotuvAI ga qaytish') : t("CRM ga o'tish");

  const bos = () => {
    if (bosqich !== 'tinch') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate(manzil);
      return;
    }
    const keyin = (ms: number, fn: () => void) => taymerlar.current.push(window.setTimeout(fn, ms));
    setBosqich('bosildi');
    let t0 = VAQT.bosildi;
    keyin(t0, () => setBosqich('yurish'));
    t0 += VAQT.yurish;
    keyin(t0, () => setBosqich('tushish'));
    t0 += VAQT.tushish;
    keyin(t0, () => setBosqich('almashish'));
    t0 += VAQT.almashish;
    keyin(t0, () => navigate(manzil));
  };

  // Kapsula rangi: almashish boshlangach — ikkinchi ilovaniki
  const korinish = (bosqich === 'almashish') !== crmda ? 'crm' : 'sotuv';

  return (
    <button
      type="button"
      className={`ik ik-${korinish} ik-${bosqich}`}
      onClick={bos}
      aria-label={nomi}
      title={nomi}
      aria-busy={bosqich !== 'tinch'}
    >
      <span className="ik-tugma" aria-hidden="true">
        <Sparkles className="ik-belgi sotuv" />
        <BriefcaseBusiness className="ik-belgi crm" />
      </span>
      <span className="ik-chuqur" aria-hidden="true" />
      <span className="ik-yol" aria-hidden="true">
        <svg className="ik-odam" viewBox="0 0 14 22" width="14" height="22">
          <circle className="ik-bosh" cx="7" cy="3.4" r="2.6" />
          <line x1="7" y1="6" x2="7" y2="13.4" />
          <g className="ik-qol chap">
            <line x1="7" y1="8" x2="4.2" y2="11.4" />
          </g>
          <g className="ik-qol ong">
            <line x1="7" y1="8" x2="9.8" y2="11.4" />
          </g>
          <g className="ik-oyoq chap">
            <line x1="7" y1="13.4" x2="4.6" y2="20.4" />
          </g>
          <g className="ik-oyoq ong">
            <line x1="7" y1="13.4" x2="9.4" y2="20.4" />
          </g>
        </svg>
      </span>
    </button>
  );
}
