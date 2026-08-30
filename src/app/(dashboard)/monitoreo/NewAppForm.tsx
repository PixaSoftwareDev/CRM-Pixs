"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Modal } from "@/components/Modal"
import { Button, Field, Input, Select } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { createApp } from "@/modules/infra/actions"

/** Alta de una aplicación para el listado de Monitoreo. */
export function NewAppForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const res = await createApp(prev, fd)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
    return res
  }, {})

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Aplicación</Button>

      {open ? (
        <Modal
          title="Nueva aplicación"
          description="Una app publicada, para entrar rápido desde acá"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <Field label="Nombre">
              <Input name="nombre" required maxLength={120} placeholder="Nombre" />
            </Field>

            <Field label="Dirección">
              <Input name="url" type="url" required placeholder="https://" />
            </Field>

            <Field label="Entorno">
              <Select name="entorno" defaultValue="produccion">
                <option value="produccion">producción</option>
                <option value="desarrollo">desarrollo</option>
                <option value="staging">staging</option>
              </Select>
            </Field>

            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Agregar"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
