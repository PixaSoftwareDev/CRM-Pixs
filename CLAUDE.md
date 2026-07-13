# CLAUDE.md — Pixs CRM

Guía para trabajar en este repositorio. El diseño de dominio vive en **[plan-tecnico.md](./plan-tecnico.md)** — leelo antes de tomar decisiones de arquitectura.

> ℹ️ **Decisión vigente:** la app corre sobre **SQLite** con **auth local por cookie**, sin Supabase/Postgres. Donde el plan viejo menciona Supabase, RLS o Vault, aplica esta guía y **[DEMO.md](./DEMO.md)**.

> ⚠️ **Next.js 16 tiene breaking changes** respecto a versiones conocidas. Ver reglas en [AGENTS.md](./AGENTS.md) y los docs en `node_modules/next/dist/docs/` antes de escribir código de framework.

@AGENTS.md

## Estado actual

**Fases 0–4 COMPLETAS** — el CRM está construido end-to-end: buildea, typecheckea y lintea. Corre en local sobre **SQLite** con auth local por cookie, sin servicios externos. Para levantarlo: `npm install` → `npm run db:push` → `npm run db:seed` → `npm run dev`, y entrar con `admin@pixs.com` / `demo1234` (ver **[DEMO.md](./DEMO.md)**). El botón "Acceso rápido (demo)" del login entra directo.

Decisiones §12 tomadas (defaults flexibles, ajustables sin reescribir):
1. Un contacto puede tener varias oportunidades/proyectos a la vez.
2. Presupuestos por proyecto (`budgets.project_id`).
3. "pendiente" = presupuesto enviado, esperando respuesta.

### Notas de implementación (Next 16 — breaking changes)
- La convención `middleware` se renombró a **`proxy`**: el archivo es `src/proxy.ts` y exporta `proxy()`.
- `cookies()` es **async** en Server Components/Actions.
- Env vars: `serverEnv()` (secretos, solo server) en `src/lib/env.ts`. Valida las claves de integraciones (cifrado, email, scraping); la base es SQLite y no lleva credenciales.
- Cliente `db` **lazy** (Proxy) en `src/db/index.ts`: abre `demo.sqlite` (better-sqlite3) en el primer uso, no al importar (así el build no necesita la base creada).
- Server Actions usan el tipo compartido `FormState` (`src/lib/forms.ts`) para encajar con `useActionState`.
- Schema: SQLite vía Drizzle (`src/db/schema/*`). Se sincroniza con `npm run db:push`; el buscador usa `LIKE`.
- Enriquecimiento de leads: SDK `@anthropic-ai/sdk`, modelo `claude-opus-4-8`, structured outputs (`output_config.format`). Ver `src/modules/scraping/enrich.ts`.
- Alertas de pago: `src/app/api/cron/alertas-pagos` (protegido por `CRON_SECRET`), agendar con `docs/pg_cron_alertas.sql`.

## Stack (resumen — ver §1 del plan para el porqué)

- **Lenguaje:** TypeScript (strict, sin `any`)
- **Framework:** Next.js 16 (App Router, Server Components, Server Actions)
- **DB:** SQLite (`better-sqlite3`), local · **ORM:** Drizzle
- **Auth:** sesión local por cookie httpOnly (`src/lib/auth/session.ts`), contraseña compartida
- **UI:** Tailwind v4 + shadcn/ui · **D&D:** dnd-kit
- **Validación:** Zod (en cada borde) · **Forms:** React Hook Form
- **Tests:** Vitest (unit) + Playwright (e2e) · **Lint:** Biome

## Reglas de oro

- **Zod valida todo input externo** antes de tocar la base. Nunca confiar en el cliente.
- **La autorización se chequea en el server** (`requireUser()` en cada Server Action/query protegida). El proxy (`src/proxy.ts`) es solo un candado por cookie; el candado real es server-side.
- **Lógica de negocio en `modules/*/service.ts`**, no dentro de los componentes React.
- **Secretos:** guardar una *referencia* a Bitwarden/1Password (`credencial_ref`), no el secreto. Lo que deba cifrarse va por `src/lib/crypto.ts` con `ENCRYPTION_KEY`. Nunca inventar cifrado propio.
- **Schema como fuente de verdad.** El schema Drizzle (`src/db/schema/*`) se sincroniza con `npm run db:push`. Revisá los cambios de schema en PR.
- **Server Components por defecto**; TanStack Query solo donde haga falta (kanban, filtros en vivo).
- Nunca commitear `.env`. `.env.example` (sin valores) sí va al repo.

## Comandos

```bash
npm run dev            # desarrollo
npm run typecheck      # tsc --noEmit
npm run lint           # biome check
npm run format         # biome check --write
npm test               # vitest run
npm run db:push        # sincroniza el schema Drizzle con demo.sqlite
npm run db:seed        # siembra usuario admin + datos de ejemplo
npm run db:studio      # explorar la base con Drizzle Studio
```

Cómo correr en local: ver **[DEMO.md](./DEMO.md)**.

## Roadmap (ver §7 del plan)

Cada fase es desplegable y usable. No se avanza sin la anterior en producción.

- **Fase 0:** ✅ Fundaciones (repo, CI/CD, SQLite + Drizzle, auth local por cookie)
- **Fase 1:** ✅ Núcleo CRM (contactos + oportunidades + timeline + dashboard)
- **Fase 2:** ✅ Proyecto + Infraestructura (kanban, inventario VPS/DBs con búsqueda)
- **Fase 3:** ✅ Dinero (pagos, finanzas, cuentas por cobrar, CSV, alertas)
- **Fase 4:** ✅ Captación / Scraping (Google Places → leads → pipeline, enriquecimiento con Claude)

## Antes de codear el schema

Cerrar las 3 definiciones de §12 del plan (multi-proyecto por cliente, pagos por proyecto vs. acuerdo, significado de "pendiente"): cambian el modelo de datos.
