import { useState, type FormEvent } from 'react';
import { BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth, ApiError } from '@/contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de conexión con el servidor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dots-bg relative flex min-h-screen items-center justify-center p-4">
      <ThemeToggle className="absolute right-4 top-4" />
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[400px] rounded-3xl border border-border bg-card p-8 shadow-sm sm:p-9"
      >
        <div className="mx-auto mb-5 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand">
          <BadgeCheck className="h-7 w-7 text-white" aria-hidden="true" />
        </div>

        <h1 className="text-center font-heading text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
          Inspecciones Estructurales
        </h1>
        <p className="mb-7 mt-1 text-center text-slate-600">
          Registro de hallazgos e informes en terreno
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuario (correo)</Label>
            <Input
              id="username"
              type="email"
              autoComplete="username"
              autoFocus
              required
              className="h-11 bg-card"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Clave</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11 bg-card"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" variant="gradient" disabled={submitting} className="h-12 w-full text-base">
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </Button>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
