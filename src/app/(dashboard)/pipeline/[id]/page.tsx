import Link from "next/link"
import { notFound } from "next/navigation"
import { Timeline } from "@/components/Timeline"
import { Badge, Card } from "@/components/ui"
import { formatMoney } from "@/lib/utils"
import { STATE_LABELS, STATE_TONES } from "@/modules/opportunities/labels"
import { getOpportunity } from "@/modules/opportunities/queries"

export const dynamic = "force-dynamic"

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const opp = await getOpportunity(id)
  if (!opp) notFound()

  return (
    <div className="animate-slide-up">
      <Link href="/pipeline" className="text-sm text-zinc-500 hover:underline">
        ← Oportunidades
      </Link>

      {/* Hero */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.12] dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{opp.titulo}</h1>
            <p className="mt-1 text-zinc-500">
              <Link
                href={`/contactos/${opp.contactId}`}
                className="hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
              >
                {opp.contactoNombre}
              </Link>
              {opp.personaContacto ? (
                <span className="text-zinc-400"> · {opp.personaContacto}</span>
              ) : null}
            </p>
          </div>
          <Badge tone={STATE_TONES[opp.estado]}>{STATE_LABELS[opp.estado]}</Badge>
        </div>
      </div>

      {/* Actividad (izq) + detalle (der, sticky) */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold">Actividad</h2>
          <Timeline entityType="opportunity" entityId={opp.id} revalidate={`/pipeline/${opp.id}`} />
        </Card>

        <Card className="space-y-4 lg:sticky lg:top-8">
          <h2 className="text-sm font-semibold">Detalle</h2>
          <Detail
            label="Valor estimado"
            value={opp.valorEstimado ? formatMoney(opp.valorEstimado, opp.moneda) : "—"}
          />
          <Detail label="Probabilidad" value={opp.probabilidad ? `${opp.probabilidad}%` : "—"} />
          {opp.estado === "perdido" && opp.motivoPerdida ? (
            <Detail label="Motivo de pérdida" value={opp.motivoPerdida} />
          ) : null}
          <Detail
            label="Cliente"
            value={
              <Link
                href={`/contactos/${opp.contactId}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {opp.contactoNombre}
              </Link>
            }
          />
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
