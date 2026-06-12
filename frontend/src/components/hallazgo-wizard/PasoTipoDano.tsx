import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TIPOS_DANO } from './datos';

interface Props {
  seleccionado: string | null;
  otro: string;
  onSeleccionar: (tipo: string) => void;
  onCambiarOtro: (texto: string) => void;
  onContinuarOtro: () => void;
}

export default function PasoTipoDano({ seleccionado, otro, onSeleccionar, onCambiarOtro, onContinuarOtro }: Props) {
  const esOtro = seleccionado === 'Otro';

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="mb-3 font-heading text-xl font-semibold text-slate-900">¿Qué tipo de daño es?</h2>
      <div className="grid flex-1 grid-cols-2 content-start gap-3">
        {TIPOS_DANO.map((tipo) => (
          <button
            key={tipo}
            type="button"
            onClick={() => onSeleccionar(tipo)}
            aria-pressed={seleccionado === tipo}
            className={`min-h-[72px] cursor-pointer rounded-2xl border-2 px-3 font-heading text-base font-semibold transition-colors ${
              seleccionado === tipo
                ? 'border-brand bg-accent text-accent-foreground'
                : 'border-slate-200 bg-card text-slate-900 active:border-brand'
            }`}
          >
            {tipo}
          </button>
        ))}
      </div>

      {esOtro && (
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="tipoDanoOtro">¿Cuál es el tipo de daño?</Label>
          <div className="flex gap-2">
            <Input
              id="tipoDanoOtro"
              className="h-14 bg-card text-base"
              placeholder="Escríbelo corto, ej. Abolladura"
              value={otro}
              autoFocus
              onChange={(e) => onCambiarOtro(e.target.value)}
            />
            <button
              type="button"
              disabled={!otro.trim()}
              onClick={onContinuarOtro}
              className="h-14 shrink-0 cursor-pointer rounded-full bg-brand px-6 font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal disabled:pointer-events-none disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
