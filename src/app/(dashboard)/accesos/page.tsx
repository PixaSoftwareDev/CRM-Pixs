import { listCredentials, listProjectOptions } from "@/modules/credentials/queries"
import { AccesosClient } from "./AccesosClient"

export const dynamic = "force-dynamic"

export default async function AccesosPage() {
  const [accesos, proyectos] = await Promise.all([listCredentials(), listProjectOptions()])

  return (
    <div>
      <AccesosClient initial={accesos} proyectos={proyectos} />
    </div>
  )
}
