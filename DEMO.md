# Pixs CRM — Modo demo (SQLite)

> ⚠️ Esta rama corre en **modo demo con SQLite**, un backend local desechable.
> **No es la configuración real** del proyecto (Postgres + Supabase). Sirve para
> levantar la app y recorrerla sin credenciales ni base externa.

## Correr en local

```bash
npm install
npx drizzle-kit push --config drizzle.config.demo.ts   # crea las tablas en demo.sqlite
npx tsx scripts/seed-demo.ts                            # siembra usuario + datos de ejemplo
npm run dev
```

Abrí http://localhost:3000/login e ingresá con:

- **Email:** `admin@pixs.com`
- **Contraseña:** `demo1234`

Cada quien genera su propia base local: el archivo `demo.sqlite` está en
`.gitignore`, así que no se comparte. Corré los dos comandos de arriba
(`drizzle-kit push` + `seed-demo`) y tenés tus datos.

## Recrear la base desde cero

```bash
rm -f demo.sqlite demo.sqlite-*
npx drizzle-kit push --config drizzle.config.demo.ts
npx tsx scripts/seed-demo.ts
```

## ¿Cómo difiere del proyecto real?

- **DB:** SQLite (`better-sqlite3`) en vez de Postgres/Supabase.
- **Auth:** sesión por cookie local (`src/lib/supabase/server.ts`), sin Supabase Auth.
  Contraseña demo compartida `demo1234` (configurable con `DEMO_PASSWORD`).
- **Búsqueda:** `LIKE` en vez de full-text (tsvector/GIN de Postgres).
- Sin RLS, sin migraciones Postgres, sin Vault.

El diseño real vive en `plan-tecnico.md` y `CLAUDE.md`.
