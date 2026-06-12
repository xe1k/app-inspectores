// Comprime una foto en el navegador antes de subirla: corrige la orientación
// EXIF (createImageBitmap con imageOrientation: 'from-image'), la reduce a un
// lado máximo y la reexporta como JPEG. Si ya pesa poco, la deja igual.

export interface CompressOptions {
  maxSide?: number;
  quality?: number;
  retryQuality?: number;
  maxBytes?: number;
  minBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxSide: 1600,
  quality: 0.8,
  retryQuality: 0.6,
  maxBytes: 1024 * 1024, // 1 MB
  minBytes: 500 * 1024, // 500 KB
};

function dibujarEnCanvas(bitmap: ImageBitmap, maxSide: number): HTMLCanvasElement {
  let { width, height } = bitmap;
  if (width > maxSide || height > maxSide) {
    if (width >= height) {
      height = Math.round((height * maxSide) / width);
      width = maxSide;
    } else {
      width = Math.round((width * maxSide) / height);
      height = maxSide;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function canvasABlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// Devuelve un nuevo File comprimido, o el original si ya pesa poco o algo falla.
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxSide, quality, retryQuality, maxBytes, minBytes } = { ...DEFAULTS, ...opts };

  if (!file.type.startsWith('image/') || file.size <= minBytes) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const canvas = dibujarEnCanvas(bitmap, maxSide);

    let blob = await canvasABlob(canvas, quality);
    if (blob && blob.size > maxBytes) {
      const reintento = await canvasABlob(canvas, retryQuality);
      if (reintento) blob = reintento;
    }
    if (!blob || blob.size >= file.size) return file;

    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
