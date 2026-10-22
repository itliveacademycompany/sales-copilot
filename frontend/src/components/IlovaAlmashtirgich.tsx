import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
 * qayerga o'tiladi (o'sha ilovada oxirgi ochilgan sahifa). Layout'dagi
 * logo shu orqali SotuvAI ↔ CRM almashtiradi.
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
