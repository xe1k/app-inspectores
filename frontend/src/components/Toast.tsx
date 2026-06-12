import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type TipoToast = 'info' | 'ok' | 'error';

interface ToastItem {
  id: number;
  mensaje: string;
  tipo: TipoToast;
}

interface ToastContextValue {
  showToast: (mensaje: string, tipo?: TipoToast) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONOS: Record<TipoToast, typeof Info> = {
  info: Info,
  ok: CheckCircle2,
  error: AlertCircle,
};

const ESTILOS: Record<TipoToast, string> = {
  info: 'border-slate-200 bg-card text-slate-900',
  ok: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((mensaje: string, tipo: TipoToast = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const Icono = ICONOS[t.tipo];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-md',
                ESTILOS[t.tipo]
              )}
            >
              <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.mensaje}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
