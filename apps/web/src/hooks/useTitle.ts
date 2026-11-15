import { useEffect } from "react";

/**
 * Título de la pestaña del navegador por pantalla ("Óptica Visión · Archivos · CRM"):
 * antes todas decían "CRM" y el historial, los marcadores y los lectores de pantalla no las distinguían.
 */
export function useTitle(...parts: (string | null | undefined | false)[]) {
  const title = [...parts.filter(Boolean), "CRM"].join(" · ");
  useEffect(() => {
    document.title = title;
  }, [title]);
}
