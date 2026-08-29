import { Card } from "@/components/ui"

// Accesos centralizados al monitoreo del VPS (Grafana) y a cada servicio.
// Son links estáticos a propósito: los gráficos viven en Grafana (que ya
// recolecta todo con Prometheus/Loki) y acá solo se entra — nada duplicado.
const VPS = "http://200.58.109.110"

const PANELES = [
  {
    href: `${VPS}/grafana/d/vps-estado`,
    titulo: "Estado del VPS",
    mide: "Uso actual: donut de RAM/CPU por aplicación y lo libre, ranking de consumo, disco y saturaciones activas.",
  },
  {
    href: `${VPS}/grafana/d/vps-historico`,
    titulo: "Histórico comparado",
    mide: "Cómo se movió cada aplicación en el tiempo (CPU, RAM, red), varias juntas, con marcas donde algo tocó su techo.",
  },
  {
    href: `${VPS}/grafana/d/vps-logs`,
    titulo: "Logs por contenedor",
    mide: "Los logs de Docker de todas las apps, bien separados por aplicación y contenedor, con búsqueda de texto.",
  },
]

const SERVICIOS = [
  { href: "https://intellix.com.ar", nombre: "Intellix prod" },
  { href: "https://dev.intellix.com.ar", nombre: "Intellix dev" },
  { href: `${VPS}/`, nombre: "Las Marías" },
  { href: `${VPS}/crmpixs`, nombre: "CRM-Pixs" },
  { href: `${VPS}/ecuestre`, nombre: "Ecuestre" },
  { href: "https://app.handicapp.com.ar", nombre: "Handicapp" },
]

export function Monitoreo() {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        Monitoreo del servidor
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PANELES.map((p) => (
          <a key={p.href} href={p.href} target="_blank" rel="noreferrer" className="group">
            <Card className="h-full transition-colors group-hover:border-black/20 dark:group-hover:border-white/30">
              <div className="font-medium">{p.titulo} ↗</div>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{p.mide}</p>
            </Card>
          </a>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SERVICIOS.map((s) => (
          <a
            key={s.href}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-black/[.08] px-3 py-1 text-sm text-zinc-600 transition-colors hover:border-black/20 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30"
          >
            {s.nombre} ↗
          </a>
        ))}
      </div>
    </section>
  )
}
