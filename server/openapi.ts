/**
 * Especificación OpenAPI 3.0 de la API REST, servida en /api/openapi.json
 * (alias /api/swagger.json y /api/api-docs). Mantenida a mano: si agregás o
 * cambiás una ruta en routes/, actualizá acá. Los cuerpos se documentan de
 * forma laxa (type: object) — la validación real es Zod en los schemas de modules/.
 */

const bearer = [{ bearerAuth: [] as string[] }]

function idParam(name = "id", description = "Id del recurso") {
  return {
    name,
    in: "path" as const,
    required: true,
    schema: { type: "string" as const },
    description,
  }
}

function queryParam(name: string, description: string) {
  return {
    name,
    in: "query" as const,
    required: false,
    schema: { type: "string" as const },
    description,
  }
}

function jsonBody(description: string, required = true) {
  return {
    required,
    description,
    content: { "application/json": { schema: { type: "object" as const } } },
  }
}

function op(tag: string, summary: string, extra: Record<string, unknown> = {}, secured = true) {
  return {
    tags: [tag],
    summary,
    ...(secured ? { security: bearer } : {}),
    responses: {
      "200": { description: "OK" },
      ...(secured ? { "401": { description: "Falta el token o es inválido" } } : {}),
    },
    ...extra,
  }
}

export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Pixs CRM API",
    version: "1.0.0",
    description:
      "API REST del CRM Pixs (Express + JWT). Todos los endpoints requieren " +
      "`Authorization: Bearer <token>` salvo /health y /auth/login|demo-login. " +
      "Errores: JSON `{ error: string }`. 401 «Token inválido o expirado» = " +
      "mismatch de secreto; «Falta el token» = no llegó el header.",
  },
  servers: [
    { url: "http://149.50.152.218/crmpixs/api", description: "Producción (VPS, solo HTTP)" },
    { url: "http://localhost:3002/api", description: "Local (npm run api:dev)" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  tags: [
    { name: "auth" },
    { name: "contacts", description: "Contactos / clientes" },
    { name: "projects" },
    { name: "tasks" },
    { name: "money", description: "Presupuestos, cuotas y transacciones" },
    { name: "documents" },
    { name: "credentials", description: "Accesos / credenciales" },
    { name: "infra", description: "Servidores y bases de datos" },
    { name: "activities", description: "Timeline / notas" },
    { name: "dashboard" },
    { name: "users" },
  ],
  paths: {
    "/health": {
      get: op("auth", "Salud del servicio (sin auth)", {}, false),
    },
    "/auth/login": {
      post: op(
        "auth",
        "Login con email + contraseña compartida; devuelve { token, user }",
        {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
        },
        false,
      ),
    },
    "/auth/demo-login": {
      post: op(
        "auth",
        "Login demo (usuario admin por defecto); devuelve { token, user }",
        {},
        false,
      ),
    },
    "/auth/me": {
      get: op("auth", "Usuario autenticado del token"),
    },

    "/contacts": {
      get: op("contacts", "Lista contactos", {
        parameters: [queryParam("search", "Filtro por nombre/empresa/email (LIKE)")],
      }),
      post: op("contacts", "Crea un contacto", { requestBody: jsonBody("contactSchema (Zod)") }),
    },
    "/contacts/{id}": {
      get: op("contacts", "Detalle de un contacto", { parameters: [idParam()] }),
      patch: op("contacts", "Actualiza un contacto", {
        parameters: [idParam()],
        requestBody: jsonBody("contactSchema (Zod)"),
      }),
      delete: op("contacts", "Elimina un contacto", { parameters: [idParam()] }),
    },
    "/contacts/{id}/people": {
      get: op("contacts", "Personas de contacto", { parameters: [idParam()] }),
      post: op("contacts", "Agrega una persona de contacto", {
        parameters: [idParam()],
        requestBody: jsonBody("personSchema (Zod)"),
      }),
    },
    "/contacts/people/{personId}": {
      delete: op("contacts", "Elimina una persona de contacto", {
        parameters: [idParam("personId", "Id de la persona")],
      }),
    },

    "/projects": {
      get: op("projects", "Lista proyectos"),
    },
    "/projects/{id}": {
      get: op("projects", "Detalle de un proyecto", { parameters: [idParam()] }),
    },
    "/projects/{id}/state": {
      patch: op("projects", "Cambia el estado del proyecto", {
        parameters: [idParam()],
        requestBody: jsonBody("{ estado }"),
      }),
    },
    "/projects/{id}/tech-info": {
      get: op("projects", "Info técnica del proyecto", { parameters: [idParam()] }),
      post: op("projects", "Agrega info técnica", {
        parameters: [idParam()],
        requestBody: jsonBody("techSchema (Zod)"),
      }),
    },
    "/projects/tech-info/{techId}": {
      delete: op("projects", "Elimina un ítem de info técnica", {
        parameters: [idParam("techId", "Id del ítem técnico")],
      }),
    },

    "/tasks": {
      get: op("tasks", "Lista tareas"),
      post: op("tasks", "Crea una tarea", { requestBody: jsonBody("boardSchema (Zod)") }),
    },
    "/tasks/{id}": {
      patch: op("tasks", "Actualiza una tarea", {
        parameters: [idParam()],
        requestBody: jsonBody("updateSchema (Zod)"),
      }),
      delete: op("tasks", "Elimina una tarea", { parameters: [idParam()] }),
    },
    "/tasks/{id}/status": {
      post: op("tasks", "Cambia el estado de la tarea", {
        parameters: [idParam()],
        requestBody: jsonBody("{ estado }"),
      }),
    },
    "/tasks/{id}/move": {
      post: op("tasks", "Mueve la tarea en el tablero", {
        parameters: [idParam()],
        requestBody: jsonBody("{ estado }"),
      }),
    },
    "/tasks/by-project/{projectId}": {
      get: op("tasks", "Tareas de un proyecto", {
        parameters: [idParam("projectId", "Id del proyecto")],
      }),
    },

    "/money/receivables": {
      get: op("money", "Cuentas por cobrar"),
    },
    "/money/summary": {
      get: op("money", "Resumen financiero"),
    },
    "/money/transactions": {
      get: op("money", "Lista transacciones", {
        parameters: [
          queryParam("from", "Fecha desde (ISO)"),
          queryParam("to", "Fecha hasta (ISO)"),
        ],
      }),
      post: op("money", "Crea una transacción", { requestBody: jsonBody("txSchema (Zod)") }),
    },
    "/money/transactions/{id}/reintegro": {
      post: op("money", "Marca reintegro de una transacción", {
        parameters: [idParam()],
        requestBody: jsonBody("{ devuelto: boolean }"),
      }),
    },
    "/money/budget/{projectId}": {
      get: op("money", "Presupuesto de un proyecto", {
        parameters: [idParam("projectId", "Id del proyecto")],
      }),
    },
    "/money/budgets": {
      post: op("money", "Crea/actualiza un presupuesto", {
        requestBody: jsonBody("budgetSchema (Zod)"),
      }),
    },
    "/money/installments/{id}/toggle": {
      post: op("money", "Marca/desmarca una cuota como pagada", {
        parameters: [idParam("id", "Id de la cuota")],
        requestBody: jsonBody("{ projectId, pagar: boolean }"),
      }),
    },

    "/documents": {
      get: op("documents", "Lista documentos de una entidad", {
        parameters: [
          queryParam("entityType", "Tipo de entidad dueña"),
          queryParam("entityId", "Id de la entidad dueña"),
        ],
      }),
      post: op("documents", "Sube un documento (multipart, máx 20 MB)", {
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: { type: "object" } } },
        },
      }),
    },
    "/documents/{id}": {
      get: op("documents", "Descarga un documento (query download=1 fuerza attachment)", {
        parameters: [idParam(), queryParam("download", "«1» para forzar descarga")],
      }),
      delete: op("documents", "Elimina un documento", { parameters: [idParam()] }),
    },

    "/credentials": {
      get: op("credentials", "Lista credenciales (sin secretos)", {
        parameters: [
          queryParam("q", "Búsqueda libre"),
          queryParam("projectId", "Filtrar por proyecto"),
          queryParam("tipo", "Filtrar por tipo de credencial"),
        ],
      }),
      post: op("credentials", "Crea una credencial", { requestBody: jsonBody("baseSchema (Zod)") }),
    },
    "/credentials/{id}": {
      patch: op("credentials", "Actualiza una credencial", {
        parameters: [idParam()],
        requestBody: jsonBody("baseSchema (Zod)"),
      }),
      delete: op("credentials", "Elimina una credencial", { parameters: [idParam()] }),
    },
    "/credentials/{id}/reveal": {
      post: op("credentials", "Revela el secreto cifrado de la credencial", {
        parameters: [idParam()],
      }),
    },

    "/infra/servers": {
      get: op("infra", "Lista servidores"),
      post: op("infra", "Crea un servidor", { requestBody: jsonBody("serverSchema (Zod)") }),
    },
    "/infra/servers/{id}": {
      get: op("infra", "Detalle de un servidor", { parameters: [idParam()] }),
    },
    "/infra/databases": {
      get: op("infra", "Lista bases de datos"),
      post: op("infra", "Crea una base de datos", {
        requestBody: jsonBody("databaseSchema (Zod)"),
      }),
    },

    "/activities": {
      get: op("activities", "Timeline de una entidad", {
        parameters: [
          queryParam("entityType", "Tipo de entidad"),
          queryParam("entityId", "Id de la entidad"),
        ],
      }),
    },
    "/activities/note": {
      post: op("activities", "Agrega una nota al timeline", {
        requestBody: jsonBody("noteSchema (Zod)"),
      }),
    },

    "/dashboard/summary": {
      get: op("dashboard", "Resumen para el panel principal"),
    },

    "/users": {
      get: op("users", "Lista usuarios"),
    },
  },
} as const
