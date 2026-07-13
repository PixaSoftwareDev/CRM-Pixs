# Pixs CRM — Plan Técnico Ejecutable

> Versión 1.0 · Julio 2026
> CRM interno para equipo de 3 (escalable). Prioridad: simplicidad, velocidad de uso, seguridad real donde hay plata y secretos, y una base que crezca sin reescrituras.

---

## 0. Principio rector (léelo antes que nada)

El mayor riesgo de este proyecto **no es técnico, es de alcance**. Seis módulos grandes construidos de una es la forma más segura de que nunca salga. La regla es: **cada fase entrega algo usable a diario**, y no se empieza la siguiente hasta que la anterior está en producción y en uso real.

La segunda regla senior: **tecnología aburrida.** Todo lo que está acá abajo es probado, con comunidad enorme y respuestas a cualquier error en Google. Nada experimental en el camino crítico. Un CRM interno tiene que durar años con mantenimiento mínimo, no ser una vidriera de frameworks.

---

## 1. Stack (con el porqué y el trade-off de cada elección)

| Capa | Elección | Por qué | Trade-off aceptado |
|---|---|---|---|
| **Lenguaje** | TypeScript (strict) | Type-safety de la DB al frontend. Menos bugs en runtime, refactors seguros. | Curva si el equipo viene de JS puro. Vale la pena. |
| **Framework** | Next.js 16 (App Router, Server Components, Server Actions) | Full-stack en un repo, un solo deploy. RSC baja el JS del cliente. Server Actions evitan escribir una API REST entera para un tool interno. | Acoplado a React/Vercel. Para interno, no importa. |
| **Runtime** | Node.js 22 LTS | Requerido por Next 16 (mín. 20). LTS = estable y con soporte. | — |
| **Base de datos** | PostgreSQL 17 (gestionada por Supabase) | El caballo de batalla. Relacional (que es lo que este dominio pide), full-text search nativo, JSON cuando hace falta, RLS para seguridad a nivel fila. Escala muchísimo más de lo que Pixs va a necesitar. | — |
| **ORM** | Drizzle | Schema en TypeScript (no un DSL aparte), queries tipo SQL con tipos, migraciones que **vos controlás** (clave para hacer `CREATE INDEX CONCURRENTLY` y no lockear tablas), bundle mínimo, y encaja muy bien con RLS de Supabase. | Menos "mágico" que Prisma; asume comodidad con SQL. Es lo que querés en un equipo de devs. |
| **Auth** | Supabase Auth | 3 usuarios reales desde el día 1 (email+password o magic link). Habilita atribución (quién gastó, quién hizo la tarea) y RLS sin reescribir después. | — |
| **Almacenamiento de archivos** | Supabase Storage (buckets privados + signed URLs) | Capturas, comprobantes, evidencia. Signed URLs = nadie accede sin permiso. | — |
| **Cifrado de secretos** | Supabase Vault (pgsodium) / libsodium a nivel app | Para credenciales que **sí o sí** vivan en la app. Ver §4. | — |
| **UI** | Tailwind CSS v4 + shadcn/ui (Radix) | Componentes accesibles que **son tuyos** (copiás el código, no dependés de una lib que rompe). Radix te da accesibilidad seria gratis. | Más setup inicial que una lib "todo incluido". Pagás una vez. |
| **Drag & drop (Kanban)** | dnd-kit | El estándar accesible para D&D en React. Teclado, touch, sensores. | — |
| **Validación** | Zod | Un esquema, validás en cliente y servidor. Nunca confiás en el input. | — |
| **Formularios** | React Hook Form + resolver de Zod | Performático, poco re-render. | — |
| **Estado servidor (cliente)** | TanStack Query, **sólo** donde haga falta (kanban, filtros en vivo) | El resto es Server Components. No metas estado global de más. | — |
| **Alertas / email** | Resend | Enviar mails de pagos vencidos es trivial. | — |
| **Jobs / cron** | pg_cron (Supabase) al inicio → Inngest o Trigger.dev cuando llegue el scraping | Alertas diarias = cron simple. Pipeline de scraping (multi-paso, con reintentos) = motor durable. | — |
| **Observabilidad** | Sentry (errores) + Axiom o Vercel logs | Te enterás de los errores antes que el equipo. | — |
| **Testing** | Vitest (unit) + Playwright (e2e de flujos críticos: auth, pagos) | No testeás todo; testeás lo que si se rompe te cuesta plata. | — |
| **Lint/format** | Biome (o ESLint + Prettier) | Biome hace lint+format en uno y es rápido. | — |
| **CI/CD** | GitHub Actions | Typecheck, lint, test, chequeo de migraciones, preview deploy por PR. | — |
| **Hosting** | **Opción A:** Vercel (app) + Supabase (DB/storage/auth). **Opción B:** 1 VPS con Docker + Coolify. | A = cero infra, escala solo, ideal para arrancar. B = costo fijo y sin lock-in si te preocupa. | Ver §9. |

**Sobre Drizzle vs Prisma:** ambos sirven en 2026 (Prisma 7 cerró la brecha de performance). Elijo Drizzle acá por tres razones concretas para *este* proyecto: (1) el schema es TypeScript real, así que generás tablas repetitivas con código; (2) controlás el SQL de las migraciones, lo que evita locks de tabla en producción cuando agregás columnas/índices; (3) juega mejor con RLS de Supabase. Si el equipo prefiere máxima abstracción y menos SQL, Prisma 7 es intercambiable sin cambiar el resto del plan.

---

## 2. Arquitectura

Monolito modular. Un solo Next.js que contiene todo, organizado por dominio. Nada de microservicios: para 3 personas es puro overhead. La única pieza que eventualmente se separa es el worker de scraping (fase tardía), porque es long-running y conviene aislarlo.

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js 16 (Vercel)                  │
│                                                          │
│  Server Components (lectura)   Server Actions (escritura)│
│         │                              │                 │
│         └──────────┬───────────────────┘                 │
│                    │ Drizzle + Zod (validación)          │
└────────────────────┼─────────────────────────────────────┘
                     │
        ┌────────────┼───────────────┬──────────────┐
        ▼            ▼               ▼              ▼
   ┌─────────┐  ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Postgres│  │ Storage  │   │  Auth    │   │  Vault   │
   │  + RLS  │  │ (archivos│   │ (3 users)│   │ (secretos│
   │         │  │  privados)│  │          │   │ cifrados)│
   └─────────┘  └──────────┘   └──────────┘   └──────────┘
        ▲
        │ pg_cron (alertas diarias)
        │
   ┌────┴─────────────────────────────┐
   │ Jobs durables (Inngest/Trigger)  │  ← sólo cuando llega scraping
   │  Google Places → Crawler → Claude│
   └──────────────────────────────────┘
```

**Flujo de una escritura (ejemplo: crear un pago):**
Cliente → Server Action → valida con Zod → chequea permisos (auth) → Drizzle inserta → RLS confirma acceso → revalida cache → UI actualizada. Sin API REST intermedia, sin estado que sincronizar a mano.

---

## 3. Modelo de datos

Las tres separaciones que hacen que esto escale (ya lo habíamos hablado): **Contacto ≠ Oportunidad ≠ Proyecto**. El pipeline mide *negocios*, no personas.

```
users
  id, nombre, email, rol, avatar_url, created_at

contacts                          -- la persona/empresa (persiste para siempre)
  id, nombre, empresa, email, telefono, sitio_web,
  source (manual|scraping|referido...),   -- ← "sello de origen"
  notas, created_at, updated_at

opportunities                     -- lo que se mueve por el pipeline
  id, contact_id → contacts,
  titulo, estado (consultado|posible|pendiente|confirmado|en_desarrollo|finalizado|perdido),
  motivo_perdida,                 -- ← métrica barata y clave
  valor_estimado, probabilidad,
  scraping_campaign_id → scraping_campaigns (nullable),
  created_at, updated_at, estado_cambiado_at   -- para medir tiempo por etapa

projects                          -- se crea al pasar a "confirmado"
  id, opportunity_id → opportunities,
  nombre, estado, fecha_inicio, fecha_fin_estimada, created_at

tasks                             -- kanban estilo Trello
  id, project_id → projects,
  titulo, descripcion, estado (columna del board), orden (para D&D),
  asignado_a → users, vence_at, created_at

task_checklist_items
  id, task_id → tasks, texto, completado, orden

-- LÍNEA DE TIEMPO POLIMÓRFICA (nota/archivo/captura que cuelga de lo que sea)
activities
  id, tipo (nota|archivo|cambio_estado|comentario),
  entity_type (contact|opportunity|project|task),
  entity_id,
  contenido, archivo_url (Storage), autor_id → users, created_at

-- INVENTARIO DE INFRAESTRUCTURA (compartido, no por proyecto)
servers
  id, nombre, proveedor, ip_hostname, specs, os, costo_mensual,
  estado (activo|baja|caido), renovacion_at, descripcion, created_at

databases
  id, nombre, motor (postgres|mysql|mongo...), server_id → servers,
  host, puerto, entorno (prod|staging|dev),
  credencial_ref,               -- ← referencia a gestor de secretos, NO el secreto
  descripcion, created_at

project_infra                     -- relación N:N (un server sirve a varios proyectos)
  project_id → projects, server_id → servers, database_id → databases

project_tech_info                 -- repos, dominios, deploys, docs, links (lo NO secreto)
  id, project_id → projects, tipo, label, valor, created_at

-- DINERO (pagos + finanzas = un solo módulo con dos vistas)
budgets
  id, project_id → projects, monto_total, moneda, descripcion, created_at

installments                      -- cuotas
  id, budget_id → budgets, monto, vence_at, estado (pendiente|pagada|vencida),
  metodo_pago, comprobante_url (Storage), pagada_at

transactions                      -- ingresos y gastos de la empresa
  id, tipo (ingreso|gasto), monto, moneda, categoria,
  realizado_por → users,          -- ← "quién hizo el gasto"
  project_id → projects (nullable), fecha, comprobante_url, descripcion

-- CAPTACIÓN / SCRAPING
scraping_campaigns
  id, nombre, query, ubicacion, cantidad, campos_extra (jsonb),
  estado (pendiente|corriendo|completada|error), created_by → users, created_at

scraping_leads                    -- bandeja de revisión (antes de entrar al pipeline)
  id, campaign_id → scraping_campaigns,
  nombre, email, telefono, contacto_nombre, contacto_area,
  sitio_web, descripcion, datos_extra (jsonb),
  estado (nuevo|aprobado|descartado|duplicado),
  contact_id → contacts (nullable, cuando se aprueba)

-- AUDITORÍA (quién hizo qué — barato y salva vidas)
audit_log
  id, user_id → users, accion, entity_type, entity_id, cambios (jsonb), created_at
```

**Índices que sí o sí van** (rendimiento): FKs, `opportunities.estado`, `installments.vence_at` + `estado`, `transactions.fecha`, y un índice **full-text** (`tsvector`) sobre `servers` y `databases` para la búsqueda instantánea del inventario, y para el buscador global (Cmd+K).

Definí bien **"pendiente"** (¿presupuesto enviado? ¿esperando respuesta?) antes de arrancar, o va a significar cosas distintas para cada uno.

---

## 4. Seguridad (la parte donde no se improvisa)

Este CRM concentra **plata, credenciales de producción y datos de contacto de personas**. Es un objetivo jugoso. Tres frentes:

### 4.1 Secretos y credenciales (el más delicado)
- **Regla de oro:** para credenciales *vivas de producción* (accesos a hosting, DBs de clientes), guardá una **referencia a un gestor de contraseñas** (Bitwarden/1Password) — el campo `credencial_ref` —, no el secreto. El CRM sabe *dónde está*, no *qué es*. Reduce drásticamente la superficie de riesgo.
- Para lo que **sí** deba vivir en la app: cifrado con **Supabase Vault** (pgsodium) o **libsodium** a nivel app, con la clave maestra en variables de entorno del server (**nunca** en la base, nunca en el repo). Jamás inventes tu propio cifrado.
- Lo no-secreto (repos, dominios, motor de DB, para qué se usa) va en texto plano para poder buscarlo rápido.

### 4.2 Acceso a datos
- **Row Level Security (RLS) activo en TODAS las tablas desde el día 1.** Aunque hoy sean 3 personas con acceso total, esto te deja pasar a permisos por rol sin reescribir nada.
- **Validá cada input** de cada Server Action con Zod. Nunca confíes en el cliente.
- **Rate limiting** (Upstash o el de Vercel) en acciones sensibles (login, scraping, envío de mails).
- **Signed URLs** para todo archivo: buckets privados, acceso temporal y autenticado.
- **Audit log** desde el principio: quién tocó qué. Barato de implementar, invaluable cuando algo no cuadra.

### 4.3 Operación
- **Backups:** PITR diario de Supabase + un `pg_dump` periódico a un storage separado. No es opcional teniendo plata acá adentro.
- **Entornos separados:** dev / staging / prod, con secretos distintos en cada uno.
- **Dependencias:** Dependabot + `npm audit` en CI. Actualizá Next.js apenas salgan parches de seguridad (el App Router tuvo varios CVEs serios en 2025-2026; mantenete al día).
- **Datos de contacto (scraping):** guardá datos *profesionales/de empresa*, no personales privados, y tené forma de borrarlos si alguien lo pide (Ley 25.326 en Argentina). Es prospección B2B normal, sólo hay que hacerla prolija.

---

## 5. Rendimiento

- **Server Components** por defecto = menos JavaScript en el cliente = más rápido.
- **Connection pooling** (pooler de Supabase / PgBouncer) obligatorio en serverless, o agotás conexiones.
- **Full-text search en Postgres** (`tsvector`) para el inventario y el buscador global — instantáneo, sin servicios externos.
- **Paginación / virtualización** en listas largas (leads scrapeados, transacciones).
- **Cache Components de Next 16** (`"use cache"`) donde el dato no cambia seguido (dashboards, métricas).
- **Edición inline y optimistic updates** en el kanban para que se *sienta* instantáneo.

---

## 6. Estructura del proyecto

```
pixs-crm/
├── src/
│   ├── app/                        # rutas (App Router)
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx            # dashboard: qué necesita atención hoy
│   │   │   ├── pipeline/           # oportunidades (drag entre estados)
│   │   │   ├── proyectos/[id]/     # kanban + info técnica + pagos
│   │   │   ├── infra/              # inventario VPS/DBs + buscador
│   │   │   ├── finanzas/           # ingresos/gastos/rentabilidad
│   │   │   └── captacion/          # scraping + bandeja de leads
│   │   └── api/                    # sólo webhooks (Resend, jobs)
│   ├── db/
│   │   ├── schema/                 # tablas Drizzle por dominio
│   │   ├── migrations/             # SQL versionado (lo controlás vos)
│   │   └── index.ts                # cliente Drizzle
│   ├── modules/                    # lógica por dominio (no en los componentes)
│   │   ├── contacts/  opportunities/  projects/  tasks/
│   │   ├── infra/  payments/  finance/  scraping/
│   │   └── <cada uno>: actions.ts (Server Actions) · queries.ts · schemas.ts (Zod) · service.ts
│   ├── components/
│   │   ├── ui/                     # shadcn/ui
│   │   └── <compartidos>
│   ├── lib/                        # auth, crypto, storage, rate-limit, utils
│   └── config/
├── tests/                          # Vitest + Playwright
├── .github/workflows/ci.yml
├── drizzle.config.ts
└── .env.example
```

**Principio:** la lógica de negocio vive en `modules/*/service.ts`, no dentro de los componentes React. Los componentes muestran; los módulos deciden. Esto hace el código testeable y te deja mover lógica a un worker aparte sin tocar la UI.

---

## 7. Roadmap por fases

Cada fase es **desplegable y usable**. No se avanza sin la anterior en producción.

### Fase 0 — Fundaciones (1 semana)
Repo, CI/CD, Supabase (DB+Auth+Storage), Drizzle configurado, RLS base, layout + auth con los 3 usuarios, `.env` y entornos. Al terminar: entrás y ves un dashboard vacío. **No entrega valor de negocio pero es el cimiento que evita reescrituras.**

### Fase 1 — Núcleo CRM (lo que se usa a diario)
Contactos + oportunidades con **drag entre estados** + **timeline** (notas, archivos, capturas) + dashboard básico ("qué necesita atención hoy"). Deja previstos en el schema `source`, `scraping_campaign_id`, y las tablas `servers`/`databases` aunque sus pantallas vengan después (así no migrás nada).
→ **Con esto ya reemplazás el Excel/WhatsApp caótico.**

### Fase 2 — Proyecto + Infraestructura
Al confirmar una oportunidad se habilita el **kanban de tareas** (asignación, checklist, comentarios) + **info técnica** del proyecto + **inventario de infraestructura** (VPS/DBs con buscador full-text y filtros, relación N:N con proyectos). Van juntos porque comparten la lógica de "guardar datos técnicos con secretos protegidos".

### Fase 3 — Dinero (pagos + finanzas)
Presupuestos, cuotas, vencimientos, comprobantes, **alertas por email** (pg_cron + Resend) + ingresos/gastos con atribución + **cuentas por cobrar** en el dashboard + rentabilidad real + export CSV para el contador. Pagos y finanzas = un módulo con dos vistas.

### Fase 4 — Captación / Scraping
Google Places (recolección) → bandeja de **leads** con dedup → aprobación → entran al pipeline como "posible" con **sello de origen**. En una segunda pasada: enriquecimiento con crawler + Claude (email, contacto, descripción). Corre en jobs durables (Inngest/Trigger.dev). Métrica clave: cuántos leads scrapeados se convirtieron en clientes reales.

### Transversal (todo el tiempo)
Paleta de comandos **Cmd+K** (saltar a cualquier cliente/recurso, crear sin mouse), responsive para lo esencial (alertas, notas rápidas) desde el celular, detección de **oportunidades frías** (sin actividad en X días), plantillas de tareas reutilizables.

---

## 8. Buenas prácticas de ingeniería

- **TypeScript strict**, sin `any`. Los tipos salen de la DB (Drizzle) y fluyen hasta la UI.
- **Zod en cada borde**: todo input externo validado antes de tocar la base.
- **Migraciones versionadas y revisadas** en PR. Nunca `push` directo a prod. Usá `CREATE INDEX CONCURRENTLY` para no lockear tablas.
- **Tests donde duele**: e2e de auth y pagos (Playwright), unit de la lógica de dinero y de dedup de leads (Vitest). No persigas 100% de cobertura.
- **CI obligatorio** antes de merge: typecheck + lint + test + chequeo de que las migraciones aplican.
- **Errores tipados**, no `throw` de strings sueltos. Sentry en producción.
- **Commits y PRs chicos.** Feature flags simples para lo que no está listo.
- **Un README que arranca el proyecto en 5 comandos.** Si un dev nuevo no levanta el entorno en 20 minutos, algo está mal.

---

## 9. Hosting: dos caminos

**Opción A — Vercel + Supabase (recomendada para arrancar).**
Cero infraestructura que mantener, escala solo, preview deploys por PR, backups gestionados. Costo variable pero para 3 personas arranca prácticamente en el tramo gratis/barato. Es lo que elegiría para salir rápido.

**Opción B — VPS único con Docker + Coolify.**
Un servidor (el que ya tengas), Postgres + la app en contenedores, Coolify para deploys tipo-Vercel self-hosted. Costo **fijo y predecible**, sin lock-in, todo tu dato en tu máquina. Más control, más responsabilidad (backups, updates, seguridad del server son tuyos). Buena opción si te incomoda depender de terceros o querés costo plano.

Podés empezar en A y migrar a B después: como todo es Postgres estándar + Next.js, la mudanza es real pero acotada.

---

## 10. Bootstrap — comandos para correr hoy

```bash
# 1. Crear el proyecto (Next 16 + TS + Tailwind + App Router)
npx create-next-app@latest pixs-crm \
  --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd pixs-crm

# 2. Dependencias core
npm install drizzle-orm postgres @supabase/supabase-js @supabase/ssr zod \
  react-hook-form @hookform/resolvers @tanstack/react-query @dnd-kit/core @dnd-kit/sortable \
  resend
npm install -D drizzle-kit @biomejs/biome vitest @playwright/test

# 3. shadcn/ui
npx shadcn@latest init

# 4. Supabase: crear proyecto en supabase.com, copiar credenciales
#    Configurar Auth (email), crear buckets privados de Storage

# 5. Variables de entorno (.env.local) — NUNCA al repo
#    DATABASE_URL=postgresql://...          (usar el pooler para serverless)
#    NEXT_PUBLIC_SUPABASE_URL=...
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#    SUPABASE_SERVICE_ROLE_KEY=...          (sólo en el server)
#    ENCRYPTION_KEY=...                     (clave maestra de cifrado, sólo server)
#    RESEND_API_KEY=...
#    ANTHROPIC_API_KEY=...                  (para el enriquecimiento, fase 4)

# 6. Definir schema en src/db/schema/, luego:
npx drizzle-kit generate    # genera el SQL de migración (revisalo)
npx drizzle-kit migrate     # aplica

# 7. Correr
npm run dev
```

**`.env.example`** (sin valores) va al repo para que cualquiera sepa qué configurar. El `.env.local` real, jamás.

---

## 11. Estimación de costos (arranque, equipo de 3)

| Servicio | Plan inicial | Costo aprox. |
|---|---|---|
| Vercel | Hobby/Pro | US$0–20/mes |
| Supabase | Free/Pro | US$0–25/mes |
| Resend | Free (3k mails/mes) | US$0 |
| Sentry | Free tier | US$0 |
| Google Places API (fase 4) | Pago por uso | ~US$5–30/mes según volumen |
| Claude API (fase 4, enriquecimiento) | Pago por uso | Bajo, según leads |

Arrancás prácticamente gratis. Los costos aparecen recién en la fase 4 (scraping), y son proporcionales al uso.

---

## 12. Definiciones a cerrar antes de codear

Estas tres cambian el modelo de datos, así que conviene decidirlas ya:

1. **¿Un cliente puede tener varios proyectos a la vez, o trabajan de a uno?** (afecta la relación contact→opportunity→project).
2. **¿Los pagos van siempre por proyecto, o puede haber un acuerdo que cubra varios?** (afecta `budgets`).
3. **¿"Pendiente" en el pipeline significa qué exactamente?** (define el estado o será ambiguo).

Con esas respuestas, el siguiente paso concreto es escribir el **schema Drizzle de la Fase 1** (contactos + oportunidades + timeline + users + audit_log) con sus índices y políticas RLS, y el layout con auth. Eso es un día de trabajo y ya tenés algo corriendo.
