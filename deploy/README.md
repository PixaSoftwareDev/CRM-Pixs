# Deploy en el VPS

El CRM corre en `/opt/crm` con Docker Compose: Postgres, API y front. El
nginx de borde (`ia_nginx`, compartido con otros proyectos) ya publica:

| URL pública | Contenedor |
|---|---|
| `/crmpixs/api/*` (reescrito a `/api/*`) | `crm-api:3005` (alias `crm-pixs-api`) |
| `/crmpixs/*` | `crm-web:3020` (alias `crm-pixs-web`) |

Esa configuración vive en el repo de Mutualyf (`nginx/nginx.prod.conf`): por eso
la URL pública es `/crmpixs` y los contenedores llevan esos alias. No cambiar
puertos ni alias sin cambiar también ese nginx.

## IP del cliente y nginx

La API limita los intentos de login (5 por minuto por IP) y los pedidos en
general (por IP y por usuario). Para eso necesita la IP real del navegador,
que llega en `X-Forwarded-For` a través del nginx compartido. Como cualquiera
puede mandar ese header, la API solo se lo cree a los proxies de `TRUST_PROXY`
(por defecto en producción: `loopback,uniquelocal`, o sea la red interna de
Docker) y toma la última IP que agregó un proxy confiable; lo que mande el
navegador en `X-Forwarded-For`, `X-Real-IP` o `Forwarded` no llega a Better Auth.

Lo que la API espera del nginx en `location /crmpixs/api/` (es lo que tiene hoy):

```nginx
proxy_set_header X-Real-IP       $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # agrega $remote_addr al final
```

- El puerto de la API (3005) no se publica en el host: solo se llega por la red
  `edge`. Si alguna vez se publica o se pone otro proxy/CDN adelante, revisar
  `TRUST_PROXY` (con un CDN hay que confiar en sus rangos, o la IP de todos los
  usuarios va a ser la del CDN).
- Si el nginx dejara de mandar `X-Forwarded-For`, todos los pedidos se verían con
  la IP del nginx y el límite de login sería compartido por todos.
- Para comprobarlo después de un deploy: `docker logs crm-api` muestra `remoteAddress`
  de cada request; tiene que ser la IP pública del navegador, no una `172.x`.

## Primera vez

```bash
cd /opt/crm/deploy
cp .env.example .env
# Completar .env generando cada secreto en el server (no los copies a chats ni al repo):
#   openssl rand -base64 32
# Guardar VAULT_KEY aparte (gestor de contraseñas): sin ella no se leen las claves de Accesos.
docker compose up -d --build
docker compose exec api node --import tsx src/scripts/create-user.ts "Nombre" email@dominio admin
```

La API aplica las migraciones y siembra los catálogos sola cada vez que arranca.

## Actualizar

```bash
# desde la máquina de desarrollo
rsync -az --delete --exclude node_modules --exclude dist --exclude .git --exclude '.env*' --exclude 'deploy/.env' \
  -e "ssh -p 2251" ./ root@VPS:/opt/crm/
# en el VPS
cd /opt/crm/deploy && docker compose up -d --build
```

## Respaldos

`/usr/local/bin/satelites-backup.sh` (cron 03:45) hace `pg_dump` de `crm-db`
a `/backups/satelites/crm/`, con 7 días de retención.

Restaurar: `gunzip -c pg_crm_<fecha>.sql.gz | docker exec -i crm-db psql -U crm -d crm`.

## Probar un deploy sin tocar la base real

Corre la prueba de punta a punta contra la imagen recién construida, con una
base temporal que se borra al terminar:

```bash
cd /opt/crm && N=crm-e2e PW=$(openssl rand -hex 16) UPW="E2e-$(openssl rand -hex 10)"
IMG=$(docker inspect crm-api --format "{{.Image}}")
docker network create $N
docker run -d --name crm-e2e-db --network $N -e POSTGRES_USER=crm -e POSTGRES_DB=crm -e POSTGRES_PASSWORD=$PW postgres:16-alpine
docker run -d --name crm-e2e-api --network $N -e NODE_ENV=production -e HOST=0.0.0.0 -e PORT=3005 \
  -e DATABASE_URL=postgres://crm:$PW@crm-e2e-db:5432/crm -e BETTER_AUTH_SECRET=$(openssl rand -base64 32) \
  -e BETTER_AUTH_URL=http://crm-e2e-api:3005 -e WEB_ORIGIN=http://crm-e2e-api:3005 \
  -e VAULT_KEY=$(openssl rand -base64 32) -e SCHEDULER_ENABLED=false $IMG
sleep 20
printf "%s\n%s\n" "$UPW" "$UPW" | docker exec -i crm-e2e-api node --import tsx src/scripts/create-user.ts E2E e2e@crm.local admin
docker run --rm --network $N -v /opt/crm/tests:/tests:ro -e E2E_BASE=http://crm-e2e-api:3005 \
  -e E2E_ORIGIN=http://crm-e2e-api:3005 -e E2E_EMAIL=e2e@crm.local -e E2E_PASSWORD="$UPW" $IMG node /tests/e2e/api.e2e.mjs
docker rm -f crm-e2e-api crm-e2e-db && docker network rm $N
```
