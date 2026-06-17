# PIXS — Frontend

El frontend de PIXS va en esta carpeta.

**Stack**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui.

## Inicialización (cuando sea el momento)

```bash
cd web
pnpm create next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*"
pnpm add @tanstack/react-query zustand react-hook-form zod
pnpm add -D openapi-typescript openapi-fetch
```

## Estructura planificada

```
/app          rutas (App Router)
/components   ui (shadcn customizado) + features por módulo
/lib          api-client generado desde /api/openapi.yaml
/stores       zustand stores
/styles       CSS global, tokens
/public       manifest PWA, íconos
```

## Principios de diseño

- Mobile-first. Target mínimo: 48 px en mobile, 40 px en desktop.
- Tipografía: cuerpo 16 px mínimo, headers desde 24 px.
- Grid 8 px. Paleta restringida: 1 color de marca + semánticos.
- WCAG 2.2 AA obligatorio. Verificado con axe en CI.
- Modo claro y oscuro completos.

**No inicializar Next.js hasta que sea la sesión correspondiente.**
