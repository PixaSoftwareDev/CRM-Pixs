import { twMerge } from "tailwind-merge";

/**
 * Une clases condicionales y resuelve conflictos de Tailwind: la última gana
 * (cn("w-full", "w-auto") → "w-auto"), así los componentes aceptan overrides.
 */
export const cn = (...parts: (string | false | null | undefined)[]) => twMerge(parts.filter(Boolean).join(" "));
