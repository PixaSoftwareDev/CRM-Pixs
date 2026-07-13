# Pixs CRM — Correr en local

La app corre sobre **SQLite** (base local, sin servidor ni credenciales externas) y
**auth local por cookie**. No hay Supabase ni Postgres: alcanza con Node.

## Correr en local

```bash
npm install
npm run db:push    # crea/actualiza las tablas en demo.sqlite
npm run db:seed    # siembra el usuario admin + datos de ejemplo
npm run dev
```

Abrí http://localhost:3000/login e ingresá con:

- **Email:** `admin@pixs.com`
- **Contraseña:** `demo1234`

> También hay un botón **"Acceso rápido (demo)"** en el login que completa esas
> credenciales y entra directo.

Cada quien genera su propia base local: el archivo `demo.sqlite` está en
`.gitignore`, así que no se comparte. Corré `db:push` + `db:seed` y tenés tus datos.

## Recrear la base desde cero

```bash
rm -f demo.sqlite demo.sqlite-*
npm run db:push
npm run db:seed
```

## Notas

- **DB:** SQLite (`better-sqlite3`). El schema Drizzle (`src/db/schema/*`) es la
  fuente de verdad; `npm run db:push` lo sincroniza con el archivo.
- **Auth:** sesión por cookie httpOnly (`src/lib/auth/session.ts`). La contraseña
  es compartida (`demo1234`), configurable con `DEMO_PASSWORD` / `DEMO_EMAIL`.
- **Búsqueda:** `LIKE` de SQLite (case-insensitive para ASCII).
- **Config opcional:** ver `.env.example` (cifrado, email/alertas, scraping).
