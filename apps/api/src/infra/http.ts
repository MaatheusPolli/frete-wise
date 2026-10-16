export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** fetch nativo + AbortSignal; JSON obrigatório. */
export async function fetchJson(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} em ${url}`);
  try {
    return await res.json();
  } catch {
    throw new HttpError(res.status, `Resposta não-JSON em ${url}`);
  }
}
