import Link from "next/link"
import { notFound } from "next/navigation"
import { Timeline } from "@/components/Timeline"
import { Badge, Card, PageHeader } from "@/components/ui"
import { formatMoney } from "@/lib/utils"
import { STATE_LABELS, STATE_TONES } from "@/modules/opportunities/labels"
import { getOpportunity } from "@/modules/opportunities/queries"

export const dynamic = "force-dynamic"

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const opp = await getOpportunity(id)
  if (!opp) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/pipeline" className="text-sm text-zinc-500 hover:underline">
        ← Pipeline
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between gap-4">
        <PageHeader
          title={opp.titulo}
          subtitle={`${opp.contactoNombre}${opp.empresa ? ` · ${opp.empresa}` : ""}`}
        />
        <Badge tone={STATE_TONES[opp.estado]}>{STATE_LABELS[opp.estado]}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <Card className="space-y-3 self-start">
          <Detail
            label="Valor estimado"
            value={opp.valorEstimado ? formatMoney(opp.valorEstimado, opp.moneda) : "—"}
          />
          <Detail label="Probabilidad" value={opp.probabilidad ? `${opp.probabilidad}%` : "—"} />
          {opp.estado === "perdido" && opp.motivoPerdida ? (
            <Detail label="Motivo de pérdida" value={opp.motivoPerdida} />
          ) : null}
          <Detail
            label="Contacto"
            value={
              <Link href={`/contactos/${opp.contactId}`} className="text-blue-600 hover:underline">
                {opp.contactoNombre}
              </Link>
            }
          />
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Actividad</h2>
          <Timeline entityType="opportunity" entityId={opp.id} revalidate={`/pipeline/${opp.id}`} />
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
