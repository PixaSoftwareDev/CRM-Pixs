import { Badge, Card, EmptyState, PageHeader } from "@/components/ui"
import { formatDate } from "@/lib/utils"
import { leadStats, listCampaigns, listLeads } from "@/modules/scraping/queries"
import { LeadRow, NewCampaign, RunButton } from "./CaptacionClient"

export const dynamic = "force-dynamic"

const CAMPAIGN_TONE = {
  pendiente: "neutral",
  corriendo: "amber",
  completada: "green",
  error: "red",
} as const

export default async function CaptacionPage() {
  const [campaigns, leads, stats] = await Promise.all([listCampaigns(), listLeads(), leadStats()])
  const bandeja = leads.filter((l) => l.estado === "nuevo" || l.estado === "duplicado")

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader title="Captación" subtitle="Scraping → bandeja de leads → pipeline" />
        <NewCampaign />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Leads recolectados" value={String(stats.total)} />
        <Stat label="Aprobados" value={String(stats.aprobados)} />
        <Stat
          label="Conversión"
          value={stats.total ? `${Math.round((stats.aprobados / stats.total) * 100)}%` : "—"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Campañas</h2>
          {campaigns.length === 0 ? (
            <EmptyState>Sin campañas. Creá la primera para recolectar leads.</EmptyState>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <Card key={c.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.nombre}</span>
                    <Badge tone={CAMPAIGN_TONE[c.estado]}>{c.estado}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    “{c.query}”{c.ubicacion ? ` · ${c.ubicacion}` : ""} · {c.cantidad} máx ·{" "}
                    {formatDate(c.createdAt)}
                  </div>
                  <div className="mt-3">
                    <RunButton campaignId={c.id} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Bandeja de leads ({bandeja.length})</h2>
          <Card>
            {bandeja.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin leads por revisar.</p>
            ) : (
              bandeja.map((l) => <LeadRow key={l.id} lead={l} />)
            )}
          </Card>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </Card>
  )
}
