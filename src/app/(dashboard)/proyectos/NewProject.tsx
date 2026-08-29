"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Modal } from "@/components/Modal"
import { Button, Field, Input, Select } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { createProject } from "@/modules/projects/actions"

type Contacto = { id: string; nombre: string }

/** Alta de proyecto desde la propia sección, eligiendo el cliente. */
export function NewProject({ contactos }: { contactos: Contacto[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const res = await createProject(prev, fd)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
    return res
  }, {})

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo proyecto</Button>

      {open ? (
        <Modal
          title="Nuevo proyecto"
          description="El trabajo que vas a hacer para un cliente"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <Field label="Cliente">
              <Select name="contactId" required defaultValue="">
                <option value="" disabled>
                  Elegí un cliente…
                </option>
                {contactos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Nombre del proyecto">
              <Input name="nombre" required maxLength={200} placeholder="Ej: Sitio web" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estado">
                <Select name="estado" defaultValue="activo">
                  <option value="activo">activo</option>
                  <option value="pausado">pausado</option>
                  <option value="finalizado">finalizado</option>
                  <option value="cancelado">cancelado</option>
                </Select>
              </Field>
              <Field label="Fecha de inicio (opcional)">
                <Input name="fechaInicio" type="date" />
              </Field>
            </div>

            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear proyecto"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
