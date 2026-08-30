"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { credentials } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import { decryptSecret, encryptSecret } from "@/lib/crypto"
import type { FormState } from "@/lib/forms"

const baseSchema = z.object({
  titulo: z.string().min(1, "El título es obligatorio").max(200),
  // Texto libre, normalizado: "VPS" y "vps" tienen que ser el mismo tipo.
  tipo: z
    .string()
    .min(1)
    .max(60)
    .transform((v) => v.trim().toLowerCase().replace(/\s+/g, " ")),
  usuario: z.string().max(200).optional(),
  secreto: z.string().max(2000).optional(),
  url: z.string().max(500).optional(),
  projectId: z.string().uuid().optional(),
  notas: z.string().max(2000).optional(),
})

function parse(formData: FormData) {
  const clean = (v: FormDataEntryValue | null) => {
    const s = typeof v === "string" ? v.trim() : ""
    return s === "" ? undefined : s
  }
  return baseSchema.safeParse({
    titulo: formData.get("titulo") ?? "",
    tipo: formData.get("tipo") ?? "otro",
    usuario: clean(formData.get("usuario")),
    secreto: clean(formData.get("secreto")),
    url: clean(formData.get("url")),
    projectId: clean(formData.get("projectId")),
    notas: clean(formData.get("notas")),
  })
}

export async function createCredential(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = parse(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  const d = parsed.data

  const [row] = await db
    .insert(credentials)
    .values({
      titulo: d.titulo,
      tipo: d.tipo,
      usuario: d.usuario ?? null,
      secretoCifrado: d.secreto ? await encryptSecret(d.secreto) : null,
      url: d.url ?? null,
      projectId: d.projectId ?? null,
      notas: d.notas ?? null,
    })
    .returning({ id: credentials.id })

  await audit({ userId: user.id, accion: "create", entityType: "credential", entityId: row?.id })
  revalidatePath("/accesos")
  return { ok: true, id: row?.id }
}

/**
 * Edita un acceso. El campo `secreto` vacío deja el existente intacto (no se
 * pisa sin querer); para cambiarlo hay que escribir uno nuevo.
 */
export async function updateCredential(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser()
  const parsed = parse(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  const d = parsed.data

  await db
    .update(credentials)
    .set({
      titulo: d.titulo,
      tipo: d.tipo,
      usuario: d.usuario ?? null,
      // Solo re-cifra si mandaron un secreto nuevo; si viene vacío, no toca el campo.
      ...(d.secreto ? { secretoCifrado: await encryptSecret(d.secreto) } : {}),
      url: d.url ?? null,
      projectId: d.projectId ?? null,
      notas: d.notas ?? null,
      updatedAt: new Date(),
    })
    .where(eq(credentials.id, id))

  await audit({ userId: user.id, accion: "update", entityType: "credential", entityId: id })
  revalidatePath("/accesos")
  return { ok: true, id }
}

export async function deleteCredential(id: string): Promise<FormState> {
  const user = await requireUser()
  await db.delete(credentials).where(eq(credentials.id, id))
  await audit({ userId: user.id, accion: "delete", entityType: "credential", entityId: id })
  revalidatePath("/accesos")
  return { ok: true }
}

/**
 * Descifra y devuelve el secreto de un acceso puntual. Es la ÚNICA vía por la
 * que el secreto llega al cliente, y solo cuando el usuario pide "mostrar".
 */
export async function revealSecret(id: string): Promise<{ value?: string; error?: string }> {
  const user = await requireUser()
  const [row] = await db
    .select({ secreto: credentials.secretoCifrado })
    .from(credentials)
    .where(eq(credentials.id, id))
    .limit(1)
  if (!row?.secreto) return { error: "Sin secreto guardado" }

  try {
    const value = await decryptSecret(row.secreto)
    await audit({ userId: user.id, accion: "reveal", entityType: "credential", entityId: id })
    return { value }
  } catch {
    return { error: "No se pudo descifrar (¿cambió la ENCRYPTION_KEY?)" }
  }
}
