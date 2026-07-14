/**
 * MODO DEMO — siembra un usuario y datos de ejemplo en la base SQLite.
 * Uso: npx tsx scripts/seed-demo.ts
 */
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../src/db/schema"

const sqlite = new Database(process.env.SQLITE_PATH ?? "demo.sqlite")
sqlite.pragma("foreign_keys = ON")
const db = drizzle(sqlite, { schema })

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (n: number) => iso(new Date(Date.now() + n * 86400000))

async function main() {
  // Usuarios del equipo. Alejo es el admin y con quien se loguea (admin@pixs.com).
  const userId = crypto.randomUUID()
  const enzoId = crypto.randomUUID()
  const guillermoId = crypto.randomUUID()
  await db.insert(schema.users).values([
    { id: userId, nombre: "Alejo", email: "admin@pixs.com", rol: "admin" },
    { id: enzoId, nombre: "Enzo", email: "enzo@pixs.com", rol: "miembro" },
    { id: guillermoId, nombre: "Guillermo", email: "guillermo@pixs.com", rol: "miembro" },
  ])

  // Clientes (el negocio, con la persona de contacto)
  const c1 = crypto.randomUUID()
  const c2 = crypto.randomUUID()
  const c3 = crypto.randomUUID()
  await db.insert(schema.contacts).values([
    {
      id: c1,
      nombre: "Panadería La Espiga",
      personaContacto: "Laura Gómez – dueña",
      email: "laura@laespiga.com",
      telefono: "+54 11 5555-1001",
      sitioWeb: "https://laespiga.com",
      source: "manual",
    },
    {
      id: c2,
      nombre: "Estudio Ruiz & Asoc.",
      personaContacto: "Martín Ruiz",
      email: "martin@ruizasoc.com",
      telefono: "+54 11 5555-1002",
      sitioWeb: "https://ruizasoc.com",
      source: "referido",
    },
    {
      id: c3,
      nombre: "Gimnasio FitZone",
      personaContacto: "Sofía Díaz",
      email: "sofia@fitzone.com",
      telefono: "+54 11 5555-1003",
      source: "scraping",
    },
  ])

  // Oportunidades (varios estados del pipeline)
  const o1 = crypto.randomUUID()
  const o2 = crypto.randomUUID()
  const o3 = crypto.randomUUID()
  const o4 = crypto.randomUUID()
  await db.insert(schema.opportunities).values([
    {
      id: o1,
      contactId: c1,
      titulo: "Sitio web + e-commerce",
      estado: "ganado",
      valorEstimado: "850000",
      moneda: "ARS",
    },
    {
      id: o2,
      contactId: c2,
      titulo: "Sistema de turnos",
      estado: "en_proceso",
      valorEstimado: "1200000",
      moneda: "ARS",
    },
    {
      id: o3,
      contactId: c3,
      titulo: "App de reservas",
      estado: "nuevo",
      valorEstimado: "600000",
      moneda: "ARS",
    },
    {
      id: o4,
      contactId: c2,
      titulo: "Landing campaña verano",
      estado: "en_proceso",
      valorEstimado: "300000",
      moneda: "ARS",
    },
  ])

  // Proyecto (de la oportunidad confirmada)
  const p1 = crypto.randomUUID()
  await db.insert(schema.projects).values({
    id: p1,
    opportunityId: o1,
    nombre: "Web + e-commerce La Espiga",
    estado: "activo",
    fechaInicio: addDays(-20),
    fechaFinEstimada: addDays(40),
  })

  // Tareas del proyecto (kanban)
  await db.insert(schema.tasks).values([
    {
      projectId: p1,
      titulo: "Diseño de home",
      estado: "hecho",
      orden: 0,
      asignados: JSON.stringify([userId]),
    },
    {
      projectId: p1,
      titulo: "Catálogo de productos",
      estado: "en_curso",
      orden: 0,
      asignados: JSON.stringify([enzoId, guillermoId]),
    },
    {
      projectId: p1,
      titulo: "Pasarela de pago",
      estado: "backlog",
      orden: 0,
      asignados: JSON.stringify([guillermoId]),
    },
    { projectId: p1, titulo: "Revisión responsive", estado: "revision", orden: 0 },
  ])

  // Presupuesto + cuotas (una vencida, una próxima)
  const b1 = crypto.randomUUID()
  await db.insert(schema.budgets).values({
    id: b1,
    projectId: p1,
    montoTotal: "850000",
    moneda: "ARS",
    descripcion: "Anticipo + 2 cuotas",
  })
  await db.insert(schema.installments).values([
    { budgetId: b1, monto: "283333", venceAt: addDays(-5), estado: "pendiente" },
    { budgetId: b1, monto: "283333", venceAt: addDays(6), estado: "pendiente" },
    { budgetId: b1, monto: "283334", venceAt: addDays(30), estado: "pendiente" },
  ])

  // Transacciones (ingresos/gastos)
  await db.insert(schema.transactions).values([
    {
      tipo: "ingreso",
      monto: "283333",
      moneda: "ARS",
      categoria: "anticipo",
      realizadoPor: userId,
      projectId: p1,
      fecha: addDays(-18),
    },
    {
      tipo: "gasto",
      monto: "45000",
      moneda: "ARS",
      categoria: "hosting",
      realizadoPor: userId,
      fecha: addDays(-10),
    },
    {
      tipo: "gasto",
      monto: "12500",
      moneda: "ARS",
      categoria: "dominio",
      descripcion: "Renovación dominio .com",
      realizadoPor: enzoId,
      fecha: addDays(-7),
    },
    {
      tipo: "gasto",
      monto: "30000",
      moneda: "ARS",
      categoria: "publicidad",
      descripcion: "Créditos Google Ads",
      realizadoPor: guillermoId,
      fecha: addDays(-4),
    },
    {
      tipo: "gasto",
      monto: "8000",
      moneda: "ARS",
      categoria: "herramientas",
      descripcion: "Suscripción Figma",
      realizadoPor: enzoId,
      fecha: addDays(-2),
    },
  ])

  // Infra
  const s1 = crypto.randomUUID()
  await db.insert(schema.servers).values({
    id: s1,
    nombre: "vps-produccion",
    proveedor: "Hetzner",
    ipHostname: "203.0.113.10",
    specs: "4 vCPU / 8GB RAM",
    os: "Ubuntu 24.04",
    costoMensual: "18000",
    estado: "activo",
    descripcion: "VPS principal de producción",
  })
  await db.insert(schema.databases).values({
    nombre: "pixs_prod",
    motor: "postgres",
    serverId: s1,
    host: "203.0.113.10",
    puerto: "5432",
    entorno: "prod",
    credencialRef: "bitwarden://pixs/db-prod",
    descripcion: "Base principal del CRM",
  })

  // Captación: campaña + leads
  const camp = crypto.randomUUID()
  await db.insert(schema.scrapingCampaigns).values({
    id: camp,
    nombre: "Gimnasios CABA",
    query: "gimnasios en Buenos Aires",
    ubicacion: "CABA",
    cantidad: 20,
    estado: "completada",
    createdBy: userId,
  })
  await db.insert(schema.scrapingLeads).values([
    {
      campaignId: camp,
      nombre: "Gimnasio PowerGym",
      email: "info@powergym.com",
      telefono: "+54 11 4444-2001",
      sitioWeb: "https://powergym.com",
      estado: "nuevo",
    },
    {
      campaignId: camp,
      nombre: "Box CrossTraining",
      email: "hola@boxct.com",
      telefono: "+54 11 4444-2002",
      estado: "aprobado",
    },
  ])

  const count = sqlite.prepare("select count(*) as n from contacts").get() as { n: number }
  console.log(`Seed OK. Contactos: ${count.n}. Usuario: admin@pixs.com`)
}

main()
