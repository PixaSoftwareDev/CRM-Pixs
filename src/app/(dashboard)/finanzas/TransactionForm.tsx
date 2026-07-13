"use client"

import { useActionState, useState } from "react"
import { Button, Field, Input, Select, Textarea } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { createTransaction } from "@/modules/money/actions"

export function TransactionForm({ proyectos }: { proyectos: { id: string; nombre: string }[] }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createTransaction(p, fd)
    if (res.ok) setOpen(false)
    return res
  }, {})

  if (!open) return <Button onClick={() => setOpen(true)}>+ Movimiento</Button>

  return (
    <form
      action={action}
      className="w-full max-w-md space-y-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.12] dark:bg-zinc-950"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select name="tipo" defaultValue="ingreso">
            <option value="ingreso">Ingreso</option>
            <option value="gasto">Gasto</option>
          </Select>
        </Field>
        <Field label="Monto">
          <Input name="monto" type="number" step="0.01" min="0" required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <Input name="fecha" type="date" required />
        </Field>
        <Field label="Categoría">
          <Input name="categoria" placeholder="hosting, sueldos…" />
        </Field>
      </div>
      <Field label="Proyecto (opcional)">
        <Select name="projectId" defaultValue="">
          <option value="">— sin proyecto —</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Descripción">
        <Textarea name="descripcion" rows={2} />
      </Field>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Registrar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
