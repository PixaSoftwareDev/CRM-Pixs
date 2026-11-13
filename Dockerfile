# Imagen del CRM: un solo Dockerfile con dos destinos (api y web).
#   docker build --target api .   → Node 22 corriendo la API (TypeScript vía tsx)
#   docker build --target web .   → nginx sirviendo el front compilado bajo /crm
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# Solo los package.json primero: la capa de dependencias se reusa si no cambian.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS web-build
COPY packages packages
COPY apps/web apps/web
ARG BASE_PATH=/crm/
RUN BASE_PATH=$BASE_PATH pnpm --filter @crm/web exec vite build

# ─── API ───
FROM base AS api-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter @crm/api...

FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=api-deps /repo /repo
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
WORKDIR /repo/apps/api
USER node
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3005/api/health || exit 1
# Migraciones + catálogos (idempotentes) y después la API.
CMD ["sh", "-c", "node --import tsx src/scripts/migrate.ts && exec node --import tsx src/index.ts"]

# ─── Web ───
FROM nginx:1.27-alpine AS web
COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /repo/apps/web/dist /usr/share/nginx/html/crm
EXPOSE 3020
