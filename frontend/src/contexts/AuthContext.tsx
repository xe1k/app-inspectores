import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

export type Rol = 'inspector' | 'supervisor' | 'gerencial' | 'admin';

interface Usuario {
  id: number;
  username: string;
  nombre: string;
  rol?: Rol;
}

interface AuthContextValue {
  user: Usuario | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ usuario: Usuario }>('/auth/me')
      .then((data) => setUser(data.usuario))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<{ usuario: Usuario }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUser(data.usuario);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export { ApiError };
