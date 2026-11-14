import type { IncomingHttpHeaders } from "node:http";

/** Header interno con la IP del cliente que resolvió Fastify. Better Auth lo usa para su rate limit. */
export const CLIENT_IP_HEADER = "x-crm-client-ip";

/**
 * Headers con los que el cliente podría inventarse una IP. No le llegan a
 * Better Auth: la única IP confiable es `request.ip` (Fastify con `trustProxy` acotado).
 */
const SPOOFABLE_IP_HEADERS = new Set([
  CLIENT_IP_HEADER,
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
]);

/**
 * Convierte los headers de Node al formato Fetch que usa Better Auth, sin los
 * de IP que manda el cliente y con la IP real en `CLIENT_IP_HEADER`.
 */
export function toFetchHeaders(raw: IncomingHttpHeaders, clientIp: string): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || SPOOFABLE_IP_HEADERS.has(key.toLowerCase())) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  headers.set(CLIENT_IP_HEADER, clientIp);
  return headers;
}

/**
 * Valor de `trustProxy` de Fastify a partir de `TRUST_PROXY`: "false"/vacío = no
 * se confía en ningún proxy (se usa la IP del socket); si no, lista de IPs/CIDR
 * o rangos con nombre de proxy-addr ("loopback", "uniquelocal"…) separados por coma.
 */
export function parseTrustProxy(value: string | undefined): false | string[] {
  const list = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 || (list.length === 1 && list[0] === "false")) return false;
  if (list.includes("true") || list.includes("*")) {
    throw new Error("TRUST_PROXY no puede confiar en cualquier origen: indicá las IPs o redes del proxy");
  }
  return list;
}
