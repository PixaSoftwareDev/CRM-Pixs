"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Badge, EmptyState, PageHeader, SearchInput } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { ServerRow } from "@/modules/infra/queries"
import { NewServerForm } from "./InfraForms"

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-2.5 align-middle"

const ESTADO_TONE = { activo: "green", baja: "neutral", caido: "red" } as const

type Sort = "nombre" | "proveedor" | "ipHostname" | "estado"

const COLUMNAS: { key: Sort; label: string; oculta?: string }[] = [
  { key: "nombre", label: "Servidor" },
  { key: "proveedor", label: "Proveedor", oculta: "hidden sm:table-cell" },
  { key: "ipHostname", label: "IP / Host", oculta: "hidden lg:table-cell" },
  { key: "estado", label: "Estado" },
]

/** Inventario de servidores, con la misma tabla y controles que el resto de la app. */
export function InfraClient({ servers }: { servers: ServerRow[] }) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<Sort>("nombre")
  const [dir, setDir] = useState<"asc" | "desc">("asc")

  function ordenarPor(key: Sort) {
    if (key === sort) {
      setDir(dir === "asc" ? "desc" : "asc")
    } else {
      setSort(key)
      setDir("asc")
    }
  }

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    const base = servers.filter((s) => {
      if (!term) return true
      return [s.nombre, s.proveedor, s.ipHostname, s.os, s.descripcion]
        .filter(Boolean)
        .some((f) => f?.toLowerCase().includes(term))
    })
    const signo = dir === "asc" ? 1 : -1
    return [...base].sort(
      (a, b) => String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")) * signo,
    )
  }, [servers, q, sort, dir])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Infraestructura" subtitle="Los servidores donde corre todo" />
        <NewServerForm />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} />
        <span className="ml-auto text-sm text-zinc-500">
          {filtrados.length} {filtrados.length === 1 ? "servidor" : "servidores"}
        </span>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState>
          {servers.length === 0
            ? "Todavía no cargaste servidores. Sumá el primero."
            : "Ningún servidor coincide con la búsqueda."}
        </EmptyState>
      ) : (
        <div className="animate-slide-up overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/[.08] bg-zinc-50 text-left dark:border-white/[.12] dark:bg-zinc-900">
                {COLUMNAS.map((col) => {
                  const activa = sort === col.key
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={activa ? (dir === "asc" ? "ascending" : "descending") : "none"}
                      className={cn(TH, col.oculta)}
                    >
                      <button
                        type="button"
                        onClick={() => ordenarPor(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 whitespace-nowrap uppercase transition-colors hover:text-zinc-900 dark:hover:text-zinc-100",
                          activa && "text-zinc-900 dark:text-zinc-100",
                        )}
                      >
                        {col.label}
                        <span
                          aria-hidden="true"
                          className={cn("text-[0.6rem]", !activa && "opacity-0")}
                        >
                          {dir === "asc" ? "▲" : "▼"}
                        </span>
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((s, i) => (
                <tr
                  key={s.id}
                  className={cn(
                    "relative bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                    i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
                  )}
                >
                  <td className={TD}>
                    {/* El seudoelemento cubre la fila entera: se puede hacer clic
                        en cualquier parte para ver el detalle. */}
                    <Link
                      href={`/infra/${s.id}`}
                      className="block truncate font-medium after:absolute after:inset-0"
                    >
                      {s.nombre}
                    </Link>
                    {s.os ? <div className="truncate text-xs text-zinc-400">{s.os}</div> : null}
                  </td>
                  <td className={cn(TD, "hidden text-zinc-500 sm:table-cell")}>
                    {s.proveedor || "—"}
                  </td>
                  <td className={cn(TD, "hidden font-mono text-xs text-zinc-500 lg:table-cell")}>
                    {s.ipHostname || "—"}
                  </td>
                  <td className={TD}>
                    <Badge tone={ESTADO_TONE[s.estado as keyof typeof ESTADO_TONE] ?? "neutral"}>
                      {s.estado}
                    </Badge>
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
