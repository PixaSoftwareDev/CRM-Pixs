import { Badge } from "@/components/ui"
import type { ActivityEntity } from "@/db/schema"
import { formatDate } from "@/lib/utils"
import { listActivities } from "@/modules/activities"
import { AddNote } from "./AddNote"

const TIPO_TONE = {
  nota: "neutral",
  archivo: "blue",
  cambio_estado: "violet",
  comentario: "green",
} as const

/** Línea de tiempo de una entidad (§3). Server Component. */
export async function Timeline({
  entityType,
  entityId,
  revalidate,
}: {
  entityType: ActivityEntity
  entityId: string
  revalidate: string
}) {
  const items = await listActivities(entityType, entityId)

  return (
    <div className="space-y-4">
      <AddNote entityType={entityType} entityId={entityId} revalidate={revalidate} />
      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">Sin actividad todavía.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <Badge tone={TIPO_TONE[a.tipo]}>{a.tipo.replace("_", " ")}</Badge>
                <span className="text-xs text-zinc-400">
                  {formatDate(a.createdAt)}
                  {a.autorNombre ? ` · ${a.autorNombre}` : ""}
                </span>
              </div>
              {a.contenido ? <p className="mt-1 text-sm">{a.contenido}</p> : null}
              {a.archivoUrl ? (
                <a
                  href={a.archivoUrl}
                  className="mt-1 inline-block text-sm text-blue-600 hover:underline"
                >
                  Ver archivo
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
