/**
 * Shim no-op de `server-only`. Ese paquete lo provee Next para marcar módulos
 * que jamás deben ir al cliente; no existe en node_modules y rompería el backend
 * Express (proceso Node plano) al importar módulos de `src` que lo usan
 * (crypto, email, scraping/enrich, scraping/places). Acá siempre corremos en el
 * server, así que es seguro que sea un import vacío. Se mapea solo para el
 * backend vía server/tsconfig.json; Next sigue usando su propia resolución.
 */
export {}
