import { type NextRequest, NextResponse } from "next/server"
import { SESSION_COOKIE } from "./constants"

/**
 * Protección de rutas por cookie de sesión. Se invoca desde `src/proxy.ts`.
 * Corre en el runtime del proxy (edge), así que no importa nada de la base
 * (better-sqlite3 es nativo): solo mira la presencia de la cookie.
 */
export function guardSession(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value)

  const path = request.nextUrl.pathname
  const isPublic = path.startsWith("/login") || path.startsWith("/auth")

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}
