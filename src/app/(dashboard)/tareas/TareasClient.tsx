"use client"

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { useId, useMemo, useState, useTransition } from "react"
import { BoardIcon, ListIcon } from "@/components/icons"
import { KebabMenu } from "@/components/KebabMenu"
import { KANBAN_CARD, KanbanBoardShell, KanbanColumn } from "@/components/kanban"
import { Modal } from "@/components/Modal"
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui"
import { ViewToggle } from "@/components/ViewToggle"
import { TASK_COLORS, TASK_COLUMNS, type TaskColor, type TaskColumn } from "@/db/schema"
import { cn, formatDate } from "@/lib/utils"
import { createTaskFromBoard, deleteTask, setTaskStatus, updateTask } from "@/modules/tasks/actions"
import { parseAsignados, serializeAsignados } from "@/modules/tasks/assignees"
import { TASK_COLOR_STYLES } from "@/modules/tasks/colors"
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
  color: TaskColor | null
  estado: TaskColumn
  asignados: string[]
  createdAt: string
  venceAt: string
}

const EMPTY_FORM: NewTaskForm = {
  projectId: "",
  titulo: "",
  descripcion: "",
  color: null,
  estado: "backlog",
  asignados: [],
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
      color: task.color,
      estado: task.estado,
      asignados: parseAsignados(task.asignados),
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
      color: form.color,
      estado: form.estado,
      asignados: form.asignados,
      createdAt: form.createdAt || undefined,
      venceAt: form.venceAt || undefined,
    }
    const proyectoNombre = proyectos.find((p) => p.id === form.projectId)?.nombre ?? ""
    const asignadosJson = serializeAsignados(form.asignados)
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
                  color: form.color,
                  estado: form.estado,
                  asignados: asignadosJson,
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
        color: form.color,
        estado: form.estado,
        venceAt,
        cerradoAt: form.estado === "hecho" ? new Date() : null,
        createdAt: res.createdAt ?? createdAt,
        projectId: form.projectId,
        proyectoNombre,
        asignados: asignadosJson,
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
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: "tablero", label: "Tablero", icon: <BoardIcon /> },
            { value: "lista", label: "Lista", icon: <ListIcon /> },
          ]}
        />

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
        <Modal
          title={editingId ? "Editar tarea" : "Nueva tarea"}
          description="Asigná proyecto, responsable y fechas"
          onClose={() => setShowForm(false)}
          className="max-w-2xl"
        >
          <form onSubmit={submitForm} className="space-y-4">
            <Field label="Título">
              <Input
                autoFocus
                placeholder="¿Qué hay que hacer?"
                value={form.titulo}
                onChange={(e) => setField("titulo", e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="space-y-1.5">
                <span className="text-sm font-medium">Responsables</span>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {usuarios.map((u) => {
                    const on = form.asignados.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() =>
                          setField(
                            "asignados",
                            on
                              ? form.asignados.filter((x) => x !== u.id)
                              : [...form.asignados, u.id],
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          on
                            ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                            : "border-black/[.12] text-zinc-600 hover:border-zinc-400 dark:border-white/[.18] dark:text-zinc-300",
                        )}
                      >
                        {u.nombre}
                      </button>
                    )
                  })}
                </div>
              </div>

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
            </div>

            <Field label="Descripción">
              <Textarea
                rows={2}
                placeholder="Detalles, contexto, links…"
                value={form.descripcion}
                onChange={(e) => setField("descripcion", e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha de creación">
                <Input
                  type="date"
                  value={form.createdAt}
                  onChange={(e) => setField("createdAt", e.target.value)}
                />
              </Field>

              <div className="space-y-1.5">
                <span className="text-sm font-medium">Color</span>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setField("color", null)}
                    aria-label="Sin color"
                    title="Sin color"
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border text-zinc-400 transition-transform hover:scale-110",
                      form.color === null
                        ? "border-zinc-900 ring-2 ring-zinc-900/20 dark:border-white dark:ring-white/20"
                        : "border-black/[.12] dark:border-white/[.18]",
                    )}
                  >
                    <span className="h-3.5 w-px rotate-45 bg-current" />
                  </button>
                  {TASK_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setField("color", c)}
                      aria-label={TASK_COLOR_STYLES[c].label}
                      title={TASK_COLOR_STYLES[c].label}
                      className={cn(
                        "h-7 w-7 rounded-full transition-transform hover:scale-110",
                        TASK_COLOR_STYLES[c].swatch,
                        form.color === c
                          ? "ring-2 ring-offset-2 ring-zinc-900 ring-offset-white dark:ring-white dark:ring-offset-zinc-950"
                          : "",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            {newError ? <p className="text-sm text-red-600">{newError}</p> : null}

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Guardando…" : editingId ? "Guardar cambios" : "Crear tarea"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState>No hay tareas que coincidan con los filtros.</EmptyState>
      ) : view === "tablero" ? (
        <Board
          items={filtered}
          usuarios={usuarios}
          onMove={changeStatus}
          onEdit={openEdit}
          onDelete={removeTask}
        />
      ) : (
        <List
          items={filtered}
          usuarios={usuarios}
          onChange={changeStatus}
          onEdit={openEdit}
          onDelete={removeTask}
        />
      )}
    </div>
  )
}

// ---------- Tablero (kanban global) ----------

type RowActions = {
  onEdit: (task: GlobalTaskRow) => void
  onDelete: (task: GlobalTaskRow) => void
}

/** Mapa id → nombre para resolver los responsables de cada tarea. */
function usuariosMap(usuarios: UserOption[]) {
  return new Map(usuarios.map((u) => [u.id, u.nombre]))
}

/** Nombres de los responsables de una tarea, resueltos contra el mapa. */
function asignadoNombres(asignados: string | null | undefined, nombres: Map<string, string>) {
  return parseAsignados(asignados)
    .map((id) => nombres.get(id))
    .filter((n): n is string => !!n)
}

/** Chips con los responsables de una tarea (uno, varios o ninguno). */
function AssigneeChips({
  asignados,
  nombres,
}: {
  asignados: string | null | undefined
  nombres: Map<string, string>
}) {
  const items = asignadoNombres(asignados, nombres)
  if (items.length === 0) return null
  return (
    <>
      {items.map((n) => (
        <span key={n} className="rounded-full bg-black/[.04] px-1.5 py-0.5 dark:bg-white/[.08]">
          {n}
        </span>
      ))}
    </>
  )
}

function Board({
  items,
  usuarios,
  onMove,
  onEdit,
  onDelete,
}: {
  items: GlobalTaskRow[]
  usuarios: UserOption[]
  onMove: (id: string, estado: TaskColumn) => void
} & RowActions) {
  const nombres = useMemo(() => usuariosMap(usuarios), [usuarios])
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  // id estable para dnd-kit: evita el mismatch de hidratación en sus ids internos.
  const dndId = useId()

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const id = String(e.active.id)
    const target = e.over?.id as TaskColumn | undefined
    if (!target) return
    const task = items.find((t) => t.id === id)
    if (!task || task.estado === target) return
    onMove(id, target)
  }

  const activeTask = activeId ? items.find((t) => t.id === activeId) : null

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <KanbanBoardShell>
        {TASK_COLUMNS.map((estado) => (
          <BoardColumn
            key={estado}
            estado={estado}
            items={items.filter((t) => t.estado === estado)}
            nombres={nombres}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </KanbanBoardShell>
      <DragOverlay>
        {activeTask ? (
          <div className={cn(KANBAN_CARD, "cursor-grabbing shadow-lg")}>
            <BoardCardBody task={activeTask} nombres={nombres} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({
  estado,
  items,
  nombres,
  onEdit,
  onDelete,
}: {
  estado: TaskColumn
  items: GlobalTaskRow[]
  nombres: Map<string, string>
} & RowActions) {
  return (
    <KanbanColumn
      id={estado}
      count={items.length}
      header={<span className="text-sm font-medium text-zinc-500">{STATUS_LABELS[estado]}</span>}
    >
      {items.map((t) => (
        <BoardCard key={t.id} task={t} nombres={nombres} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </KanbanColumn>
  )
}

/** Contenido visual de la tarjeta (reutilizado por el DragOverlay). */
function BoardCardBody({ task, nombres }: { task: GlobalTaskRow; nombres: Map<string, string> }) {
  return (
    <>
      {task.color ? (
        <div className={cn("mb-2 h-1.5 w-10 rounded-full", TASK_COLOR_STYLES[task.color].bar)} />
      ) : null}
      <div className="pr-6 font-medium leading-snug">{task.titulo}</div>
      {task.descripcion ? (
        <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{task.descripcion}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
        <span>{task.proyectoNombre}</span>
        <AssigneeChips asignados={task.asignados} nombres={nombres} />
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
    </>
  )
}

function BoardCard({
  task,
  nombres,
  onEdit,
  onDelete,
}: { task: GlobalTaskRow; nombres: Map<string, string> } & RowActions) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    // Sin transform en el nodo original: el arrastre lo muestra el DragOverlay,
    // así no se extiende el área de scroll (evita el "scroll infinito").
    <div
      ref={setNodeRef}
      className={cn(
        "group relative cursor-grab hover:shadow-md",
        KANBAN_CARD,
        isDragging && "opacity-40",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="absolute right-1.5 top-1.5">
        <KebabMenu onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
      </div>
      <BoardCardBody task={task} nombres={nombres} />
    </div>
  )
}

// Vencida: tiene fecha de vencimiento pasada y no está terminada.
function isOverdue(task: GlobalTaskRow) {
  return task.estado !== "hecho" && !!task.venceAt && new Date(task.venceAt) < new Date()
}

// ---------- Lista (tabla) ----------

function List({
  items,
  usuarios,
  onChange,
  onEdit,
  onDelete,
}: {
  items: GlobalTaskRow[]
  usuarios: UserOption[]
  onChange: (id: string, estado: TaskColumn) => void
} & RowActions) {
  const nombres = useMemo(() => usuariosMap(usuarios), [usuarios])
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
              <td className="px-4 py-2 font-medium">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      t.color ? TASK_COLOR_STYLES[t.color].bar : "bg-transparent",
                    )}
                  />
                  {t.titulo}
                </div>
              </td>
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
              <td className="px-4 py-2 text-zinc-500">
                {asignadoNombres(t.asignados, nombres).join(", ") || "—"}
              </td>
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
                <KebabMenu onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
