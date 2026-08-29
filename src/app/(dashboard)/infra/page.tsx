import { listDatabases, listServers } from "@/modules/infra/queries"
import { InfraClient } from "./InfraClient"

export const dynamic = "force-dynamic"

export default async function InfraPage() {
  const [servers, databases] = await Promise.all([listServers(), listDatabases()])

  return (
    <div>
      <InfraClient servers={servers} databases={databases} />
    </div>
  )
}
