import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, type AuthContext as ApiAuthContext, type BusinessAccess } from './api';

/**
 * Auth holati: joriy foydalanuvchi, uning barcha bizneslari va faol biznes.
 *
 * Bitta odam bir nechta biznesda bo'lishi mumkin (FR-08) — server buni
 * boshidan qo'llab-quvvatlaydi. Ilgari frontend har doim `businesses[0]`
 * ni olardi, ya'ni ikkinchi biznesga umuman kirib bo'lmasdi.
 *
 * Tanlov `localStorage` da: qayta yuklanganda odam o'zi tanlagan biznesda
 * qolishi kerak, aks holda har yangilanishda birinchisiga qaytardi.
 */

const TANLOV_KALIT = 'sotuvai-biznes';

interface AuthState {
  loading: boolean;
  user: ApiAuthContext['user'] | null;
  business: BusinessAccess | null;
  businesses: BusinessAccess[];
  /** Faol biznesni almashtiradi. Noma'lum id berilsa hech narsa qilmaydi. */
  switchBusiness: (businessId: string) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ApiAuthContext['user'] | null>(null);
  const [businesses, setBusinesses] = useState<BusinessAccess[]>([]);
  const [business, setBusiness] = useState<BusinessAccess | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ctx = await api.get<ApiAuthContext>('/api/v1/auth/context');
      setUser(ctx.user);
      setBusinesses(ctx.businesses);

      // Saqlangan tanlov hali ham mavjudmi — huquq olib qo'yilgan
      // bo'lishi mumkin, shuning uchun ro'yxatdan qidiriladi.
      const saqlangan = localStorage.getItem(TANLOV_KALIT);
      const topildi = ctx.businesses.find((b) => b.businessId === saqlangan);
      setBusiness(topildi ?? ctx.businesses[0] ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setBusiness(null);
        setBusinesses([]);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchBusiness = useCallback(
    (businessId: string) => {
      setBusinesses((joriy) => {
        const topildi = joriy.find((b) => b.businessId === businessId);
        if (topildi) {
          localStorage.setItem(TANLOV_KALIT, businessId);
          setBusiness(topildi);
        }
        return joriy;
      });
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.post('/api/v1/auth/logout');
    localStorage.removeItem(TANLOV_KALIT);
    setUser(null);
    setBusiness(null);
    setBusinesses([]);
  }, []);

  return (
    <Ctx.Provider
      value={{ loading, user, business, businesses, switchBusiness, refresh, logout }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth AuthProvider ichida chaqirilishi kerak');
  return v;
}
