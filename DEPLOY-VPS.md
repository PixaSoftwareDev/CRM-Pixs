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

## Actualizar a una versión nueva

```bash
cd /root/CRM-Pixs
git pull
npm ci
SQLITE_PATH=/root/CRM-Pixs/data/pixs.sqlite npm run db:push   # aplica cambios de schema
npm run build
pm2 restart pixs
```

## Notas

- **Ingreso:** entrá a `http://<IP_DEL_SERVIDOR>/crmpixs` con `admin@pixs.com` + la `DEMO_PASSWORD` que pusiste. El botón "Acceso rápido (demo)" y el cartel con la contraseña **no se muestran** en producción (`NODE_ENV=production`).
- **Backups:** copiá periódicamente `data/pixs.sqlite` (y la carpeta `storage/` con los documentos subidos).
- **`ENCRYPTION_KEY`:** guardala en un lugar seguro. Si la cambiás, los secretos ya cargados en Accesos quedan indescifrables.
- **Captación:** la recolección (OpenStreetMap) funciona sin keys; el enriquecimiento necesita `GEMINI_API_KEY`.
