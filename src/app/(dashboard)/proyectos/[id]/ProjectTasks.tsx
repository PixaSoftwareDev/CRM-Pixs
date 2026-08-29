import Link from "next/link"
import { Badge, Card } from "@/components/ui"
import type { TaskColumn } from "@/db/schema"
import { formatDate } from "@/lib/utils"
import type { TaskRow } from "@/modules/tasks/queries"

const COLUMNA_LABEL: Record<TaskColumn, string> = {
  backlog: "Backlog",
  en_curso: "En curso",
  revision: "Revisión",
  hecho: "Hecho",
}

const COLUMNA_TONE: Record<TaskColumn, "neutral" | "blue" | "amber" | "green"> = {
  backlog: "neutral",
  en_curso: "blue",
  revision: "amber",
  hecho: "green",
}

/**
 * Tareas del proyecto, resumidas en su ficha. Se muestran las pendientes (el
 * trabajo que falta) porque es lo primero que se busca al abrir un proyecto;
 * para moverlas entre columnas está el tablero en Tareas.
 */
export function ProjectTasks({ tareas }: { tareas: TaskRow[] }) {
  const pendientes = tareas.filter((t) => t.estado !== "hecho")
  const hechas = tareas.length - pendientes.length

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Tareas</h2>
        <Link href="/tareas" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
          Abrir tablero →
        </Link>
      </div>

      {tareas.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Este proyecto todavía no tiene tareas. Se crean desde el tablero de{" "}
          <Link href="/tareas" className="text-blue-600 hover:underline dark:text-blue-400">
            Tareas
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-zinc-500">
            {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"} · {hechas} hecha
            {hechas === 1 ? "" : "s"} de {tareas.length}
          </p>

          {pendientes.length === 0 ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              Todas las tareas están terminadas.
            </p>
          ) : (
            <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
              {pendientes.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.titulo}</div>
                    {t.venceAt ? (
                      <div className="text-xs text-zinc-400">vence {formatDate(t.venceAt)}</div>
                    ) : null}
                  </div>
                  <Badge tone={COLUMNA_TONE[t.estado]}>{COLUMNA_LABEL[t.estado]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
