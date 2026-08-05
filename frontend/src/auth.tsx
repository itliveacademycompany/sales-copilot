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
 * Auth holati: joriy foydalanuvchi va faol biznes.
 * MVP'da foydalanuvchining birinchi biznesi avtomatik faol bo'ladi.
 */

interface AuthState {
  loading: boolean;
  user: ApiAuthContext['user'] | null;
  business: BusinessAccess | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ApiAuthContext['user'] | null>(null);
  const [business, setBusiness] = useState<BusinessAccess | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ctx = await api.get<ApiAuthContext>('/api/v1/auth/context');
      setUser(ctx.user);
      setBusiness(ctx.businesses[0] ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setBusiness(null);
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

  const logout = useCallback(async () => {
    await api.post('/api/v1/auth/logout');
    setUser(null);
    setBusiness(null);
  }, []);

  return (
    <Ctx.Provider value={{ loading, user, business, refresh, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth AuthProvider ichida chaqirilishi kerak');
  return v;
}
