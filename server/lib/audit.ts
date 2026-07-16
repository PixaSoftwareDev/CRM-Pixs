import { db } from "@/db"
import { auditLog } from "@/db/schema"

/**
 * Registro de auditoría — misma tabla y forma que `audit()` de `src/lib/auth.ts`,
 * reimplementado acá para no importar ese módulo (arrastra `next/navigation`).
 * Best-effort: nunca rompe la mutación.
 */
export async function audit(input: {
  userId: string
  accion: string
  entityType: string
  entityId?: string
  cambios?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: input.userId,
      accion: input.accion,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      cambios: input.cambios ?? null,
    })
  } catch {
    // no-op: la auditoría no debe frenar la operación.
  }
}
