"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { useConfirm } from "@/components/ConfirmDialog"
import { MailIcon, PhoneIcon, TrashIcon, UserIcon } from "@/components/icons"
import { Button, Card, Field, Input } from "@/components/ui"
import { addContactPerson, deleteContactPerson } from "@/modules/contacts/people-actions"
import type { ContactPersonRow } from "@/modules/contacts/queries"

export function ContactPeople({
  contactId,
  people,
}: {
  contactId: string
  people: ContactPersonRow[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const formRef = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, startSave] = useTransition()
  const [, startDelete] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const fd = new FormData(e.currentTarget)
    fd.set("contactId", contactId)
    startSave(async () => {
      const res = await addContactPerson({}, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      formRef.current?.reset()
      setOpen(false)
      router.refresh()
    })
  }

  async function remove(p: ContactPersonRow) {
    const ok = await confirm({
      title: "Eliminar persona",
      message: `¿Eliminar a "${p.nombre}" de los contactos?`,
      danger: true,
    })
    if (!ok) return
    startDelete(async () => {
      await deleteContactPerson(p.id, contactId)
      router.refresh()
    })
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Personas de contacto</h2>
        <span className="text-xs text-zinc-400">
          {people.length} {people.length === 1 ? "persona" : "personas"}
        </span>
      </div>

      {people.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Todavía no cargaste personas de contacto. Sumá con quién hablás en la empresa.
        </p>
      ) : (
        <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
          {people.map((p) => {
            const tel = p.telefono?.replace(/[^\d+]/g, "")
            return (
              <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 text-zinc-400">
                    <UserIcon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{p.nombre}</span>
                      {p.puesto ? <span className="text-xs text-zinc-500">{p.puesto}</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      {p.email ? (
                        <a
                          href={`mailto:${p.email}`}
                          className="inline-flex items-center gap-1.5 hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                        >
                          <MailIcon size={13} />
                          {p.email}
                        </a>
                      ) : null}
                      {p.telefono ? (
                        <a
                          href={`tel:${tel}`}
                          className="inline-flex items-center gap-1.5 hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                        >
                          <PhoneIcon size={13} />
                          {p.telefono}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  title="Eliminar"
                  aria-label={`Eliminar a ${p.nombre}`}
                  className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  <TrashIcon size={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open ? (
        <form
          ref={formRef}
          onSubmit={submit}
          className="mt-4 space-y-3 rounded-xl border border-black/[.08] bg-zinc-50 p-4 dark:border-white/[.12] dark:bg-zinc-800/40"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <Input name="nombre" autoFocus placeholder="Juan Pérez" autoComplete="off" />
            </Field>
            <Field label="Puesto">
              <Input name="puesto" placeholder="Encargado de pagos" autoComplete="off" />
            </Field>
            <Field label="Correo">
              <Input name="email" type="email" placeholder="juan@empresa.com" autoComplete="off" />
            </Field>
            <Field label="Teléfono">
              <Input name="telefono" placeholder="+54 11 …" autoComplete="off" />
            </Field>
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false)
                setError(undefined)
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Guardando…" : "Agregar"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            + Agregar persona
          </Button>
        </div>
      )}
    </Card>
  )
}
