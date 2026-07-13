import { type NextRequest, NextResponse } from "next/server"

// Debe coincidir con SESSION_COOKIE de "@/lib/supabase/server". Se inlinea acá
// para no arrastrar better-sqlite3 (módulo nativo) al runtime del proxy.
const SESSION_COOKIE = "demo_session"

/**
 * MODO DEMO — protección de rutas por cookie de sesión (sin Supabase real).
 * Se invoca desde src/proxy.ts. No metas lógica pesada acá.
 */
export async function updateSession(request: NextRequest) {
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
