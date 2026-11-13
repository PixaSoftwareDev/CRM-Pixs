import { useCallback, useState } from "react";

/** Copia al portapapeles y marca qué clave se copió durante 1,5 s ("Copiado ✓"). */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }, []);
  return { copied, copy };
}
