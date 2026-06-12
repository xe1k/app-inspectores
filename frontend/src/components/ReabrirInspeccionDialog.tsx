import { useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api';
import type { Inspeccion } from '@/pages/InspectionDetailPage';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspeccionId: string;
  onReabierta: (insp: Inspeccion) => void;
}

export default function ReabrirInspeccionDialog({ open, onOpenChange, inspeccionId, onReabierta }: Props) {
  const [pin, setPin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPin('');
    setMotivo('');
    setError('');
  }, [open]);

  async function reabrir() {
    if (!motivo.trim()) {
      setError('Indica el motivo de la reapertura');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const insp = await apiFetch<Inspeccion>(`/inspecciones/${inspeccionId}/reabrir`, {
        method: 'POST',
        body: JSON.stringify({ pin, motivo: motivo.trim() }),
      });
      onReabierta(insp);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-slate-900">
            <RotateCcw className="h-5 w-5 text-brand dark:text-brand-cyan" aria-hidden="true" />
            Reabrir inspección firmada
          </DialogTitle>
        </DialogHeader>

        <p className="-mt-2 text-sm text-slate-500">
          Esta inspección está firmada. Para corregirla necesitas tu PIN y un motivo, que quedarán
          registrados. La firma actual quedará invalidada.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="motivoReapertura">Motivo de la reapertura</Label>
          <Textarea
            id="motivoReapertura"
            className="bg-card"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: faltó registrar un hallazgo, corregir un dato del informe…"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pinReapertura">PIN de firma (4 dígitos)</Label>
          <Input
            id="pinReapertura"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            className="h-12 bg-card text-base"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="gradient" onClick={reabrir} disabled={enviando || pin.length !== 4 || !motivo.trim()}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Reabrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
