"use client"

import { useActionState, useState } from "react"
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { createDatabase, createServer } from "@/modules/infra/actions"

export function NewServerForm() {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createServer(p, fd)
    if (res.ok) setOpen(false)
    return res
  }, {})

  if (!open)
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Servidor
      </Button>
    )

  return (
    <Card>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
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
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={pending}>
            Guardar
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function NewDatabaseForm({ servers }: { servers: { id: string; nombre: string }[] }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createDatabase(p, fd)
    if (res.ok) setOpen(false)
    return res
  }, {})

  if (!open)
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Base de datos
      </Button>
    )

  return (
    <Card>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
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
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={pending}>
            Guardar
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  )
}
