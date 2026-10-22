import { Columns3, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import './ilova-almash.css';

const KALIT = 'sotuvai-ilova-yol';

/** Joriy manzil CRM ilovasiga tegishlimi. */
export function crmdami(yol: string): boolean {
  return yol === '/crm' || yol.startsWith('/crm/');
}

function oxirgi(ilova: 'sotuv' | 'crm'): string | null {
  try {
    return sessionStorage.getItem(`${KALIT}-${ilova}`);
  } catch {
    return null;
  }
}

/**
 * Ikki ilova orasidagi yo'llar: hozir qaysi birida turibmiz va ikkinchisiga
 * qayerga o'tiladi (o'sha ilovada oxirgi ochilgan sahifa). Almashtirgich
 * tugmalari ham, logo ham shu bitta manbadan foydalanadi.
 */
export function useIlovaYollari() {
  const loc = useLocation();
  const crm = crmdami(loc.pathname);
  const joriy = loc.pathname + loc.search;
  return {
    crm,
    sotuvYol: crm ? (oxirgi('sotuv') ?? '/') : joriy,
    crmYol: crm ? joriy : (oxirgi('crm') ?? '/crm'),
  };
}

/** Joriy sahifani eslab qoladi — Layout'da bir marta chaqiriladi. */
export function useIlovaYoliniEsla() {
  const loc = useLocation();
  const crm = crmdami(loc.pathname);
  useEffect(() => {
    try {
      sessionStorage.setItem(`${KALIT}-${crm ? 'crm' : 'sotuv'}`, loc.pathname + loc.search);
    } catch {
      /* xotira yopiq — almashtirgich baribir ishlaydi */
    }
  }, [crm, loc.pathname, loc.search]);
}

/**
 * Tepadagi "SotuvAI | CRM" almashtirgichi. Har ilovada oxirgi ochilgan
 * sahifa eslab qolinadi — CRM dan qaytganda odam o'sha joyiga tushadi.
 */
export function IlovaAlmashtirgich() {
  const t = useT();
  const { crm, sotuvYol, crmYol } = useIlovaYollari();

  return (
    <nav className="ilova-almash" aria-label={t('Ilova')}>
      <Link title="SotuvAI" to={sotuvYol} className={crm ? '' : 'faol'} aria-current={crm ? undefined : 'page'}>
        <Sparkles aria-hidden="true" />
        <span>SotuvAI</span>
      </Link>
      <Link title="CRM" to={crmYol} className={crm ? 'faol' : ''} aria-current={crm ? 'page' : undefined}>
        <Columns3 aria-hidden="true" />
        <span>CRM</span>
      </Link>
    </nav>
  );
}
