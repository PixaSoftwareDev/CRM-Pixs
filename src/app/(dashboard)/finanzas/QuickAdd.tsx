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

type QuickAddProps = {
  usuarios: UserOption[]
  proyectos: { id: string; nombre: string }[]
  defaultPagadoPor?: string
}

/**
 * Carga rápida de un gasto o ingreso en desktop: una barra en una sola línea,
 * siempre visible (tipo → monto → qué fue → quién pagó → fecha → Agregar).
 * En móvil se oculta (la página la envuelve en `hidden md:block`) y el alta
 * pasa por QuickAddMovil, el botón junto a "Exportar".
 */
export function QuickAdd({ usuarios, proyectos, defaultPagadoPor }: QuickAddProps) {
  const router = useRouter()
  const inlineRef = useRef<HTMLFormElement>(null)
  const inlineFileRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<"gasto" | "ingreso">("gasto")
  const [comprobante, setComprobante] = useState<string | null>(null)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createTransaction(p, fd)
    if (res.ok) {
      inlineRef.current?.reset()
      setComprobante(null)
      router.refresh()
    }
    return res
  }, {})

  const esGasto = tipo === "gasto"

  return (
    <form
      ref={inlineRef}
      action={action}
      className="rounded-xl border border-black/[.08] bg-white p-3 dark:border-white/[.12] dark:bg-zinc-950"
    >
      <input type="hidden" name="tipo" value={tipo} />
      <div className="flex flex-wrap items-center gap-2">
        {/* Gasto / Ingreso */}
        <div className="flex rounded-md bg-black/[.05] p-[3px] dark:bg-white/[.06]">
          <button
            type="button"
            onClick={() => setTipo("gasto")}
            className={cn(
              "h-[30px] rounded px-3.5 text-[13px] font-medium transition-colors",
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
              "h-[30px] rounded px-3.5 text-[13px] font-medium transition-colors",
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
          className="w-28"
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
          className="min-w-36 flex-1"
        />
        {/* Quién puso la plata: solo en gastos, es lo que define el reintegro. */}
        {esGasto ? (
          <Select
            name="realizadoPor"
            defaultValue={defaultPagadoPor ?? ""}
            aria-label="Quién lo pagó"
            className="w-32"
          >
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                Pagó {u.nombre}
              </option>
            ))}
          </Select>
        ) : null}
        <Select name="projectId" defaultValue="" aria-label="Proyecto (opcional)" className="w-36">
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
          className="w-32"
        />

        {/* Comprobante opcional */}
        <input
          ref={inlineFileRef}
          type="file"
          name="comprobante"
          accept={Object.keys(ALLOWED_DOCUMENT_TYPES).join(",")}
          className="hidden"
          onChange={(e) => setComprobante(e.target.files?.[0]?.name ?? null)}
        />
        <button
          type="button"
          onClick={() => inlineFileRef.current?.click()}
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

        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar"}
        </Button>
      </div>
      {state.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
      {comprobante ? (
        <p className="mt-2 truncate text-xs text-zinc-500">Adjunto: {comprobante}</p>
      ) : null}
    </form>
  )
}

/**
 * Alta de movimiento en móvil: botón "+ Movimiento" junto a "Exportar" que
 * abre un modal con los mismos campos apilados. Misma Server Action que la
 * barra de desktop; solo cambia el layout.
 */
export function QuickAddMovil({ usuarios, proyectos, defaultPagadoPor }: QuickAddProps) {
  const router = useRouter()
  const modalRef = useRef<HTMLFormElement>(null)
  const modalFileRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<"gasto" | "ingreso">("gasto")
  const [comprobante, setComprobante] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, fd) => {
    const res = await createTransaction(p, fd)
    if (res.ok) {
      modalRef.current?.reset()
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
    if (modalFileRef.current) modalFileRef.current.value = ""
    setComprobante(null)
  }

  return (
    <div className="md:hidden">
      <Button onClick={() => setAbierto(true)}>+ Movimiento</Button>

      {abierto ? (
        <Modal
          title="Nuevo movimiento"
          description="Un gasto o un ingreso, con su comprobante"
          onClose={cerrar}
        >
          <form ref={modalRef} action={action} className="space-y-4">
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
                <Input name="fecha" type="date" required defaultValue={todayISO()} />
              </Field>
            </div>

            <Field label="Concepto">
              <Input
                name="descripcion"
                required
                placeholder={esGasto ? "Ej: hosting" : "Ej: cuota"}
              />
            </Field>

            <div className={cn("grid gap-4", esGasto && "sm:grid-cols-2")}>
              {/* Quién puso la plata: solo en gastos, es lo que define el reintegro. */}
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
              ref={modalFileRef}
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
                  onClick={() => modalFileRef.current?.click()}
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
    </div>
  )
}
