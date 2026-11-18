import type { KeyboardEvent } from "react";
import { Button } from "./Button";

/**
 * Confirmación en línea dentro de un modal (en lugar de window.confirm). Al
 * aparecer, el foco va al botón principal; Esc equivale a "cancelar" y no cierra el modal.
 */
export function InlineConfirm({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  disabled,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    // Sin esto el Esc le llega al <dialog> y cierra el modal.
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  };

  return (
    <div
      role="alert"
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
    >
      <strong>{message}</strong>
      <span className="flex flex-wrap gap-2 max-sm:w-full max-sm:*:flex-1">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        {/* La confirmación la abrió el teclado: el foco va directo a la acción. */}
        <Button size="sm" autoFocus onClick={onConfirm} disabled={disabled}>
          {confirmLabel}
        </Button>
      </span>
    </div>
  );
}
