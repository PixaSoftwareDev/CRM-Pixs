"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { Badge, Card, EmptyState, Input, Select } from "@/components/ui"
import { cn, daysUntil, formatMoney } from "@/lib/utils"
import { toggleReintegro } from "@/modules/money/actions"
import type { TransactionRow } from "@/modules/money/queries"
import type { UserOption } from "@/modules/users/queries"

type Receivable = {
  id: string
  monto: string
  venceAt: string
  proyecto: string
  projectId: string
}

// dd/mm sin año para las filas (compacto); el filtro usa fechas ISO.
function shortDate(fecha: string) {
  const [y, m, d] = fecha.split("-")
  return d && m ? `${d}/${m}/${y.slice(2)}` : fecha
}

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
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [persona, setPersona] = useState("")
  const [tipo, setTipo] = useState("")
  const [, startToggle] = useTransition()

  // Resync cuando el server revalida (tras crear/editar): sin esto habría que F5.
  useEffect(() => setItems(initial), [initial])

  const nombres = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios])

  // Reintegros pendientes: gastos NO reintegrados, agrupados por quién pagó.
  const reintegros = useMemo(() => {
    const acc = new Map<string, number>()
    for (const t of items) {
      if (t.tipo !== "gasto" || t.reintegrado || !t.realizadoPor) continue
      acc.set(t.realizadoPor, (acc.get(t.realizadoPor) ?? 0) + Number(t.monto))
    }
    return [...acc]
      .map(([id, total]) => ({ id, nombre: nombres.get(id) ?? "—", total }))
      .sort((a, b) => b.total - a.total)
  }, [items, nombres])

  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (from && t.fecha < from) return false
      if (to && t.fecha > to) return false
      if (persona && t.realizadoPor !== persona) return false
      if (tipo && t.tipo !== tipo) return false
      return true
    })
  }, [items, from, to, persona, tipo])

  function marcar(t: TransactionRow, devuelto: boolean) {
    const prev = items
    setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, reintegrado: devuelto } : x)))
    startToggle(async () => {
      const res = await toggleReintegro(t.id, devuelto)
      if (res.error) setItems(prev)
    })
  }

  const hayFiltro = from || to || persona || tipo

  return (
    <div className="space-y-6">
      {/* Reintegros pendientes por persona */}
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Reintegros pendientes</h2>
          <span className="text-xs text-zinc-400">Gastos pagados de su bolsillo, sin devolver</span>
        </div>
        {reintegros.length === 0 ? (
          <p className="text-sm text-zinc-400">Nada por devolver. 👌</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reintegros.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.12] dark:bg-zinc-900"
              >
                <div className="text-xs text-zinc-400">A devolver a</div>
                <div className="font-medium">{r.nombre}</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-red-600 dark:text-red-400">
                  {formatMoney(r.total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Movimientos con filtros */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Movimientos</h2>
            <span className="text-xs text-zinc-400">{filtered.length}</span>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              Desde
              <Input
                type="date"
                aria-label="Fecha desde"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-auto text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              Hasta
              <Input
                type="date"
                aria-label="Fecha hasta"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-auto text-xs"
              />
            </div>
            <Select
              className="h-8 w-auto min-w-28 text-xs"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>
            <Select
              className="h-8 w-auto min-w-24 text-xs"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="">Todo</option>
              <option value="ingreso">Ingresos</option>
              <option value="gasto">Gastos</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState>
              {hayFiltro ? "Sin movimientos para ese filtro." : "Sin movimientos registrados."}
            </EmptyState>
          ) : (
            <div className="divide-y divide-black/[.06] dark:divide-white/[.08]">
              {filtered.map((t) => {
                const pendiente = t.tipo === "gasto" && !t.reintegrado && !!t.realizadoPor
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {t.descripcion || t.categoria || t.tipo}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
                        <span>{shortDate(t.fecha)}</span>
                        {t.categoria ? <span>· {t.categoria}</span> : null}
                        {t.autor ? <span>· {t.autor}</span> : null}
                        {t.tipo === "gasto" && t.realizadoPor ? (
                          t.reintegrado ? (
                            <Badge tone="green">devuelto</Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => marcar(t, true)}
                              className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                            >
                              marcar devuelto
                            </button>
                          )
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span
                        className={cn(
                          "font-medium",
                          t.tipo === "ingreso" ? "text-green-600" : "text-red-600",
                        )}
                      >
                        {t.tipo === "ingreso" ? "+" : "−"}
                        {formatMoney(t.monto, t.moneda)}
                      </span>
                      {t.reintegrado && t.tipo === "gasto" ? (
                        <button
                          type="button"
                          onClick={() => marcar(t, false)}
                          className="text-[11px] text-zinc-400 hover:text-zinc-600 hover:underline dark:hover:text-zinc-300"
                        >
                          revertir
                        </button>
                      ) : pendiente ? (
                        <span className="text-[11px] text-zinc-400">a reintegrar</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Cuentas por cobrar */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Cuentas por cobrar</h2>
          {cobrar.length === 0 ? (
            <p className="text-sm text-zinc-400">Nada pendiente. 👌</p>
          ) : (
            <ul className="space-y-2">
              {cobrar.map((c) => {
                const dias = daysUntil(c.venceAt)
                const vencida = dias < 0
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/proyectos/${c.projectId}`} className="truncate hover:underline">
                      {c.proyecto}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span>{formatMoney(c.monto)}</span>
                      <Badge tone={vencida ? "red" : "amber"}>
                        {vencida ? `−${Math.abs(dias)}d` : `${dias}d`}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
