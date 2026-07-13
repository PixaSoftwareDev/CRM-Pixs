import { Badge, Card, EmptyState, PageHeader } from "@/components/ui"
import { formatMoney } from "@/lib/utils"
import { listServersMinimal, searchDatabases, searchServers } from "@/modules/infra/queries"
import { NewDatabaseForm, NewServerForm } from "./InfraForms"

export const dynamic = "force-dynamic"

const ESTADO_TONE = { activo: "green", baja: "neutral", caido: "red" } as const

export default async function InfraPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const [servers, databases, serverList] = await Promise.all([
    searchServers(q),
    searchDatabases(q),
    listServersMinimal(),
  ])

  return (
    <div>
      <PageHeader title="Infraestructura" subtitle="Inventario compartido · búsqueda full-text" />

      <form className="mb-4" action="/infra">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar en servidores y bases (nombre, proveedor, host…)"
          className="h-9 w-full max-w-lg rounded-md border border-zinc-300 bg-transparent px-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Servidores ({servers.length})</h2>
            <NewServerForm />
          </div>
          {servers.length === 0 ? (
            <EmptyState>Sin servidores{q ? " para esa búsqueda" : ""}.</EmptyState>
          ) : (
            servers.map((s) => (
              <Card key={s.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.nombre}</span>
                  <Badge tone={ESTADO_TONE[s.estado as keyof typeof ESTADO_TONE] ?? "neutral"}>
                    {s.estado}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {[s.proveedor, s.ipHostname, s.os].filter(Boolean).join(" · ") || "—"}
                </div>
                {s.costoMensual ? (
                  <div className="mt-1 text-xs text-zinc-400">
                    {formatMoney(s.costoMensual)}/mes
                  </div>
                ) : null}
              </Card>
            ))
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Bases de datos ({databases.length})</h2>
            <NewDatabaseForm servers={serverList} />
          </div>
          {databases.length === 0 ? (
            <EmptyState>Sin bases{q ? " para esa búsqueda" : ""}.</EmptyState>
          ) : (
            databases.map((d) => (
              <Card key={d.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.nombre}</span>
                  <Badge tone="blue">{d.motor}</Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {[d.entorno, d.host, d.puerto].filter(Boolean).join(" · ") || "—"}
                </div>
                {d.credencialRef ? (
                  <div className="mt-1 text-xs text-zinc-400">🔑 {d.credencialRef}</div>
                ) : null}
              </Card>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
