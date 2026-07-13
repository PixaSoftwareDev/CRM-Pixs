"use client"

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { useId, useMemo, useState, useTransition } from "react"
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui"
import { TASK_COLUMNS, type TaskColumn } from "@/db/schema"
import { cn, formatDate } from "@/lib/utils"
import { createTaskFromBoard, deleteTask, setTaskStatus, updateTask } from "@/modules/tasks/actions"
import type { GlobalTaskRow, ProjectOption, UserOption } from "@/modules/tasks/queries"

const STATUS_LABELS: Record<TaskColumn, string> = {
  backlog: "Backlog",
  en_curso: "En curso",
  revision: "Revisión",
  hecho: "Hecho",
}

type View = "tablero" | "lista"

// yyyy-mm-dd en hora local (para los inputs date).
function toInputDate(date: Date | string | null | undefined) {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

function todayStr() {
  return toInputDate(new Date())
}

type NewTaskForm = {
  projectId: string
  titulo: string
  descripcion: string
  estado: TaskColumn
  asignadoA: string
  createdAt: string
  venceAt: string
}

const EMPTY_FORM: NewTaskForm = {
  projectId: "",
  titulo: "",
  descripcion: "",
  estado: "backlog",
  asignadoA: "",
  createdAt: "",
  venceAt: "",
}

export function TareasClient({
  initial,
  proyectos,
  usuarios,
}: {
  initial: GlobalTaskRow[]
  proyectos: ProjectOption[]
  usuarios: UserOption[]
}) {
  const [items, setItems] = useState(initial)
  const [view, setView] = useState<View>("tablero")
  const [projectFilter, setProjectFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [, startTransition] = useTransition()

  // Alta / edición de tarea desde esta pestaña.
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NewTaskForm>(EMPTY_FORM)
  const [newError, setNewError] = useState<string>()
  const [creating, startCreate] = useTransition()

  function setField<K extends keyof NewTaskForm>(key: K, value: NewTaskForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const filtered = useMemo(
    () =>
      items.filter(
        (t) =>
          (!projectFilter || t.projectId === projectFilter) &&
          (!statusFilter || t.estado === statusFilter),
      ),
    [items, projectFilter, statusFilter],
  )

  const pendientes = filtered.filter((t) => t.estado !== "hecho").length
  const hechas = filtered.length - pendientes

  // Cambia el estado con actualización optimista; revierte si el server falla.
  function changeStatus(id: string, estado: TaskColumn) {
    const prev = items
    setItems((cur) =>
      cur.map((t) =>
        t.id === id ? { ...t, estado, cerradoAt: estado === "hecho" ? new Date() : null } : t,
      ),
    )
    startTransition(async () => {
      const res = await setTaskStatus(id, estado)
      if (res?.error) setItems(prev)
    })
  }

  function openForm() {
    setNewError(undefined)
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      // Preselecciona el proyecto del filtro activo, o el primero disponible.
      projectId: projectFilter || proyectos[0]?.id || "",
      createdAt: todayStr(),
    })
    setShowForm(true)
  }

  function openEdit(task: GlobalTaskRow) {
    setNewError(undefined)
    setEditingId(task.id)
    setForm({
      projectId: task.projectId,
      titulo: task.titulo,
      descripcion: task.descripcion ?? "",
      estado: task.estado,
      asignadoA: task.asignadoA ?? "",
      createdAt: toInputDate(task.createdAt),
      venceAt: toInputDate(task.venceAt),
    })
    setShowForm(true)
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault()
    setNewError(undefined)
    const titulo = form.titulo.trim()
    if (!titulo || !form.projectId) {
      setNewError("Elegí un proyecto y escribí un título")
      return
    }
    const payload = {
      projectId: form.projectId,
      titulo,
      descripcion: form.descripcion.trim() || undefined,
      estado: form.estado,
      asignadoA: form.asignadoA || undefined,
      createdAt: form.createdAt || undefined,
      venceAt: form.venceAt || undefined,
    }
    const proyectoNombre = proyectos.find((p) => p.id === form.projectId)?.nombre ?? ""
    const asignadoNombre = usuarios.find((u) => u.id === form.asignadoA)?.nombre ?? null
    const venceAt = form.venceAt ? new Date(`${form.venceAt}T12:00:00`) : null
    const createdAt = form.createdAt ? new Date(`${form.createdAt}T12:00:00`) : new Date()

    startCreate(async () => {
      if (editingId) {
        const res = await updateTask({ id: editingId, ...payload })
        if (!res.ok) {
          setNewError(res.error ?? "No se pudo guardar la tarea")
          return
        }
        setItems((cur) =>
          cur.map((t) =>
            t.id === editingId
              ? {
                  ...t,
                  titulo,
                  descripcion: form.descripcion.trim() || null,
                  estado: form.estado,
                  asignadoA: form.asignadoA || null,
                  asignadoNombre,
                  projectId: form.projectId,
                  proyectoNombre,
                  venceAt,
                  createdAt,
                  cerradoAt: form.estado === "hecho" ? (t.cerradoAt ?? new Date()) : null,
                }
              : t,
          ),
        )
        setShowForm(false)
        return
      }

      const res = await createTaskFromBoard(payload)
      if (!res.ok || !res.id) {
        setNewError(res.error ?? "No se pudo crear la tarea")
        return
      }
      const nueva: GlobalTaskRow = {
        id: res.id,
        titulo,
        descripcion: form.descripcion.trim() || null,
        estado: form.estado,
        venceAt,
        cerradoAt: form.estado === "hecho" ? new Date() : null,
        createdAt: res.createdAt ?? createdAt,
        projectId: form.projectId,
        proyectoNombre,
        asignadoA: form.asignadoA || null,
        asignadoNombre,
      }
      setItems((cur) => [nueva, ...cur])
      setShowForm(false)
    })
  }

  function removeTask(task: GlobalTaskRow) {
    const prev = items
    setItems((cur) => cur.filter((t) => t.id !== task.id))
    if (editingId === task.id) setShowForm(false)
    startTransition(async () => {
      try {
        await deleteTask(task.id, task.projectId)
      } catch {
        setItems(prev) // rollback si falla
      }
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
          <Button
            variant={view === "tablero" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setView("tablero")}
          >
            Tablero
          </Button>
          <Button
            variant={view === "lista" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setView("lista")}
          >
            Lista
          </Button>
        </div>

        <Select
          className="w-auto min-w-44"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="">Todos los proyectos</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>

        <Select
          className="w-auto min-w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {TASK_COLUMNS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-500">
            {pendientes} pendiente{pendientes === 1 ? "" : "s"} · {hechas} hecha
            {hechas === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            onClick={openForm}
            disabled={proyectos.length === 0}
            title={proyectos.length === 0 ? "Primero creá un proyecto" : undefined}
          >
            + Nueva tarea
          </Button>
        </div>
      </div>

      {showForm ? (
        <form
          onSubmit={submitForm}
          className="mb-5 rounded-xl border border-black/[.08] bg-zinc-50 p-4 dark:border-white/[.12] dark:bg-zinc-900/40"
        >
          <div className="mb-3 text-sm font-semibold">
            {editingId ? "Editar tarea" : "Nueva tarea"}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Título" className="sm:col-span-2 lg:col-span-4">
              {/* biome-ignore lint/a11y/noAutofocus: foco al abrir el formulario */}
              <Input
                autoFocus
                placeholder="¿Qué hay que hacer?"
                value={form.titulo}
                onChange={(e) => setField("titulo", e.target.value)}
              />
            </Field>

            <Field label="Proyecto">
              <Select
                value={form.projectId}
                onChange={(e) => setField("projectId", e.target.value)}
              >
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Responsable">
              <Select
                value={form.asignadoA}
                onChange={(e) => setField("asignadoA", e.target.value)}
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Estado">
              <Select
                value={form.estado}
                onChange={(e) => setField("estado", e.target.value as TaskColumn)}
              >
                {TASK_COLUMNS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Resolución estimada">
              <Input
                type="date"
                value={form.venceAt}
                onChange={(e) => setField("venceAt", e.target.value)}
              />
            </Field>

            <Field label="Descripción" className="sm:col-span-2 lg:col-span-3">
              <Textarea
                rows={2}
                placeholder="Detalles, contexto, links…"
                value={form.descripcion}
                onChange={(e) => setField("descripcion", e.target.value)}
              />
            </Field>

            <Field label="Fecha de creación">
              <Input
                type="date"
                value={form.createdAt}
                onChange={(e) => setField("createdAt", e.target.value)}
              />
            </Field>
          </div>

          {newError ? <p className="mt-3 text-sm text-red-600">{newError}</p> : null}

          <div className="mt-4 flex gap-2">
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Guardando…" : editingId ? "Guardar cambios" : "Crear tarea"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState>No hay tareas que coincidan con los filtros.</EmptyState>
      ) : view === "tablero" ? (
        <Board items={filtered} onMove={changeStatus} onEdit={openEdit} onDelete={removeTask} />
      ) : (
        <List items={filtered} onChange={changeStatus} onEdit={openEdit} onDelete={removeTask} />
      )}
    </div>
  )
}

// ---------- Tablero (kanban global) ----------

type RowActions = {
  onEdit: (task: GlobalTaskRow) => void
  onDelete: (task: GlobalTaskRow) => void
}

function Board({
  items,
  onMove,
  onEdit,
  onDelete,
}: { items: GlobalTaskRow[]; onMove: (id: string, estado: TaskColumn) => void } & RowActions) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  // id estable para dnd-kit: evita el mismatch de hidratación en sus ids internos.
  const dndId = useId()

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id)
    const target = e.over?.id as TaskColumn | undefined
    if (!target) return
    const task = items.find((t) => t.id === id)
    if (!task || task.estado === target) return
    onMove(id, target)
  }

  return (
    <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {TASK_COLUMNS.map((estado) => (
          <BoardColumn
            key={estado}
            estado={estado}
            items={items.filter((t) => t.estado === estado)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </DndContext>
  )
}

function BoardColumn({
  estado,
  items,
  onEdit,
  onDelete,
}: { estado: TaskColumn; items: GlobalTaskRow[] } & RowActions) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })
  return (
    <div className="flex min-w-[13rem] flex-1 flex-col">
      <div className="mb-2 px-1 text-sm font-medium text-zinc-500">
        {STATUS_LABELS[estado]} <span className="text-zinc-400">· {items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-lg bg-zinc-100/60 p-2 dark:bg-zinc-900/40",
          isOver && "ring-2 ring-zinc-400",
        )}
      >
        {items.map((t) => (
          <BoardCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

function BoardCard({ task, onEdit, onDelete }: { task: GlobalTaskRow } & RowActions) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        "group relative cursor-grab rounded-lg border border-black/[.08] bg-white p-3 text-sm shadow-sm dark:border-white/[.12] dark:bg-zinc-900",
        isDragging && "opacity-50",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="absolute right-1.5 top-1.5">
        <TaskMenu onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
      </div>
      <div className="pr-6 font-medium leading-snug">{task.titulo}</div>
      {task.descripcion ? (
        <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{task.descripcion}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
        <span>{task.proyectoNombre}</span>
        {task.asignadoNombre ? (
          <span className="rounded-full bg-black/[.04] px-1.5 py-0.5 dark:bg-white/[.08]">
            {task.asignadoNombre}
          </span>
        ) : null}
      </div>
      {task.estado === "hecho" && task.cerradoAt ? (
        <div className="mt-1.5 text-xs text-green-600 dark:text-green-400">
          Cerrada {formatDate(task.cerradoAt)}
        </div>
      ) : task.venceAt ? (
        <div
          className={cn(
            "mt-1.5 text-xs",
            isOverdue(task) ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-400",
          )}
        >
          Vence {formatDate(task.venceAt)}
        </div>
      ) : null}
    </div>
  )
}

// Vencida: tiene fecha de vencimiento pasada y no está terminada.
function isOverdue(task: GlobalTaskRow) {
  return task.estado !== "hecho" && !!task.venceAt && new Date(task.venceAt) < new Date()
}

// Menú "⋮" con acciones (Editar / Eliminar). Detiene la propagación para no
// disparar el drag&drop de la tarjeta.
function TaskMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div className="relative" onPointerDown={stop}>
      <button
        type="button"
        aria-label="Acciones de la tarea"
        onClick={(e) => {
          stop(e)
          setOpen((o) => !o)
        }}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-black/[.05] hover:text-zinc-700 dark:hover:bg-white/[.08] dark:hover:text-zinc-200"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            onPointerDown={stop}
          />
          <div className="absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-md border border-black/[.08] bg-white py-1 text-sm shadow-lg dark:border-white/[.12] dark:bg-zinc-900">
            <button
              type="button"
              onClick={(e) => {
                stop(e)
                setOpen(false)
                onEdit()
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={(e) => {
                stop(e)
                setOpen(false)
                onDelete()
              }}
              className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Eliminar
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

// ---------- Lista (tabla) ----------

function List({
  items,
  onChange,
  onEdit,
  onDelete,
}: {
  items: GlobalTaskRow[]
  onChange: (id: string, estado: TaskColumn) => void
} & RowActions) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-black/[.08] text-left text-xs text-zinc-500 dark:border-white/[.12]">
            <th className="px-4 py-2 font-medium">Tarea</th>
            <th className="px-4 py-2 font-medium">Proyecto</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Responsable</th>
            <th className="px-4 py-2 font-medium">Apertura</th>
            <th className="px-4 py-2 font-medium">Vence</th>
            <th className="px-4 py-2 font-medium">Cierre</th>
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.id}
              className="border-b border-black/[.05] last:border-0 dark:border-white/[.08]"
            >
              <td className="px-4 py-2 font-medium">{t.titulo}</td>
              <td className="px-4 py-2 text-zinc-500">{t.proyectoNombre}</td>
              <td className="px-4 py-2">
                <Select
                  className="h-8 w-auto min-w-32 text-xs"
                  value={t.estado}
                  onChange={(e) => onChange(t.id, e.target.value as TaskColumn)}
                >
                  {TASK_COLUMNS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </td>
              <td className="px-4 py-2 text-zinc-500">{t.asignadoNombre ?? "—"}</td>
              <td className="px-4 py-2 text-zinc-400">{formatDate(t.createdAt)}</td>
              <td className="px-4 py-2 text-zinc-400">{formatDate(t.venceAt)}</td>
              <td className="px-4 py-2">
                {t.cerradoAt ? (
                  <Badge tone="green">{formatDate(t.cerradoAt)}</Badge>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-right">
                <TaskMenu onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
