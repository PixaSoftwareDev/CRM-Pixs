import type { TaskColor } from "@/db/schema"

/**
 * Prioridad → clases Tailwind. `swatch` para el selector, `bar` para la barra
 * de acento y `card` para teñir la tarjeta entera.
 *
 * `field` tiñe el desplegable del formulario con la prioridad elegida.
 * El tinte es deliberadamente muy suave (5-8 %): tiene que leerse de un vistazo
 * sin volver el tablero un arcoíris ni ensuciar el tema oscuro. Clases
 * literales (no interpoladas) para que Tailwind las incluya en el build.
 */
export const TASK_COLOR_STYLES: Record<
  TaskColor,
  { label: string; swatch: string; bar: string; card: string; field: string }
> = {
  green: {
    label: "Normal",
    swatch: "bg-green-500",
    bar: "bg-green-500",
    card: "bg-green-500/[.06] border-green-500/25 dark:bg-green-500/[.08]",
    field: "border-green-500/50 bg-green-500/[.06] text-green-800 dark:text-green-300",
  },
  amber: {
    label: "Importante",
    swatch: "bg-amber-500",
    bar: "bg-amber-500",
    card: "bg-amber-500/[.07] border-amber-500/30 dark:bg-amber-500/[.10]",
    field: "border-amber-500/50 bg-amber-500/[.07] text-amber-800 dark:text-amber-300",
  },
  red: {
    label: "Urgente",
    swatch: "bg-red-500",
    bar: "bg-red-500",
    card: "bg-red-500/[.06] border-red-500/30 dark:bg-red-500/[.10]",
    field: "border-red-500/50 bg-red-500/[.06] text-red-800 dark:text-red-300",
  },
}
