import { Router } from "express"
import { z } from "zod"
import { db } from "@/db"
import { databases, servers } from "@/db/schema"
import { getServer, listDatabases, listServers } from "@/modules/infra/queries"
import { audit } from "../lib/audit"
import { asyncHandler, HttpError, nil, parse } from "../lib/http"

export const infraRouter = Router()

// GET /api/infra/servers
infraRouter.get(
  "/servers",
  asyncHandler(async (_req, res) => {
    res.json(await listServers())
  }),
)

// GET /api/infra/servers/:id
infraRouter.get(
  "/servers/:id",
  asyncHandler(async (req, res) => {
    const s = await getServer(req.params.id)
    if (!s) throw new HttpError(404, "Servidor no encontrado")
    res.json(s)
  }),
)

// GET /api/infra/databases
infraRouter.get(
  "/databases",
  asyncHandler(async (_req, res) => {
    res.json(await listDatabases())
  }),
)

const serverSchema = z.object({
  nombre: z.string().min(1).max(120),
  proveedor: z.string().max(120).optional(),
  ipHostname: z.string().max(200).optional(),
  specs: z.string().max(500).optional(),
  os: z.string().max(120).optional(),
  costoMensual: z.coerce.number().nonnegative().optional(),
  descripcion: z.string().max(1000).optional(),
})

// POST /api/infra/servers
infraRouter.post(
  "/servers",
  asyncHandler(async (req, res) => {
    const d = parse(serverSchema, req.body)
    const [row] = await db
      .insert(servers)
      .values({
        nombre: d.nombre,
        proveedor: nil(d.proveedor),
        ipHostname: nil(d.ipHostname),
        specs: nil(d.specs),
        os: nil(d.os),
        costoMensual: d.costoMensual?.toString(),
        descripcion: nil(d.descripcion),
      })
      .returning({ id: servers.id })
    await audit({ userId: req.user.id, accion: "create", entityType: "server" })
    res.status(201).json({ id: row?.id })
  }),
)

const databaseSchema = z.object({
  nombre: z.string().min(1).max(120),
  motor: z.string().min(1).max(40).default("postgres"),
  entorno: z.enum(["prod", "staging", "dev"]).default("prod"),
  serverId: z.string().uuid().optional().or(z.literal("")),
  host: z.string().max(200).optional(),
  puerto: z.string().max(10).optional(),
  credencialRef: z.string().max(300).optional(),
  descripcion: z.string().max(1000).optional(),
})

// POST /api/infra/databases
infraRouter.post(
  "/databases",
  asyncHandler(async (req, res) => {
    const d = parse(databaseSchema, req.body)
    const [row] = await db
      .insert(databases)
      .values({
        nombre: d.nombre,
        motor: d.motor,
        entorno: d.entorno,
        serverId: d.serverId ? d.serverId : null,
        host: nil(d.host),
        puerto: nil(d.puerto),
        credencialRef: nil(d.credencialRef),
        descripcion: nil(d.descripcion),
      })
      .returning({ id: databases.id })
    await audit({ userId: req.user.id, accion: "create", entityType: "database" })
    res.status(201).json({ id: row?.id })
  }),
)
