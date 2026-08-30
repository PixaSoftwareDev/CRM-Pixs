import { listServers } from "@/modules/infra/queries"
import { InfraClient } from "./InfraClient"

export const dynamic = "force-dynamic"

export default async function InfraPage() {
  const servers = await listServers()

  return (
    <div>
      {/* La cabecera la arma InfraClient, que es quien tiene el botón de alta. */}
      <InfraClient servers={servers} />
    </div>
  )
}
