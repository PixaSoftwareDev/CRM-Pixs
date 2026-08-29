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
      <TareasClient initial={tareas} proyectos={proyectos} usuarios={usuarios} />
    </div>
  )
}
