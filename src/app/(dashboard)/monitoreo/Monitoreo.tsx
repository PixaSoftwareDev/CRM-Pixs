import { ExternalLinkIcon } from "@/components/icons"
import { Card } from "@/components/ui"
import type { MonitoredAppRow } from "@/modules/infra/queries"

// Los paneles son fijos: viven en Grafana, que ya recolecta todo con
// Prometheus/Loki. Acá solo se entra, no se duplica nada.
const VPS = "http://200.58.109.110"

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-3 align-middle"

const ENTORNO_LABEL: Record<string, string> = {
  produccion: "producción",
  desarrollo: "desarrollo",
  staging: "staging",
}

const PANELES = [
  {
    href: `${VPS}/grafana/d/vps-estado`,
    titulo: "Estado del VPS",
    mide: "Uso actual: RAM y CPU por aplicación, ranking de consumo, disco y saturaciones activas.",
  },
  {
    href: `${VPS}/grafana/d/vps-historico`,
    titulo: "Histórico comparado",
    mide: "Cómo se movió cada aplicación en el tiempo (CPU, RAM, red), con marcas donde tocó su techo.",
  },
  {
    href: `${VPS}/grafana/d/vps-logs`,
    titulo: "Logs por contenedor",
    mide: "Los logs de Docker de todas las apps, separados por contenedor y con búsqueda de texto.",
  },
]

/** Muestra la dirección sin el protocolo, que solo agrega ruido. */
function limpia(href: string) {
  return href.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

export function Monitoreo({ apps }: { apps: MonitoredAppRow[] }) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Paneles</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PANELES.map((p) => (
            <a key={p.href} href={p.href} target="_blank" rel="noreferrer" className="group">
              <Card className="h-full transition-colors group-hover:border-black/20 dark:group-hover:border-white/30">
                <div className="flex items-center gap-1.5 font-medium">
                  {p.titulo}
                  <ExternalLinkIcon size={13} className="shrink-0 text-zinc-400" />
                </div>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{p.mide}</p>
              </Card>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Aplicaciones</h2>

        {apps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/[.12] p-10 text-center text-sm text-zinc-500 dark:border-white/[.14]">
            Todavía no cargaste aplicaciones.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/[.08] bg-zinc-50 text-left dark:border-white/[.12] dark:bg-zinc-900">
                  <th scope="col" className={TH}>
                    Aplicación
                  </th>
                  <th scope="col" className={`${TH} hidden sm:table-cell`}>
                    Entorno
                  </th>
                  <th scope="col" className={TH}>
                    Dirección
                  </th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a, i) => (
                  <tr
                    key={a.id}
                    className={`relative bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50${
                      i === 0 ? "" : " border-t border-black/[.06] dark:border-white/[.08]"
                    }`}
                  >
                    <td className={TD}>
                      {/* Cubre la fila entera: se puede hacer clic en cualquier parte. */}
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 font-medium after:absolute after:inset-0"
                      >
                        {a.nombre}
                        <ExternalLinkIcon size={13} className="shrink-0 text-zinc-400" />
                      </a>
                    </td>
                    <td className={`${TD} hidden text-zinc-500 sm:table-cell`}>
                      {ENTORNO_LABEL[a.entorno] ?? a.entorno}
                    </td>
                    <td className={`${TD} font-mono text-xs text-zinc-500`}>{limpia(a.url)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
