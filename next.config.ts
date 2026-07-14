import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

// Subpath opcional para servir la app bajo `/crmpixs` (u otro) cuando comparte
// servidor con otras apps internas. Se fija en build con NEXT_PUBLIC_BASE_PATH.
// Vacío = se sirve en la raíz (comportamiento por defecto en local).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined

const nextConfig: NextConfig = {
  reactCompiler: true,
  basePath,
  // Fijamos la raíz del workspace: hay otro package-lock.json más arriba
  // (/home/guille) que si no confunde a Turbopack sobre cuál es la raíz.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  experimental: {
    // Subida de documentos: el default de Server Actions es 1MB; permitimos
    // hasta 20MB (más un margen de overhead multipart). Ver módulo documents.
    serverActions: { bodySizeLimit: "22mb" },
  },
}

export default nextConfig
