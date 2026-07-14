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
npm run build
pm2 start npm --name pixs -- run start        # levanta `next start` (puerto 3000)
pm2 save
pm2 startup                                    # seguí la instrucción que imprime, para autoarranque
```

La app queda en `http://<IP_DEL_SERVIDOR>:3000` (abrí el puerto 3000 en el firewall / panel del proveedor).

## 6. (Recomendado) Nginx + dominio

```bash
apt install -y nginx
cat > /etc/nginx/sites-available/pixs <<'EOF'
server {
    listen 80;
    server_name <TU_DOMINIO_O_HOSTNAME>;      # o tu dominio
    client_max_body_size 25m;                  # subida de documentos hasta 20MB
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
ln -sf /etc/nginx/sites-available/pixs /etc/nginx/sites-enabled/pixs
nginx -t && systemctl reload nginx
# HTTPS (opcional): apt install -y certbot python3-certbot-nginx && certbot --nginx
```

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

- **Ingreso:** `admin@pixs.com` + la `DEMO_PASSWORD` que pusiste. El botón "Acceso rápido (demo)" y el cartel con la contraseña **no se muestran** en producción (`NODE_ENV=production`).
- **Backups:** copiá periódicamente `data/pixs.sqlite` (y la carpeta `storage/` con los documentos subidos).
- **`ENCRYPTION_KEY`:** guardala en un lugar seguro. Si la cambiás, los secretos ya cargados en Accesos quedan indescifrables.
- **Captación:** la recolección (OpenStreetMap) funciona sin keys; el enriquecimiento necesita `GEMINI_API_KEY`.
