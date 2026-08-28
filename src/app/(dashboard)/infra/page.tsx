import { PageHeader } from "@/components/ui"
import { listDatabases, listServers } from "@/modules/infra/queries"
import { InfraClient } from "./InfraClient"
import { Monitoreo } from "./Monitoreo"

export const dynamic = "force-dynamic"

export default async function InfraPage() {
  const [servers, databases] = await Promise.all([listServers(), listDatabases()])

  return (
    <div>
      <PageHeader
        title="Infraestructura"
        subtitle="Inventario compartido · filtrá por estado, entorno, proveedor o motor"
      />
      <Monitoreo />
      <InfraClient servers={servers} databases={databases} />
    </div>
  )
}
