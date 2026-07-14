import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactCompiler: true,
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
