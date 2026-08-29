"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { PaperclipIcon, SearchIcon } from "@/components/icons"
import { Badge, Card } from "@/components/ui"
import { asset } from "@/lib/basePath"
import { cn, daysUntil, formatMoney } from "@/lib/utils"
import { toggleReintegro } from "@/modules/money/actions"
import type { TransactionRow } from "@/modules/money/queries"
import type { UserOption } from "@/modules/users/queries"

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-3 align-middle"

type Receivable = {
  id: string
  monto: string
  moneda: string
  venceAt: string
  proyecto: string
  projectId: string
  empresa: string
  contactId: string
}

type Pestana = "movimientos" | "cobrar"

/** dd/mm/aa: compacto para la columna de fecha. */
function shortDate(fecha: string) {
  const [y, m, d] = fecha.split("-")
  return d && m ? `${d}/${m}/${y.slice(2)}` : fecha
}

/**
 * Finanzas contada como una historia, no como una fila de números sueltos:
 *
 *  1. El saldo, y una barra que muestra qué parte de lo que entró ya se gastó.
 *  2. Un aviso, solo si hay plata sin devolver a alguien.
 *  3. Dos pestañas —lo que pasó y lo que falta cobrar—, cada una con su monto
 *     adentro, así ningún número queda flotando sin contexto.
 */
export function FinanzasClient({
  initial,
  usuarios,
  cobrar,
}: {
  initial: TransactionRow[]
  usuarios: UserOption[]
  cobrar: Receivable[]
}) {
  const [items, setItems] = useState(initial)
  const [pestana, setPestana] = useState<Pestana>("movimientos")
  const [q, setQ] = useState("")
  const [tipo, setTipo] = useState("")
  const [persona, setPersona] = useState("")
  const [soloSinDevolver, setSoloSinDevolver] = useState(false)
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [, startToggle] = useTransition()

  // Resync cuando el server revalida (tras crear/editar): sin esto habría que F5.
  useEffect(() => setItems(initial), [initial])

  const totales = useMemo(() => {
    let ingresos = 0
    let gastos = 0
    let aDevolver = 0
    const personas = new Set<string>()
    for (const t of items) {
      if (t.tipo === "ingreso") {
        ingresos += Number(t.monto)
      } else {
        gastos += Number(t.monto)
        if (!t.reintegrado && t.realizadoPor) {
          aDevolver += Number(t.monto)
          personas.add(t.realizadoPor)
        }
      }
    }
    return {
      ingresos,
      gastos,
      neto: ingresos - gastos,
      aDevolver,
      cuantos: personas.size,
      // Qué parte de lo que entró ya se gastó. Sin ingresos no hay proporción.
      gastadoPct: ingresos > 0 ? Math.min(100, (gastos / ingresos) * 100) : gastos > 0 ? 100 : 0,
    }
  }, [items])

  const porCobrar = useMemo(() => cobrar.reduce((a, c) => a + Number(c.monto), 0), [cobrar])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((t) => {
      if (soloSinDevolver && (t.tipo !== "gasto" || t.reintegrado || !t.realizadoPor)) return false
      if (tipo && t.tipo !== tipo) return false
      if (persona && t.realizadoPor !== persona) return false
      if (!term) return true
      const texto = `${t.descripcion ?? ""} ${t.categoria ?? ""} ${t.autor ?? ""}`
      return texto.toLowerCase().includes(term)
    })
  }, [items, tipo, persona, q, soloSinDevolver])

  function marcar(t: TransactionRow, devuelto: boolean) {
    const prev = items
    setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, reintegrado: devuelto } : x)))
    startToggle(async () => {
      const res = await toggleReintegro(t.id, devuelto)
      if (res?.error) setItems(prev)
    })
  }

  const hayFiltro = Boolean(q || tipo || persona || soloSinDevolver)

  function limpiarFiltros() {
    setQ("")
    setTipo("")
    setPersona("")
    setSoloSinDevolver(false)
  }

  function verSinDevolver() {
    setPestana("movimientos")
    setTipo("")
    setPersona("")
    setQ("")
    setSoloSinDevolver(true)
    setFiltrosAbiertos(true)
  }

  return (
    <div className="space-y-5">
      {/* 1 · El saldo, con la proporción de lo gastado en forma de barra. */}
      <Card className="p-6">
        <div className="text-sm text-zinc-500">Saldo</div>
        <div
          className={cn(
            "mt-1 text-4xl font-semibold tracking-tight",
            totales.neto >= 0 ? "text-zinc-900 dark:text-white" : "text-red-600 dark:text-red-400",
          )}
        >
          {formatMoney(String(totales.neto))}
        </div>

        <div className="mt-5 max-w-xl">
          <div
            className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
            role="img"
            aria-label={`Se gastó el ${Math.round(totales.gastadoPct)}% de lo que entró`}
          >
            <div
              className="bg-red-500/80 transition-[width] duration-500"
              style={{ width: `${totales.gastadoPct}%` }}
            />
            <div className="flex-1 bg-green-500/70" />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500/70" aria-hidden="true" />
              <span className="text-zinc-500">Entró</span>
              <span className="font-medium">{formatMoney(String(totales.ingresos))}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500/80" aria-hidden="true" />
              <span className="text-zinc-500">Salió</span>
              <span className="font-medium">{formatMoney(String(totales.gastos))}</span>
            </span>
          </div>
        </div>
      </Card>

      {/* 2 · Aviso: plata que alguien puso de su bolsillo y sigue sin volver. */}
      {totales.aDevolver > 0 ? (
        <button
          type="button"
          onClick={verSinDevolver}
          className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm transition-colors hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:hover:bg-amber-950/70"
        >
          <span className="font-medium text-amber-800 dark:text-amber-300">
            {formatMoney(String(totales.aDevolver))} sin devolver
          </span>
          <span className="text-amber-700/80 dark:text-amber-400/80">
            a {totales.cuantos} {totales.cuantos === 1 ? "persona" : "personas"} que pagaron de su
            bolsillo
          </span>
          <span className="ml-auto text-xs font-medium text-amber-800 dark:text-amber-300">
            ver →
          </span>
        </button>
      ) : null}

      {/* 3 · Navegación primero: dos pestañas subrayadas, legibles en claro y en
             oscuro. Los filtros viven detrás de un botón, para que no compitan
             con la navegación. */}
      <div className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
        <div className="flex items-center justify-between gap-4 border-b border-black/[.08] px-4 dark:border-white/[.12]">
          <nav className="flex gap-6" aria-label="Secciones de finanzas">
            <Tab
              activa={pestana === "movimientos"}
              onClick={() => setPestana("movimientos")}
              label="Movimientos"
              cantidad={items.length}
            />
            <Tab
              activa={pestana === "cobrar"}
              onClick={() => setPestana("cobrar")}
              label="Por cobrar"
              cantidad={cobrar.length}
            />
          </nav>

          {pestana === "movimientos" ? (
            <button
              type="button"
              onClick={() => setFiltrosAbiertos((v) => !v)}
              aria-expanded={filtrosAbiertos}
              className={cn(
                "my-2 shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
                filtrosAbiertos || hayFiltro
                  ? "bg-black/[.06] text-zinc-900 dark:bg-white/[.12] dark:text-white"
                  : "text-zinc-500 hover:bg-black/[.04] hover:text-zinc-900 dark:hover:bg-white/[.06] dark:hover:text-white",
              )}
            >
              Filtros{hayFiltro ? " ·" : ""}
            </button>
          ) : null}
        </div>

        {/* Filtros, desplegables */}
        {pestana === "movimientos" && filtrosAbiertos ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.12] dark:bg-white/[.03]">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por concepto, categoría o persona…"
                aria-label="Buscar movimientos"
                className="h-9 w-72 max-w-full rounded-md border border-black/[.10] bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-white/[.14] dark:bg-zinc-900 dark:text-white dark:focus:border-blue-400"
              />
            </div>

            <div className="inline-flex rounded-md border border-black/[.10] p-0.5 dark:border-white/[.14]">
              {(
                [
                  ["", "Todo"],
                  ["ingreso", "Entradas"],
                  ["gasto", "Salidas"],
                ] as const
              ).map(([valor, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTipo(valor)}
                  className={cn(
                    "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    tipo === valor
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.08]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {usuarios.length > 1 ? (
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                aria-label="Quién lo hizo"
                className="h-9 rounded-md border border-black/[.10] bg-white px-2 text-sm text-zinc-700 outline-none transition-colors focus:border-blue-500 dark:border-white/[.14] dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">Cualquiera</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            ) : null}

            {hayFiltro ? (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="ml-auto text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-white"
              >
                Limpiar
              </button>
            ) : null}
          </div>
        ) : null}

        {pestana === "movimientos" ? (
          filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-zinc-500">
              Sin movimientos para ese filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-black/[.08] text-left dark:border-white/[.12]">
                    <th className={cn(TH, "w-20 whitespace-nowrap")}>Fecha</th>
                    <th className={TH}>Concepto</th>
                    <th className={cn(TH, "hidden md:table-cell")}>Quién</th>
                    <th className={cn(TH, "hidden sm:table-cell")}>Reintegro</th>
                    <th className={cn(TH, "text-right")}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, i) => (
                    <tr
                      key={t.id}
                      className={cn(
                        "bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                        i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
                      )}
                    >
                      <td className={cn(TD, "whitespace-nowrap text-xs text-zinc-500")}>
                        {shortDate(t.fecha)}
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {t.descripcion || t.categoria || t.tipo}
                          </span>
                          {t.comprobanteId ? (
                            <a
                              href={asset(`/api/documentos/${t.comprobanteId}`)}
                              target="_blank"
                              rel="noreferrer"
                              title={t.comprobanteNombre ?? "Ver comprobante"}
                              aria-label="Ver comprobante"
                              className="shrink-0 text-zinc-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <PaperclipIcon />
                            </a>
                          ) : null}
                        </div>
                        {t.categoria && t.descripcion ? (
                          <div className="truncate text-xs text-zinc-400">{t.categoria}</div>
                        ) : null}
                      </td>
                      <td className={cn(TD, "hidden text-xs text-zinc-500 md:table-cell")}>
                        {t.autor ?? "—"}
                      </td>
                      {/* El reintegro se resuelve acá, en la fila del gasto. */}
                      <td className={cn(TD, "hidden sm:table-cell")}>
                        {t.tipo === "gasto" && t.realizadoPor ? (
                          t.reintegrado ? (
                            <button
                              type="button"
                              onClick={() => marcar(t, false)}
                              title="Deshacer"
                              className="text-xs text-green-600 hover:underline dark:text-green-400"
                            >
                              devuelto
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => marcar(t, true)}
                              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                            >
                              marcar devuelto
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                        )}
                      </td>
                      <td className={cn(TD, "text-right")}>
                        <span
                          className={cn(
                            "whitespace-nowrap font-medium",
                            t.tipo === "ingreso" ? "text-green-600" : "text-red-600",
                          )}
                        >
                          {t.tipo === "ingreso" ? "+" : "−"}
                          {formatMoney(t.monto, t.moneda)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : cobrar.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            No hay cuotas pendientes de cobro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/[.08] text-left dark:border-white/[.12]">
                  <th className={TH}>Cliente</th>
                  <th className={cn(TH, "hidden sm:table-cell")}>Proyecto</th>
                  <th className={cn(TH, "whitespace-nowrap")}>Vence</th>
                  <th className={cn(TH, "text-right")}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {cobrar.map((c, i) => {
                  const dias = daysUntil(c.venceAt)
                  const vencida = dias < 0
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                        i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
                      )}
                    >
                      <td className={cn(TD, "font-medium")}>
                        <Link href={`/contactos/${c.contactId}`} className="hover:underline">
                          {c.empresa}
                        </Link>
                      </td>
                      <td className={cn(TD, "hidden text-zinc-500 sm:table-cell")}>
                        <Link href={`/proyectos/${c.projectId}`} className="hover:underline">
                          {c.proyecto}
                        </Link>
                      </td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <Badge tone={vencida ? "red" : dias <= 7 ? "amber" : "neutral"}>
                          {vencida ? `vencida hace ${Math.abs(dias)}d` : `en ${dias}d`}
                        </Badge>
                      </td>
                      <td className={cn(TD, "whitespace-nowrap text-right font-medium")}>
                        {formatMoney(c.monto, c.moneda)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/[.08] bg-zinc-50 dark:border-white/[.12] dark:bg-white/[.03]">
                  <td className={cn(TD, "text-sm text-zinc-500")} colSpan={3}>
                    Total pendiente
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-right font-semibold")}>
                    {formatMoney(String(porCobrar))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Pestaña subrayada: el activo se marca con una línea, no con un fondo. */
function Tab({
  activa,
  onClick,
  label,
  cantidad,
}: {
  activa: boolean
  onClick: () => void
  label: string
  cantidad: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 py-3 text-sm font-medium transition-colors",
        activa
          ? "border-blue-600 text-zinc-900 dark:border-blue-400 dark:text-white"
          : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white",
      )}
    >
      {label}
      <span
        className={cn(
          "ml-2 rounded-full px-1.5 py-0.5 text-xs",
          activa
            ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
            : "bg-black/[.06] text-zinc-500 dark:bg-white/[.10] dark:text-zinc-300",
        )}
      >
        {cantidad}
      </span>
    </button>
  )
}
