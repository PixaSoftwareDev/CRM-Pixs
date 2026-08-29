import { listDatabases, listServers } from "@/modules/infra/queries"
import { InfraClient } from "./InfraClient"
import { Monitoreo } from "./Monitoreo"

export const dynamic = "force-dynamic"

export default async function InfraPage() {
  const [servers, databases] = await Promise.all([listServers(), listDatabases()])

  return (
    <div>
      {/* La cabecera la arma InfraClient, que es quien tiene los botones de alta. */}
      <InfraClient servers={servers} databases={databases} />

      {/* Accesos al monitoreo del VPS (Grafana), debajo del inventario. */}
      <div className="mt-8">
        <Monitoreo />
      </div>
    </div>
  )
}
