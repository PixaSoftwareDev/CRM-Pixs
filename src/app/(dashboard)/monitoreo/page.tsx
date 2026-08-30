import { PageHeader } from "@/components/ui"
import { listApps } from "@/modules/infra/queries"
import { Monitoreo } from "./Monitoreo"
import { NewAppForm } from "./NewAppForm"

export const dynamic = "force-dynamic"

export default async function MonitoreoPage() {
  const apps = await listApps()

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Monitoreo"
          subtitle="Cómo viene el servidor y por dónde se entra a cada aplicación"
        />
        <NewAppForm />
      </div>
      <Monitoreo apps={apps} />
    </div>
  )
}
