import cors from "cors"
import express, { type NextFunction, type Request, type Response } from "express"
import { MulterError } from "multer"
import { requireAuth } from "./lib/auth"
import { config } from "./lib/config"
import { HttpError } from "./lib/http"
import { openapiSpec } from "./openapi"
import { activitiesRouter } from "./routes/activities"
import { authRouter } from "./routes/auth"
import { contactsRouter } from "./routes/contacts"
import { credentialsRouter } from "./routes/credentials"
import { dashboardRouter } from "./routes/dashboard"
import { documentsRouter } from "./routes/documents"
import { infraRouter } from "./routes/infra"
import { moneyRouter } from "./routes/money"
import { opportunitiesRouter } from "./routes/opportunities"
import { projectsRouter } from "./routes/projects"
import { scrapingRouter } from "./routes/scraping"
import { tasksRouter } from "./routes/tasks"
import { usersRouter } from "./routes/users"

const app = express()

app.use(
  cors({
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
  }),
)
app.use(express.json({ limit: "1mb" }))

// Salud (sin auth) — para probes / nginx.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "pixs-api" })
})

// Spec OpenAPI (sin auth) — para conectores/herramientas que descubren la API.
app.get(["/api/openapi.json", "/api/swagger.json", "/api/api-docs"], (_req, res) => {
  res.json(openapiSpec)
})

// Login (sin auth).
app.use("/api/auth", authRouter)

// Todo lo demás requiere JWT.
app.use("/api/contacts", requireAuth, contactsRouter)
app.use("/api/opportunities", requireAuth, opportunitiesRouter)
app.use("/api/projects", requireAuth, projectsRouter)
app.use("/api/tasks", requireAuth, tasksRouter)
app.use("/api/money", requireAuth, moneyRouter)
app.use("/api/documents", requireAuth, documentsRouter)
app.use("/api/credentials", requireAuth, credentialsRouter)
app.use("/api/infra", requireAuth, infraRouter)
app.use("/api/scraping", requireAuth, scrapingRouter)
app.use("/api/activities", requireAuth, activitiesRouter)
app.use("/api/dashboard", requireAuth, dashboardRouter)
app.use("/api/users", requireAuth, usersRouter)

// 404 para rutas /api desconocidas.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" })
})

// Error handler central.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  if (err instanceof MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "El archivo supera los 20 MB" : err.message
    return res.status(400).json({ error: msg })
  }
  console.error("[pixs-api] error no controlado:", err)
  res.status(500).json({ error: "Error interno del servidor" })
})

app.listen(config.port, () => {
  console.log(`[pixs-api] escuchando en http://127.0.0.1:${config.port}`)
})
