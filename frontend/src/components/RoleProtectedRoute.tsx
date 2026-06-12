import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth, type Rol } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';

// Como ProtectedRoute, pero además exige que el rol del usuario esté en
// `roles`. Si no, avisa con un toast y redirige a "/".
export default function RoleProtectedRoute({ roles }: { roles: Rol[] }) {
  const { user, loading } = useAuth();
  const { showToast } = useToast();
  const avisado = useRef(false);

  const sinAcceso = !loading && user && !roles.includes(user.rol as Rol);

  useEffect(() => {
    if (sinAcceso && !avisado.current) {
      avisado.current = true;
      showToast('No tienes acceso a esta sección', 'error');
    }
  }, [sinAcceso, showToast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (sinAcceso) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
