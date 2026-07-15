"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { GridIcon, ListIcon } from "@/components/icons"
import { Badge, Input, Select } from "@/components/ui"
import { ViewToggle } from "@/components/ViewToggle"
import type { ProjectState } from "@/db/schema"
import { cn, formatMoney } from "@/lib/utils"
import type { ProjectListRow } from "@/modules/projects/queries"

const ESTADO_TONE: Record<ProjectState, "green" | "amber" | "blue" | "red"> = {
  activo: "green",
  pausado: "amber",
  finalizado: "blue",
  cancelado: "red",
}

type View = "card" | "list"
const STORAGE_KEY = "proyectos_view"

export function ProjectsList({ proyectos }: { proyectos: ProjectListRow[] }) {
  const [cliente, setCliente] = useState<string>("")
  const [q, setQ] = useState<string>("")
  const [view, setView] = useState<View>("card")

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "card" || saved === "list") setView(saved)
  }, [])

  function changeView(v: View) {
    setView(v)
    localStorage.setItem(STORAGE_KEY, v)
  }

  // Clientes únicos (id + nombre) para el filtro.
  const clientes = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of proyectos) {
      if (p.contactId) map.set(p.contactId, p.contactoNombre)
    }
    return [...map]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [proyectos])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    return proyectos.filter((p) => {
      if (cliente && p.contactId !== cliente) return false
      if (!term) return true
      return p.nombre.toLowerCase().includes(term) || p.contactoNombre.toLowerCase().includes(term)
    })
  }, [proyectos, cliente, q])

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
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-500">
            {filtrados.length} {filtrados.length === 1 ? "proyecto" : "proyectos"}
          </span>
          <ViewToggle
            value={view}
            onChange={changeView}
            options={[
              { value: "card", label: "Tarjetas", icon: <GridIcon /> },
              { value: "list", label: "Lista", icon: <ListIcon /> },
            ]}
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[.12] p-10 text-center text-sm text-zinc-500 dark:border-white/[.14]">
          No hay proyectos que coincidan con la búsqueda.
        </div>
      ) : view === "card" ? (
        <div className="grid animate-slide-up gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((p) => (
            <Link
              key={p.id}
              href={`/proyectos/${p.id}`}
              className="block h-full rounded-xl border border-black/[.08] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md dark:border-white/[.12] dark:bg-zinc-900 dark:hover:border-zinc-500"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{p.contactoNombre}</span>
                <Badge tone={ESTADO_TONE[p.estado]}>{p.estado}</Badge>
              </div>
              <div className="truncate text-sm text-zinc-500">{p.nombre}</div>
              {p.valor ? (
                <div className="mt-2 text-xs text-zinc-400">{formatMoney(p.valor, p.moneda)}</div>
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="animate-slide-up overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
          {filtrados.map((p, i) => (
            <Link
              key={p.id}
              href={`/proyectos/${p.id}`}
              className={cn(
                "flex items-center gap-3 bg-white px-4 py-3 transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.contactoNombre}</div>
                <div className="truncate text-xs text-zinc-500">{p.nombre}</div>
              </div>
              {p.valor ? (
                <span className="hidden shrink-0 text-xs text-zinc-400 sm:block">
                  {formatMoney(p.valor, p.moneda)}
                </span>
              ) : null}
              <Badge tone={ESTADO_TONE[p.estado]}>{p.estado}</Badge>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
