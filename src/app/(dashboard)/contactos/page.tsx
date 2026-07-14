import { EmptyState, PageHeader } from "@/components/ui"
import { listContacts } from "@/modules/contacts/queries"
import { ContactForm } from "./ContactForm"
import { ContactsList } from "./ContactsList"

export const dynamic = "force-dynamic"

export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const contactos = await listContacts(q)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Clientes" subtitle="Los negocios con los que trabajás" />
        <ContactForm />
      </div>

      <form className="mb-4" action="/contactos">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, contacto o email…"
          className="h-9 w-full max-w-sm rounded-md border border-zinc-300 bg-transparent px-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
      </form>

      {contactos.length === 0 ? (
        <EmptyState>No hay clientes{q ? " para esa búsqueda" : ""}.</EmptyState>
      ) : (
        <ContactsList contactos={contactos} />
      )}
    </div>
  )
}
