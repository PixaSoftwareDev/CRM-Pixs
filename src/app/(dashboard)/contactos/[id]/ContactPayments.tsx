"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Modal } from "@/components/Modal"
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui"
import { asset } from "@/lib/basePath"
import { formatMoney } from "@/lib/utils"
import type { ContactPayment } from "@/modules/contacts/queries"
import { createTransaction } from "@/modules/money/actions"

/** Fecha de hoy en yyyy-mm-dd, para el valor por defecto del formulario. */
function hoy() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Cobros del cliente, cargados desde su propia ficha: monto, fecha, concepto y
 * la factura adjunta, todo en un paso. No hace falta abrir una oportunidad ni
 * un proyecto — por debajo es un movimiento de caja atado al cliente, así que
 * también aparece en Finanzas.
 */
export function ContactPayments({
  contactId,
  pagos,
  pendiente,
}: {
  contactId: string
  pagos: ContactPayment[]
  /** Cuotas de sus proyectos que todavía no pagó. */
  pendiente: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(
    async (prev: { error?: string; ok?: boolean }, fd: FormData) => {
      const res = await createTransaction(prev, fd)
      if (res.ok) {
        setOpen(false)
        router.refresh()
      }
      return res
    },
    {},
  )

  const cobrado = pagos
    .filter((p) => p.tipo === "ingreso")
    .reduce((s, p) => s + Number(p.monto || 0), 0)
  const moneda = pagos[0]?.moneda ?? "ARS"

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Cobros y facturas</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          + Registrar cobro
        </Button>
      </div>

      {/* Resumen: lo que ya entró y lo que falta cobrar de sus proyectos. */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-white/[.04]">
          <div className="text-xs text-zinc-500">Cobrado</div>
          <div className="font-semibold text-green-700 dark:text-green-400">
            {formatMoney(String(cobrado), moneda)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-white/[.04]">
          <div className="text-xs text-zinc-500">Por cobrar</div>
          <div
            className={
              pendiente > 0
                ? "font-semibold text-amber-700 dark:text-amber-400"
                : "font-semibold text-zinc-400"
            }
          >
            {formatMoney(String(pendiente), moneda)}
          </div>
        </div>
      </div>

      {pagos.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Todavía no hay cobros registrados para este cliente.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
            {pagos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.descripcion || "Cobro"}</div>
                  <div className="truncate text-xs text-zinc-400">
                    {p.fecha}
                    {p.projectNombre ? ` · ${p.projectNombre}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.comprobanteUrl ? (
                    <a
                      href={asset(`/api/documentos/${p.comprobanteUrl}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Factura ↓
                    </a>
                  ) : null}
                  <Badge tone={p.tipo === "ingreso" ? "green" : "amber"}>
                    {formatMoney(p.monto, p.moneda)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {open ? (
        <Modal
          title="Registrar cobro"
          description="Queda asociado al cliente y aparece en Finanzas"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <input type="hidden" name="contactId" value={contactId} />
            <input type="hidden" name="tipo" value="ingreso" />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monto">
                <Input name="monto" type="number" step="0.01" min="0" required autoFocus />
              </Field>
              <Field label="Moneda">
                <Select name="moneda" defaultValue="ARS">
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
            </div>

            <Field label="Fecha">
              <Input name="fecha" type="date" defaultValue={hoy()} required />
            </Field>

            <Field label="Concepto">
              <Input name="descripcion" placeholder="Concepto" maxLength={500} />
            </Field>

            <Field label="Factura (opcional)">
              <Input name="comprobante" type="file" className="h-auto py-1.5" />
            </Field>

            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Registrar cobro"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </Card>
  )
}
