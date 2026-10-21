import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAAS: QAYSI KABINETDAMIZ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bitta frontend build barcha manzillarda ishlaydi: asosiy domen (landing,
 * super admin) va har bir mijoz subdomeni (`acme.example.uz`). Qaysi biri
 * ekanini frontend o'zi hisoblamaydi — backend `Host` bo'yicha aytadi
 * (`GET /api/v1/public/tenant`). Shunda domen faqat backend sozlamasida
 * (WEB_ORIGIN) turadi va ikki joyda farq qilib qolmaydi.
 *
 * Bu faqat KO'RINISH uchun. Izolyatsiya serverda: subdomendagi sessiya
 * boshqa biznesni umuman olmaydi.
 */

interface Umumiy {
  /** Asosiy sayt manzili (landing, umumiy kirish). */
  rootUrl: string;
  rootDomain: string;
}

export type Kabinet =
  | ({ tur: 'root' } & Umumiy)
  | ({ tur: 'tenant'; slug: string; name: string; logoUrl: string | null; locale: string } & Umumiy)
  | ({ tur: 'topilmadi'; slug: string } & Umumiy)
  /** Platforma admini kabinetni vaqtincha to'xtatgan — login o'rniga tushuntirish. */
  | ({ tur: 'faolsiz'; slug: string; name: string } & Umumiy);

const Ctx = createContext<Kabinet | null>(null);

export function KabinetProvider({ children }: { children: ReactNode }) {
  const [kabinet, setKabinet] = useState<Kabinet | null>(null);

  useEffect(() => {
    let tirik = true;
    api
      .get<Kabinet>('/api/v1/public/tenant')
      .then((k) => tirik && setKabinet(k))
      // Server javob bermasa — asosiy sayt rejimi: ilova ochiladi, login
      // xatosi esa odatdagidek ko'rinadi. Oq ekran qolmaydi.
      .catch(() => tirik && setKabinet({ tur: 'root', rootUrl: window.location.origin, rootDomain: window.location.hostname }));
    return () => {
      tirik = false;
    };
  }, []);

  // Brauzer yorlig'ida mijoz nomi — bir nechta kabinet ochiq bo'lsa adashmaslik uchun
  useEffect(() => {
    if (kabinet?.tur === 'tenant') document.title = `${kabinet.name} · SotuvAI`;
  }, [kabinet]);

  return <Ctx.Provider value={kabinet}>{children}</Ctx.Provider>;
}

/** Joriy kabinet; birinchi so'rov tugaguncha `null`. */
export const useKabinet = () => useContext(Ctx);
