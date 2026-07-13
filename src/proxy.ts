import type { NextRequest } from "next/server"
import { guardSession } from "@/lib/auth/guard"

// Next 16 renombró la convención "middleware" a "proxy".
export async function proxy(request: NextRequest) {
  return guardSession(request)
}

export const config = {
  // Corre en todo salvo assets estáticos e imágenes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
