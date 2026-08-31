"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useConfirm } from "@/components/ConfirmDialog"
import { PaperclipIcon } from "@/components/icons"
import { KebabMenu } from "@/components/KebabMenu"
import { Badge, Card, Tab, Tabs } from "@/components/ui"
import { ColorSelect } from "@/components/ui/ColorSelect"
import { asset } from "@/lib/basePath"
import { cn, daysUntil, formatMoney, todayISO } from "@/lib/utils"
import {
  deleteTransaction,
  reintegrarTodo,
  toggleInstallment,
  toggleReintegro,
} from "@/modules/money/actions"
import type { TransactionRow } from "@/modules/money/queries"
import type { UserOption } from "@/modules/users/queries"
import { EditMovimiento } from "./EditMovimiento"

type Receivable = {
  id: string
  monto: string
  moneda: string
  venceAt: string
  proyecto: string
  projectId: string
  // Nulos cuando el proyecto no tiene cliente asignado.
  empresa: string | null
  contactId: string | null
}

type Pestana = "movimientos" | "cobrar" | "devolver"
type Filtro = "" | "gasto" | "ingreso"

// Movimientos visibles por vez; "Mostrar más" suma otra tanda.
const PAGE = 15

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-3 align-middle"

/** dd/mm sin año: compacto para la columna de fecha. */
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
  return todayISO().slice(0, 7)
}

/**
 * Finanzas en una sola lectura: arriba el saldo del período elegido y, debajo,
 * una única lista por vez —lo que pasó, lo que falta cobrar o lo que hay que
 * devolver—. Cobrar y devolver se resuelven con un toque en su propia fila.
 */
export function FinanzasClient({
  initial,
  usuarios,
  proyectos,
  cobrar,
}: {
  initial: TransactionRow[]
  usuarios: UserOption[]
  proyectos: { id: string; nombre: string }[]
  cobrar: Receivable[]
}) {
  const confirm = useConfirm()
  const [items, setItems] = useState(initial)
  const [cuotas, setCuotas] = useState(cobrar)
  const [editar, setEditar] = useState<TransactionRow | null>(null)
  const [pestana, setPestana] = useState<Pestana>("movimientos")
  const [filtro, setFiltro] = useState<Filtro>("")
  const [persona, setPersona] = useState("")
  // Período: "yyyy-mm", o "" para todo el historial. Por defecto, este mes.
  const [mesLista, setMesLista] = useState(mesActual)
  const [limite, setLimite] = useState(PAGE)
  const [, start] = useTransition()

  // Resync cuando el server revalida (tras crear/editar): sin esto habría que F5.
  useEffect(() => setItems(initial), [initial])
  useEffect(() => setCuotas(cobrar), [cobrar])

  const nombres = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios])

  /** Entró, salió y saldo del período elegido (o de todo, si no hay mes). */
  const totales = useMemo(() => {
    let ingresos = 0
    let gastos = 0
    for (const t of items) {
      if (mesLista && !t.fecha.startsWith(mesLista)) continue
      if (t.tipo === "ingreso") ingresos += Number(t.monto)
      else gastos += Number(t.monto)
    }
    return { ingresos, gastos, neto: ingresos - gastos }
  }, [items, mesLista])

  /** Gastos que alguien pagó de su bolsillo y siguen sin devolverse. */
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

  // Meses con movimientos (más el actual), del más reciente al más viejo.
  const meses = useMemo(() => {
    const set = new Set<string>([mesActual()])
    for (const t of items) set.add(t.fecha.slice(0, 7))
    return [...set].sort().reverse()
  }, [items])

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
  const visibles = filtrados.slice(0, limite)
  const ocultos = Math.max(0, filtrados.length - limite)

  /** Devuelve de una todo lo que se le debe a una persona. */
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

  /** Borra un movimiento (con confirmación); si era cobro de cuota, la cuota vuelve a Por cobrar. */
  async function borrar(t: TransactionRow) {
    const ok = await confirm({
      title: "Eliminar movimiento",
      message: `Se borra "${t.descripcion || t.categoria || t.tipo}" de ${formatMoney(t.monto, t.moneda)}. ${
        t.comprobanteId ? "El comprobante adjunto también se elimina. " : ""
      }Esto no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    })
    if (!ok) return
    const prev = items
    setItems((cur) => cur.filter((x) => x.id !== t.id))
    start(async () => {
      const res = await deleteTransaction(t.id)
      if (res.error) setItems(prev)
    })
  }

  /** Marca la cuota como cobrada; desaparece de la lista al instante. */
  function marcarCobrada(c: Receivable) {
    const prev = cuotas
    setCuotas((cur) => cur.filter((x) => x.id !== c.id))
    start(async () => {
      const res = await toggleInstallment(c.id, c.projectId, true)
      if (!res.ok) setCuotas(prev)
    })
  }

  return (
    <div className="space-y-5">
      {/* Un solo número protagonista: el saldo del período. */}
      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-500">
              Saldo · {mesLista ? labelMes(mesLista) : "todo el historial"}
            </div>
            <div
              className={cn(
                "mt-1 text-4xl font-semibold tracking-tight",
                totales.neto >= 0
                  ? "text-zinc-900 dark:text-white"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {formatMoney(totales.neto)}
            </div>
          </div>

          <ColorSelect
            className="w-44"
            value={mesLista}
            onChange={setMesLista}
            ariaLabel="Período"
            options={[
              ...meses.map((m) => ({ value: m, label: labelMes(m) })),
              { value: "", label: "Todo el historial" },
            ]}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
          <Dato label="Entró" valor={totales.ingresos} tono="text-green-600 dark:text-green-400" />
          <Dato label="Salió" valor={totales.gastos} tono="text-red-600 dark:text-red-400" />
        </div>
      </Card>

      {/* Una lista por vez. Cada pestaña lleva su cantidad al lado. */}
      <Tabs
        acciones={
          pestana === "movimientos" ? (
            <>
              <ColorSelect
                className="w-36"
                value={filtro}
                onChange={(v) => {
                  setFiltro(v as Filtro)
                  setLimite(PAGE)
                }}
                ariaLabel="Tipo"
                options={[
                  { value: "", label: "Todo" },
                  { value: "ingreso", label: "Entradas" },
                  { value: "gasto", label: "Salidas" },
                ]}
              />
              {usuarios.length > 1 ? (
                <ColorSelect
                  className="w-40"
                  value={persona}
                  onChange={(v) => {
                    setPersona(v)
                    setLimite(PAGE)
                  }}
                  ariaLabel="Quién"
                  options={[
                    { value: "", label: "Quién" },
                    ...usuarios.map((u) => ({ value: u.id, label: u.nombre })),
                  ]}
                />
              ) : null}
            </>
          ) : null
        }
      >
        <Tab
          activa={pestana === "movimientos"}
          onClick={() => setPestana("movimientos")}
          badge={filtrados.length}
        >
          Movimientos
        </Tab>
        <Tab
          activa={pestana === "cobrar"}
          onClick={() => setPestana("cobrar")}
          badge={cuotas.length}
        >
          Por cobrar
        </Tab>
        <Tab
          activa={pestana === "devolver"}
          onClick={() => setPestana("devolver")}
          badge={reintegros.length}
        >
          A devolver
        </Tab>
      </Tabs>

      {pestana === "movimientos" ? (
        visibles.length === 0 ? (
          <Vacio>Sin movimientos en este período.</Vacio>
        ) : (
          <>
            <Tabla cabeceras={["Fecha", "Concepto", "Quién", "Monto", ""]}>
              {visibles.map((t, i) => (
                <tr key={t.id} className={fila(i)}>
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
                          className="shrink-0 text-zinc-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <PaperclipIcon />
                        </a>
                      ) : null}
                      {t.tipo === "gasto" && t.reintegrado ? (
                        <button
                          type="button"
                          onClick={() => revertir(t)}
                          title="Marcar como no devuelto"
                          className="shrink-0 text-xs text-green-600 hover:underline dark:text-green-400"
                        >
                          devuelto
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className={cn(TD, "hidden text-xs text-zinc-500 md:table-cell")}>
                    {t.autor ?? "—"}
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
                  <td className={cn(TD, "w-8 pl-0 pr-2 text-right")}>
                    <KebabMenu onEdit={() => setEditar(t)} onDelete={() => borrar(t)} />
                  </td>
                </tr>
              ))}
            </Tabla>
            {ocultos > 0 ? (
              <button
                type="button"
                onClick={() => setLimite((n) => n + PAGE)}
                className="w-full rounded-lg border border-black/[.08] py-2 text-sm text-zinc-600 transition-colors hover:bg-black/[.03] dark:border-white/[.12] dark:text-zinc-300 dark:hover:bg-white/[.05]"
              >
                Mostrar {Math.min(ocultos, PAGE)} más
              </button>
            ) : null}
          </>
        )
      ) : null}

      {pestana === "cobrar" ? (
        cuotas.length === 0 ? (
          <Vacio>Nada pendiente de cobro. 👌</Vacio>
        ) : (
          <Tabla
            cabeceras={["Cliente", "Proyecto", "Vence", "Monto", ""]}
            pie={<Pie label="Total por cobrar" valor={totalCobrar} />}
          >
            {cuotas.map((c, i) => {
              const dias = daysUntil(c.venceAt)
              const vencida = dias < 0
              return (
                <tr key={c.id} className={fila(i)}>
                  <td className={cn(TD, "font-medium")}>
                    {c.contactId ? (
                      <Link href={`/contactos/${c.contactId}`} className="hover:underline">
                        {c.empresa}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">Sin cliente</span>
                    )}
                  </td>
                  <td className={cn(TD, "hidden text-zinc-500 sm:table-cell")}>
                    <Link href={`/proyectos/${c.projectId}`} className="hover:underline">
                      {c.proyecto}
                    </Link>
                  </td>
                  <td className={cn(TD, "whitespace-nowrap")}>
                    <Badge tone={vencida ? "red" : dias <= 7 ? "amber" : "neutral"}>
                      {vencida ? `vencida ${Math.abs(dias)}d` : `en ${dias}d`}
                    </Badge>
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-right font-medium")}>
                    {formatMoney(c.monto, c.moneda)}
                  </td>
                  <td className={cn(TD, "text-right")}>
                    <Accion label="Cobrado" onClick={() => marcarCobrada(c)} />
                  </td>
                </tr>
              )
            })}
          </Tabla>
        )
      ) : null}

      {pestana === "devolver" ? (
        reintegros.length === 0 ? (
          <Vacio>Nada por devolver. 👌</Vacio>
        ) : (
          <Tabla
            cabeceras={["Persona", "Conceptos", "Monto", ""]}
            pie={<Pie label="Total a devolver" valor={totalPagar} />}
          >
            {reintegros.map((r, i) => (
              <tr key={r.id} className={fila(i)}>
                <td className={cn(TD, "font-medium")}>{r.nombre}</td>
                <td className={cn(TD, "hidden text-xs text-zinc-500 sm:table-cell")}>
                  <span className="truncate" title={r.conceptos.join(", ")}>
                    {r.conceptos.length === 1
                      ? r.conceptos[0]
                      : `${r.conceptos[0]} + ${r.conceptos.length - 1} más`}
                  </span>
                </td>
                <td className={cn(TD, "whitespace-nowrap text-right font-medium")}>
                  {formatMoney(r.total)}
                </td>
                <td className={cn(TD, "text-right")}>
                  <Accion label="Pagado" onClick={() => pagarTodo(r.id, r.ids)} />
                </td>
              </tr>
            ))}
          </Tabla>
        )
      ) : null}

      {editar ? (
        <EditMovimiento
          tx={editar}
          usuarios={usuarios}
          proyectos={proyectos}
          onClose={() => setEditar(null)}
        />
      ) : null}
    </div>
  )
}

/** Clase de fila, con separador salvo en la primera. */
function fila(i: number) {
  return cn(
    "bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
    i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
  )
}

function Tabla({
  cabeceras,
  children,
  pie,
}: {
  cabeceras: string[]
  children: React.ReactNode
  pie?: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/[.08] bg-zinc-50 text-left dark:border-white/[.12] dark:bg-zinc-900">
            {cabeceras.map((c, i) => (
              <th
                key={c || `col-${i}`}
                scope="col"
                className={cn(
                  TH,
                  // Cada th se oculta igual que las celdas de su columna.
                  (c === "Proyecto" || c === "Conceptos") && "hidden sm:table-cell",
                  c === "Quién" && "hidden md:table-cell",
                  i === cabeceras.length - 1 && "text-right",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
        {pie ? <tfoot>{pie}</tfoot> : null}
      </table>
    </div>
  )
}

function Pie({ label, valor }: { label: string; valor: number }) {
  return (
    <tr className="border-t border-black/[.08] bg-zinc-50 dark:border-white/[.12] dark:bg-white/[.03]">
      <td className={cn(TD, "text-sm text-zinc-500")} colSpan={2}>
        {label}
      </td>
      <td className={cn(TD, "whitespace-nowrap text-right font-semibold")} colSpan={2}>
        {formatMoney(valor)}
      </td>
    </tr>
  )
}

/** Botón de resolver, en la última columna. */
function Accion({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap rounded-md border border-black/[.12] px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-green-500/50 hover:bg-green-500/10 hover:text-green-700 dark:border-white/[.18] dark:text-zinc-300 dark:hover:text-green-400"
    >
      {label}
    </button>
  )
}

function Dato({ label, valor, tono }: { label: string; valor: number; tono: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={cn("text-lg font-semibold tracking-tight", tono)}>{formatMoney(valor)}</div>
    </div>
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/[.12] p-10 text-center text-sm text-zinc-500 dark:border-white/[.14]">
      {children}
    </div>
  )
}
