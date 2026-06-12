import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eraser, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiError } from '@/lib/api';

interface Perfil {
  username: string;
  nombre_completo: string;
  rut: string | null;
  cargo: string | null;
  firma_imagen: string | null;
  tiene_pin: boolean;
}

interface MensajeProps {
  tipo: 'ok' | 'error';
  texto: string;
}

function Mensaje({ tipo, texto }: MensajeProps) {
  return (
    <div
      className={`rounded-md px-3 py-2 text-sm ${tipo === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
      role={tipo === 'error' ? 'alert' : 'status'}
    >
      {texto}
    </div>
  );
}

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loadError, setLoadError] = useState('');

  // Identidad
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [rut, setRut] = useState('');
  const [cargo, setCargo] = useState('');
  const [guardandoIdentidad, setGuardandoIdentidad] = useState(false);
  const [msgIdentidad, setMsgIdentidad] = useState<MensajeProps | null>(null);

  // Firma
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujandoRef = useRef(false);
  const [hayTrazo, setHayTrazo] = useState(false);
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const [msgFirma, setMsgFirma] = useState<MensajeProps | null>(null);

  // PIN
  const [pin, setPin] = useState('');
  const [pinConfirmacion, setPinConfirmacion] = useState('');
  const [guardandoPin, setGuardandoPin] = useState(false);
  const [msgPin, setMsgPin] = useState<MensajeProps | null>(null);

  useEffect(() => {
    apiFetch<Perfil>('/perfil')
      .then((p) => {
        setPerfil(p);
        setNombreCompleto(p.nombre_completo || '');
        setRut(p.rut || '');
        setCargo(p.cargo || '');
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor'));
  }, []);

  async function guardarIdentidad(e: FormEvent) {
    e.preventDefault();
    setGuardandoIdentidad(true);
    setMsgIdentidad(null);
    try {
      const data = await apiFetch<Perfil>('/perfil', {
        method: 'PUT',
        body: JSON.stringify({ nombre_completo: nombreCompleto.trim(), rut: rut.trim(), cargo: cargo.trim() }),
      });
      setPerfil(data);
      setMsgIdentidad({ tipo: 'ok', texto: 'Datos guardados' });
    } catch (e) {
      setMsgIdentidad({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setGuardandoIdentidad(false);
    }
  }

  // ---- Firma manuscrita ----
  function coordenadas(canvas: HTMLCanvasElement, ev: PointerEvent | React.PointerEvent) {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * (canvas.width / r.width), (ev.clientY - r.top) * (canvas.height / r.height)];
  }

  function iniciarTrazo(ev: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const [x, y] = coordenadas(canvas, ev);
    ctx.beginPath();
    ctx.moveTo(x, y);
    dibujandoRef.current = true;
  }

  function dibujarTrazo(ev: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !dibujandoRef.current) return;
    ev.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    const [x, y] = coordenadas(canvas, ev);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHayTrazo(true);
  }

  function terminarTrazo(ev: React.PointerEvent<HTMLCanvasElement>) {
    dibujandoRef.current = false;
    canvasRef.current?.releasePointerCapture(ev.pointerId);
  }

  function limpiarFirma() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHayTrazo(false);
  }

  useEffect(() => {
    if (perfil && !perfil.firma_imagen) limpiarFirma();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.firma_imagen]);

  async function guardarFirma() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGuardandoFirma(true);
    setMsgFirma(null);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      await apiFetch('/perfil/firma', { method: 'PUT', body: JSON.stringify({ firma_imagen: dataUrl }) });
      setPerfil((p) => (p ? { ...p, firma_imagen: dataUrl } : p));
      setMsgFirma({ tipo: 'ok', texto: 'Firma guardada' });
    } catch (e) {
      setMsgFirma({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setGuardandoFirma(false);
    }
  }

  async function quitarFirma() {
    if (!confirm('¿Quitar tu firma manuscrita guardada?')) return;
    setGuardandoFirma(true);
    setMsgFirma(null);
    try {
      await apiFetch('/perfil/firma', { method: 'DELETE' });
      setPerfil((p) => (p ? { ...p, firma_imagen: null } : p));
      limpiarFirma();
      setMsgFirma({ tipo: 'ok', texto: 'Firma eliminada' });
    } catch (e) {
      setMsgFirma({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setGuardandoFirma(false);
    }
  }

  // ---- PIN ----
  async function guardarPin(e: FormEvent) {
    e.preventDefault();
    setGuardandoPin(true);
    setMsgPin(null);
    try {
      await apiFetch('/perfil/pin', { method: 'PUT', body: JSON.stringify({ pin, pin_confirmacion: pinConfirmacion }) });
      setPerfil((p) => (p ? { ...p, tiene_pin: true } : p));
      setPin('');
      setPinConfirmacion('');
      setMsgPin({ tipo: 'ok', texto: 'PIN configurado ✓' });
    } catch (e) {
      setMsgPin({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setGuardandoPin(false);
    }
  }

  if (loadError) {
    return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{loadError}</div>;
  }

  if (!perfil) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-semibold text-slate-900">Mi perfil</h1>
      <p className="-mt-2 text-sm text-slate-500">
        Estos datos se usan para identificarte como responsable al firmar las inspecciones.
      </p>

      {/* Identidad */}
      <form onSubmit={guardarIdentidad} className="space-y-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
        <h2 className="font-heading text-base font-semibold text-slate-900">Identidad</h2>
        <div className="space-y-1.5">
          <Label htmlFor="nombreCompleto">Nombre completo</Label>
          <Input id="nombreCompleto" required className="h-12 bg-card text-base" value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rut">RUT</Label>
            <Input id="rut" placeholder="12.345.678-9" className="h-12 bg-card text-base" value={rut} onChange={(e) => setRut(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cargo">Cargo</Label>
            <Input id="cargo" placeholder="Inspector estructural" className="h-12 bg-card text-base" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
        </div>
        {msgIdentidad && <Mensaje {...msgIdentidad} />}
        <Button type="submit" variant="gradient" disabled={guardandoIdentidad} className="h-11">
          {guardandoIdentidad ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Guardar
        </Button>
      </form>

      {/* Firma */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
        <h2 className="font-heading text-base font-semibold text-slate-900">Mi firma</h2>
        <p className="-mt-1 text-sm text-slate-500">Dibuja tu firma en el recuadro con el dedo o el mouse.</p>
        <canvas
          ref={canvasRef}
          width={600}
          height={240}
          className="h-[150px] w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
          onPointerDown={iniciarTrazo}
          onPointerMove={dibujarTrazo}
          onPointerUp={terminarTrazo}
          onPointerCancel={terminarTrazo}
        />
        {msgFirma && <Mensaje {...msgFirma} />}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={limpiarFirma} className="h-11">
            <Eraser className="h-4 w-4" aria-hidden="true" /> Limpiar
          </Button>
          <Button type="button" variant="gradient" onClick={guardarFirma} disabled={guardandoFirma || !hayTrazo} className="h-11">
            {guardandoFirma ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Guardar firma
          </Button>
          {perfil.firma_imagen && (
            <Button type="button" variant="ghost" onClick={quitarFirma} disabled={guardandoFirma} className="h-11 text-red-600 hover:text-red-700">
              Quitar firma guardada
            </Button>
          )}
        </div>
      </div>

      {/* PIN */}
      <form onSubmit={guardarPin} className="space-y-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
        <h2 className="font-heading text-base font-semibold text-slate-900">PIN de firma</h2>
        <p className="-mt-1 text-sm text-slate-500">
          4 dígitos que pedirá la app para firmar inspecciones.
          {perfil.tiene_pin ? ' Ya tienes un PIN configurado; puedes cambiarlo aquí.' : ''}
        </p>
        {perfil.tiene_pin && (
          <p className="text-sm font-medium text-green-700">PIN configurado ✓</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pin">Nuevo PIN (4 dígitos)</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              className="h-12 bg-card text-base"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pinConfirmacion">Repite el PIN</Label>
            <Input
              id="pinConfirmacion"
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              className="h-12 bg-card text-base"
              value={pinConfirmacion}
              onChange={(e) => setPinConfirmacion(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
        </div>
        {msgPin && <Mensaje {...msgPin} />}
        <Button type="submit" variant="gradient" disabled={guardandoPin} className="h-11">
          {guardandoPin ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Guardar PIN
        </Button>
      </form>
    </div>
  );
}
