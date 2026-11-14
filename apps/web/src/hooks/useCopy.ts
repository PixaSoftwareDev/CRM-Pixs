import { useCallback, useState } from "react";
import { copyText } from "../lib/clipboard";

/** Copia al portapapeles y marca qué clave se copió durante 1,5 s ("Copiado ✓"). */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (key: string, text: string) => {
    try {
      await copyText(text);
    } catch {
      // Último recurso: el navegador muestra el texto seleccionado para copiarlo a mano.
      window.prompt("No se pudo copiar solo. Copialo desde acá:", text);
      return;
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }, []);
  return { copied, copy };
}
