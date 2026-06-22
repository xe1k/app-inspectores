import { Link, NavLink, Outlet } from 'react-router-dom';
import { BadgeCheck, LogOut, UserCircle } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth, type Rol } from '@/contexts/AuthContext';

interface NavItem {
  to: string;
  label: string;
  roles?: Rol[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Equipos' },
  { to: '/plantillas', label: 'Plantillas de equipo' },
  { to: '/dashboard', label: 'Dashboard', roles: ['gerencial', 'admin'] },
  { to: '/admin', label: 'Administración', roles: ['admin'] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const items = NAV_ITEMS.filter((item) => !item.roles || (user?.rol && item.roles.includes(user.rol)));

  return (
    <div className="dots-bg flex min-h-screen flex-col">
      <header className="px-4 pt-4">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-full border border-border bg-card py-2 pl-4 pr-2 shadow-sm">
            <div className="flex items-center gap-2 font-heading text-base font-semibold text-slate-900 sm:text-lg">
              <BadgeCheck className="h-6 w-6 text-brand dark:text-brand-cyan" aria-hidden="true" />
              Inspecciones Estructurales
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/perfil"
                title="Mi perfil"
                className="flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-sm text-slate-600 transition-colors hover:bg-secondary hover:text-slate-900"
              >
                <UserCircle className="h-5 w-5" aria-hidden="true" />
                {user?.nombre}
              </Link>
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="flex min-h-[40px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Salir
              </button>
            </div>
          </div>
          <nav className="mt-3 flex gap-1 rounded-full bg-slate-100 p-1 sm:mx-auto sm:w-fit">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex-1 rounded-full px-5 py-2.5 text-center text-sm transition-colors sm:flex-none ${
                    isActive ? 'bg-card font-semibold text-brand shadow-sm dark:bg-slate-200 dark:text-brand-cyan' : 'font-medium text-slate-600 hover:text-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4">
        <Outlet />
      </main>

      <p className="py-4 text-center text-xs text-slate-400">
        App de Inspecciones Estructurales — CHABA
      </p>
    </div>
  );
}
