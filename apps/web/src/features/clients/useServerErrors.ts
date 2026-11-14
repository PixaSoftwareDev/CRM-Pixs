import { useEffect } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ApiError } from "../../lib/api";

/**
 * Lleva los errores de validación del server a cada campo del formulario
 * ("/taxId" → error en taxId) y devuelve el mensaje general si no es de un campo.
 */
export function useServerErrors<T extends FieldValues>(form: UseFormReturn<T>, error: Error | null): string | null {
  // Solo se marcan en el campo los errores de campos que el formulario tiene; los
  // demás (p. ej. "durationMinutes", que se calcula de Desde/Hasta) van al mensaje
  // general: si no, el error no se veía en ningún lado.
  const values = form.getValues() as Record<string, unknown>;
  const isField = (name: string) => !!name && (name.split(".")[0] ?? "") in values;
  const issues =
    error instanceof ApiError && error.issues
      ? error.issues.map((i) => ({ name: i.path.replace(/^\//, "").replaceAll("/", "."), message: i.message }))
      : [];

  useEffect(() => {
    for (const issue of issues) {
      if (isField(issue.name)) form.setError(issue.name as Path<T>, { message: issue.message });
    }
  }, [error, form]);

  if (!error) return null;
  if (!issues.length) return error.message;
  const general = issues.filter((i) => !isField(i.name)).map((i) => i.message);
  return general.length ? general.join(" · ") : null;
}
