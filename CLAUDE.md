# CLAUDE.md — Pixs CRM

Guía para trabajar en este repositorio. El diseño completo vive en **[plan-tecnico.md](./plan-tecnico.md)** — leelo antes de tomar decisiones de arquitectura.

> ⚠️ **Next.js 16 tiene breaking changes** respecto a versiones conocidas. Ver reglas en [AGENTS.md](./AGENTS.md) y los docs en `node_modules/next/dist/docs/` antes de escribir código de framework.

@AGENTS.md

## Estado actual

**Fases 0–4 COMPLETAS** — el CRM está construido end-to-end: buildea, typecheckea, lintea y las migraciones son consistentes con el schema. **Falta lo operativo del usuario**: crear el proyecto Supabase real, completar `.env.local` (ver `.env.example`), aplicar migraciones (`npm run db:migrate`) y crear los 3 usuarios en Supabase Auth. Recién ahí se puede probar el login y los flujos con datos reales.

Decisiones §12 tomadas (defaults flexibles, ajustables sin reescribir):
1. Un contacto puede tener varias oportunidades/proyectos a la vez.
2. Presupuestos por proyecto (`budgets.project_id`).
3. "pendiente" = presupuesto enviado, esperando respuesta.

### Notas de implementación (Next 16 — breaking changes)
- La convención `middleware` se renombró a **`proxy`**: el archivo es `src/proxy.ts` y exporta `proxy()`.
- `cookies()` es **async** en Server Components/Actions.
- Env vars: `env` (público, seguro en cualquier lado) vs. `serverEnv()` (secretos, solo server) en `src/lib/env.ts`.
- Cliente `db` **lazy** (Proxy) en `src/db/index.ts`: la conexión/validación de secretos ocurre en el primer uso, no al importar (así el build no necesita credenciales reales).
- Server Actions usan el tipo compartido `FormState` (`src/lib/forms.ts`) para encajar con `useActionState`.
- Migraciones: RLS + triggers + FTS van *appendeados* a mano en los `.sql` (Drizzle no genera policies). El full-text (`tsvector` generado + GIN) sí está en el schema Drizzle (`infra.ts`).
- Enriquecimiento de leads: SDK `@anthropic-ai/sdk`, modelo `claude-opus-4-8`, structured outputs (`output_config.format`). Ver `src/modules/scraping/enrich.ts`.
- Alertas de pago: `src/app/api/cron/alertas-pagos` (protegido por `CRON_SECRET`), agendar con `docs/pg_cron_alertas.sql`.

## Stack (resumen — ver §1 del plan para el porqué)

- **Lenguaje:** TypeScript (strict, sin `any`)
- **Framework:** Next.js 16 (App Router, Server Components, Server Actions)
- **DB:** PostgreSQL 17 vía Supabase · **ORM:** Drizzle
- **Auth / Storage / Secretos:** Supabase Auth · Storage (buckets privados) · Vault
- **UI:** Tailwind v4 + shadcn/ui · **D&D:** dnd-kit
- **Validación:** Zod (en cada borde) · **Forms:** React Hook Form
- **Tests:** Vitest (unit) + Playwright (e2e) · **Lint:** Biome

## Reglas de oro

- **Zod valida todo input externo** antes de tocar la base. Nunca confiar en el cliente.
- **RLS activo en todas las tablas** desde el día 1.
- **Lógica de negocio en `modules/*/service.ts`**, no dentro de los componentes React.
- **Secretos vivos de producción:** guardar una *referencia* a Bitwarden/1Password (`credencial_ref`), no el secreto. Lo que deba cifrarse, va por Supabase Vault. Nunca inventar cifrado propio.
- **Migraciones versionadas y revisadas en PR.** Usar `CREATE INDEX CONCURRENTLY` para no lockear tablas. Nunca `push` directo a prod.
- **Server Components por defecto**; TanStack Query solo donde haga falta (kanban, filtros en vivo).
- Nunca commitear `.env.local`. `.env.example` (sin valores) sí va al repo.

## Comandos (una vez inicializado el proyecto)

```bash
npm run dev            # desarrollo (Turbopack)
npm run typecheck      # tsc --noEmit
npm run lint           # biome check
npm run format         # biome check --write
npm test               # vitest run
npm run db:generate    # generar SQL de migración (revisarlo antes de aplicar)
npm run db:migrate     # aplicar migraciones (requiere DIRECT_URL en .env.local)
```

Bootstrap inicial completo: ver §10 del plan.

## Roadmap (ver §7 del plan)

Cada fase es desplegable y usable. No se avanza sin la anterior en producción.

- **Fase 0:** ✅ Fundaciones (repo, CI/CD, Supabase, Drizzle, RLS, auth)
- **Fase 1:** ✅ Núcleo CRM (contactos + oportunidades + timeline + dashboard)
- **Fase 2:** ✅ Proyecto + Infraestructura (kanban, inventario VPS/DBs con FTS)
- **Fase 3:** ✅ Dinero (pagos, finanzas, cuentas por cobrar, CSV, alertas)
- **Fase 4:** ✅ Captación / Scraping (Google Places → leads → pipeline, enriquecimiento con Claude)

## Antes de codear el schema

Cerrar las 3 definiciones de §12 del plan (multi-proyecto por cliente, pagos por proyecto vs. acuerdo, significado de "pendiente"): cambian el modelo de datos.
