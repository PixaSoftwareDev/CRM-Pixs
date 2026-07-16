# Pixs CRM — API REST (Express + JWT)

Backend REST que expone las operaciones del CRM. Comparte la misma base SQLite y
el mismo `storage/` que la app Next (proceso aparte). Reusa las `queries`,
`services`, cifrado y storage de `src/` — no duplica lógica de negocio.

## Levantar

```bash
npm run api:dev     # desarrollo (watch)
npm run api:start   # producción (pm2)
```

Env: `JWT_SECRET`, `API_PORT` (3002), `API_CORS_ORIGIN`, y reusa `ENCRYPTION_KEY`,
`DEMO_PASSWORD`, `DEMO_EMAIL`, `SQLITE_PATH`. Ver `.env.example`.

## Autenticación (JWT)

```
POST /api/auth/login   { email, password }  → { token, user }
POST /api/auth/demo-login                    → { token, user }
GET  /api/auth/me       (Bearer)             → { id, email, nombre, rol }
```

Todo lo demás requiere el header `Authorization: Bearer <token>`. Sin token → 401.
El token dura 7 días. La contraseña es la compartida (`DEMO_PASSWORD`), igual que el front.

```bash
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@pixs.com","password":"demo1234"}' | jq -r .token)
curl http://localhost:3002/api/contacts -H "Authorization: Bearer $TOKEN"
```

## Endpoints

Convención REST: `GET` lee, `POST` crea, `PATCH` edita, `DELETE` borra. Bodies en JSON
(salvo subidas, que son `multipart/form-data`).

| Recurso | Endpoints |
|---|---|
| **auth** | `POST /auth/login` · `POST /auth/demo-login` · `GET /auth/me` |
| **contacts** | `GET /contacts?search=` · `POST /contacts` · `GET/PATCH/DELETE /contacts/:id` · `GET /contacts/:id/opportunities` · `GET/POST /contacts/:id/people` · `DELETE /contacts/people/:personId` |
| **opportunities** | `GET /opportunities` · `GET/PATCH/DELETE /opportunities/:id` · `POST /opportunities` · `POST /opportunities/:id/move` `{estado,motivoPerdida?}` |
| **projects** | `GET /projects` · `GET /projects/:id` · `PATCH /projects/:id/state` `{estado}` · `GET/POST /projects/:id/tech-info` · `DELETE /projects/tech-info/:techId` |
| **tasks** | `GET /tasks` · `GET /tasks/by-project/:projectId` · `POST /tasks` · `PATCH /tasks/:id` · `POST /tasks/:id/status` `{estado}` · `POST /tasks/:id/move` `{estado}` · `DELETE /tasks/:id` |
| **money** | `GET /money/summary` · `GET /money/receivables` · `GET /money/budget/:projectId` · `POST /money/budgets` · `GET /money/transactions?from=&to=` · `POST /money/transactions` (multipart, campo `comprobante` opcional) · `POST /money/installments/:id/toggle` `{projectId,pagar}` · `POST /money/transactions/:id/reintegro` `{devuelto}` |
| **documents** | `GET /documents?entityType=&entityId=` · `POST /documents` (multipart `file`) · `GET /documents/:id` (binario; `?download=1`) · `DELETE /documents/:id` |
| **credentials** | `GET /credentials?q=&projectId=&tipo=` (nunca el secreto) · `POST /credentials` · `PATCH/DELETE /credentials/:id` · `POST /credentials/:id/reveal` (descifra) |
| **infra** | `GET /infra/servers` · `GET /infra/servers/:id` · `POST /infra/servers` · `GET /infra/databases` · `POST /infra/databases` |
| **scraping** | `GET/POST /scraping/campaigns` · `POST /scraping/campaigns/:id/run` · `GET /scraping/leads?campaignId=` · `GET /scraping/leads/stats` · `POST /scraping/leads/:id/{approve,discard,enrich}` · `DELETE /scraping/leads/:id` |
| **activities** | `GET /activities?entityType=&entityId=` · `POST /activities/note` `{entityType,entityId,contenido}` |
| **dashboard** | `GET /dashboard/summary` |
| **users** | `GET /users` |

## Notas

- El secreto de un acceso solo se obtiene con `POST /credentials/:id/reveal`; los
  listados devuelven `tieneSecreto` pero nunca el valor.
- Los errores llegan como `{ "error": "<mensaje>" }` con el status HTTP correspondiente
  (400 validación, 401 sin/mal token, 404 no encontrado, 500 interno).
