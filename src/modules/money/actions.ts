"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { budgets, documents, installments, transactions } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import type { FormState } from "@/lib/forms"
import { saveDocumentFile } from "@/lib/storage"
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from "@/modules/documents/shared"

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
  if (!budget) throw new Error("No se pudo crear el presupuesto")

  // Reparte en cuotas mensuales iguales (la última absorbe el redondeo).
  const base = Math.floor((montoTotal / cuotas) * 100) / 100
  const first = new Date(primerVencimiento)
  const rows = Array.from({ length: cuotas }, (_, i) => {
    const vence = new Date(first)
    vence.setMonth(vence.getMonth() + i)
    const monto = i === cuotas - 1 ? montoTotal - base * (cuotas - 1) : base
    return {
      budgetId: budget.id,
      monto: monto.toFixed(2),
      venceAt: vence.toISOString().slice(0, 10),
    }
  })
  await db.insert(installments).values(rows)

  await audit({ userId: user.id, accion: "create", entityType: "budget", entityId: budget?.id })
  revalidatePath(`/proyectos/${projectId}`)
  return { ok: true }
}

/**
 * Marca una cuota como pagada (o revierte). Al pagar, registra el ingreso en la
 * caja vinculado a la cuota; al revertir, borra ese ingreso. Así el cobro
 * aparece en Finanzas y no se duplica.
 */
export async function toggleInstallment(id: string, projectId: string, pagar: boolean) {
  const user = await requireUser()

  await db
    .update(installments)
    .set({
      estado: pagar ? "pagada" : "pendiente",
      pagadaAt: pagar ? new Date() : null,
    })
    .where(eq(installments.id, id))

  // Movimiento en caja: uno solo por cuota (borro cualquiera previo por las dudas).
  await db.delete(transactions).where(eq(transactions.installmentId, id))
  if (pagar) {
    const [cuota] = await db
      .select({ monto: installments.monto, moneda: budgets.moneda })
      .from(installments)
      .innerJoin(budgets, eq(installments.budgetId, budgets.id))
      .where(eq(installments.id, id))
      .limit(1)
    if (cuota) {
      await db.insert(transactions).values({
        tipo: "ingreso",
        monto: cuota.monto,
        moneda: cuota.moneda,
        categoria: "Cobro de proyecto",
        projectId,
        installmentId: id,
        fecha: new Date().toISOString().slice(0, 10),
        realizadoPor: user.id,
        descripcion: "Cobro de cuota",
      })
    }
  }

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
  realizadoPor: z.string().uuid().optional().or(z.literal("")),
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
    realizadoPor: formData.get("realizadoPor") || "",
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  // Comprobante opcional (factura/ticket). Se valida antes de tocar la base.
  const file = formData.get("comprobante")
  const tieneComprobante = file instanceof File && file.size > 0
  if (tieneComprobante) {
    if (file.size > MAX_DOCUMENT_SIZE) return { error: "El comprobante supera los 20 MB" }
    if (!ALLOWED_DOCUMENT_TYPES[file.type]) {
      return { error: "Comprobante no permitido (PDF, imágenes, Office, texto o ZIP)" }
    }
  }

  const [tx] = await db
    .insert(transactions)
    .values({
      tipo: parsed.data.tipo,
      monto: parsed.data.monto.toString(),
      moneda: parsed.data.moneda,
      categoria: parsed.data.categoria,
      fecha: parsed.data.fecha,
      descripcion: parsed.data.descripcion,
      projectId: parsed.data.projectId ? parsed.data.projectId : null,
      // Quién lo pagó: el elegido en el form, o el usuario actual por defecto.
      realizadoPor: parsed.data.realizadoPor ? parsed.data.realizadoPor : user.id,
    })
    .returning({ id: transactions.id })

  // El comprobante reusa la infra de documentos: cuelga del movimiento y se
  // sirve por /api/documentos/[id]. El id del doc queda en comprobante_url.
  if (tieneComprobante && tx) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const storedName = await saveDocumentFile(buffer, file.name)
    const [doc] = await db
      .insert(documents)
      .values({
        entityType: "transaction",
        entityId: tx.id,
        nombre: file.name,
        storedName,
        mimeType: file.type,
        tamano: file.size,
        subidoPor: user.id,
      })
      .returning({ id: documents.id })
    if (doc) {
      await db
        .update(transactions)
        .set({ comprobanteUrl: doc.id })
        .where(eq(transactions.id, tx.id))
    }
  }

  await audit({ userId: user.id, accion: "create", entityType: "transaction", entityId: tx?.id })
  revalidatePath("/finanzas")
  return { ok: true }
}

/** Marca un gasto como reintegrado (devuelto a quien lo pagó) o lo revierte. */
export async function toggleReintegro(id: string, devuelto: boolean): Promise<FormState> {
  const user = await requireUser()
  await db
    .update(transactions)
    .set({ reintegrado: devuelto, reintegradoAt: devuelto ? new Date() : null })
    .where(eq(transactions.id, id))
  await audit({ userId: user.id, accion: "update", entityType: "transaction", entityId: id })
  revalidatePath("/finanzas")
  return { ok: true }
}

/**
 * Devuelve de una vez todo lo que se le debe a una persona: marca reintegrados
 * todos sus gastos pendientes. Es el botón "Pagado" de la columna "Falta pagar".
 */
export async function reintegrarTodo(userId: string): Promise<FormState> {
  const user = await requireUser()
  if (!z.string().uuid().safeParse(userId).success) return { error: "Usuario inválido" }
  await db
    .update(transactions)
    .set({ reintegrado: true, reintegradoAt: new Date() })
    .where(
      and(
        eq(transactions.tipo, "gasto"),
        eq(transactions.realizadoPor, userId),
        eq(transactions.reintegrado, false),
      ),
    )
  await audit({ userId: user.id, accion: "update", entityType: "transaction", entityId: userId })
  revalidatePath("/finanzas")
  return { ok: true }
}
