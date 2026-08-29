import { EmptyState, PageHeader } from "@/components/ui"
import { listContacts } from "@/modules/contacts/queries"
import { listProjects } from "@/modules/projects/queries"
import { NewProject } from "./NewProject"
import { ProjectsList } from "./ProjectsList"

export const dynamic = "force-dynamic"

export default async function ProyectosPage() {
  const [proyectos, contactos] = await Promise.all([listProjects(), listContacts()])
  const opciones = contactos.map((c) => ({ id: c.id, nombre: c.nombre }))

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Proyectos" subtitle="El trabajo que hacés para cada cliente" />
        {opciones.length > 0 ? <NewProject contactos={opciones} /> : null}
      </div>

      {contactos.length === 0 ? (
        <EmptyState>
          Primero creá un cliente en <strong>Clientes</strong> para poder abrir proyectos.
        </EmptyState>
      ) : proyectos.length === 0 ? (
        <EmptyState>Todavía no hay proyectos. Creá el primero.</EmptyState>
      ) : (
        <ProjectsList proyectos={proyectos} />
      )}
    </div>
  )
}
