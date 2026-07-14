import { EmptyState, PageHeader } from "@/components/ui"
import { listProjects } from "@/modules/projects/queries"
import { ProjectsList } from "./ProjectsList"

export const dynamic = "force-dynamic"

export default async function ProyectosPage() {
  const proyectos = await listProjects()

  return (
    <div>
      <PageHeader title="Proyectos" subtitle="Se crean al confirmar una oportunidad" />
      {proyectos.length === 0 ? (
        <EmptyState>
          Todavía no hay proyectos. Confirmá una oportunidad en <strong>Oportunidades</strong> y se
          crea el proyecto automáticamente.
        </EmptyState>
      ) : (
        <ProjectsList proyectos={proyectos} />
      )}
    </div>
  )
}
