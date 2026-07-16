# Deploy en VPS — Pixs CRM

Guía para levantar el CRM en un VPS Ubuntu/Debian, **limpio, solo con el usuario admin**.
La app corre sobre Next.js 16 + SQLite (better-sqlite3). No necesita base externa.

> Todos los bloques se corren **en el servidor** (por SSH). Reemplazá los valores
> entre `<...>` por los tuyos. **No comitees el `.env`.**

---

## 0. Conectarte

```bash
ssh -p<PUERTO_SSH> <usuario>@<IP_DEL_SERVIDOR>
```

## 1. Dependencias del sistema (una sola vez)

```bash
apt update && apt upgrade -y
# Node 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git build-essential python3   # build-essential/python3: better-sqlite3 compila nativo
npm install -g pm2                                   # gestor de procesos
node -v && npm -v                                    # verificá Node >= 20
```

## 2. Clonar el repo

```bash
cd /root
git clone https://github.com/PixaSoftwareDev/CRM-Pixs.git
cd CRM-Pixs
mkdir -p data                                        # acá vive la base SQLite
```

## 3. Variables de entorno

Generá una clave de cifrado y creá el `.env`:

```bash
ENC=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
cat > .env <<EOF
NODE_ENV=production
SQLITE_PATH=/root/CRM-Pixs/data/pixs.sqlite

# Subpath: como el server ya tiene otra app en "/", esta se sirve en /crmpixs.
# Se hornea en el build (Next basePath), por eso también va en el .env.
NEXT_PUBLIC_BASE_PATH=/crmpixs

# Puerto propio para no chocar con la otra app (que suele usar 3000).
PORT=3001

# Login (contraseña compartida). ¡Poné una fuerte!
DEMO_EMAIL=admin@pixs.com
DEMO_PASSWORD=<CONTRASEÑA-FUERTE>

# Cifrado de "Accesos" (NO la pierdas: sin esta clave, los secretos guardados no se descifran)
ENCRYPTION_KEY=$ENC

# Opcionales
# GEMINI_API_KEY=<tu-key-de-gemini>     # enriquecimiento de leads en Captación
# CRON_SECRET=<secreto>                 # si vas a usar el cron de alertas de pago
EOF
chmod 600 .env
```

> El subpath `/crmpixs` queda fijado en el build. Si algún día lo querés en la
> raíz o en otra ruta, cambiá `NEXT_PUBLIC_BASE_PATH` y volvé a `npm run build`.

## 4. Instalar, crear el esquema y sembrar el admin

```bash
npm ci

# Crea todas las tablas desde el schema Drizzle en la base de producción
SQLITE_PATH=/root/CRM-Pixs/data/pixs.sqlite npm run db:push

# Crea ÚNICAMENTE el usuario admin (sin datos de prueba)
SQLITE_PATH=/root/CRM-Pixs/data/pixs.sqlite DEMO_EMAIL=admin@pixs.com npm run db:seed:prod
```

## 5. Build y arranque

```bash
npm run build                                  # hornea el subpath /crmpixs (lee NEXT_PUBLIC_BASE_PATH del .env)
pm2 start npm --name pixs -- run start         # `next start` en el puerto 3001 (PORT del .env)
pm2 save
pm2 startup                                     # seguí la instrucción que imprime, para autoarranque
```

La app escucha en `127.0.0.1:3001`. **No** hace falta abrir ese puerto al exterior:
se accede a través de nginx en el paso 6, bajo `http://<IP_DEL_SERVIDOR>/crmpixs`.

## 6. Nginx — servir bajo `/crmpixs`

Como el server ya tiene otra app en `/`, **no** creamos un `server` nuevo: agregamos
un `location /crmpixs` **dentro del bloque `server` que ya existe**. Editá el archivo
de nginx de la app actual (típicamente `/etc/nginx/sites-available/default` o el que
uses) y pegá este bloque adentro del `server { ... }`:

```nginx
    # --- Pixs CRM (subpath /crmpixs → app en 127.0.0.1:3001) ---
    location /crmpixs {
        proxy_pass http://127.0.0.1:3001;      # SIN barra final: se conserva el prefijo /crmpixs
        client_max_body_size 25m;               # subida de documentos hasta 20MB
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
```

Aplicá:

```bash
nginx -t && systemctl reload nginx
```

> ⚠️ El `proxy_pass` va **sin barra final** (`:3001;`, no `:3001/;`). Así nginx le
> pasa la ruta completa `/crmpixs/...` a Next, que es lo que `basePath` espera.
> Si le ponés la barra, Next recibe `/` y rompe.

La app queda en **`http://<IP_DEL_SERVIDOR>/crmpixs`**.

> HTTPS (opcional, si tenés dominio): `apt install -y certbot python3-certbot-nginx && certbot --nginx`

---

## 7. Backend REST (Express + JWT) — proceso `pixs-api`

El CRM incluye una **API REST** aparte (carpeta `server/`) que expone todas las
operaciones vía HTTP con **JWT**, para clientes externos (bots, integraciones).
Comparte la MISMA base SQLite y el MISMO `storage/` que la app Next, así que
corre desde la misma raíz del repo. No toca la app web; es aditivo.

```bash
cd /root/CRM-Pixs

# 1) Variables del backend en el .env (además de las que ya tenés):
cat >> .env <<EOF

# Backend REST
JWT_SECRET=$(openssl rand -base64 48)
API_PORT=3002
API_CORS_ORIGIN=https://<TU_DOMINIO>       # o http://<IP>; coma-separado si hay varios
EOF

# 2) Levantar como segundo proceso PM2 (tsx ya está en devDependencies → usar npm ci sin --omit=dev)
pm2 start npm --name pixs-api -- run api:start
pm2 save
```

Nginx — exponer la API bajo `/crmpixs/api` (dentro del MISMO `server { ... }`):

```nginx
    # --- Pixs API (REST + JWT → 127.0.0.1:3002) ---
    location /crmpixs/api/ {
        proxy_pass http://127.0.0.1:3002/api/;   # conserva el prefijo /api
        client_max_body_size 25m;                # subida de comprobantes/documentos
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

```bash
nginx -t && systemctl reload nginx
```

La API queda en `https://<dominio>/crmpixs/api`. Probar:
`curl -X POST https://<dominio>/crmpixs/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@pixs.com","password":"<TU_PASS>"}'`
→ devuelve `{ token, user }`. Con `Authorization: Bearer <token>` se accede al resto
(`/contacts`, `/opportunities`, `/dashboard/summary`, etc.).

> Rollback: `pm2 delete pixs-api` + quitar el `location` de nginx. La app web sigue intacta.

---

## Actualizar a una versión nueva

```bash
cd /root/CRM-Pixs
git pull
npm ci
SQLITE_PATH=/root/CRM-Pixs/data/pixs.sqlite npm run db:push   # aplica cambios de schema (crea contact_people, etc.)
npm run build
pm2 restart pixs
pm2 restart pixs-api        # reiniciá también el backend REST
```

## Notas

- **Ingreso:** entrá a `http://<IP_DEL_SERVIDOR>/crmpixs` con `admin@pixs.com` + la `DEMO_PASSWORD` que pusiste. El botón "Acceso rápido (demo)" y el cartel con la contraseña **no se muestran** en producción (`NODE_ENV=production`).
- **Backups:** copiá periódicamente `data/pixs.sqlite` (y la carpeta `storage/` con los documentos subidos).
- **`ENCRYPTION_KEY`:** guardala en un lugar seguro. Si la cambiás, los secretos ya cargados en Accesos quedan indescifrables.
- **Captación:** la recolección (OpenStreetMap) funciona sin keys; el enriquecimiento necesita `GEMINI_API_KEY`.
