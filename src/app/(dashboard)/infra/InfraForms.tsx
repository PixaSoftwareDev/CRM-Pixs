"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Modal } from "@/components/Modal"
import { Button, Field, Input, Select, Textarea } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { createDatabase, createServer } from "@/modules/infra/actions"

export function NewServerForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createServer(p, fd)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
    return res
  }, {})

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + Servidor
      </Button>
      {open ? (
        <Modal
          title="Nuevo servidor"
          description="Registrá una máquina o VPS"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <Input name="nombre" required />
              </Field>
              <Field label="Proveedor">
                <Input name="proveedor" placeholder="Hetzner, AWS…" />
              </Field>
              <Field label="IP / Hostname">
                <Input name="ipHostname" />
              </Field>
              <Field label="OS">
                <Input name="os" placeholder="Ubuntu 24.04" />
              </Field>
              <Field label="Specs">
                <Input name="specs" placeholder="4 vCPU / 8GB" />
              </Field>
              <Field label="Costo mensual">
                <Input name="costoMensual" type="number" step="0.01" min="0" />
              </Field>
            </div>
            <Field label="Descripción">
              <Textarea name="descripcion" rows={2} />
            </Field>
            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar servidor"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}

export function NewDatabaseForm({ servers }: { servers: { id: string; nombre: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createDatabase(p, fd)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
    return res
  }, {})

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + Base de datos
      </Button>
      {open ? (
        <Modal
          title="Nueva base de datos"
          description="Registrá una base y su servidor"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <Input name="nombre" required />
              </Field>
              <Field label="Motor">
                <Select name="motor" defaultValue="postgres">
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="mongo">MongoDB</option>
                  <option value="redis">Redis</option>
                </Select>
              </Field>
              <Field label="Servidor">
                <Select name="serverId" defaultValue="">
                  <option value="">— sin asignar —</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Entorno">
                <Select name="entorno" defaultValue="prod">
                  <option value="prod">Producción</option>
                  <option value="staging">Staging</option>
                  <option value="dev">Dev</option>
                </Select>
              </Field>
              <Field label="Host">
                <Input name="host" />
              </Field>
              <Field label="Puerto">
                <Input name="puerto" placeholder="5432" />
              </Field>
            </div>
            <Field label="Referencia de credencial (Bitwarden/1Password) — NO el secreto">
              <Input name="credencialRef" placeholder="bitwarden://item/xxxx" />
            </Field>
            <Field label="Descripción">
              <Textarea name="descripcion" rows={2} />
            </Field>
            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar base de datos"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
