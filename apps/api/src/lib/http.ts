import type { IncomingHttpHeaders } from "node:http";

/** Convierte los headers de Node al formato Fetch que usa Better Auth. */
export function toFetchHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  return headers;
}
