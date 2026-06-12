import { useAuth, type Rol } from '@/contexts/AuthContext';

// Rol del usuario en sesión (o null si aún no carga / no hay sesión).
export function useRol(): Rol | null {
  const { user } = useAuth();
  return user?.rol ?? null;
}

// true si el rol actual está incluido en la lista dada.
export function useTieneRol(...roles: Rol[]): boolean {
  const rol = useRol();
  return rol != null && roles.includes(rol);
}
