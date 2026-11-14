import { useEffect } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ApiError } from "../../lib/api";

const fieldOf = (path: string) => path.replace(/^\//, "").replaceAll("/", ".");

/**
 * Lleva los errores de validación del server a cada campo del formulario
 * ("/taxId" → error en taxId) y devuelve el mensaje general para lo que no se
 * puede mostrar en un campo.
 *
 * `shown` son los campos que muestran su error en pantalla: el error de
 * cualquier otro campo cae al mensaje general (si no, el botón "no hace nada").
 * Sin `shown`, cae al general lo que no es un campo del formulario.
 */
export function useServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: Error | null,
  shown?: readonly Path<T>[],
): string | null {
  const values = form.getValues() as Record<string, unknown>;
  const isShown = (name: string) =>
    !!name && (shown ? (shown as readonly string[]).includes(name) : (name.split(".")[0] ?? "") in values);

  useEffect(() => {
    if (!(error instanceof ApiError) || !error.issues) return;
    for (const issue of error.issues) {
      const name = fieldOf(issue.path);
      if (isShown(name)) form.setError(name as Path<T>, { message: issue.message });
    }
  }, [error, form]);

  if (!error) return null;
  const issues = error instanceof ApiError ? (error.issues ?? []) : [];
  if (!issues.length) return error.message;
  const loose = issues.filter((i) => !isShown(fieldOf(i.path))).map((i) => i.message);
  return loose.length ? [...new Set(loose)].join(" · ") : null;
}
