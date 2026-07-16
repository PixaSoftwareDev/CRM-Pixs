import { eq } from "drizzle-orm"
import { Router } from "express"
import { z } from "zod"
import { db } from "@/db"
import { contactPeople, contacts } from "@/db/schema"
import {
  getContact,
  listContactOpportunities,
  listContactPeople,
  listContacts,
} from "@/modules/contacts/queries"
import { cleanContact, contactSchema } from "@/modules/contacts/schemas"
import { audit } from "../lib/audit"
import { asyncHandler, HttpError, parse } from "../lib/http"

export const contactsRouter = Router()

// GET /api/contacts?search=
contactsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined
    res.json(await listContacts(search))
  }),
)

// GET /api/contacts/:id
contactsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const c = await getContact(req.params.id)
    if (!c) throw new HttpError(404, "Cliente no encontrado")
    res.json(c)
  }),
)

// GET /api/contacts/:id/opportunities
contactsRouter.get(
  "/:id/opportunities",
  asyncHandler(async (req, res) => {
    res.json(await listContactOpportunities(req.params.id))
  }),
)

// POST /api/contacts
contactsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parse(contactSchema, req.body)
    const [row] = await db
      .insert(contacts)
      .values({ ...cleanContact(data), source: "manual" })
      .returning({ id: contacts.id })
    await audit({
      userId: req.user.id,
      accion: "create",
      entityType: "contact",
      entityId: row?.id,
    })
    res.status(201).json({ id: row?.id })
  }),
)

// PATCH /api/contacts/:id
contactsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parse(contactSchema, req.body)
    await db
      .update(contacts)
      .set({ ...cleanContact(data), updatedAt: new Date() })
      .where(eq(contacts.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "update",
      entityType: "contact",
      entityId: req.params.id,
    })
    res.json({ id: req.params.id })
  }),
)

// DELETE /api/contacts/:id
contactsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await db.delete(contacts).where(eq(contacts.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "delete",
      entityType: "contact",
      entityId: req.params.id,
    })
    res.json({ ok: true })
  }),
)

// --- Personas de contacto ---

const personSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  puesto: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  telefono: z.string().trim().max(60).optional(),
})

// GET /api/contacts/:id/people
contactsRouter.get(
  "/:id/people",
  asyncHandler(async (req, res) => {
    res.json(await listContactPeople(req.params.id))
  }),
)

// POST /api/contacts/:id/people
contactsRouter.post(
  "/:id/people",
  asyncHandler(async (req, res) => {
    const d = parse(personSchema, req.body)
    const [row] = await db
      .insert(contactPeople)
      .values({
        contactId: req.params.id,
        nombre: d.nombre,
        puesto: d.puesto || null,
        email: d.email || null,
        telefono: d.telefono || null,
      })
      .returning({ id: contactPeople.id })
    await audit({ userId: req.user.id, accion: "create", entityType: "contact_person" })
    res.status(201).json({ id: row?.id })
  }),
)

// DELETE /api/contacts/people/:personId
contactsRouter.delete(
  "/people/:personId",
  asyncHandler(async (req, res) => {
    await db.delete(contactPeople).where(eq(contactPeople.id, req.params.personId))
    await audit({
      userId: req.user.id,
      accion: "delete",
      entityType: "contact_person",
      entityId: req.params.personId,
    })
    res.json({ ok: true })
  }),
)
