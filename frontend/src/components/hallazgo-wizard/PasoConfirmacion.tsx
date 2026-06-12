import { Loader2 } from 'lucide-react';
import { formatHoras, formatPersonas } from '@/lib/formatHallazgo';
import { resumenUbicacion, type DatosHallazgo } from './datos';

interface Props {
  datos: DatosHallazgo;
  guardando: boolean;
  error: string;
  onGuardar: () => void;
}

const ETIQUETA_CRITICIDAD: Record<string, { texto: string; clases: string }> = {
  alta: { texto: 'ALTA', clases: 'bg-red-100 text-red-600' },
  media: { texto: 'MEDIA', clases: 'bg-amber-100 text-amber-800' },
  baja: { texto: 'BAJA', clases: 'bg-green-100 text-green-600' },
};

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</p>
      <div className="text-base font-medium text-slate-900">{children}</div>
    </div>
  );
}

export default function PasoConfirmacion({ datos, guardando, error, onGuardar }: Props) {
  const criticidad = datos.criticidad ? ETIQUETA_CRITICIDAD[datos.criticidad] : null;
  const tipo = datos.tipoDano === 'Otro' ? datos.tipoDanoOtro.trim() : datos.tipoDano;
  const { sistema, sector } = resumenUbicacion(datos);

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="mb-3 font-heading text-xl font-semibold text-slate-900">Revisa antes de guardar</h2>

      <div className="grid flex-1 content-start grid-cols-1 gap-3 sm:grid-cols-2">
        <Tarjeta titulo="Criticidad">
          {criticidad ? (
            <span className={`inline-block rounded-full px-3 py-1 font-heading font-bold ${criticidad.clases}`}>
              {criticidad.texto}
            </span>
          ) : (
            '—'
          )}
        </Tarjeta>
        <Tarjeta titulo="Tipo de daño">{tipo || '—'}</Tarjeta>
        <Tarjeta titulo="Ubicación">
          {sistema || '—'}
          {sector ? ` — ${sector}` : ''}
          {datos.codigo.trim() ? (
            <span className="mt-0.5 block text-sm font-normal text-slate-600">Código {datos.codigo.trim().toUpperCase()}</span>
          ) : null}
        </Tarjeta>
        <Tarjeta titulo="Reparación">
          {formatHoras(datos.tiempoHrs)}
          <span className="mt-0.5 block text-sm font-normal text-slate-600">
            {formatPersonas(datos.recursosCantidad)}
            {' · Preexistencia: '}
            {datos.preexistencia === 'si' ? 'Sí' : datos.preexistencia === 'no' ? 'No' : '—'}
          </span>
        </Tarjeta>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Fotos {datos.fotos.length > 0 ? `(${datos.fotos.length})` : ''}
        </p>
        {datos.fotos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {datos.fotos.map((f) => (
              <div key={f.preview} className="aspect-square overflow-hidden rounded-lg bg-slate-200">
                <img src={f.preview} alt="Foto del hallazgo" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Sin fotos.</p>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          disabled={guardando}
          onClick={onGuardar}
          className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand font-heading text-lg font-medium text-white transition-colors hover:bg-brand-teal disabled:pointer-events-none disabled:opacity-60"
        >
          {guardando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          Guardar hallazgo
        </button>
      </div>
    </div>
  );
}
