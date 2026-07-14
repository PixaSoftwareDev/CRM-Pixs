"use client"

import { useMemo, useState } from "react"
import { Badge, Card, EmptyState, Input, Select } from "@/components/ui"
import { formatMoney } from "@/lib/utils"
import type { DatabaseRow, ServerRow } from "@/modules/infra/queries"
import { NewDatabaseForm, NewServerForm } from "./InfraForms"

const ESTADO_TONE = { activo: "green", baja: "neutral", caido: "red" } as const
const ESTADOS = ["activo", "baja", "caido"] as const
const ENTORNOS = ["prod", "staging", "dev"] as const
const ENTORNO_LABEL: Record<string, string> = { prod: "Producción", staging: "Staging", dev: "Dev" }

export function InfraClient({
  servers,
  databases,
}: {
  servers: ServerRow[]
  databases: DatabaseRow[]
}) {
  const [q, setQ] = useState("")
  const [estado, setEstado] = useState("")
  const [proveedor, setProveedor] = useState("")
  const [entorno, setEntorno] = useState("")
  const [motor, setMotor] = useState("")

  // Opciones dinámicas para los selects (según lo cargado).
  const proveedores = useMemo(
    () => [...new Set(servers.map((s) => s.proveedor).filter(Boolean))].sort() as string[],
    [servers],
  )
  const motores = useMemo(
    () => [...new Set(databases.map((d) => d.motor).filter(Boolean))].sort() as string[],
    [databases],
  )

  const serversFiltrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    const has = (...fs: (string | null)[]) =>
      !term || fs.some((f) => f?.toLowerCase().includes(term))
    return servers.filter(
      (s) =>
        (!estado || s.estado === estado) &&
        (!proveedor || s.proveedor === proveedor) &&
        has(s.nombre, s.proveedor, s.ipHostname, s.os, s.descripcion),
    )
  }, [servers, estado, proveedor, q])

  const databasesFiltradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    const has = (...fs: (string | null)[]) =>
      !term || fs.some((f) => f?.toLowerCase().includes(term))
    return databases.filter(
      (d) =>
        (!entorno || d.entorno === entorno) &&
        (!motor || d.motor === motor) &&
        has(d.nombre, d.motor, d.host, d.descripcion),
    )
  }, [databases, entorno, motor, q])

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en servidores y bases (nombre, proveedor, host…)"
          className="h-9 max-w-md flex-1"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Servidores */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Servidores ({serversFiltrados.length})</h2>
            <NewServerForm />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              className="h-8 w-auto min-w-32 text-xs"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            {proveedores.length > 0 ? (
              <Select
                className="h-8 w-auto min-w-32 text-xs"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
              >
                <option value="">Todos los proveedores</option>
                {proveedores.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>

          {serversFiltrados.length === 0 ? (
            <EmptyState>Sin servidores para ese filtro.</EmptyState>
          ) : (
            serversFiltrados.map((s) => (
              <Card key={s.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.nombre}</span>
                  <Badge tone={ESTADO_TONE[s.estado as keyof typeof ESTADO_TONE] ?? "neutral"}>
                    {s.estado}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {[s.proveedor, s.ipHostname, s.os].filter(Boolean).join(" · ") || "—"}
                </div>
                {s.costoMensual ? (
                  <div className="mt-1 text-xs text-zinc-400">
                    {formatMoney(s.costoMensual)}/mes
                  </div>
                ) : null}
              </Card>
            ))
          )}
        </section>

        {/* Bases de datos */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Bases de datos ({databasesFiltradas.length})</h2>
            <NewDatabaseForm servers={servers.map((s) => ({ id: s.id, nombre: s.nombre }))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              className="h-8 w-auto min-w-32 text-xs"
              value={entorno}
              onChange={(e) => setEntorno(e.target.value)}
            >
              <option value="">Todos los entornos</option>
              {ENTORNOS.map((s) => (
                <option key={s} value={s}>
                  {ENTORNO_LABEL[s]}
                </option>
              ))}
            </Select>
            {motores.length > 0 ? (
              <Select
                className="h-8 w-auto min-w-28 text-xs"
                value={motor}
                onChange={(e) => setMotor(e.target.value)}
              >
                <option value="">Todos los motores</option>
                {motores.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>

          {databasesFiltradas.length === 0 ? (
            <EmptyState>Sin bases para ese filtro.</EmptyState>
          ) : (
            databasesFiltradas.map((d) => (
              <Card key={d.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.nombre}</span>
                  <Badge tone="blue">{d.motor}</Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {[d.entorno, d.host, d.puerto].filter(Boolean).join(" · ") || "—"}
                </div>
                {d.credencialRef ? (
                  <div className="mt-1 text-xs text-zinc-400">🔑 {d.credencialRef}</div>
                ) : null}
              </Card>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
