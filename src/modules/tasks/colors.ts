import type { TaskColor } from "@/db/schema"

/**
 * Mapa de color → clases Tailwind. `swatch` para el selector, `bar` para la
 * barra de acento a la izquierda de la tarjeta. Clases literales (no
 * interpoladas) para que Tailwind las incluya en el build.
 */
export const TASK_COLOR_STYLES: Record<TaskColor, { label: string; swatch: string; bar: string }> =
  {
    red: { label: "Rojo", swatch: "bg-red-500", bar: "bg-red-500" },
    amber: { label: "Ámbar", swatch: "bg-amber-500", bar: "bg-amber-500" },
    green: { label: "Verde", swatch: "bg-green-500", bar: "bg-green-500" },
    blue: { label: "Azul", swatch: "bg-blue-500", bar: "bg-blue-500" },
    violet: { label: "Violeta", swatch: "bg-violet-500", bar: "bg-violet-500" },
    pink: { label: "Rosa", swatch: "bg-pink-500", bar: "bg-pink-500" },
  }
