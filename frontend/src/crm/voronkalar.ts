import { useSyncExternalStore } from 'react';

/**
 * CRM menyusidagi voronkalar ro'yxati.
 *
 * Metasell'dagidek har bir voronka chap menyuda alohida bo'lim bo'lib turadi.
 * Voronkalarni CRM ilovasi (`CrmIlova`) allaqachon yuklaydi — menyu uchun
 * ikkinchi so'rov yubormaslik uchun natija shu kichik ombor orqali Layout'ga
 * uzatiladi.
 */
export interface MenyuVoronka {
  id: string;
  name: string;
  isMain: boolean;
}

let joriy: MenyuVoronka[] = [];
const tinglovchilar = new Set<() => void>();

export function menyuVoronkalariniYangila(v: MenyuVoronka[]): void {
  // Bir xil ro'yxat kelsa menyu qayta chizilmasin
  if (JSON.stringify(v) === JSON.stringify(joriy)) return;
  joriy = v;
  for (const f of tinglovchilar) f();
}

export function useMenyuVoronkalari(): MenyuVoronka[] {
  return useSyncExternalStore(
    (f) => {
      tinglovchilar.add(f);
      return () => tinglovchilar.delete(f);
    },
    () => joriy,
  );
}
