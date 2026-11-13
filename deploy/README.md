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
