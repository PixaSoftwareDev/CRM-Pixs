import { PageHeader } from "@/components/ui"
import { listAllTasks, listProjectOptions, listUsers } from "@/modules/tasks/queries"
import { TareasClient } from "./TareasClient"

export const dynamic = "force-dynamic"

export default async function TareasPage() {
  const [tareas, proyectos, usuarios] = await Promise.all([
    listAllTasks(),
    listProjectOptions(),
    listUsers(),
  ])

  return (
    <div>
      <PageHeader
        title="Tareas"
        subtitle="Todas las tareas de todos los proyectos en un solo lugar"
      />
      <TareasClient initial={tareas} proyectos={proyectos} usuarios={usuarios} />
    </div>
  )
}
