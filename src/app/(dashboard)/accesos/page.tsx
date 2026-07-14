import { PageHeader } from "@/components/ui"
import { listCredentials, listProjectOptions } from "@/modules/credentials/queries"
import { AccesosClient } from "./AccesosClient"

export const dynamic = "force-dynamic"

export default async function AccesosPage() {
  const [accesos, proyectos] = await Promise.all([listCredentials(), listProjectOptions()])

  return (
    <div>
      <PageHeader
        title="Accesos"
        subtitle="Usuarios, contraseñas y URLs de todo lo que tenemos. Los secretos se guardan cifrados."
      />
      <AccesosClient initial={accesos} proyectos={proyectos} />
    </div>
  )
}
