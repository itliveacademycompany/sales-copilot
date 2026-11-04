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
  /** Tashqi CRM (amoCRM) dan sinxronlanadi — nomini bu yerda o'zgartirib bo'lmaydi. */
  external?: boolean;
}

let joriy: MenyuVoronka[] = [];
const tinglovchilar = new Set<() => void>();

export function menyuVoronkalariniYangila(v: MenyuVoronka[]): void {
  // Bir xil ro'yxat kelsa menyu qayta chizilmasin
  if (JSON.stringify(v) === JSON.stringify(joriy)) return;
  joriy = v;
  for (const f of tinglovchilar) f();
}

/**
 * Menyudan yangi voronka qo'shilganda CRM holatini qayta yuklash. CRM ilovasi
 * o'z `yangila` funksiyasini shu yerga ro'yxatdan o'tkazadi — menyu (Layout)
 * CRM kontekstidan tashqarida turadi.
 */
let yuklovchi: (() => Promise<void>) | null = null;

export function voronkaYuklovchisi(fn: (() => Promise<void>) | null): void {
  yuklovchi = fn;
}

export async function crmHolatiniQaytaYukla(): Promise<void> {
  await yuklovchi?.();
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
