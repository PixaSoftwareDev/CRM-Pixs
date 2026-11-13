import { useEffect } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ApiError } from "../../lib/api";

/**
 * Lleva los errores de validación del server a cada campo del formulario
 * ("/taxId" → error en taxId) y devuelve el mensaje general si no es de un campo.
 */
export function useServerErrors<T extends FieldValues>(form: UseFormReturn<T>, error: Error | null): string | null {
  useEffect(() => {
    if (!(error instanceof ApiError) || !error.issues) return;
    for (const issue of error.issues) {
      const name = issue.path.replace(/^\//, "").replaceAll("/", ".");
      if (name) form.setError(name as Path<T>, { message: issue.message });
    }
  }, [error, form]);

  if (!error) return null;
  if (error instanceof ApiError && error.issues?.length) return null;
  return error.message;
}
