import { EmptyState, PageHeader } from "@/components/ui"
import { listContacts } from "@/modules/contacts/queries"
import { listOpportunities } from "@/modules/opportunities/queries"
import { KanbanBoard } from "./KanbanBoard"
import { NewOpportunity } from "./NewOpportunity"

export const dynamic = "force-dynamic"

export default async function PipelinePage() {
  const [opps, contactos] = await Promise.all([listOpportunities(), listContacts()])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Oportunidades" subtitle="Arrastrá las tarjetas entre estados" />
        <NewOpportunity contactos={contactos.map((c) => ({ id: c.id, nombre: c.nombre }))} />
      </div>

      {contactos.length === 0 ? (
        <EmptyState>
          Primero creá un cliente en <strong>Clientes</strong> para poder abrir oportunidades.
        </EmptyState>
      ) : opps.length === 0 ? (
        <EmptyState>Todavía no hay oportunidades. Creá la primera.</EmptyState>
      ) : (
        <KanbanBoard
          initial={opps}
          contactos={contactos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      )}
    </div>
  )
}
