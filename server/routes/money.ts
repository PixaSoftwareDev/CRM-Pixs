import { eq } from "drizzle-orm"
import { Router } from "express"
import multer from "multer"
import { z } from "zod"
import { db } from "@/db"
import { budgets, documents, installments, transactions } from "@/db/schema"
import { saveDocumentFile } from "@/lib/storage"
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from "@/modules/documents/shared"
import {
  financeSummary,
  getProjectBudget,
  listTransactions,
  receivables,
} from "@/modules/money/queries"
import { audit } from "../lib/audit"
import { asyncHandler, HttpError, parse } from "../lib/http"

export const moneyRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE } })

// GET /api/money/receivables
moneyRouter.get(
  "/receivables",
  asyncHandler(async (_req, res) => {
    res.json(await receivables())
  }),
)

// GET /api/money/summary
moneyRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    res.json(await financeSummary())
  }),
)

// GET /api/money/budget/:projectId
moneyRouter.get(
  "/budget/:projectId",
  asyncHandler(async (req, res) => {
    res.json(await getProjectBudget(req.params.projectId))
  }),
)

// GET /api/money/transactions?from=&to=
moneyRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : undefined
    const to = typeof req.query.to === "string" ? req.query.to : undefined
    res.json(await listTransactions({ from, to }))
  }),
)

const budgetSchema = z.object({
  projectId: z.string().uuid(),
  montoTotal: z.coerce.number().positive(),
  moneda: z.string().default("ARS"),
  cuotas: z.coerce.number().int().min(1).max(60),
  primerVencimiento: z.string().min(1),
  descripcion: z.string().max(500).optional(),
})

// POST /api/money/budgets
moneyRouter.post(
  "/budgets",
  asyncHandler(async (req, res) => {
    const d = parse(budgetSchema, req.body)
    const [budget] = await db
      .insert(budgets)
      .values({
        projectId: d.projectId,
        montoTotal: d.montoTotal.toString(),
        moneda: d.moneda,
        descripcion: d.descripcion,
      })
      .returning({ id: budgets.id })
    if (!budget) throw new Error("No se pudo crear el presupuesto")

    const base = Math.floor((d.montoTotal / d.cuotas) * 100) / 100
    const first = new Date(d.primerVencimiento)
    const rows = Array.from({ length: d.cuotas }, (_, i) => {
      const vence = new Date(first)
      vence.setMonth(vence.getMonth() + i)
      const monto = i === d.cuotas - 1 ? d.montoTotal - base * (d.cuotas - 1) : base
      return {
        budgetId: budget.id,
        monto: monto.toFixed(2),
        venceAt: vence.toISOString().slice(0, 10),
      }
    })
    await db.insert(installments).values(rows)
    await audit({
      userId: req.user.id,
      accion: "create",
      entityType: "budget",
      entityId: budget?.id,
    })
    res.status(201).json({ id: budget?.id })
  }),
)

// POST /api/money/installments/:id/toggle  { projectId, pagar }
const toggleSchema = z.object({ projectId: z.string().uuid(), pagar: z.boolean() })
moneyRouter.post(
  "/installments/:id/toggle",
  asyncHandler(async (req, res) => {
    const { projectId, pagar } = parse(toggleSchema, req.body)
    const id = req.params.id
    await db
      .update(installments)
      .set({ estado: pagar ? "pagada" : "pendiente", pagadaAt: pagar ? new Date() : null })
      .where(eq(installments.id, id))
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
          realizadoPor: req.user.id,
          descripcion: "Cobro de cuota",
        })
      }
    }
    await audit({ userId: req.user.id, accion: "update", entityType: "installment", entityId: id })
    res.json({ ok: true })
  }),
)

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

// POST /api/money/transactions  (multipart opcional: campo `comprobante`)
moneyRouter.post(
  "/transactions",
  upload.single("comprobante"),
  asyncHandler(async (req, res) => {
    const d = parse(txSchema, req.body)
    const file = req.file
    if (file && !ALLOWED_DOCUMENT_TYPES[file.mimetype]) {
      throw new HttpError(400, "Comprobante no permitido (PDF, imágenes, Office, texto o ZIP)")
    }
    const [tx] = await db
      .insert(transactions)
      .values({
        tipo: d.tipo,
        monto: d.monto.toString(),
        moneda: d.moneda,
        categoria: d.categoria,
        fecha: d.fecha,
        descripcion: d.descripcion,
        projectId: d.projectId ? d.projectId : null,
        realizadoPor: d.realizadoPor ? d.realizadoPor : req.user.id,
      })
      .returning({ id: transactions.id })

    if (file && tx) {
      const storedName = await saveDocumentFile(file.buffer, file.originalname)
      const [doc] = await db
        .insert(documents)
        .values({
          entityType: "transaction",
          entityId: tx.id,
          nombre: file.originalname,
          storedName,
          mimeType: file.mimetype,
          tamano: file.size,
          subidoPor: req.user.id,
        })
        .returning({ id: documents.id })
      if (doc) {
        await db
          .update(transactions)
          .set({ comprobanteUrl: doc.id })
          .where(eq(transactions.id, tx.id))
      }
    }
    await audit({
      userId: req.user.id,
      accion: "create",
      entityType: "transaction",
      entityId: tx?.id,
    })
    res.status(201).json({ id: tx?.id })
  }),
)

// POST /api/money/transactions/:id/reintegro  { devuelto }
const reintegroSchema = z.object({ devuelto: z.boolean() })
moneyRouter.post(
  "/transactions/:id/reintegro",
  asyncHandler(async (req, res) => {
    const { devuelto } = parse(reintegroSchema, req.body)
    await db
      .update(transactions)
      .set({ reintegrado: devuelto, reintegradoAt: devuelto ? new Date() : null })
      .where(eq(transactions.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "update",
      entityType: "transaction",
      entityId: req.params.id,
    })
    res.json({ ok: true })
  }),
)
