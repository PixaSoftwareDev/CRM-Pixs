========================================================================
  PIXS CRM — RUTAS
  Base web:  http://200.58.109.110/crmpixs        (VPS DattaWeb, HTTP 80)
  Base API:  http://200.58.109.110/crmpixs/api    (REST + JWT Bearer)
  Host / egress: 200.58.109.110  (alt: sd-5994335-l.dattaweb.com)
  Actualizado: 2026-08-28
========================================================================


RUTA PRINCIPAL
------------------------------------------------------------------------
  GET  /crmpixs                      -> redirige a /crmpixs/login


PÁGINAS (GET — requieren sesión por cookie salvo /login)
------------------------------------------------------------------------
  GET  /crmpixs/login                Login
  GET  /crmpixs/dashboard            Panel principal
  GET  /crmpixs/contactos            Contactos / Clientes
  GET  /crmpixs/contactos/[id]       Detalle de un contacto
  GET  /crmpixs/pipeline             Oportunidades (kanban)
  GET  /crmpixs/pipeline/[id]        Detalle de una oportunidad
  GET  /crmpixs/proyectos            Proyectos
  GET  /crmpixs/proyectos/[id]       Detalle de un proyecto
  GET  /crmpixs/tareas               Tareas
  GET  /crmpixs/finanzas             Finanzas / pagos
  GET  /crmpixs/infra                Infraestructura (VPS, bases)
  GET  /crmpixs/accesos              Accesos / credenciales
  GET  /crmpixs/captacion            Captación / scraping de leads

  Endpoints internos de la app Next (sesión por cookie):
  GET  /crmpixs/api/finanzas/export      Export CSV de transacciones
  GET  /crmpixs/api/documentos/[id]      Descarga un documento por id


API REST (server/ Express, proceso pm2 "pixs-api", puerto 3005)
------------------------------------------------------------------------
  Auth: header  Authorization: Bearer <JWT>  en todo salvo /health,
  /auth/login y /auth/demo-login. Token de servicio vigente vence
  2027-07-16 (se genera con `npm run api:token` en el VPS).

  Salud / auth / spec
    GET    /crmpixs/api/health
    GET    /crmpixs/api/openapi.json     Spec OpenAPI 3 (alias: swagger.json, api-docs; sin auth)
    POST   /crmpixs/api/auth/login
    POST   /crmpixs/api/auth/demo-login
    GET    /crmpixs/api/auth/me

  Contactos
    GET    /crmpixs/api/contacts?search=
    POST   /crmpixs/api/contacts
    GET    /crmpixs/api/contacts/:id
    PATCH  /crmpixs/api/contacts/:id
    DELETE /crmpixs/api/contacts/:id
    GET    /crmpixs/api/contacts/:id/opportunities
    GET    /crmpixs/api/contacts/:id/people
    POST   /crmpixs/api/contacts/:id/people
    DELETE /crmpixs/api/contacts/people/:personId

  Oportunidades
    GET    /crmpixs/api/opportunities
    POST   /crmpixs/api/opportunities
    GET    /crmpixs/api/opportunities/:id
    PATCH  /crmpixs/api/opportunities/:id
    DELETE /crmpixs/api/opportunities/:id
    POST   /crmpixs/api/opportunities/:id/move

  Proyectos
    GET    /crmpixs/api/projects
    GET    /crmpixs/api/projects/:id
    PATCH  /crmpixs/api/projects/:id/state
    GET    /crmpixs/api/projects/:id/tech-info
    POST   /crmpixs/api/projects/:id/tech-info
    DELETE /crmpixs/api/projects/tech-info/:techId

  Tareas
    GET    /crmpixs/api/tasks
    POST   /crmpixs/api/tasks
    PATCH  /crmpixs/api/tasks/:id
    DELETE /crmpixs/api/tasks/:id
    POST   /crmpixs/api/tasks/:id/status
    POST   /crmpixs/api/tasks/:id/move
    GET    /crmpixs/api/tasks/by-project/:projectId

  Dinero
    GET    /crmpixs/api/money/receivables
    GET    /crmpixs/api/money/summary
    GET    /crmpixs/api/money/transactions
    GET    /crmpixs/api/money/budget/:projectId
    POST   /crmpixs/api/money/budgets
    POST   /crmpixs/api/money/transactions
    POST   /crmpixs/api/money/transactions/:id/reintegro
    POST   /crmpixs/api/money/installments/:id/toggle

  Documentos
    GET    /crmpixs/api/documents
    POST   /crmpixs/api/documents
    GET    /crmpixs/api/documents/:id
    DELETE /crmpixs/api/documents/:id

  Credenciales
    GET    /crmpixs/api/credentials
    POST   /crmpixs/api/credentials
    PATCH  /crmpixs/api/credentials/:id
    DELETE /crmpixs/api/credentials/:id
    POST   /crmpixs/api/credentials/:id/reveal

  Infraestructura
    GET    /crmpixs/api/infra/servers
    GET    /crmpixs/api/infra/servers/:id
    POST   /crmpixs/api/infra/servers
    GET    /crmpixs/api/infra/databases
    POST   /crmpixs/api/infra/databases

  Captación / scraping
    GET    /crmpixs/api/scraping/campaigns
    POST   /crmpixs/api/scraping/campaigns
    POST   /crmpixs/api/scraping/campaigns/:id/run
    GET    /crmpixs/api/scraping/leads
    GET    /crmpixs/api/scraping/leads/stats
    POST   /crmpixs/api/scraping/leads/:id/approve
    POST   /crmpixs/api/scraping/leads/:id/discard
    POST   /crmpixs/api/scraping/leads/:id/enrich
    DELETE /crmpixs/api/scraping/leads/:id

  Actividades / dashboard / usuarios
    GET    /crmpixs/api/activities
    POST   /crmpixs/api/activities/note
    GET    /crmpixs/api/dashboard/summary
    GET    /crmpixs/api/users


NOTA
------------------------------------------------------------------------
  Solo HTTP (no HTTPS): el server block de nginx escucha en el 80.
  Las páginas web usan sesión por cookie (redirigen 307 a /login).
  La API REST usa JWT Bearer y es la que consume el conector Intellix.
========================================================================
