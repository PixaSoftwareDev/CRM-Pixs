"use client"

import { useActionState, useRef } from "react"
import { Button, Input, Select } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { addTechInfo } from "@/modules/projects/actions"

export function TechInfoForm({ projectId }: { projectId: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await addTechInfo(p, fd)
    if (res.ok) formRef.current?.reset()
    return res
  }, {})

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Select name="tipo" className="w-32" defaultValue="repo">
        <option value="repo">Repo</option>
        <option value="dominio">Dominio</option>
        <option value="deploy">Deploy</option>
        <option value="doc">Doc</option>
        <option value="link">Link</option>
      </Select>
      <Input name="label" placeholder="Etiqueta" className="w-40" required />
      <Input name="valor" placeholder="Valor" className="w-56" required />
      <Button type="submit" size="sm" disabled={pending}>
        Agregar
      </Button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  )
}
