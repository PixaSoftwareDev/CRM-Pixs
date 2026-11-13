/** Errores de dominio: los servicios los lanzan y el error handler los traduce a HTTP. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Recurso") {
    super(404, `${what} no encontrado`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

/** Violación de unicidad de Postgres (para mapear a 409 con un mensaje claro). */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; constraint_name?: string; cause?: unknown };
  if (e.code === "23505") return !constraint || e.constraint_name === constraint;
  return e.cause !== undefined && isUniqueViolation(e.cause, constraint);
}
