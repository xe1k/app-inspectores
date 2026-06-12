import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // sin localStorage (modo privado), el tema solo dura la sesión
    }
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input bg-card text-slate-600 transition-colors hover:text-slate-900 ${className}`}
    >
      {dark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
