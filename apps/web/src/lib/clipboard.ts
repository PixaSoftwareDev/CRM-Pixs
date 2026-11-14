/**
 * Copia texto al portapapeles. `navigator.clipboard` solo existe en contextos
 * seguros (HTTPS o localhost); el CRM publicado va por HTTP, así que ahí se usa
 * el método clásico con un <textarea> oculto.
 */
export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  // Dentro de un <dialog> modal el resto de la página es inerte: el textarea va en el modal abierto.
  (document.querySelector("dialog[open]") ?? document.body).appendChild(area);
  area.select();
  try {
    if (!document.execCommand("copy")) throw new Error("No se pudo copiar");
  } finally {
    area.remove();
  }
}
