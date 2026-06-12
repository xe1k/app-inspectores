interface Props {
  seleccionada: 'alta' | 'media' | 'baja' | null;
  onSeleccionar: (c: 'alta' | 'media' | 'baja') => void;
}

const OPCIONES: { valor: 'alta' | 'media' | 'baja'; etiqueta: string; detalle: string; clases: string }[] = [
  {
    valor: 'alta',
    etiqueta: 'ALTA',
    detalle: 'Atender de inmediato',
    clases: 'bg-red-600 text-white active:bg-red-700',
  },
  {
    valor: 'media',
    etiqueta: 'MEDIA',
    detalle: 'Programar reparación',
    clases: 'bg-amber-400 text-amber-950 active:bg-amber-500',
  },
  {
    valor: 'baja',
    etiqueta: 'BAJA',
    detalle: 'Mantener en observación',
    clases: 'bg-green-600 text-white active:bg-green-700',
  },
];

export default function PasoCriticidad({ seleccionada, onSeleccionar }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold text-slate-900">¿Qué tan grave es el daño?</h2>
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onSeleccionar(o.valor)}
          aria-pressed={seleccionada === o.valor}
          className={`flex min-h-[96px] flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl transition-transform active:scale-[.99] ${o.clases} ${
            seleccionada === o.valor ? 'ring-4 ring-ring ring-offset-2 ring-offset-background' : ''
          }`}
        >
          <span className="font-heading text-3xl font-bold tracking-wide">{o.etiqueta}</span>
          <span className="mt-1 text-sm opacity-90">{o.detalle}</span>
        </button>
      ))}
    </div>
  );
}
