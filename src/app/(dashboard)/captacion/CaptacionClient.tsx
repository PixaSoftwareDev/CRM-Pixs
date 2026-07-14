"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState, useTransition } from "react"
import { Modal } from "@/components/Modal"
import { Badge, Button, Field, Input } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import {
  approveLeadAction,
  createCampaign,
  discardLeadAction,
  enrichLeadAction,
  runCampaignAction,
} from "@/modules/scraping/actions"

export function NewCampaign() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createCampaign(p, fd)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
    return res
  }, {})

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nueva campaña</Button>
      {open ? (
        <Modal
          title="Nueva campaña"
          description="Recolección de leads por scraping"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <Field label="Nombre">
              <Input name="nombre" required placeholder="Estudios contables CABA" />
            </Field>
            <Field label="Qué buscar (query)">
              <Input name="query" required placeholder="estudio contable" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ubicación">
                <Input name="ubicacion" placeholder="Buenos Aires" />
              </Field>
              <Field label="Cantidad (máx 20)">
                <Input name="cantidad" type="number" min="1" max="20" defaultValue="20" />
              </Field>
            </div>
            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear campaña"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}

export function RunButton({ campaignId }: { campaignId: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await runCampaignAction(campaignId)
            setMsg(res.error ?? `OK: ${"insertados" in res ? res.insertados : 0} leads`)
          })
        }
      >
        {pending ? "Corriendo…" : "Recolectar"}
      </Button>
      {msg ? <span className="text-xs text-zinc-500">{msg}</span> : null}
    </div>
  )
}

const LEAD_TONE = {
  nuevo: "blue",
  aprobado: "green",
  descartado: "neutral",
  duplicado: "amber",
} as const

export function LeadRow({
  lead,
}: {
  lead: {
    id: string
    nombre: string
    email: string | null
    telefono: string | null
    sitioWeb: string | null
    descripcion: string | null
    estado: "nuevo" | "aprobado" | "descartado" | "duplicado"
  }
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className="flex items-start justify-between gap-3 border-b border-black/[.06] py-3 text-sm last:border-0 dark:border-white/[.08]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{lead.nombre}</span>
          <Badge tone={LEAD_TONE[lead.estado]}>{lead.estado}</Badge>
        </div>
        <div className="mt-0.5 truncate text-xs text-zinc-500">
          {[lead.email, lead.telefono, lead.sitioWeb].filter(Boolean).join(" · ") || "—"}
        </div>
        {lead.descripcion ? (
          <div className="mt-0.5 truncate text-xs text-zinc-400">{lead.descripcion}</div>
        ) : null}
        {err ? <div className="mt-0.5 text-xs text-red-600">{err}</div> : null}
      </div>
      {lead.estado === "nuevo" || lead.estado === "duplicado" ? (
        <div className="flex shrink-0 gap-1">
          {lead.sitioWeb ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await enrichLeadAction(lead.id)
                  if (res.error) setErr(res.error)
                })
              }
            >
              Enriquecer
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await approveLeadAction(lead.id)
                if (res && "error" in res) setErr(res.error as string)
              })
            }
          >
            Aprobar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => start(() => void discardLeadAction(lead.id))}
          >
            Descartar
          </Button>
        </div>
      ) : null}
    </div>
  )
}
