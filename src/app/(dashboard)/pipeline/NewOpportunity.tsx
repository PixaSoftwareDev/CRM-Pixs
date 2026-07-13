"use client"

import { useActionState, useState } from "react"
import { Button, Field, Input, Select } from "@/components/ui"
import { type ActionState, createOpportunity } from "@/modules/opportunities/actions"

export function NewOpportunity({ contactos }: { contactos: { id: string; nombre: string }[] }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await createOpportunity(prev, fd)
    if (res.ok) setOpen(false)
    return res
  }, {})

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={contactos.length === 0}>
        + Nueva oportunidad
      </Button>
    )
  }

  return (
    <form
      action={action}
      className="w-full max-w-md space-y-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.12] dark:bg-zinc-950"
    >
      <Field label="Contacto">
        <Select name="contactId" required>
          {contactos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Título">
        <Input name="titulo" required placeholder="Ej: Rediseño de sitio web" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor estimado">
          <Input name="valorEstimado" type="number" step="0.01" min="0" />
        </Field>
        <Field label="Probabilidad %">
          <Input name="probabilidad" type="number" min="0" max="100" />
        </Field>
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Crear"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
