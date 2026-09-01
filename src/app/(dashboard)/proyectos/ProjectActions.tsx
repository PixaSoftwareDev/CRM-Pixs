"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState, useTransition } from "react"
import { useConfirm } from "@/components/ConfirmDialog"
import { KebabMenu } from "@/components/KebabMenu"
import { Modal } from "@/components/Modal"
import { Button, Field, Input, Select } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { deleteProject, updateProject } from "@/modules/projects/actions"
import type { ProjectListRow } from "@/modules/projects/queries"

type Contacto = { id: string; nombre: string }

/**
 * Menú ⋮ de un proyecto en el listado: Editar (modal) / Eliminar.
 * Mismo patrón que ContactActions; el modal reusa el layout del alta.
 */
export function ProjectActions({
  project,
  contactos,
  className,
}: {
  project: ProjectListRow
  contactos: Contacto[]
  className?: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [, startTransition] = useTransition()
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const res = await updateProject(project.id, prev, fd)
    if (res.ok) {
      setEditing(false)
      router.refresh()
    }
    return res
  }, {})

  async function handleDelete() {
    const ok = await confirm({
      title: "Eliminar proyecto",
      message: `¿Eliminar "${project.nombre}"? Se borran también sus tareas, presupuestos y cuotas. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    })
    if (!ok) return
    startTransition(async () => {
      await deleteProject(project.id)
      router.refresh()
    })
  }

  return (
    <div className={className}>
      <KebabMenu onEdit={() => setEditing(true)} onDelete={handleDelete} />
      {editing ? (
        <Modal
          title="Editar proyecto"
          description={project.nombre}
          onClose={() => setEditing(false)}
        >
          <form action={action} className="space-y-4">
            <Field label="Cliente">
              <Select name="contactId" defaultValue={project.contactId ?? ""}>
                <option value="">Sin asignar</option>
                {contactos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Nombre del proyecto">
              <Input name="nombre" required maxLength={200} defaultValue={project.nombre} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estado">
                <Select name="estado" defaultValue={project.estado}>
                  <option value="activo">activo</option>
                  <option value="pausado">pausado</option>
                  <option value="finalizado">finalizado</option>
                  <option value="cancelado">cancelado</option>
                </Select>
              </Field>
              <Field label="Fecha de inicio (opcional)">
                <Input name="fechaInicio" type="date" defaultValue={project.fechaInicio ?? ""} />
              </Field>
            </div>

            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
