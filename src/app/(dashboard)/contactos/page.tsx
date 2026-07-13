import Link from "next/link"
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui"
import { formatDate } from "@/lib/utils"
import { listContacts } from "@/modules/contacts/queries"
import { ContactForm } from "./ContactForm"

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
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader title="Contactos" subtitle="Personas y empresas" />
        <ContactForm />
      </div>

      <form className="mb-4" action="/contactos">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, empresa o email…"
          className="h-9 w-full max-w-sm rounded-md border border-zinc-300 bg-transparent px-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
      </form>

      {contactos.length === 0 ? (
        <EmptyState>No hay contactos{q ? " para esa búsqueda" : ""}.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contactos.map((c) => (
            <Link key={c.id} href={`/contactos/${c.id}`}>
              <Card className="h-full transition-colors hover:border-zinc-400">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.nombre}</span>
                  {c.source !== "manual" ? <Badge tone="violet">{c.source}</Badge> : null}
                </div>
                {c.empresa ? <div className="text-sm text-zinc-500">{c.empresa}</div> : null}
                {c.email ? <div className="mt-2 text-xs text-zinc-400">{c.email}</div> : null}
                <div className="mt-2 text-xs text-zinc-400">Alta {formatDate(c.createdAt)}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
