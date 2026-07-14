"use client"

import { Field, Input, Textarea } from "@/components/ui"

type Defaults = {
  nombre?: string | null
  personaContacto?: string | null
  email?: string | null
  telefono?: string | null
  sitioWeb?: string | null
  notas?: string | null
}

/** Campos del formulario de cliente, compartidos entre crear y editar. */
export function ContactFields({ defaults }: { defaults?: Defaults }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del cliente">
          <Input
            name="nombre"
            required
            autoFocus
            placeholder="Ej: Panadería La Espiga"
            defaultValue={defaults?.nombre ?? ""}
          />
        </Field>
        <Field label="Persona de contacto">
          <Input
            name="personaContacto"
            placeholder="Ej: Laura – dueña"
            defaultValue={defaults?.personaContacto ?? ""}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <Input name="email" type="email" defaultValue={defaults?.email ?? ""} />
        </Field>
        <Field label="Teléfono">
          <Input name="telefono" defaultValue={defaults?.telefono ?? ""} />
        </Field>
      </div>
      <Field label="Sitio web">
        <Input name="sitioWeb" placeholder="https://" defaultValue={defaults?.sitioWeb ?? ""} />
      </Field>
      <Field label="Notas">
        <Textarea
          name="notas"
          rows={3}
          placeholder="Contexto, cómo llegó, etc."
          defaultValue={defaults?.notas ?? ""}
        />
      </Field>
    </>
  )
}
