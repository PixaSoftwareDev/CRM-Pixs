import type { NextFunction, Request, Response } from "express"
import type { ZodType } from "zod"
import type { AuthUser } from "./types"

/** Error HTTP con status, para cortar el flujo desde cualquier handler. */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Request con `params` estrechado a string (los tipos de Express 5 los declaran
 * como `string | string[]`; en la práctica de estas rutas siempre son string).
 */
export type ApiRequest = Request & { params: Record<string, string>; user: AuthUser }

/**
 * Envuelve un handler async y manda cualquier rechazo al error handler de
 * Express (en Express 5 no siempre se propaga solo desde promesas).
 */
export function asyncHandler(
  fn: (req: ApiRequest, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as ApiRequest, res, next).catch(next)
  }
}

/** Valida `data` contra un schema Zod; tira HttpError 400 con el primer mensaje. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const res = schema.safeParse(data)
  if (!res.success) {
    throw new HttpError(400, res.error.issues[0]?.message ?? "Datos inválidos")
  }
  return res.data
}

/** Normaliza "" y undefined a null (para columnas nullable). */
export function nil(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : ""
  return s.length ? s : null
}
