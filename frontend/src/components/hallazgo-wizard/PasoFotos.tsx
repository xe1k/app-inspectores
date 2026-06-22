import { useRef, useState } from 'react';
import { AlertTriangle, Camera, Loader2, Pencil, X } from 'lucide-react';
import PhotoEditorDialog, { type PhotoEditorResult } from '@/components/PhotoEditorDialog';
import { type Diagrama } from '@/components/DiagramaMarcador';
import { compressImage } from '@/lib/compressImage';
import type { DatosHallazgo } from './datos';

interface Props {
  datos: DatosHallazgo;
  actualizar: (parcial: Partial<DatosHallazgo>) => void;
  onContinuar: () => void;
  diagramas: Diagrama[];
  plantillaId: number | null;
}

export default function PasoFotos({ datos, actualizar, onContinuar, diagramas, plantillaId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [adjuntandoId, setAdjuntandoId] = useState<number | null>(null);
  const [editorArchivo, setEditorArchivo] = useState<File | null>(null);
  // null = foto nueva (cámara); número = se está re-anotando la foto en ese índice.
  const [editorIndex, setEditorIndex] = useState<number | null>(null);
  const [editorTitulo, setEditorTitulo] = useState('Resalta el punto importante de la foto');

  async function handleArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setProcesando(true);
    try {
      setEditorIndex(null);
      setEditorTitulo('Resalta el punto importante de la foto');
      setEditorArchivo(await compressImage(archivo));
    } finally {
      setProcesando(false);
    }
  }

  function handleEditorConfirm(resultado: PhotoEditorResult) {
    const idx = editorIndex;
    setEditorArchivo(null);
    setEditorIndex(null);
    const preview = URL.createObjectURL(resultado.archivo);
    if (idx == null) {
      actualizar({ fotos: [...datos.fotos, { archivo: resultado.archivo, preview }] });
    } else {
      const previa = datos.fotos[idx];
      if (previa) URL.revokeObjectURL(previa.preview);
      actualizar({ fotos: datos.fotos.map((f, i) => (i === idx ? { archivo: resultado.archivo, preview } : f)) });
    }
  }

  // Re-abrir el editor sobre una foto ya agregada (incluye diagramas adjuntos)
  // para destacar la zona del daño.
  function anotarFoto(index: number) {
    const foto = datos.fotos[index];
    if (!foto) return;
    setEditorIndex(index);
    setEditorTitulo('Destaca la zona del daño');
    setEditorArchivo(foto.archivo);
  }

  function eliminarFoto(index: number) {
    const foto = datos.fotos[index];
    URL.revokeObjectURL(foto.preview);
    actualizar({ fotos: datos.fotos.filter((_, i) => i !== index) });
  }

  // Trae la imagen del diagrama del servidor y la suma como una foto más del
  // hallazgo (queda en memoria hasta que se guarda, igual que las fotos).
  async function adjuntarDiagrama(d: Diagrama) {
    if (plantillaId == null) return;
    setAdjuntandoId(d.id);
    try {
      const resp = await fetch(`/api/plantillas/${plantillaId}/diagramas/${d.id}/imagen`, { credentials: 'include' });
      if (!resp.ok) throw new Error('No se pudo obtener el diagrama');
      const blob = await resp.blob();
      const nombre = d.nombre.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'diagrama';
      const archivo = new File([blob], `${nombre}.jpg`, { type: blob.type || 'image/jpeg' });
      const preview = URL.createObjectURL(archivo);
      actualizar({ fotos: [...datos.fotos, { archivo, preview }] });
    } catch {
      // si falla, el inspector puede volver a tocar el diagrama
    } finally {
      setAdjuntandoId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="font-heading text-xl font-semibold text-slate-900">Evidencia: fotos y diagrama</h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {datos.fotos.map((f, i) => (
          <div key={f.preview} className="relative aspect-square overflow-hidden rounded-lg bg-slate-200">
            <img src={f.preview} alt="Evidencia del hallazgo" className="h-full w-full object-cover" />
            <div className="absolute right-1.5 top-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => anotarFoto(i)}
                title="Destacar / anotar"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow transition-colors hover:bg-white hover:text-brand"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => eliminarFoto(i)}
                title="Quitar"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow transition-colors hover:bg-white hover:text-red-600"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={procesando}
          className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-brand hover:text-brand"
        >
          {procesando ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Camera className="h-6 w-6" aria-hidden="true" />}
          <span className="text-sm font-medium">Tomar foto</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleArchivoChange}
      />

      {datos.criticidad === 'alta' && datos.fotos.length === 0 && (
        <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Se recomienda agregar al menos una foto para hallazgos críticos.
        </p>
      )}

      {plantillaId != null && diagramas.length > 0 && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-1 font-heading text-base font-semibold text-slate-900">Adjuntar diagrama de referencia</h3>
          <p className="-mt-0.5 mb-2 text-sm text-slate-500">
            Toca un diagrama para sumarlo como foto del informe. Luego toca el lápiz sobre él para destacar la zona del daño.
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {diagramas.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => adjuntarDiagrama(d)}
                disabled={adjuntandoId != null}
                className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 text-center transition-colors hover:border-brand disabled:opacity-60"
              >
                <img
                  src={`/api/plantillas/${plantillaId}/diagramas/${d.id}/imagen`}
                  alt={d.nombre}
                  className="absolute inset-0 h-full w-full object-cover opacity-60"
                />
                <span className="relative px-1 text-xs font-medium text-slate-700">
                  {adjuntandoId === d.id ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : d.nombre}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onContinuar}
        className="mt-auto h-14 w-full cursor-pointer rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal"
      >
        Continuar →
      </button>

      {editorArchivo && (
        <PhotoEditorDialog
          archivo={editorArchivo}
          titulo={editorTitulo}
          onCancel={() => {
            setEditorArchivo(null);
            setEditorIndex(null);
          }}
          onConfirm={handleEditorConfirm}
        />
      )}
    </div>
  );
}
