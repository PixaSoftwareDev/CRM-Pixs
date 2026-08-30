"use client"

import { useRouter } from "next/navigation"
import { useActionState, useRef, useState } from "react"
import { PaperclipIcon } from "@/components/icons"
import { Modal } from "@/components/Modal"
import { Button, Field, Input, Select } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { cn, todayISO } from "@/lib/utils"
import { ALLOWED_DOCUMENT_TYPES } from "@/modules/documents/shared"
import { createTransaction } from "@/modules/money/actions"
import type { UserOption } from "@/modules/users/queries"

function hoy() {
  return todayISO()
}

/**
 * Carga rápida de un gasto o ingreso: tipo → monto → qué fue → quién pagó →
 * fecha → Agregar. Vive detrás de un botón, como las altas del resto de la app,
 * para no ocupar el tope de la pantalla todo el tiempo.
 */
export function QuickAdd({
  usuarios,
  proyectos,
  defaultPagadoPor,
}: {
  usuarios: UserOption[]
  proyectos: { id: string; nombre: string }[]
  defaultPagadoPor?: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<"gasto" | "ingreso">("gasto")
  const [comprobante, setComprobante] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createTransaction(p, fd)
    if (res.ok) {
      formRef.current?.reset()
      setComprobante(null)
      setAbierto(false)
      router.refresh()
    }
    return res
  }, {})

  const esGasto = tipo === "gasto"

  function cerrar() {
    setAbierto(false)
  }

  /** Saca el archivo elegido: limpia el input y el nombre que se muestra. */
  function quitarComprobante() {
    if (fileRef.current) fileRef.current.value = ""
    setComprobante(null)
  }

  return (
    <>
      <Button onClick={() => setAbierto(true)}>+ Movimiento</Button>

      {abierto ? (
        <Modal
          title="Nuevo movimiento"
          description="Un gasto o un ingreso, con su comprobante"
          onClose={cerrar}
        >
          <form ref={formRef} action={action} className="space-y-4">
            <input type="hidden" name="tipo" value={tipo} />

            {/* Gasto / Ingreso: lo primero que se decide, y tiñe el resto del form. */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/[.05] p-1 dark:bg-white/[.06]">
              <button
                type="button"
                onClick={() => setTipo("gasto")}
                className={cn(
                  "h-9 rounded-md text-sm font-medium transition-colors",
                  esGasto
                    ? "bg-red-600 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                Gasto
              </button>
              <button
                type="button"
                onClick={() => setTipo("ingreso")}
                className={cn(
                  "h-9 rounded-md text-sm font-medium transition-colors",
                  !esGasto
                    ? "bg-green-600 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                Ingreso
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monto">
                <Input
                  name="monto"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0,00"
                  autoFocus
                />
              </Field>
              <Field label="Fecha">
                <Input name="fecha" type="date" required defaultValue={hoy()} />
              </Field>
            </div>

            <Field label="Concepto">
              <Input
                name="descripcion"
                required
                placeholder={esGasto ? "En qué se gastó" : "De qué es el ingreso"}
              />
            </Field>

            <div className={cn("grid gap-4", esGasto && "sm:grid-cols-2")}>
              {/* Quién puso la plata: solo en gastos, es lo que define el reintegro.
                  En un ingreso paga el cliente, así que el campo no tiene sentido. */}
              {esGasto ? (
                <Field label="Quién lo pagó">
                  <Select name="realizadoPor" defaultValue={defaultPagadoPor ?? ""}>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="Proyecto (opcional)">
                <Select name="projectId" defaultValue="">
                  <option value="">Sin proyecto</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Comprobante opcional: el input real va oculto y lo dispara el botón. */}
            <input
              ref={fileRef}
              type="file"
              name="comprobante"
              accept={Object.keys(ALLOWED_DOCUMENT_TYPES).join(",")}
              className="hidden"
              onChange={(e) => setComprobante(e.target.files?.[0]?.name ?? null)}
            />
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Comprobante (opcional)</span>
              {comprobante ? (
                <div className="flex items-center gap-2 rounded-md border border-blue-500/60 px-3 py-2 text-sm">
                  <PaperclipIcon size={16} />
                  <span className="min-w-0 flex-1 truncate">{comprobante}</span>
                  <button
                    type="button"
                    onClick={quitarComprobante}
                    className="text-xs text-zinc-500 transition-colors hover:text-red-600"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
                >
                  <PaperclipIcon size={16} />
                  Adjuntar factura o ticket
                </button>
              )}
            </div>

            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={cerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : esGasto ? "Agregar gasto" : "Agregar ingreso"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
