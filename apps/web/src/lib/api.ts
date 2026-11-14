import { BASE } from "./base";

/** Error de la API con el mensaje que devuelve el server (ya pensado para mostrar). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/**
 * La ficha pedida no existe: id desconocido (404) o que ni siquiera tiene forma de
 * id (400, p. ej. `/clientes/abc`). Reintentar no sirve.
 */
export const isNotFound = (err: unknown) => err instanceof ApiError && (err.status === 404 || err.status === 400);

type Query = Record<string, string | number | undefined | null>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const init: RequestInit = { method, credentials: "include", headers: {} };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + withQuery(path, query), init);

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      issues?: { path: string; message: string }[];
    } | null;
    if (res.status === 401) window.dispatchEvent(new Event("auth:expired"));
    throw new ApiError(res.status, data?.error ?? "Algo salió mal. Probá de nuevo.", data?.issues);
  }
  // Un 201/204 puede venir sin cuerpo: no es un error.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T = void>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T = void>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T = void>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
