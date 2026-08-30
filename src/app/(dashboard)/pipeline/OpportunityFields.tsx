"use client"

import { Field, Input, Select } from "@/components/ui"

/** Campos del formulario de oportunidad, compartidos entre crear y editar. */
export function OpportunityFields({
  contactos,
  defaults,
}: {
  contactos: { id: string; nombre: string }[]
  defaults?: {
    contactId?: string
    titulo?: string
    valorEstimado?: string | null
    probabilidad?: string | null
  }
}) {
  return (
    <>
      <Field label="Cliente">
        <Select name="contactId" required defaultValue={defaults?.contactId}>
          {contactos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Título">
        <Input name="titulo" required placeholder="Título" defaultValue={defaults?.titulo} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor estimado">
          <Input
            name="valorEstimado"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults?.valorEstimado ?? ""}
          />
        </Field>
        <Field label="Probabilidad %">
          <Input
            name="probabilidad"
            type="number"
            min="0"
            max="100"
            defaultValue={defaults?.probabilidad ?? ""}
          />
        </Field>
      </div>
    </>
  )
}
