"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { budgets, installments, transactions } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import type { FormState } from "@/lib/forms"

/** Crea el presupuesto de un proyecto con N cuotas iguales. */
const budgetSchema = z.object({
  projectId: z.string().uuid(),
  montoTotal: z.coerce.number().positive(),
  moneda: z.string().default("ARS"),
  cuotas: z.coerce.number().int().min(1).max(60),
  primerVencimiento: z.string().min(1), // yyyy-mm-dd
  descripcion: z.string().max(500).optional(),
})

export async function createBudget(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = budgetSchema.safeParse({
    projectId: formData.get("projectId"),
    montoTotal: formData.get("montoTotal"),
    moneda: formData.get("moneda") || "ARS",
    cuotas: formData.get("cuotas"),
    primerVencimiento: formData.get("primerVencimiento"),
    descripcion: formData.get("descripcion") || undefined,
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  const { projectId, montoTotal, moneda, cuotas, primerVencimiento } = parsed.data

  const [budget] = await db
    .insert(budgets)
    .values({
      projectId,
      montoTotal: montoTotal.toString(),
      moneda,
      descripcion: parsed.data.descripcion,
    })
    .returning({ id: budgets.id })

  // Reparte en cuotas mensuales iguales (la última absorbe el redondeo).
  const base = Math.floor((montoTotal / cuotas) * 100) / 100
  const first = new Date(primerVencimiento)
  const rows = Array.from({ length: cuotas }, (_, i) => {
    const vence = new Date(first)
    vence.setMonth(vence.getMonth() + i)
    const monto = i === cuotas - 1 ? montoTotal - base * (cuotas - 1) : base
    return {
      budgetId: budget!.id,
      monto: monto.toFixed(2),
      venceAt: vence.toISOString().slice(0, 10),
    }
  })
  await db.insert(installments).values(rows)

  await audit({ userId: user.id, accion: "create", entityType: "budget", entityId: budget?.id })
  revalidatePath(`/proyectos/${projectId}`)
  return { ok: true }
}

/** Marca una cuota como pagada (o revierte). */
export async function toggleInstallment(id: string, projectId: string, pagar: boolean) {
  const user = await requireUser()
  await db
    .update(installments)
    .set({
      estado: pagar ? "pagada" : "pendiente",
      pagadaAt: pagar ? new Date() : null,
    })
    .where(eq(installments.id, id))
  await audit({ userId: user.id, accion: "update", entityType: "installment", entityId: id })
  revalidatePath(`/proyectos/${projectId}`)
  revalidatePath("/finanzas")
  return { ok: true }
}

const txSchema = z.object({
  tipo: z.enum(["ingreso", "gasto"]),
  monto: z.coerce.number().positive(),
  moneda: z.string().default("ARS"),
  categoria: z.string().max(80).optional(),
  fecha: z.string().min(1),
  descripcion: z.string().max(500).optional(),
  projectId: z.string().uuid().optional().or(z.literal("")),
})

export async function createTransaction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = txSchema.safeParse({
    tipo: formData.get("tipo"),
    monto: formData.get("monto"),
    moneda: formData.get("moneda") || "ARS",
    categoria: formData.get("categoria") || undefined,
    fecha: formData.get("fecha"),
    descripcion: formData.get("descripcion") || undefined,
    projectId: formData.get("projectId") || "",
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  await db.insert(transactions).values({
    tipo: parsed.data.tipo,
    monto: parsed.data.monto.toString(),
    moneda: parsed.data.moneda,
    categoria: parsed.data.categoria,
    fecha: parsed.data.fecha,
    descripcion: parsed.data.descripcion,
    projectId: parsed.data.projectId ? parsed.data.projectId : null,
    realizadoPor: user.id, // atribución: "quién hizo el gasto"
  })
  await audit({ userId: user.id, accion: "create", entityType: "transaction" })
  revalidatePath("/finanzas")
  return { ok: true }
}
