"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Badge, Input, Select } from "@/components/ui"
import type { ProjectState } from "@/db/schema"
import { cn, formatDate, formatMoney } from "@/lib/utils"
import type { ProjectListRow } from "@/modules/projects/queries"

const ESTADO_TONE: Record<ProjectState, "green" | "amber" | "blue" | "red"> = {
  activo: "green",
  pausado: "amber",
  finalizado: "blue",
  cancelado: "red",
}

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-2.5 align-middle"

type SortKey = "contactoNombre" | "nombre" | "valor" | "estado" | "createdAt"
type SortDir = "asc" | "desc"

const COLUMNAS: { key: SortKey; label: string; oculta?: string }[] = [
  { key: "contactoNombre", label: "Cliente" },
  { key: "nombre", label: "Proyecto" },
  { key: "valor", label: "Valor", oculta: "hidden sm:table-cell" },
  { key: "estado", label: "Estado" },
  { key: "createdAt", label: "Alta", oculta: "hidden lg:table-cell" },
]

export function ProjectsList({ proyectos }: { proyectos: ProjectListRow[] }) {
  const [cliente, setCliente] = useState<string>("")
  const [q, setQ] = useState<string>("")
  const [sort, setSort] = useState<SortKey>("createdAt")
  const [dir, setDir] = useState<SortDir>("desc")

  /** Misma columna alterna el sentido; otra, arranca ascendente. */
  function ordenarPor(key: SortKey) {
    if (key === sort) {
      setDir(dir === "asc" ? "desc" : "asc")
    } else {
      setSort(key)
      setDir("asc")
    }
  }

  // Clientes únicos (id + nombre) para el filtro.
  const clientes = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of proyectos) {
      if (p.contactId && p.contactoNombre) map.set(p.contactId, p.contactoNombre)
    }
    return [...map]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [proyectos])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    const base = proyectos.filter((p) => {
      if (cliente && p.contactId !== cliente) return false
      if (!term) return true
      return (
        p.nombre.toLowerCase().includes(term) ||
        (p.contactoNombre ?? "").toLowerCase().includes(term)
      )
    })

    const signo = dir === "asc" ? 1 : -1
    return [...base].sort((a, b) => {
      if (sort === "valor") {
        return (Number(a.valor ?? 0) - Number(b.valor ?? 0)) * signo
      }
      if (sort === "createdAt") {
        return (a.createdAt.getTime() - b.createdAt.getTime()) * signo
      }
      return String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")) * signo
    })
  }, [proyectos, cliente, q, sort, dir])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por proyecto o cliente…"
          className="h-9 max-w-xs flex-1"
        />
        {clientes.length > 1 ? (
          <Select
            className="w-auto min-w-48"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
          >
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        ) : null}
        <span className="ml-auto text-sm text-zinc-500">
          {filtrados.length} {filtrados.length === 1 ? "proyecto" : "proyectos"}
        </span>
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[.12] p-10 text-center text-sm text-zinc-500 dark:border-white/[.14]">
          No hay proyectos que coincidan con la búsqueda.
        </div>
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
              {filtrados.map((p, i) => (
                <tr
                  key={p.id}
                  className={cn(
                    "relative bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                    i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
                  )}
                >
                  <td className={TD}>
                    {/* El seudoelemento cubre la fila entera: se puede hacer clic
                        en cualquier parte, sin anidar enlaces dentro de la tabla. */}
                    <Link
                      href={`/proyectos/${p.id}`}
                      className="truncate font-medium after:absolute after:inset-0"
                    >
                      {p.contactoNombre ?? "—"}
                    </Link>
                  </td>
                  <td className={cn(TD, "text-zinc-600 dark:text-zinc-300")}>
                    <span className="truncate">{p.nombre}</span>
                  </td>
                  <td className={cn(TD, "hidden whitespace-nowrap text-zinc-500 sm:table-cell")}>
                    {p.valor ? formatMoney(p.valor, p.moneda ?? "ARS") : "—"}
                  </td>
                  <td className={TD}>
                    <Badge tone={ESTADO_TONE[p.estado]}>{p.estado}</Badge>
                  </td>
                  <td
                    className={cn(
                      TD,
                      "hidden whitespace-nowrap text-xs text-zinc-400 lg:table-cell",
                    )}
                  >
                    {formatDate(p.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
