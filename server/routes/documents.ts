import { eq } from "drizzle-orm"
import { Router } from "express"
import multer from "multer"
import { z } from "zod"
import { db } from "@/db"
import { DOCUMENT_ENTITIES, documents } from "@/db/schema"
import { deleteDocumentFile, readDocumentFile, saveDocumentFile } from "@/lib/storage"
import { listDocuments } from "@/modules/documents/queries"
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from "@/modules/documents/shared"
import { audit } from "../lib/audit"
import { asyncHandler, HttpError, parse } from "../lib/http"

export const documentsRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE } })

const listQuery = z.object({
  entityType: z.enum(DOCUMENT_ENTITIES),
  entityId: z.string().uuid(),
})

// GET /api/documents?entityType=&entityId=
documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = parse(listQuery, req.query)
    res.json(await listDocuments(entityType, entityId))
  }),
)

// POST /api/documents  (multipart `file`, campos entityType/entityId)
documentsRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = parse(listQuery, req.body)
    const file = req.file
    if (!file) throw new HttpError(400, "Elegí un archivo")
    if (!ALLOWED_DOCUMENT_TYPES[file.mimetype]) {
      throw new HttpError(400, "Tipo de archivo no permitido (PDF, imágenes, Office, texto o ZIP)")
    }
    const storedName = await saveDocumentFile(file.buffer, file.originalname)
    const [row] = await db
      .insert(documents)
      .values({
        entityType,
        entityId,
        nombre: file.originalname,
        storedName,
        mimeType: file.mimetype,
        tamano: file.size,
        subidoPor: req.user.id,
      })
      .returning({ id: documents.id })
    await audit({
      userId: req.user.id,
      accion: "create",
      entityType: "document",
      entityId: row?.id,
    })
    res.status(201).json({ id: row?.id })
  }),
)

// GET /api/documents/:id  → binario (inline; ?download=1 fuerza descarga)
documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [doc] = await db.select().from(documents).where(eq(documents.id, req.params.id)).limit(1)
    if (!doc) throw new HttpError(404, "No encontrado")
    let file: Buffer
    try {
      file = await readDocumentFile(doc.storedName)
    } catch {
      throw new HttpError(404, "Archivo no disponible")
    }
    const download = req.query.download === "1"
    const disposition = download ? "attachment" : "inline"
    const encoded = encodeURIComponent(doc.nombre)
    res.setHeader("content-type", doc.mimeType)
    res.setHeader("content-disposition", `${disposition}; filename*=UTF-8''${encoded}`)
    res.setHeader("cache-control", "private, no-store")
    res.send(file)
  }),
)

// DELETE /api/documents/:id
documentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const [doc] = await db.select().from(documents).where(eq(documents.id, req.params.id)).limit(1)
    if (!doc) throw new HttpError(404, "El documento ya no existe")
    await db.delete(documents).where(eq(documents.id, req.params.id))
    await deleteDocumentFile(doc.storedName)
    await audit({
      userId: req.user.id,
      accion: "delete",
      entityType: "document",
      entityId: req.params.id,
    })
    res.json({ ok: true })
  }),
)
