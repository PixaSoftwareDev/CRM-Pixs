"use client"

import { useRouter } from "next/navigation"
import { useActionState, useRef, useState } from "react"
import { Modal } from "@/components/Modal"
import { Button, Field, Input, Select, Textarea } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { ALLOWED_DOCUMENT_TYPES } from "@/modules/documents/shared"
import { createTransaction } from "@/modules/money/actions"

export function TransactionForm({
  proyectos,
  usuarios,
  defaultPagadoPor,
}: {
  proyectos: { id: string; nombre: string }[]
  usuarios: { id: string; nombre: string }[]
  defaultPagadoPor?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [comprobante, setComprobante] = useState<string | null>(null)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createTransaction(p, fd)
    if (res.ok) {
      setOpen(false)
      setComprobante(null)
      router.refresh()
    }
    return res
  }, {})

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Movimiento</Button>
      {open ? (
        <Modal
          title="Nuevo movimiento"
          description="Registrá un ingreso o gasto"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select name="tipo" defaultValue="ingreso">
                  <option value="ingreso">Ingreso</option>
                  <option value="gasto">Gasto</option>
                </Select>
              </Field>
              <Field label="Monto">
                <Input name="monto" type="number" step="0.01" min="0" required />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha">
                <Input name="fecha" type="date" required />
              </Field>
              <Field label="Categoría">
                <Input name="categoria" placeholder="hosting, sueldos…" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="¿Quién lo pagó?">
                <Select name="realizadoPor" defaultValue={defaultPagadoPor ?? ""}>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Proyecto (opcional)">
                <Select name="projectId" defaultValue="">
                  <option value="">— sin proyecto —</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Descripción">
              <Textarea name="descripcion" rows={2} />
            </Field>
            <Field label="Comprobante (opcional)">
              <input
                ref={fileRef}
                type="file"
                name="comprobante"
                accept={Object.keys(ALLOWED_DOCUMENT_TYPES).join(",")}
                className="hidden"
                onChange={(e) => setComprobante(e.target.files?.[0]?.name ?? null)}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  {comprobante ? "Cambiar archivo" : "Adjuntar comprobante"}
                </Button>
                {comprobante ? (
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
                    <span className="truncate" title={comprobante}>
                      {comprobante}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (fileRef.current) fileRef.current.value = ""
                        setComprobante(null)
                      }}
                      className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Quitar comprobante"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-400">
                    Factura o ticket · PDF, imagen u Office (hasta 20 MB)
                  </span>
                )}
              </div>
            </Field>
            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Registrar movimiento"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
