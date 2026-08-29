import { EmptyState, PageHeader } from "@/components/ui"
import { type ContactSort, isContactSort, listContacts } from "@/modules/contacts/queries"
import { ContactForm } from "./ContactForm"
import { ContactsList } from "./ContactsList"

export const dynamic = "force-dynamic"

export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string }>
}) {
  const params = await searchParams
  const q = params.q
  // El orden viaja en la URL: así se puede compartir el enlace y sobrevive al
  // recargar, sin estado en el cliente.
  const sort: ContactSort = isContactSort(params.sort) ? params.sort : "createdAt"
  const dir = params.dir === "asc" ? "asc" : "desc"
  const contactos = await listContacts(q, sort, dir)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Clientes" subtitle="Los negocios con los que trabajás" />
        <ContactForm />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form action="/contactos">
          {/* El orden actual viaja con la búsqueda para no perderse al buscar. */}
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, contacto o email…"
            className="h-9 w-full max-w-sm min-w-[16rem] rounded-md border border-zinc-300 bg-transparent px-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
        </form>
        <span className="text-sm text-zinc-500">
          {contactos.length} {contactos.length === 1 ? "cliente" : "clientes"}
        </span>
      </div>

      {contactos.length === 0 ? (
        <EmptyState>No hay clientes{q ? " para esa búsqueda" : ""}.</EmptyState>
      ) : (
        <ContactsList contactos={contactos} q={q} sort={sort} dir={dir} />
      )}
    </div>
  )
}
