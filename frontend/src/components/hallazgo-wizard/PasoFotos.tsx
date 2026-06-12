import { useRef, useState } from 'react';
import { AlertTriangle, Camera, Loader2, X } from 'lucide-react';
import PhotoEditorDialog, { type PhotoEditorResult } from '@/components/PhotoEditorDialog';
import { compressImage } from '@/lib/compressImage';
import type { DatosHallazgo } from './datos';

interface Props {
  datos: DatosHallazgo;
  actualizar: (parcial: Partial<DatosHallazgo>) => void;
  onContinuar: () => void;
}

export default function PasoFotos({ datos, actualizar, onContinuar }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [editorArchivo, setEditorArchivo] = useState<File | null>(null);

  async function handleArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setProcesando(true);
    try {
      setEditorArchivo(await compressImage(archivo));
    } finally {
      setProcesando(false);
    }
  }

  function handleEditorConfirm(resultado: PhotoEditorResult) {
    setEditorArchivo(null);
    const preview = URL.createObjectURL(resultado.archivo);
    actualizar({ fotos: [...datos.fotos, { archivo: resultado.archivo, preview }] });
  }

  function eliminarFoto(index: number) {
    const foto = datos.fotos[index];
    URL.revokeObjectURL(foto.preview);
    actualizar({ fotos: datos.fotos.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="font-heading text-xl font-semibold text-slate-900">Fotos del daño</h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {datos.fotos.map((f, i) => (
          <div key={f.preview} className="relative aspect-square overflow-hidden rounded-lg bg-slate-200">
            <img src={f.preview} alt="Foto del hallazgo" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => eliminarFoto(i)}
              title="Quitar"
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow transition-colors hover:bg-white hover:text-red-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
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
          titulo="Resalta el punto importante de la foto"
          onCancel={() => setEditorArchivo(null)}
          onConfirm={handleEditorConfirm}
        />
      )}
    </div>
  );
}
