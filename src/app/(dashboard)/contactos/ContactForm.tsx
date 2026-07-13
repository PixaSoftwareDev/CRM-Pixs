"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Button, Field, Input, Textarea } from "@/components/ui"
import { type ActionState, createContact } from "@/modules/contacts/actions"

export function ContactForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await createContact(prev, fd)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
    return res
  }, {})

  if (!open) return <Button onClick={() => setOpen(true)}>+ Nuevo contacto</Button>

  return (
    <form
      action={action}
      className="w-full max-w-md space-y-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.12] dark:bg-zinc-950"
    >
      <Field label="Nombre">
        <Input name="nombre" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Empresa">
          <Input name="empresa" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono">
          <Input name="telefono" />
        </Field>
        <Field label="Sitio web">
          <Input name="sitioWeb" placeholder="https://" />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea name="notas" rows={3} />
      </Field>
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
