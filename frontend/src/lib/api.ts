export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    ...opts,
  });

  return parseRespuesta<T>(res);
}

export async function apiUpload<T>(path: string, formData: FormData, method = 'POST'): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    body: formData,
  });

  return parseRespuesta<T>(res);
}

async function parseRespuesta<T>(res: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // respuesta sin cuerpo JSON
  }

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'Error de conexión con el servidor';
    throw new ApiError(res.status, message);
  }

  return data as T;
}
