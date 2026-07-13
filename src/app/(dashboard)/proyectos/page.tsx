import Link from "next/link"
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui"
import { formatMoney } from "@/lib/utils"
import { listProjects } from "@/modules/projects/queries"

export const dynamic = "force-dynamic"

const ESTADO_TONE = {
  activo: "green",
  pausado: "amber",
  finalizado: "blue",
  cancelado: "red",
} as const

export default async function ProyectosPage() {
  const proyectos = await listProjects()

  return (
    <div>
      <PageHeader title="Proyectos" subtitle="Se crean al confirmar una oportunidad" />
      {proyectos.length === 0 ? (
        <EmptyState>
          Todavía no hay proyectos. Confirmá una oportunidad en el <strong>Pipeline</strong> y se
          crea el proyecto automáticamente.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {proyectos.map((p) => (
            <Link key={p.id} href={`/proyectos/${p.id}`}>
              <Card className="h-full transition-colors hover:border-zinc-400">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.nombre}</span>
                  <Badge tone={ESTADO_TONE[p.estado]}>{p.estado}</Badge>
                </div>
                <div className="text-sm text-zinc-500">{p.contactoNombre}</div>
                {p.valor ? (
                  <div className="mt-2 text-xs text-zinc-400">{formatMoney(p.valor, p.moneda)}</div>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
