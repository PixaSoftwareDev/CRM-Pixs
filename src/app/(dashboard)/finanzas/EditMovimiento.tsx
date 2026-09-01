"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Modal } from "@/components/Modal"
import { Button, Field, Input, Select } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { cn } from "@/lib/utils"
import { updateTransaction } from "@/modules/money/actions"
import type { TransactionRow } from "@/modules/money/queries"
import type { UserOption } from "@/modules/users/queries"

/**
 * Edición de un movimiento existente. Mismo layout que el alta (QuickAdd),
 * precargado con los valores actuales. El comprobante no se toca desde acá.
 */
export function EditMovimiento({
  tx,
  usuarios,
  proyectos,
  onClose,
}: {
  tx: TransactionRow
  usuarios: UserOption[]
  proyectos: { id: string; nombre: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [tipo, setTipo] = useState<"ingreso" | "gasto">(tx.tipo as "ingreso" | "gasto")
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await updateTransaction(p, fd)
    if (res.ok) {
      onClose()
      router.refresh()
    }
    return res
  }, {})

  const esGasto = tipo === "gasto"

  return (
    <Modal
      title="Editar movimiento"
      description={tx.descripcion || tx.categoria || "Movimiento"}
      onClose={onClose}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="moneda" value={tx.moneda} />
        {tx.categoria ? <input type="hidden" name="categoria" value={tx.categoria} /> : null}

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
              defaultValue={tx.monto}
            />
          </Field>
          <Field label="Fecha">
            <Input name="fecha" type="date" required defaultValue={tx.fecha} />
          </Field>
        </div>

        <Field label="Concepto">
          <Input
            name="descripcion"
            required
            defaultValue={tx.descripcion ?? ""}
            placeholder={esGasto ? "Ej: hosting" : "Ej: cuota"}
          />
        </Field>

        <div className={cn("grid gap-4", esGasto && "sm:grid-cols-2")}>
          {esGasto ? (
            <Field label="Quién lo pagó">
              <Select name="realizadoPor" defaultValue={tx.realizadoPor ?? ""}>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Proyecto (opcional)">
            <Select name="projectId" defaultValue={tx.projectId ?? ""}>
              <option value="">Sin proyecto</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

        <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
