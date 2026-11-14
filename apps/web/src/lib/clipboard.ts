/**
 * Copia texto al portapapeles. `navigator.clipboard` solo existe en contextos
 * seguros (HTTPS o localhost); el CRM publicado va por HTTP, así que ahí se usa
 * el método clásico con un <textarea> oculto.
 */
export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Sin permiso o sin foco: se intenta con el método clásico.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  // Sin `readonly`: en iPhone/iPad un campo de solo lectura no se puede seleccionar.
  // `inputMode: none` evita que se abra el teclado y 16px evita que la pantalla haga zoom.
  area.inputMode = "none";
  area.setAttribute("aria-hidden", "true");
  area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px";
  // Dentro de un <dialog> modal el resto de la página es inerte: el textarea va en el
  // modal abierto (el último, si hay uno encima de otro).
  ([...document.querySelectorAll("dialog[open]")].at(-1) ?? document.body).appendChild(area);
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) throw new Error("No se pudo copiar");
  } finally {
    area.remove();
    before?.focus({ preventScroll: true });
  }
}
