import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api';
import type { Inspeccion } from '@/pages/InspectionDetailPage';

interface Perfil {
  nombre_completo: string;
  rut: string | null;
  cargo: string | null;
  tiene_pin: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspeccionId: string;
  equipo: string;
  ot: string | null;
  numHallazgos: number;
  onFirmado: (insp: Inspeccion) => void;
}

export default function FirmarInspeccionDialog({ open, onOpenChange, inspeccionId, equipo, ot, numHallazgos, onFirmado }: Props) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [sinPin, setSinPin] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin('');
    setError('');
    setSinPin(false);
    apiFetch<Perfil>('/perfil')
      .then(setPerfil)
      .catch(() => setPerfil(null));
  }, [open]);

  async function firmar() {
    setEnviando(true);
    setError('');
    setSinPin(false);
    try {
      const insp = await apiFetch<Inspeccion>(`/inspecciones/${inspeccionId}/firmar`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      onFirmado(insp);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (e.status === 409 && e.message.toLowerCase().includes('pin')) setSinPin(true);
      } else {
        setError('Error de conexión con el servidor');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-slate-900">
            <ShieldCheck className="h-5 w-5 text-brand dark:text-brand-cyan" aria-hidden="true" />
            Firmar y completar inspección
          </DialogTitle>
        </DialogHeader>

        <p className="-mt-2 text-sm text-slate-500">
          Al firmar declaras que esta inspección fue realizada por ti y que la información registrada es correcta.
          La inspección quedará marcada como completada y no podrá editarse, salvo que la reabras con tu PIN.
        </p>

        <div className="rounded-lg border border-slate-200 bg-secondary p-3 text-sm text-slate-700">
          <p><b className="text-slate-900">Responsable:</b> {perfil?.nombre_completo || '—'}</p>
          {perfil?.rut && <p className="mt-0.5"><b className="text-slate-900">RUT:</b> {perfil.rut}</p>}
          {perfil?.cargo && <p className="mt-0.5"><b className="text-slate-900">Cargo:</b> {perfil.cargo}</p>}
          <p className="mt-0.5"><b className="text-slate-900">Equipo:</b> {equipo}{ot ? ` · OT ${ot}` : ''}</p>
          <p className="mt-0.5"><b className="text-slate-900">Hallazgos:</b> {numHallazgos}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pinFirma">PIN de firma (4 dígitos)</Label>
          <Input
            id="pinFirma"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoFocus
            className="h-12 bg-card text-base"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
            {sinPin && (
              <>
                {' '}
                <Link to="/perfil" className="font-medium underline">Ir a mi perfil</Link>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="gradient" onClick={firmar} disabled={enviando || pin.length !== 4}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Firmar y completar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
