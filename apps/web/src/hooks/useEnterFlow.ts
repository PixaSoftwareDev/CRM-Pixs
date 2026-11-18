import { type KeyboardEvent, useId, useRef, useState } from "react";

const ATTR = "data-enter-flow";

/**
 * Enter recorre los campos de un formulario en vez de guardarlo: en cada campo
 * marcado pasa al siguiente, y en el último pide confirmación (no guarda directo).
 *
 * - `container(canConfirm)` va en el elemento que envuelve todos los campos (el <form>
 *   o el cuerpo del modal). `canConfirm` dice si vale pedir confirmación en el último
 *   (false = sin cambios o con errores a la vista: Enter no hace nada).
 * - `field` se esparce en cada campo de la secuencia; el orden es el del DOM.
 * - Un campo que ya atiende su Enter (p. ej. un combobox con la lista abierta)
 *   llama a preventDefault y esto no hace nada.
 *
 * Enter en un input de fecha u hora de Chrome/Firefox envía el formulario por
 * "implicit submission": el preventDefault del keydown lo evita.
 */
export function useEnterFlow() {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  /** Campo desde el que se pidió confirmar, para devolverle el foco. */
  const origin = useRef<HTMLElement | null>(null);

  const onKeyDown = (canConfirm: () => boolean) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter" || e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.getAttribute(ATTR) !== id) return;
    e.preventDefault();
    const fields = [...e.currentTarget.querySelectorAll<HTMLElement>(`[${ATTR}]`)].filter(
      (el) => el === target || (el.getAttribute(ATTR) === id && !el.matches(":disabled") && el.getClientRects().length > 0),
    );
    const next = fields[fields.indexOf(target) + 1];
    if (next) {
      next.focus();
      return;
    }
    if (!canConfirm()) return;
    origin.current = target;
    setConfirming(true);
  };

  const backToField = () => {
    setConfirming(false);
    origin.current?.focus();
  };

  return {
    container: (canConfirm: () => boolean = () => true) => ({ onKeyDown: onKeyDown(canConfirm) }),
    field: { [ATTR]: id } as { [ATTR]: string },
    confirming,
    /** Descarta la confirmación sin mover el foco (al reabrir el formulario). */
    reset: () => setConfirming(false),
    /** "Seguir editando" o Esc: cierra la confirmación y vuelve al campo. */
    cancel: backToField,
    /** Cierra la confirmación y corre la acción (si falla, el foco queda en el campo). */
    accept: (action: () => void) => {
      backToField();
      action();
    },
  };
}
