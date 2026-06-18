# PIXS — Contexto del Proyecto

## Proyecto

PIXS es un CRM + ERP ligero con generación de leads por scraping para una PyME argentina de servicios.
Cubre el ciclo completo: prospección → venta → entrega → facturación → cobro → finanzas → reportes.
Reemplaza Google Drive + planillas + agendas con una plataforma propia, usada a diario por gente no técnica.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Go 1.25 (satisface el requisito "Go 1.23+"; deps actuales requieren 1.25), módulo: `pixs` |
| HTTP | Echo v4 |
| DB Driver | pgx/v5 + pgxpool |
| Queries | sqlc (generado en `internal/repository/sqlc`) |
| Migraciones | Atlas HCL (`db/migrations/`) |
| DB Dev | PostgreSQL 16 en Docker |
| Cache/sesiones | Redis 7 en Docker (`go-redis/v9`) |
| Jobs | River (Postgres-backed) — a configurar |
| Frontend | Next.js 15 (App Router) + React + TypeScript, en `/web` |
| Decimales | `shopspring/decimal` — PROHIBIDO `float64` para dinero |
| Logging | `log/slog` (JSON a stdout) |
| Config | `envconfig` (prefijo `PIXS_`) |
| Errores | `cockroachdb/errors` (wrap con contexto) |
| Testing | `testify` + `testcontainers-go` para integración |
| Deploy | Bare-metal con systemd (Docker solo en dev) |

## Estructura de Carpetas

```
/cmd
  /api          main del servidor HTTP (Echo)
  /worker       main del worker River (stub por ahora)
  /migrate      CLI de migraciones (stub por ahora)
/internal
  /domain       Entidades, value objects, invariantes de negocio. Sin deps de infraestructura.
  /service      Casos de uso por bounded context. Orquesta domain + repository + platform.
  /repository
    /sqlc       Código Go generado por sqlc. NO editar a mano.
    /postgres   Implementaciones de repositorio que usan sqlc.
  /transport
    /http
      /handler  Echo handlers, uno por bounded context.
      /middleware Middlewares: auth, RBAC, rate limit, idempotency, OTel.
      /mapper   Conversiones domain ↔ HTTP DTO.
      /validator Reglas de validación custom (go-playground/validator).
  /jobs         Workers de River, uno por dominio.
  /auth         Sesiones Redis, 2FA TOTP, RBAC (casbin), argon2id.
  /scraping     Fetcher (http + chromedp), extractor determinístico, cliente LLM.
  /platform     Wrappers: Redis, Cloudflare R2, Resend, OpenTelemetry, Anthropic API.
  /pdf          Generación de PDFs (chromedp render + gofpdf).
  /search       Helpers de full-text search (tsvector + pg_trgm).
  /config       Struct Config cargado con envconfig.
/db
  /migrations   Archivos de migración Atlas (.sql o HCL).
  /queries      Archivos .sql fuente para sqlc.
/api            openapi.yaml — contrato de la API REST.
/web            Frontend Next.js (ver web/README.md).
/docs
  /runbooks     Procedimientos operativos (restore, deploy de emergencia, etc.).
```

## Reglas No Negociables

### Dinero y Decimales
- **SIEMPRE** usar `shopspring/decimal` para montos, cotizaciones y totales.
- **NUNCA** usar `float64` o `float32` para valores monetarios.
- Columnas de monto en Postgres: `NUMERIC(15,2)`. Cotizaciones: `NUMERIC(12,6)`.

### Multi-tenant desde el Día Uno
- Toda tabla de dominio lleva `company_id UUID NOT NULL` con FK a `companies`.
- Hoy hay una sola empresa; el campo siempre tendrá el mismo valor. La constraint ya está.
- Los repos siempre filtran por `company_id`. Sin excepción.

### Timestamps y Soft-delete
- Toda tabla de dominio lleva `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` y `deleted_at TIMESTAMPTZ`.
- Excepción: tablas append-only (`audit_logs`, `task_comments`, `lead_activities`) y
  catálogos puros (`vat_rates`, `currencies`, `expense_categories`) solo llevan `created_at`.
- Soft-delete obligatorio: **nunca** `DELETE` en tablas de dominio. Siempre `SET deleted_at = now()`.
- Todos los SELECTs de lista filtran `WHERE deleted_at IS NULL`.

### Transacciones e Idempotencia
- Operaciones que mueven dinero o emiten comprobantes: **idempotency key obligatoria**.
  - Columna `idempotency_key UUID NOT NULL UNIQUE` en la tabla.
  - El handler HTTP lee la key del header `X-Idempotency-Key`.
  - Si ya existe, retornar el recurso creado previamente (HTTP 200, no 201).
- Facturas, recibos, órdenes de pago, movimientos de caja, conciliación, reembolsos,
  conversión de lead a cliente: dentro de una **única transacción de DB**.

### Numeración de Comprobantes
- Tabla `sequence_numbers (document_type, sale_point, last_number)`.
- El número se obtiene con `SELECT ... FOR UPDATE` dentro de la misma transacción
  que crea el comprobante. Nunca fuera de transacción.

### Multi-moneda
- Cada operación financiera guarda:
  - `amount`: monto en moneda original.
  - `currency`: código ISO 4217.
  - `exchange_rate`: cotización al momento de la operación (`NUMERIC(12,6)`).
  - `exchange_rate_date`: fecha de la cotización.
  - `functional_amount`: monto convertido a moneda funcional (`NUMERIC(15,2)`).
- **Nunca recalcular históricos** usando la cotización actual. La foto del momento es inmutable.

### Arquitectura Hexagonal
- Flujo de dependencias: `transport` → `service` → `domain`. Y `service` → `repository`.
- El paquete `domain` no importa NADA de infraestructura (sin pgx, sin echo, sin redis).
- Los handlers no contienen lógica de negocio; solo deserializan, llaman al service, serializan.
- Los servicios no conocen Echo ni HTTP; reciben y devuelven tipos de dominio.

### Errores y Logging
- Errores: `cockroachdb/errors` para wrap con contexto. Ej: `errors.Wrap(err, "creating invoice")`.
- Logs: `slog` con campos estructurados. Nunca `fmt.Println` en código de producción.
- El handler convierte errores de dominio a HTTP status codes en un mapper centralizado.

### Audit Log
- En módulos críticos (contactos, facturas, recibos, órdenes de pago, movimientos de caja,
  gastos, usuarios, permisos): insertar en `audit_logs` con `before_state` y `after_state` en JSONB.
- La tabla `audit_logs` es append-only. Sin UPDATE, sin DELETE, sin soft-delete.

## Convenciones de Código

- **Idioma del código**: inglés (nombres de variables, funciones, paquetes, comentarios de código).
- **Idioma de la UI**: español argentino (mensajes de error al usuario, labels, textos).
- **Nombres de paquetes**: cortos, en minúsculas, sin guiones bajos. Ej: `config`, `handler`, `finance`.
- **Interfaces**: definidas en el paquete que las *usa*, no en el que las implementa.
- **Tests**: `testify/assert` y `testify/require`. Repos contra Postgres real con `testcontainers-go`.
- **Archivos de test**: `_test.go` en el mismo paquete (white-box) o paquete `_test` (black-box).
- **Generado por sqlc**: no editar `internal/repository/sqlc/` a mano. Siempre regenerar con `make sqlc`.

## Cómo Verificar

```bash
make db-up          # Levanta Postgres + Redis, espera healthy
go build ./...      # Compilación sin errores
make run-api        # Servidor escucha en :8080
curl localhost:8080/health  # → {"status":"ok"}
make lint           # golangci-lint sin errores
go vet ./...        # Limpio
make test           # Tests con -race
```

## Cómo agregar un River job

River (cola de jobs sobre Postgres) maneja el trabajo en background. Sus tablas
(`river_*`) **no** se gestionan con Atlas: se aplican programáticamente al
arrancar el worker (`rivermigrate` en `cmd/worker`). Para agregar un job nuevo:

1. Definir `YourJobArgs struct` que implemente `river.JobArgs` con `Kind() string`.
2. Implementar `YourWorker` embebiendo `river.WorkerDefaults[YourJobArgs]` con
   `Work(ctx context.Context, job *river.Job[YourJobArgs]) error`.
3. Registrarlo con `river.AddWorker(workers, &YourWorker{})` en `cmd/worker/main.go`.
4. Encolar desde un service con `jobClient.Insert(ctx, YourJobArgs{...}, &river.InsertOpts{Queue: "tu_cola"})`.
   El API usa un cliente *enqueue-only* (`jobs.NewEnqueueClient`); el worker usa
   `jobs.NewWorkerClient` con los workers registrados.
5. Colas declaradas en `internal/jobs/client.go` (`river.QueueDefault`, `"scraping"`).

Nota: el proceso `cmd/worker` debe correr al menos una vez para crear las tablas
`river_*` antes de que el API pueda encolar; de lo contrario `Insert` falla.
Convención de canal de progreso (para WebSocket futuro): `scraping:job:{job_id}`.

## Flujo de Trabajo por Sesión

1. Leer este CLAUDE.md antes de escribir una línea de código.
2. Alcance: **un módulo o bounded context por sesión**. No avanzar fuera del scope pedido.
3. Al terminar el módulo: `go build ./...`, `make lint`, `go vet ./...` deben pasar.
4. Commit con mensaje descriptivo: `feat(contacts): add contact CRUD and timeline`.
5. Reportar qué se creó y el resultado de la verificación. Detenerse.

## Variables de Entorno

Ver `.env.example` en la raíz. Todas con prefijo `PIXS_`.
Nunca commitear `.env`. Siempre está en `.gitignore`.
