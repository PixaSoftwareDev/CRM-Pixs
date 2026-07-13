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
