import Link from "next/link"
import { notFound } from "next/navigation"
import { Timeline } from "@/components/Timeline"
import { Card, PageHeader } from "@/components/ui"
import { getContact } from "@/modules/contacts/queries"

export const dynamic = "force-dynamic"

export default async function ContactoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await getContact(id)
  if (!c) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/contactos" className="text-sm text-zinc-500 hover:underline">
        ← Contactos
      </Link>
      <div className="mt-2 mb-6">
        <PageHeader title={c.nombre} subtitle={c.empresa ?? undefined} />
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <Card className="space-y-3 self-start">
          <Detail label="Email" value={c.email ?? "—"} />
          <Detail label="Teléfono" value={c.telefono ?? "—"} />
          <Detail
            label="Sitio web"
            value={
              c.sitioWeb ? (
                <a href={c.sitioWeb} className="text-blue-600 hover:underline">
                  {c.sitioWeb}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Detail label="Origen" value={c.source} />
          {c.notas ? <Detail label="Notas" value={c.notas} /> : null}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Actividad</h2>
          <Timeline entityType="contact" entityId={c.id} revalidate={`/contactos/${c.id}`} />
        </Card>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}
