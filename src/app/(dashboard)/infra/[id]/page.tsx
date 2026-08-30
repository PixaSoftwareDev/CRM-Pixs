import Link from "next/link"
import { notFound } from "next/navigation"
import { Badge, Card } from "@/components/ui"
import { formatDate, formatMoney } from "@/lib/utils"
import { getServer } from "@/modules/infra/queries"

export const dynamic = "force-dynamic"

const ESTADO_TONE = { activo: "green", baja: "neutral", caido: "red" } as const

export default async function ServidorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const server = await getServer(id)
  if (!server) notFound()

  return (
    <div>
      <Link href="/infra" className="text-sm text-zinc-500 hover:underline">
        ← Infraestructura
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{server.nombre}</h1>
          <p className="text-sm text-zinc-500">
            {[server.proveedor, server.os].filter(Boolean).join(" · ") || "Sin proveedor cargado"}
          </p>
        </div>
        <Badge tone={ESTADO_TONE[server.estado as keyof typeof ESTADO_TONE] ?? "neutral"}>
          {server.estado}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Especificaciones</h2>
          <dl className="divide-y divide-black/[.06] text-sm dark:divide-white/[.08]">
            <Dato label="Recursos" valor={server.specs} destacado />
            <Dato label="Sistema" valor={server.os} />
            <Dato label="IP / Host" valor={server.ipHostname} mono />
            <Dato label="Proveedor" valor={server.proveedor} />
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Contrato</h2>
          <dl className="divide-y divide-black/[.06] text-sm dark:divide-white/[.08]">
            <Dato
              label="Costo mensual"
              valor={server.costoMensual ? `${formatMoney(server.costoMensual)}/mes` : null}
              destacado
            />
            <Dato label="Renueva" valor={formatDate(server.renovacionAt)} />
            <Dato label="Alta" valor={formatDate(server.createdAt)} />
          </dl>
        </Card>
      </div>

      {server.descripcion ? (
        <Card className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Notas</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">
            {server.descripcion}
          </p>
        </Card>
      ) : null}
    </div>
  )
}

/** Fila etiqueta / valor. Muestra un guion cuando el dato no está cargado. */
function Dato({
  label,
  valor,
  mono,
  destacado,
}: {
  label: string
  valor?: string | null
  mono?: boolean
  destacado?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd
        className={[
          "min-w-0 truncate text-right",
          mono ? "font-mono text-xs" : "",
          destacado ? "font-medium" : "",
          valor ? "" : "text-zinc-400",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {valor || "—"}
      </dd>
    </div>
  )
}
