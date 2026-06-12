import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Circle, Eraser, Pencil, Square, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Forma {
  tipo: 'rect' | 'circulo' | 'flecha' | 'libre';
  color: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  puntos?: [number, number][];
}

const MAX_LADO = 2000;
const COLORES = ['#ef4444', '#facc15', '#22d3ee', '#4ade80', '#ffffff'];
const HERRAMIENTAS: { id: Forma['tipo']; Icon: typeof Square; titulo: string }[] = [
  { id: 'rect', Icon: Square, titulo: 'Rectángulo' },
  { id: 'circulo', Icon: Circle, titulo: 'Círculo' },
  { id: 'flecha', Icon: ArrowUpRight, titulo: 'Flecha' },
  { id: 'libre', Icon: Pencil, titulo: 'Trazo libre' },
];

export interface PhotoEditorResult {
  archivo: File;
  conMarcas: boolean;
}

interface PhotoEditorDialogProps {
  archivo: File;
  titulo?: string;
  onCancel: () => void;
  onConfirm: (resultado: PhotoEditorResult) => void;
}

function pintarForma(ctx: CanvasRenderingContext2D, f: Forma, grosor: number) {
  ctx.save();
  ctx.strokeStyle = f.color;
  ctx.lineWidth = grosor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = grosor * 0.8;
  if (f.tipo === 'libre') {
    ctx.beginPath();
    (f.puntos || []).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  } else if (f.tipo === 'rect') {
    ctx.strokeRect(Math.min(f.x0, f.x1), Math.min(f.y0, f.y1), Math.abs(f.x1 - f.x0), Math.abs(f.y1 - f.y0));
  } else if (f.tipo === 'circulo') {
    ctx.beginPath();
    ctx.ellipse(
      (f.x0 + f.x1) / 2,
      (f.y0 + f.y1) / 2,
      Math.abs(f.x1 - f.x0) / 2 || 1,
      Math.abs(f.y1 - f.y0) / 2 || 1,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  } else if (f.tipo === 'flecha') {
    const ang = Math.atan2(f.y1 - f.y0, f.x1 - f.x0);
    const cabeza = grosor * 3.2;
    ctx.beginPath();
    ctx.moveTo(f.x0, f.y0);
    ctx.lineTo(f.x1, f.y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(f.x1, f.y1);
    ctx.lineTo(f.x1 - cabeza * Math.cos(ang - 0.45), f.y1 - cabeza * Math.sin(ang - 0.45));
    ctx.moveTo(f.x1, f.y1);
    ctx.lineTo(f.x1 - cabeza * Math.cos(ang + 0.45), f.y1 - cabeza * Math.sin(ang + 0.45));
    ctx.stroke();
  }
  ctx.restore();
}

export default function PhotoEditorDialog({ archivo, titulo, onCancel, onConfirm }: PhotoEditorDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const formasRef = useRef<Forma[]>([]);
  const formaActivaRef = useRef<Forma | null>(null);
  const grosorRef = useRef(6);
  const redibujarRef = useRef<() => void>(() => {});
  const herramientaRef = useRef<Forma['tipo']>('rect');
  const colorRef = useRef(COLORES[0]);

  const [herramienta, setHerramienta] = useState<Forma['tipo']>('rect');
  const [color, setColor] = useState(COLORES[0]);
  const [hayFormas, setHayFormas] = useState(false);

  useEffect(() => {
    herramientaRef.current = herramienta;
  }, [herramienta]);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    formasRef.current = [];
    formaActivaRef.current = null;
    setHayFormas(false);

    const url = URL.createObjectURL(archivo);
    const img = new Image();

    function redibujar() {
      ctx!.drawImage(img, 0, 0, canvas!.width, canvas!.height);
      for (const f of formasRef.current.concat(formaActivaRef.current ? [formaActivaRef.current] : [])) {
        pintarForma(ctx!, f, grosorRef.current);
      }
    }
    redibujarRef.current = redibujar;

    img.onload = () => {
      const escala = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * escala);
      canvas.height = Math.round(img.naturalHeight * escala);
      grosorRef.current = Math.max(4, Math.round(Math.max(canvas.width, canvas.height) / 220));
      redibujar();
    };
    img.src = url;

    function coordenadas(ev: PointerEvent): [number, number] {
      const r = canvas!.getBoundingClientRect();
      return [(ev.clientX - r.left) * (canvas!.width / r.width), (ev.clientY - r.top) * (canvas!.height / r.height)];
    }

    function onPointerDown(ev: PointerEvent) {
      ev.preventDefault();
      canvas!.setPointerCapture(ev.pointerId);
      const [x, y] = coordenadas(ev);
      formaActivaRef.current =
        herramientaRef.current === 'libre'
          ? { tipo: 'libre', color: colorRef.current, x0: x, y0: y, x1: x, y1: y, puntos: [[x, y]] }
          : { tipo: herramientaRef.current, color: colorRef.current, x0: x, y0: y, x1: x, y1: y };
    }
    function onPointerMove(ev: PointerEvent) {
      const f = formaActivaRef.current;
      if (!f) return;
      const [x, y] = coordenadas(ev);
      if (f.tipo === 'libre') f.puntos!.push([x, y]);
      else {
        f.x1 = x;
        f.y1 = y;
      }
      redibujar();
    }
    function onPointerUp() {
      const f = formaActivaRef.current;
      if (!f) return;
      const minima = f.tipo === 'libre' ? f.puntos!.length > 1 : Math.hypot(f.x1 - f.x0, f.y1 - f.y0) > grosorRef.current;
      if (minima) {
        formasRef.current.push(f);
        setHayFormas(true);
      }
      formaActivaRef.current = null;
      redibujar();
    }
    function onPointerCancel() {
      formaActivaRef.current = null;
      redibujar();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);

    return () => {
      URL.revokeObjectURL(url);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [archivo]);

  function deshacer() {
    formasRef.current.pop();
    setHayFormas(formasRef.current.length > 0);
    redibujarRef.current();
  }

  function limpiar() {
    formasRef.current = [];
    setHayFormas(false);
    redibujarRef.current();
  }

  function guardar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (formasRef.current.length === 0) {
      onConfirm({ archivo, conMarcas: false });
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onConfirm({ archivo, conMarcas: false });
          return;
        }
        const base = (archivo.name || 'foto').replace(/\.[^.]+$/, '');
        onConfirm({ archivo: new File([blob], `${base}_marcada.jpg`, { type: 'image/jpeg' }), conMarcas: true });
      },
      'image/jpeg',
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-2.5">
      <div className="flex h-full w-full max-w-2xl flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-200">{titulo || 'Resalta el punto importante de la foto'}</span>
          <button
            type="button"
            onClick={onCancel}
            title="Cancelar"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl">
          <canvas ref={canvasRef} className="max-h-full max-w-full touch-none rounded-lg shadow-2xl" style={{ cursor: 'crosshair' }} />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <div className="flex gap-1.5">
            {HERRAMIENTAS.map(({ id, Icon, titulo: t }) => (
              <button
                key={id}
                type="button"
                title={t}
                onClick={() => setHerramienta(id)}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border-2 transition-colors ${
                  herramienta === id ? 'border-white bg-white text-brand-navy' : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                title="Color"
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`h-8 w-8 rounded-full border-[3px] transition-transform ${
                  color === c ? 'scale-[1.18] border-white' : 'border-white/30'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              title="Deshacer"
              onClick={deshacer}
              disabled={!hayFormas}
              className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
            >
              <Undo2 className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Borrar todas las marcas"
              onClick={limpiar}
              disabled={!hayFormas}
              className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
            >
              <Eraser className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex gap-2.5">
          <Button type="button" variant="outline" className="h-11 flex-1 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" variant="gradient" className="h-11 flex-1" onClick={guardar}>
            Usar esta foto
          </Button>
        </div>
      </div>
    </div>
  );
}
