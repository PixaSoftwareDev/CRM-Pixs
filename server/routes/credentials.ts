import { eq } from "drizzle-orm"
import { Router } from "express"
import { z } from "zod"
import { db } from "@/db"
import { CREDENTIAL_TYPES, type CredentialType, credentials } from "@/db/schema"
import { listCredentials } from "@/modules/credentials/queries"
import { audit } from "../lib/audit"
import { decryptSecret, encryptSecret } from "../lib/crypto"
import { asyncHandler, HttpError, parse } from "../lib/http"

export const credentialsRouter = Router()

// GET /api/credentials?q=&projectId=&tipo=  (NUNCA devuelve el secreto)
credentialsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined
    const tipo = typeof req.query.tipo === "string" ? (req.query.tipo as CredentialType) : undefined
    res.json(await listCredentials({ q, projectId, tipo }))
  }),
)

const baseSchema = z.object({
  titulo: z.string().min(1, "El título es obligatorio").max(200),
  tipo: z.enum(CREDENTIAL_TYPES),
  usuario: z.string().max(200).optional(),
  secreto: z.string().max(2000).optional(),
  url: z.string().max(500).optional(),
  projectId: z.string().uuid().optional(),
  notas: z.string().max(2000).optional(),
})

const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : ""
  return s === "" ? undefined : s
}
function normalize(body: Record<string, unknown>) {
  return {
    titulo: body.titulo ?? "",
    tipo: body.tipo ?? "otro",
    usuario: clean(body.usuario),
    secreto: clean(body.secreto),
    url: clean(body.url),
    projectId: clean(body.projectId),
    notas: clean(body.notas),
  }
}

// POST /api/credentials
credentialsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = parse(baseSchema, normalize(req.body ?? {}))
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
    await audit({
      userId: req.user.id,
      accion: "create",
      entityType: "credential",
      entityId: row?.id,
    })
    res.status(201).json({ id: row?.id })
  }),
)

// PATCH /api/credentials/:id  (secreto vacío = no se toca)
credentialsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = parse(baseSchema, normalize(req.body ?? {}))
    await db
      .update(credentials)
      .set({
        titulo: d.titulo,
        tipo: d.tipo,
        usuario: d.usuario ?? null,
        ...(d.secreto ? { secretoCifrado: await encryptSecret(d.secreto) } : {}),
        url: d.url ?? null,
        projectId: d.projectId ?? null,
        notas: d.notas ?? null,
        updatedAt: new Date(),
      })
      .where(eq(credentials.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "update",
      entityType: "credential",
      entityId: req.params.id,
    })
    res.json({ id: req.params.id })
  }),
)

// DELETE /api/credentials/:id
credentialsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await db.delete(credentials).where(eq(credentials.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "delete",
      entityType: "credential",
      entityId: req.params.id,
    })
    res.json({ ok: true })
  }),
)

// POST /api/credentials/:id/reveal  → descifra el secreto (única vía)
credentialsRouter.post(
  "/:id/reveal",
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select({ secreto: credentials.secretoCifrado })
      .from(credentials)
      .where(eq(credentials.id, req.params.id))
      .limit(1)
    if (!row?.secreto) throw new HttpError(404, "Sin secreto guardado")
    try {
      const value = await decryptSecret(row.secreto)
      await audit({
        userId: req.user.id,
        accion: "reveal",
        entityType: "credential",
        entityId: req.params.id,
      })
      res.json({ value })
    } catch {
      throw new HttpError(500, "No se pudo descifrar (¿cambió la ENCRYPTION_KEY?)")
    }
  }),
)
