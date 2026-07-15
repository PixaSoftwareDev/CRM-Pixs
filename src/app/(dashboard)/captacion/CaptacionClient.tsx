"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState, useTransition } from "react"
import { useConfirm } from "@/components/ConfirmDialog"
import { TrashIcon } from "@/components/icons"
import { Modal } from "@/components/Modal"
import { Badge, Button, Field, Input } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import {
  approveLeadAction,
  createCampaign,
  deleteLeadAction,
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

type Lead = {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  sitioWeb: string | null
  direccion: string | null
  contactoNombre: string | null
  contactoArea: string | null
  descripcion: string | null
  estado: "nuevo" | "aprobado" | "descartado" | "duplicado"
}

export function LeadRow({ lead }: { lead: Lead }) {
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ver, setVer] = useState(false)

  const accionable = lead.estado === "nuevo" || lead.estado === "duplicado"

  function enriquecer() {
    start(async () => {
      const res = await enrichLeadAction(lead.id)
      if (res.error) setErr(res.error)
    })
  }
  function aprobar() {
    start(async () => {
      const res = await approveLeadAction(lead.id)
      if (res && "error" in res) setErr(res.error as string)
      else setVer(false)
    })
  }
  function descartar() {
    start(() => void discardLeadAction(lead.id))
    setVer(false)
  }
  async function eliminar() {
    const ok = await confirm({
      title: "Eliminar lead",
      message: `¿Eliminar el lead "${lead.nombre}"? Esta acción no se puede deshacer.`,
      danger: true,
    })
    if (!ok) return
    start(() => void deleteLeadAction(lead.id))
    setVer(false)
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-black/[.06] py-3 text-sm last:border-0 dark:border-white/[.08]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{lead.nombre}</span>
          <Badge tone={LEAD_TONE[lead.estado]}>{lead.estado}</Badge>
        </div>
        <div className="mt-0.5 truncate text-xs text-zinc-500">
          {[lead.telefono, lead.email, lead.sitioWeb].filter(Boolean).join(" · ") || "Sin contacto"}
        </div>
        {lead.direccion ? (
          <div className="mt-0.5 truncate text-xs text-zinc-400">{lead.direccion}</div>
        ) : null}
        {err ? <div className="mt-0.5 text-xs text-red-600">{err}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => setVer(true)}>
          Ver
        </Button>
        {accionable ? (
          <Button size="sm" disabled={pending} onClick={aprobar}>
            Aprobar
          </Button>
        ) : null}
        <button
          type="button"
          onClick={eliminar}
          disabled={pending}
          title="Eliminar lead"
          aria-label={`Eliminar ${lead.nombre}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        >
          <TrashIcon size={16} />
        </button>
      </div>

      {ver ? (
        <Modal
          title={lead.nombre}
          description={`Lead ${lead.estado}`}
          onClose={() => setVer(false)}
        >
          <div className="space-y-3 text-sm">
            <DetailRow label="Teléfono / celular" value={lead.telefono} />
            <DetailRow label="Email" value={lead.email} />
            <DetailRow
              label="Persona de contacto"
              value={[lead.contactoNombre, lead.contactoArea].filter(Boolean).join(" — ") || null}
            />
            <DetailRow label="Sitio web" value={lead.sitioWeb} href={lead.sitioWeb} />
            <DetailRow label="Dirección" value={lead.direccion} />
            <DetailRow label="Descripción" value={lead.descripcion} />

            {!lead.telefono && lead.sitioWeb ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                Sin teléfono. Probá “Enriquecer”: lee el sitio web y suele encontrar
                teléfono/celular, email y contacto.
              </p>
            ) : null}
            {err ? <p className="text-xs text-red-600">{err}</p> : null}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={eliminar}
                className="mr-auto text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Eliminar
              </Button>
              {accionable ? (
                <>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={descartar}>
                    Descartar
                  </Button>
                  {lead.sitioWeb ? (
                    <Button size="sm" variant="secondary" disabled={pending} onClick={enriquecer}>
                      {pending ? "Enriqueciendo…" : "Enriquecer"}
                    </Button>
                  ) : null}
                  <Button size="sm" disabled={pending} onClick={aprobar}>
                    Aprobar → cliente
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function DetailRow({
  label,
  value,
  href,
}: {
  label: string
  value: string | null
  href?: string | null
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-black/[.05] pb-2 last:border-0 dark:border-white/[.06]">
      <span className="text-xs text-zinc-400">{label}</span>
      {value ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="truncate font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {value}
          </a>
        ) : (
          <span className="break-words">{value}</span>
        )
      ) : (
        <span className="text-zinc-400">—</span>
      )}
    </div>
  )
}
