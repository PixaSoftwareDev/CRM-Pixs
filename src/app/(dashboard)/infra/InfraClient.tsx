"use client"

import { useMemo, useState } from "react"
import { Badge, EmptyState, Input, PageHeader } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { DatabaseRow, ServerRow } from "@/modules/infra/queries"
import { NewDatabaseForm, NewServerForm } from "./InfraForms"

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-2.5 align-middle"

const ESTADO_TONE = { activo: "green", baja: "neutral", caido: "red" } as const
const ENTORNO_LABEL: Record<string, string> = { prod: "Producción", staging: "Staging", dev: "Dev" }

type Filtro = "todo" | "servidor" | "base"

/**
 * Una sola fila, sea servidor o base: el inventario se lee de corrido y el tipo
 * es una columna más. Antes eran dos listas separadas, y en la práctica todo
 * vive en el mismo lugar.
 */
type Item = {
  id: string
  tipo: "servidor" | "base"
  nombre: string
  /** Dónde se conecta: IP del servidor o host:puerto de la base. */
  donde: string
  /** Proveedor y sistema, o motor y entorno. */
  detalle: string
  estado: string
  tone: "green" | "neutral" | "red" | "blue"
}

export function InfraClient({
  servers,
  databases,
}: {
  servers: ServerRow[]
  databases: DatabaseRow[]
}) {
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todo")

  const items = useMemo<Item[]>(() => {
    const deServidores: Item[] = servers.map((s) => ({
      id: s.id,
      tipo: "servidor",
      nombre: s.nombre,
      donde: s.ipHostname ?? "—",
      detalle: [s.proveedor, s.os].filter(Boolean).join(" · ") || "—",
      estado: s.estado,
      tone: ESTADO_TONE[s.estado as keyof typeof ESTADO_TONE] ?? "neutral",
    }))

    const deBases: Item[] = databases.map((d) => ({
      id: d.id,
      tipo: "base",
      nombre: d.nombre,
      donde: [d.host, d.puerto].filter(Boolean).join(":") || "—",
      detalle: [d.motor, ENTORNO_LABEL[d.entorno] ?? d.entorno].filter(Boolean).join(" · "),
      estado: d.motor,
      tone: "blue",
    }))

    return [...deServidores, ...deBases]
  }, [servers, databases])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((i) => {
      if (filtro !== "todo" && i.tipo !== filtro) return false
      if (!term) return true
      return `${i.nombre} ${i.donde} ${i.detalle}`.toLowerCase().includes(term)
    })
  }, [items, filtro, q])

  const cuenta = (t: Filtro) =>
    t === "todo" ? items.length : items.filter((i) => i.tipo === t).length

  return (
    <div>
      {/* Misma cabecera que Clientes y Proyectos: título, bajada y las acciones
          principales arriba a la derecha. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Infraestructura"
          subtitle="Dónde vive todo: los servidores y las bases de datos que corren en ellos"
        />
        <div className="flex items-center gap-2">
          <NewServerForm />
          <NewDatabaseForm servers={servers.map((s) => ({ id: s.id, nombre: s.nombre }))} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Filtro por tipo: todo / servidores / bases */}
        <div className="inline-flex rounded-lg border border-black/[.08] p-0.5 dark:border-white/[.12]">
          {(
            [
              ["todo", "Todo"],
              ["servidor", "Servidores"],
              ["base", "Bases"],
            ] as const
          ).map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                filtro === valor
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]",
              )}
            >
              {label} <span className="opacity-60">{cuenta(valor)}</span>
            </button>
          ))}
        </div>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, host o proveedor…"
          className="h-9 max-w-xs flex-1"
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState>
          {items.length === 0
            ? "Todavía no cargaste nada. Sumá tu primer servidor."
            : "Nada coincide con la búsqueda."}
        </EmptyState>
      ) : (
        <div className="animate-slide-up overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/[.08] bg-zinc-50 text-left dark:border-white/[.12] dark:bg-zinc-900">
                <th className={TH}>Nombre</th>
                <th className={TH}>Tipo</th>
                <th className={cn(TH, "hidden lg:table-cell")}>Dirección</th>
                <th className={cn(TH, "hidden sm:table-cell")}>Detalle</th>
                <th className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((i, idx) => (
                <tr
                  key={`${i.tipo}-${i.id}`}
                  className={cn(
                    "bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                    idx > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
                  )}
                >
                  <td className={cn(TD, "font-medium")}>{i.nombre}</td>
                  <td className={TD}>
                    <Badge tone={i.tipo === "servidor" ? "neutral" : "violet"}>
                      {i.tipo === "servidor" ? "Servidor" : "Base"}
                    </Badge>
                  </td>
                  <td className={cn(TD, "hidden font-mono text-xs text-zinc-500 lg:table-cell")}>
                    {i.donde}
                  </td>
                  <td className={cn(TD, "hidden text-zinc-500 sm:table-cell")}>{i.detalle}</td>
                  <td className={TD}>
                    <Badge tone={i.tone}>{i.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
