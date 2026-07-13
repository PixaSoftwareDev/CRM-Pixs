"use client"

import { useActionState, useState, useTransition } from "react"
import { Button, Field, Input, Select } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { cn, daysUntil, formatDate, formatMoney } from "@/lib/utils"
import { createBudget, toggleInstallment } from "@/modules/money/actions"

type Cuota = {
  id: string
  monto: string
  venceAt: string
  estado: "pendiente" | "pagada" | "vencida"
}

export function BudgetForm({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createBudget(p, fd)
    if (res.ok) setOpen(false)
    return res
  }, {})

  if (!open)
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Presupuesto
      </Button>
    )

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Monto total">
        <Input name="montoTotal" type="number" step="0.01" min="0" required />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cuotas">
          <Input name="cuotas" type="number" min="1" max="60" defaultValue="1" required />
        </Field>
        <Field label="Moneda">
          <Select name="moneda" defaultValue="ARS">
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
      </div>
      <Field label="Primer vencimiento">
        <Input name="primerVencimiento" type="date" required />
      </Field>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Crear"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

export function InstallmentRow({
  cuota,
  moneda,
  projectId,
}: {
  cuota: Cuota
  moneda: string
  projectId: string
}) {
  const [, start] = useTransition()
  const pagada = cuota.estado === "pagada"
  const dias = daysUntil(cuota.venceAt)
  const vencida = !pagada && dias < 0

  return (
    <div className="flex items-center justify-between gap-2 border-b border-black/[.06] py-2 text-sm last:border-0 dark:border-white/[.08]">
      <div>
        <div className={cn("font-medium", pagada && "text-zinc-400 line-through")}>
          {formatMoney(cuota.monto, moneda)}
        </div>
        <div className={cn("text-xs", vencida ? "text-red-600" : "text-zinc-400")}>
          Vence {formatDate(cuota.venceAt)}
          {vencida ? ` · vencida hace ${Math.abs(dias)}d` : ""}
        </div>
      </div>
      <Button
        size="sm"
        variant={pagada ? "ghost" : "primary"}
        onClick={() => start(() => void toggleInstallment(cuota.id, projectId, !pagada))}
      >
        {pagada ? "Revertir" : "Marcar pagada"}
      </Button>
    </div>
  )
}
