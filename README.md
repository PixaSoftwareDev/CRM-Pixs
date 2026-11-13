# CRM

CRM interno: clientes, agenda, embudo, proyectos, tickets, finanzas,
accesos cifrados y automatizaciones.

**Stack:** pnpm (monorepo) · Fastify 5 + Better Auth · PostgreSQL 16 + Drizzle ·
React 19 + Vite + TanStack Router/Query · Tailwind v4 · Zod compartido entre front y API.

```
apps/api        API (Fastify) — módulos por dominio: repository / service / routes
apps/web        Front (SPA) — features por pantalla
packages/db     Schema Drizzle, migraciones y catálogos
packages/shared Contratos Zod y DTOs que usan los dos lados
deploy/         Docker Compose y guía del VPS
```

## Desarrollo

```bash
pnpm install
cp .env.example .env              # completar secretos: openssl rand -base64 32
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm seed:demo                    # datos de ejemplo (opcional)
pnpm dev                          # web en :5173, API en :3001
```

`pnpm typecheck` · `pnpm test` · `pnpm db:generate` (después de cambiar el schema).

### Prueba de punta a punta

`tests/e2e/api.e2e.mjs` recorre toda la API como un usuario (login, clientes,
tareas, embudo, proyectos, tickets, finanzas, accesos, automatizaciones, logout):
unos 160 chequeos. **Crea datos**: correrlo solo contra una base de prueba.

```bash
E2E_BASE=http://localhost:3001 E2E_ORIGIN=http://localhost:5173 \
E2E_EMAIL=… E2E_PASSWORD=… pnpm test:e2e
```

## Producción

Ver [deploy/README.md](deploy/README.md).
