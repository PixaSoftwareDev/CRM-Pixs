"use client"

import { useRouter } from "next/navigation"
import { useActionState, useRef, useState } from "react"
import { PaperclipIcon } from "@/components/icons"
import { Button, Input, Select } from "@/components/ui"
import type { FormState } from "@/lib/forms"
import { cn, todayISO } from "@/lib/utils"
import { ALLOWED_DOCUMENT_TYPES } from "@/modules/documents/shared"
import { createTransaction } from "@/modules/money/actions"
import type { UserOption } from "@/modules/users/queries"

/**
 * Carga rápida de un gasto o ingreso, en una sola línea y siempre visible:
 * tipo → monto → qué fue → quién pagó → fecha → Agregar. Sin modal.
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
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createTransaction(p, fd)
    if (res.ok) {
      formRef.current?.reset()
      setComprobante(null)
      router.refresh()
    }
    return res
  }, {})

  const esGasto = tipo === "gasto"

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-xl border border-black/[.08] bg-white p-3 dark:border-white/[.12] dark:bg-zinc-950"
    >
      <input type="hidden" name="tipo" value={tipo} />
      {/* Móvil: grilla de 2 columnas (los `order-*` arman las filas).
          Desde md: una sola línea con flex, como siempre. */}
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
        {/* Gasto / Ingreso */}
        <div className="order-1 col-span-2 flex rounded-md bg-black/[.05] p-[3px] md:order-none md:col-span-1 dark:bg-white/[.06]">
          <button
            type="button"
            onClick={() => setTipo("gasto")}
            className={cn(
              "h-[30px] flex-1 rounded px-3.5 text-[13px] font-medium transition-colors md:flex-none",
              esGasto
                ? "bg-red-600 text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
            )}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => setTipo("ingreso")}
            className={cn(
              "h-[30px] flex-1 rounded px-3.5 text-[13px] font-medium transition-colors md:flex-none",
              !esGasto
                ? "bg-green-600 text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
            )}
          >
            Ingreso
          </button>
        </div>

        <Input
          name="monto"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="$ monto"
          aria-label="Monto"
          className="order-2 md:order-none md:w-28"
        />
        <Input
          name="descripcion"
          required
          placeholder={
            esGasto
              ? "¿Qué fue? (ej. hosting, dominio, suscripción)"
              : "¿De qué? (ej. cuota, anticipo)"
          }
          aria-label="Concepto"
          className="order-4 col-span-2 md:order-none md:col-span-1 md:min-w-36 md:flex-1"
        />
        {/* Quién puso la plata: solo en gastos, es lo que define el reintegro. */}
        {esGasto ? (
          <Select
            name="realizadoPor"
            defaultValue={defaultPagadoPor ?? ""}
            aria-label="Quién lo pagó"
            className="order-5 md:order-none md:w-32"
          >
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                Pagó {u.nombre}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          name="projectId"
          defaultValue=""
          aria-label="Proyecto (opcional)"
          className={cn("order-6 md:order-none md:w-36", !esGasto && "col-span-2 md:col-span-1")}
        >
          <option value="">Sin proyecto</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
        <Input
          name="fecha"
          type="date"
          required
          defaultValue={todayISO()}
          aria-label="Fecha"
          className="order-3 md:order-none md:w-32"
        />

        {/* Comprobante opcional */}
        <input
          ref={fileRef}
          type="file"
          name="comprobante"
          accept={Object.keys(ALLOWED_DOCUMENT_TYPES).join(",")}
          className="hidden"
          onChange={(e) => setComprobante(e.target.files?.[0]?.name ?? null)}
        />
        {/* En móvil, clip + Agregar comparten la última fila; en md el div
            desaparece (contents) y quedan sueltos en la línea. */}
        <div className="order-7 col-span-2 flex items-center gap-2 md:contents">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title={comprobante ?? "Adjuntar comprobante"}
            aria-label="Adjuntar comprobante"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors",
              comprobante
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-zinc-300 text-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-200",
            )}
          >
            <PaperclipIcon size={16} />
          </button>

          <Button type="submit" disabled={pending} className="flex-1 md:flex-none">
            {pending ? "Guardando…" : "Agregar"}
          </Button>
        </div>
      </div>
      {state.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
      {comprobante ? (
        <p className="mt-2 truncate text-xs text-zinc-500">Adjunto: {comprobante}</p>
      ) : null}
    </form>
  )
}
