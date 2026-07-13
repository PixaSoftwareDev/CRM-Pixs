import { redirect } from "next/navigation"
import { db } from "@/db"
import { auditLog } from "@/db/schema"
import { getUser } from "@/lib/auth/session"

/**
 * Devuelve el usuario autenticado o redirige a /login.
 * Usar al inicio de toda Server Action / query que necesite sesión.
 */
export async function requireUser() {
  const user = await getUser()
  if (!user) redirect("/login")
  return user
}

/** Registra una acción en el audit_log (§4.2). Best-effort: no rompe la mutación. */
export async function audit(input: {
  userId: string
  accion: string
  entityType: string
  entityId?: string
  cambios?: Record<string, unknown>
}) {
  try {
    await db.insert(auditLog).values({
      userId: input.userId,
      accion: input.accion,
      entityType: input.entityType,
      entityId: input.entityId,
      cambios: input.cambios,
    })
  } catch {
    // Auditar nunca debe tumbar la operación de negocio.
  }
}
