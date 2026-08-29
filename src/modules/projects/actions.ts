"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { PROJECT_STATES, type ProjectState, projects, projectTechInfo } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import type { FormState } from "@/lib/forms"

export async function setProjectState(id: string, estado: ProjectState) {
  const user = await requireUser()
  if (!PROJECT_STATES.includes(estado)) return { error: "Estado inválido" }
  await db.update(projects).set({ estado }).where(eq(projects.id, id))
  await audit({ userId: user.id, accion: "update", entityType: "project", entityId: id })
  revalidatePath(`/proyectos/${id}`)
  return { ok: true }
}

const techSchema = z.object({
  projectId: z.string().uuid(),
  tipo: z.enum(["repo", "dominio", "deploy", "doc", "link"]),
  label: z.string().min(1).max(120),
  valor: z.string().min(1).max(500),
})

export async function addTechInfo(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = techSchema.safeParse({
    projectId: formData.get("projectId"),
    tipo: formData.get("tipo"),
    label: formData.get("label"),
    valor: formData.get("valor"),
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  await db.insert(projectTechInfo).values(parsed.data)
  await audit({
    userId: user.id,
    accion: "create",
    entityType: "project_tech_info",
    entityId: parsed.data.projectId,
  })
  revalidatePath(`/proyectos/${parsed.data.projectId}`)
  return { ok: true }
}

export async function deleteTechInfo(id: string, projectId: string) {
  await requireUser()
  await db.delete(projectTechInfo).where(eq(projectTechInfo.id, id))
  revalidatePath(`/proyectos/${projectId}`)
}

/** Alta de proyecto directa, sin pasar por el embudo de ventas. */
const newProjectSchema = z.object({
  contactId: z.string().uuid(),
  nombre: z.string().min(1).max(200),
  estado: z.enum(PROJECT_STATES).default("activo"),
  fechaInicio: z.string().optional(),
})

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = newProjectSchema.safeParse({
    contactId: formData.get("contactId"),
    nombre: formData.get("nombre"),
    estado: formData.get("estado") || "activo",
    fechaInicio: formData.get("fechaInicio") || undefined,
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  // Sin `opportunityId`: el proyecto nace del cliente, no de una oportunidad ganada.
  const [project] = await db
    .insert(projects)
    .values({
      contactId: parsed.data.contactId,
      nombre: parsed.data.nombre,
      estado: parsed.data.estado,
      fechaInicio: parsed.data.fechaInicio,
    })
    .returning({ id: projects.id })

  await audit({ userId: user.id, accion: "create", entityType: "project", entityId: project?.id })
  revalidatePath("/proyectos")
  revalidatePath(`/contactos/${parsed.data.contactId}`)
  return { ok: true }
}
