import { useEffect } from 'react';
import { api } from '../../api';

/**
 * "Tizimdan foydalanish" vidjeti uchun faollik belgisi.
 *
 * Har daqiqada serverga bitta belgi ketadi — faqat sahifa ko'rinib turgan
 * va foydalanuvchi so'nggi 5 daqiqada nimadir qilgan (sichqoncha, klaviatura,
 * aylantirish) bo'lsa. Fon tabda ochiq qolgan sahifa vaqt yig'maydi. Server
 * bir daqiqani bir marta hisoblaydi, shuning uchun ikki tab ikki baravar
 * vaqt bermaydi.
 */
const DAQIQA = 60_000;
const SUKUT = 5 * DAQIQA;

export function useFaollikBelgisi(businessId: string | null | undefined): void {
  useEffect(() => {
    if (!businessId) return;
    let oxirgi = Date.now();
    const harakat = () => {
      oxirgi = Date.now();
    };
    const hodisalar = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    hodisalar.forEach((h) => window.addEventListener(h, harakat, { passive: true }));

    const yubor = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - oxirgi > SUKUT) return;
      void api.post(`/api/v1/businesses/${businessId}/activity/ping`, {}).catch(() => undefined);
    };
    const birinchi = setTimeout(yubor, 5_000);
    const davriy = setInterval(yubor, DAQIQA);
    return () => {
      clearTimeout(birinchi);
      clearInterval(davriy);
      hodisalar.forEach((h) => window.removeEventListener(h, harakat));
    };
  }, [businessId]);
}
