"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { PaperclipIcon } from "@/components/icons"
import { Badge, Card, EmptyState, Select } from "@/components/ui"
import { asset } from "@/lib/basePath"
import { cn, daysUntil, formatMoney } from "@/lib/utils"
import { reintegrarTodo, toggleInstallment, toggleReintegro } from "@/modules/money/actions"
import type { TransactionRow } from "@/modules/money/queries"
import type { UserOption } from "@/modules/users/queries"

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

type Filtro = "" | "gasto" | "ingreso"

// Movimientos visibles por vez; "Mostrar más" suma otra tanda.
const PAGE = 10

// dd/mm sin año para las filas (compacto).
function shortDate(fecha: string) {
  const [, m, d] = fecha.split("-")
  return d && m ? `${d}/${m}` : fecha
}

const MES_LABEL = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" })
function labelMes(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  const txt = MES_LABEL.format(new Date(y, m - 1, 1))
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}
function mesActual() {
  return new Date().toISOString().slice(0, 7)
}

function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-green-600 dark:text-green-400"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function ArrowIcon({ up }: { up: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {up ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
    </svg>
  )
}

/** Botón "✓ Pagado" / "✓ Cobrado": un toque y sale de la lista. */
function DoneButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-xs font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
    >
      <CheckIcon />
      {label}
    </button>
  )
}

function Panel({
  title,
  total,
  tone,
  hint,
  children,
}: {
  title: string
  total?: string
  tone?: "red" | "green"
  hint?: string
  children: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {total ? (
            <span
              className={cn(
                "text-base font-semibold tracking-tight",
                tone === "red" && "text-red-600 dark:text-red-400",
                tone === "green" && "text-green-600 dark:text-green-400",
              )}
            >
              {total}
            </span>
          ) : null}
        </div>
        {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
      </div>
      {children}
    </Card>
  )
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
  const [cuotas, setCuotas] = useState(cobrar)
  const [filtro, setFiltro] = useState<Filtro>("")
  const [persona, setPersona] = useState("")
  // Período de la lista: "yyyy-mm" o "" = todo el historial. Por defecto, este mes.
  const [mesLista, setMesLista] = useState(mesActual)
  const [limite, setLimite] = useState(PAGE)
  const [, start] = useTransition()

  // Resync cuando el server revalida (tras crear/editar): sin esto habría que F5.
  useEffect(() => setItems(initial), [initial])
  useEffect(() => setCuotas(cobrar), [cobrar])

  const nombres = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios])

  // Resumen del mes en curso.
  const mes = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7)
    let ingresos = 0
    let gastos = 0
    for (const t of items) {
      if (!t.fecha.startsWith(ym)) continue
      if (t.tipo === "ingreso") ingresos += Number(t.monto)
      else gastos += Number(t.monto)
    }
    return { ingresos, gastos, neto: ingresos - gastos }
  }, [items])

  // Falta pagar: gastos NO reintegrados, agrupados por quién los pagó.
  const reintegros = useMemo(() => {
    const acc = new Map<string, { total: number; conceptos: string[]; ids: string[] }>()
    for (const t of items) {
      if (t.tipo !== "gasto" || t.reintegrado || !t.realizadoPor) continue
      const g = acc.get(t.realizadoPor) ?? { total: 0, conceptos: [], ids: [] }
      g.total += Number(t.monto)
      g.conceptos.push(t.descripcion || t.categoria || "gasto")
      g.ids.push(t.id)
      acc.set(t.realizadoPor, g)
    }
    return [...acc]
      .map(([id, g]) => ({ id, nombre: nombres.get(id) ?? "—", ...g }))
      .sort((a, b) => b.total - a.total)
  }, [items, nombres])
  const totalPagar = reintegros.reduce((s, r) => s + r.total, 0)
  const totalCobrar = cuotas.reduce((s, c) => s + Number(c.monto), 0)

  // Al cambiar un filtro se vuelve a la primera tanda.
  function cambiarFiltro(v: Filtro) {
    setFiltro(v)
    setLimite(PAGE)
  }
  function cambiarPersona(v: string) {
    setPersona(v)
    setLimite(PAGE)
  }
  function cambiarMes(v: string) {
    setMesLista(v)
    setLimite(PAGE)
  }

  // Meses con movimientos (más el actual), del más reciente al más viejo.
  const meses = useMemo(() => {
    const set = new Set<string>([mesActual()])
    for (const t of items) set.add(t.fecha.slice(0, 7))
    return [...set].sort().reverse()
  }, [items])

  // Movimientos filtrados (todos) y agrupados por recencia (solo los visibles).
  const filtrados = useMemo(
    () =>
      items.filter(
        (t) =>
          (!mesLista || t.fecha.startsWith(mesLista)) &&
          (!filtro || t.tipo === filtro) &&
          (!persona || t.realizadoPor === persona),
      ),
    [items, mesLista, filtro, persona],
  )
  const grupos = useMemo(() => {
    const hoy = isoDaysAgo(0)
    const semana = isoDaysAgo(7)
    const out: { titulo: string; rows: TransactionRow[] }[] = [
      { titulo: "Hoy", rows: [] },
      { titulo: "Esta semana", rows: [] },
      { titulo: "Antes", rows: [] },
    ]
    for (const t of filtrados.slice(0, limite)) {
      const i = t.fecha >= hoy ? 0 : t.fecha >= semana ? 1 : 2
      out[i].rows.push(t)
    }
    return out.filter((g) => g.rows.length)
  }, [filtrados, limite])
  const ocultos = Math.max(0, filtrados.length - limite)

  function pagarTodo(userId: string, ids: string[]) {
    const prev = items
    setItems((cur) => cur.map((x) => (ids.includes(x.id) ? { ...x, reintegrado: true } : x)))
    start(async () => {
      const res = await reintegrarTodo(userId)
      if (res.error) setItems(prev)
    })
  }

  function revertir(t: TransactionRow) {
    const prev = items
    setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, reintegrado: false } : x)))
    start(async () => {
      const res = await toggleReintegro(t.id, false)
      if (res.error) setItems(prev)
    })
  }

  function cobrar_(c: Receivable) {
    const prev = cuotas
    setCuotas((cur) => cur.filter((x) => x.id !== c.id))
    start(async () => {
      const res = await toggleInstallment(c.id, c.projectId, true)
      if (!res.ok) setCuotas(prev)
    })
  }

  return (
    <div className="space-y-6">
      {/* Resumen del mes */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ingresos del mes" value={formatMoney(mes.ingresos)} tone="green" />
        <Stat label="Gastos del mes" value={formatMoney(mes.gastos)} tone="red" />
        <Stat
          label="Neto del mes"
          value={formatMoney(mes.neto)}
          tone={mes.neto >= 0 ? "green" : "red"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Falta pagar */}
        <Panel
          title="Falta pagar"
          total={totalPagar ? formatMoney(totalPagar) : undefined}
          tone="red"
          hint="Gastos que alguien pagó de su bolsillo"
        >
          {reintegros.length === 0 ? (
            <p className="text-sm text-zinc-400">Nada por devolver.</p>
          ) : (
            <div className="space-y-2">
              {reintegros.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-zinc-50 p-3 dark:border-white/[.12] dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="font-medium">Devolver a {r.nombre}</div>
                    <div className="truncate text-xs text-zinc-400" title={r.conceptos.join(", ")}>
                      {r.conceptos.length === 1
                        ? r.conceptos[0]
                        : `${r.conceptos[0]} + ${r.conceptos.length - 1} más`}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatMoney(r.total)}
                    </span>
                    <DoneButton label="Pagado" onClick={() => pagarTodo(r.id, r.ids)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Por cobrar */}
        <Panel
          title="Por cobrar"
          total={totalCobrar ? formatMoney(totalCobrar) : undefined}
          tone="green"
          hint="Cuotas de clientes · tocá cuando entre la plata"
        >
          {cuotas.length === 0 ? (
            <p className="text-sm text-zinc-400">Nada pendiente.</p>
          ) : (
            <div className="space-y-2">
              {cuotas.map((c) => {
                const dias = daysUntil(c.venceAt)
                const vencida = dias < 0
                const pronto = !vencida && dias <= 7
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-900",
                      vencida
                        ? "border-red-400/40"
                        : pronto
                          ? "border-amber-400/40"
                          : "border-black/[.08] dark:border-white/[.12]",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.empresa}</span>
                        {vencida ? (
                          <Badge tone="red" className="whitespace-nowrap">
                            vencida {Math.abs(dias)}d
                          </Badge>
                        ) : pronto ? (
                          <Badge tone="amber" className="whitespace-nowrap">
                            vence en {dias}d
                          </Badge>
                        ) : null}
                      </div>
                      <Link
                        href={`/proyectos/${c.projectId}`}
                        className="block truncate text-xs text-zinc-400 hover:underline"
                      >
                        {c.proyecto} · vence {shortDate(c.venceAt)}
                      </Link>
                    </div>
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {formatMoney(c.monto, c.moneda)}
                      </span>
                      <DoneButton label="Cobrado" onClick={() => cobrar_(c)} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        {/* Movimientos */}
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Movimientos</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={mesLista}
                onChange={(e) => cambiarMes(e.target.value)}
                aria-label="Período"
                className="h-7 w-auto text-xs"
              >
                {meses.map((m, i) => (
                  <option key={m} value={m}>
                    {i === 0 && m === mesActual() ? "Este mes" : labelMes(m)}
                  </option>
                ))}
                <option value="">Todo el historial</option>
              </Select>
              <Select
                value={persona}
                onChange={(e) => cambiarPersona(e.target.value)}
                aria-label="Filtrar por persona"
                className="h-7 w-auto text-xs"
              >
                <option value="">Todos</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
              <div className="flex rounded-md bg-black/[.05] p-0.5 text-xs font-medium dark:bg-white/[.06]">
                {(
                  [
                    ["", "Todos"],
                    ["gasto", "Gastos"],
                    ["ingreso", "Ingresos"],
                  ] as [Filtro, string][]
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => cambiarFiltro(v)}
                    className={cn(
                      "rounded px-2.5 py-1 transition-colors",
                      filtro === v
                        ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {grupos.length === 0 ? (
            <EmptyState>
              {filtro || persona
                ? "Nada con ese filtro."
                : mesLista
                  ? "Sin movimientos este período."
                  : "Sin movimientos."}
            </EmptyState>
          ) : (
            <div>
              {grupos.map((g) => (
                <div key={g.titulo}>
                  <div className="pt-2 pb-1 text-[11px] uppercase tracking-wider text-zinc-500">
                    {g.titulo}
                  </div>
                  <div className="divide-y divide-black/[.06] dark:divide-white/[.08]">
                    {g.rows.map((t) => {
                      const ingreso = t.tipo === "ingreso"
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-3 py-2.5 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                                ingreso
                                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                              )}
                            >
                              <ArrowIcon up={ingreso} />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {t.descripcion || t.categoria || t.tipo}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-400">
                                <span>{shortDate(t.fecha)}</span>
                                {t.categoria && t.descripcion ? <span>· {t.categoria}</span> : null}
                                {t.autor ? (
                                  <span>
                                    · {ingreso ? "cobró" : "pagó"} {t.autor}
                                  </span>
                                ) : null}
                                {t.comprobanteId ? (
                                  <a
                                    href={asset(`/api/documentos/${t.comprobanteId}`)}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={t.comprobanteNombre ?? "Ver comprobante"}
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    <PaperclipIcon />
                                  </a>
                                ) : null}
                                {!ingreso && t.realizadoPor && t.reintegrado ? (
                                  <button
                                    type="button"
                                    onClick={() => revertir(t)}
                                    title="Volver a marcar como pendiente"
                                    className="text-green-600 hover:underline dark:text-green-400"
                                  >
                                    · devuelto
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 font-semibold",
                              ingreso
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400",
                            )}
                          >
                            {ingreso ? "+ " : "− "}
                            {formatMoney(t.monto, t.moneda)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
            {ocultos > 0 ? (
              <button
                type="button"
                onClick={() => setLimite((n) => n + PAGE)}
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Mostrar {Math.min(PAGE, ocultos)} más ({ocultos} restantes)
              </button>
            ) : (
              <span>
                {filtrados.length} movimiento{filtrados.length === 1 ? "" : "s"}
              </span>
            )}
            <a href={asset("/api/finanzas/export")} className="hover:underline">
              Exportar todo a CSV
            </a>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "green" | "red" }) {
  return (
    <Card className="py-4">
      <div className="text-xs text-zinc-400">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight",
          tone === "green"
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </div>
    </Card>
  )
}
