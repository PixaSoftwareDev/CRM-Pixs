"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { databases, servers } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import type { FormState } from "@/lib/forms"

const serverSchema = z.object({
  nombre: z.string().min(1).max(120),
  proveedor: z.string().max(120).optional().or(z.literal("")),
  ipHostname: z.string().max(200).optional().or(z.literal("")),
  specs: z.string().max(500).optional().or(z.literal("")),
  os: z.string().max(120).optional().or(z.literal("")),
  costoMensual: z.coerce.number().nonnegative().optional(),
  descripcion: z.string().max(1000).optional().or(z.literal("")),
})

const nil = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : ""
  return s.length ? s : null
}

export async function createServer(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = serverSchema.safeParse({
    nombre: formData.get("nombre"),
    proveedor: formData.get("proveedor") ?? "",
    ipHostname: formData.get("ipHostname") ?? "",
    specs: formData.get("specs") ?? "",
    os: formData.get("os") ?? "",
    costoMensual: formData.get("costoMensual") || undefined,
    descripcion: formData.get("descripcion") ?? "",
  })
  if (!parsed.success) return { error: "El nombre es obligatorio" }

  await db.insert(servers).values({
    nombre: parsed.data.nombre,
    proveedor: nil(formData.get("proveedor")),
    ipHostname: nil(formData.get("ipHostname")),
    specs: nil(formData.get("specs")),
    os: nil(formData.get("os")),
    costoMensual: parsed.data.costoMensual?.toString(),
    descripcion: nil(formData.get("descripcion")),
  })
  await audit({ userId: user.id, accion: "create", entityType: "server" })
  revalidatePath("/infra")
  return { ok: true }
}

const databaseSchema = z.object({
  nombre: z.string().min(1).max(120),
  motor: z.string().min(1).max(40),
  entorno: z.enum(["prod", "staging", "dev"]),
  serverId: z.string().uuid().optional().or(z.literal("")),
  host: z.string().max(200).optional().or(z.literal("")),
  puerto: z.string().max(10).optional().or(z.literal("")),
  // Referencia al gestor de secretos, NO el secreto (§4.1).
  credencialRef: z.string().max(300).optional().or(z.literal("")),
  descripcion: z.string().max(1000).optional().or(z.literal("")),
})

export async function createDatabase(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = databaseSchema.safeParse({
    nombre: formData.get("nombre"),
    motor: formData.get("motor") || "postgres",
    entorno: formData.get("entorno") || "prod",
    serverId: formData.get("serverId") ?? "",
    host: formData.get("host") ?? "",
    puerto: formData.get("puerto") ?? "",
    credencialRef: formData.get("credencialRef") ?? "",
    descripcion: formData.get("descripcion") ?? "",
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  await db.insert(databases).values({
    nombre: parsed.data.nombre,
    motor: parsed.data.motor,
    entorno: parsed.data.entorno,
    serverId: parsed.data.serverId ? parsed.data.serverId : null,
    host: nil(formData.get("host")),
    puerto: nil(formData.get("puerto")),
    credencialRef: nil(formData.get("credencialRef")),
    descripcion: nil(formData.get("descripcion")),
  })
  await audit({ userId: user.id, accion: "create", entityType: "database" })
  revalidatePath("/infra")
  return { ok: true }
}
