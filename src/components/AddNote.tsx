"use client"

import { useActionState, useRef } from "react"
import { Button, Textarea } from "@/components/ui"
import type { ActivityEntity } from "@/db/schema"
import { addNoteAction, type NoteState } from "@/modules/activities/actions"

export function AddNote({
  entityType,
  entityId,
  revalidate,
}: {
  entityType: ActivityEntity
  entityId: string
  revalidate: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState<NoteState, FormData>(async (prev, fd) => {
    const res = await addNoteAction(prev, fd)
    if (res.ok) formRef.current?.reset()
    return res
  }, {})

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="revalidate" value={revalidate} />
      <Textarea name="contenido" rows={2} placeholder="Nota" required />
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Agregar nota"}
      </Button>
    </form>
  )
}
