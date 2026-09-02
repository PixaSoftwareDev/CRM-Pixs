"use client"

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { useId, useMemo, useState, useTransition } from "react"
import { BoardIcon, ListIcon } from "@/components/icons"
import { KebabMenu } from "@/components/KebabMenu"
import { KANBAN_CARD, KanbanBoardShell, KanbanColumn } from "@/components/kanban"
import { Modal } from "@/components/Modal"
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Tab,
  Tabs,
  Textarea,
} from "@/components/ui"
import { ColorSelect } from "@/components/ui/ColorSelect"
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

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-2.5 align-middle"

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
  const [responsableFilter, setResponsableFilter] = useState<string>("")
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

  // Las hechas se archivan solas: pasados 14 días de cerradas salen del
  // tablero para que la columna no crezca infinita. Filtrando por estado
  // "Hecho" se ven todas, viejas incluidas.
  const DIAS_ARCHIVO = 14
  const filtered = useMemo(() => {
    const corte = Date.now() - DIAS_ARCHIVO * 24 * 60 * 60 * 1000
    return items.filter((t) => {
      if (t.estado === "hecho" && statusFilter !== "hecho") {
        const cierre = t.cerradoAt ?? t.createdAt
        if (cierre && new Date(cierre).getTime() < corte) return false
      }
      return (
        (!projectFilter || t.projectId === projectFilter) &&
        (!statusFilter || t.estado === statusFilter) &&
        // "sin" = tareas que no tiene nadie asignado.
        (!responsableFilter ||
          (responsableFilter === "sin"
            ? parseAsignados(t.asignados).length === 0
            : parseAsignados(t.asignados).includes(responsableFilter)))
      )
    })
  }, [items, projectFilter, statusFilter, responsableFilter])

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
      {/* Misma cabecera que Clientes y Proyectos: título, bajada y la acción
          principal arriba a la derecha. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Tareas"
          subtitle="Todas las tareas de todos los proyectos en un solo lugar"
        />
        <Button
          onClick={openForm}
          disabled={proyectos.length === 0}
          title={proyectos.length === 0 ? "Primero creá un proyecto" : undefined}
        >
          + Nueva tarea
        </Button>
      </div>

      {/* Vista y filtros en la misma línea: las pestañas a la izquierda, los
          controles a la derecha. */}
      <Tabs
        className="mb-4"
        acciones={
          <>
            <ColorSelect
              className="w-60"
              value={projectFilter}
              onChange={setProjectFilter}
              ariaLabel="Proyecto"
              options={[
                { value: "", label: "Todos los proyectos" },
                ...proyectos.map((p) => ({ value: p.id, label: p.nombre })),
              ]}
            />

            <ColorSelect
              className="w-44"
              value={responsableFilter}
              onChange={setResponsableFilter}
              ariaLabel="Responsable"
              options={[
                { value: "", label: "Responsable" },
                { value: "sin", label: "Sin asignar" },
                ...usuarios.map((u) => ({ value: u.id, label: u.nombre })),
              ]}
            />

            {/* El estado solo se filtra en Lista: en el tablero las columnas ya son los estados. */}
            {view === "lista" ? (
              <ColorSelect
                className="w-40"
                value={statusFilter}
                onChange={setStatusFilter}
                ariaLabel="Estado"
                options={[
                  { value: "", label: "Todos los estados" },
                  ...TASK_COLUMNS.map((e) => ({ value: e as string, label: STATUS_LABELS[e] })),
                ]}
              />
            ) : null}
          </>
        }
      >
        <Tab activa={view === "tablero"} onClick={() => setView("tablero")}>
          <BoardIcon /> Tablero
        </Tab>
        <Tab activa={view === "lista"} onClick={() => setView("lista")}>
          <ListIcon /> Lista
        </Tab>
      </Tabs>

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
                placeholder="Título"
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

              <Field label="Responsable">
                {/* Un solo responsable por tarea. El campo guarda una lista
                    (por si algún día hacen falta varios), pero acá se elige uno. */}
                <Select
                  value={form.asignados[0] ?? ""}
                  onChange={(e) =>
                    setField("asignados", e.target.value === "" ? [] : [e.target.value])
                  }
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
            </div>

            <Field label="Descripción">
              <Textarea
                rows={2}
                placeholder="Notas"
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

              <Field label="Prioridad">
                {/* Desplegable en vez de botones: entra en una línea y queda a
                    la par del campo de fecha. */}
                <ColorSelect
                  value={form.color ?? ""}
                  onChange={(v) => setField("color", v === "" ? null : (v as TaskColor))}
                  ariaLabel="Prioridad"
                  options={[
                    { value: "", label: "Sin prioridad", dot: "bg-zinc-300 dark:bg-zinc-600" },
                    ...TASK_COLORS.map((c) => ({
                      value: c as string,
                      label: TASK_COLOR_STYLES[c].label,
                      dot: TASK_COLOR_STYLES[c].swatch,
                    })),
                  ]}
                />
              </Field>
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
  // Mouse: arrastra al mover 6px. Touch: mantené presionado 200ms para arrastrar,
  // así en móvil un deslizamiento normal scrollea el tablero en vez de agarrar una tarjeta.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
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
        // Tinte suave según la prioridad: se lee de un vistazo sin gritar.
        task.color && TASK_COLOR_STYLES[task.color].card,
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

type TaskSort = "titulo" | "proyectoNombre" | "estado" | "responsable" | "createdAt" | "venceAt"

const COLUMNAS: { key: TaskSort; label: string; oculta?: string }[] = [
  { key: "titulo", label: "Tarea" },
  { key: "proyectoNombre", label: "Proyecto", oculta: "hidden md:table-cell" },
  { key: "estado", label: "Estado" },
  { key: "responsable", label: "Responsable", oculta: "hidden lg:table-cell" },
  { key: "createdAt", label: "Apertura", oculta: "hidden xl:table-cell" },
  { key: "venceAt", label: "Vence", oculta: "hidden sm:table-cell" },
]

/** Misma tabla que el resto de la app: encabezados que ordenan al tocarlos. */
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
  const [sort, setSort] = useState<TaskSort>("createdAt")
  const [dir, setDir] = useState<"asc" | "desc">("desc")

  function ordenarPor(key: TaskSort) {
    if (key === sort) {
      setDir(dir === "asc" ? "desc" : "asc")
    } else {
      setSort(key)
      setDir("asc")
    }
  }

  const ordenados = useMemo(() => {
    const signo = dir === "asc" ? 1 : -1
    const fecha = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0)
    return [...items].sort((a, b) => {
      if (sort === "createdAt") return (fecha(a.createdAt) - fecha(b.createdAt)) * signo
      if (sort === "venceAt") return (fecha(a.venceAt) - fecha(b.venceAt)) * signo
      if (sort === "responsable") {
        const na = asignadoNombres(a.asignados, nombres).join(", ")
        const nb = asignadoNombres(b.asignados, nombres).join(", ")
        return na.localeCompare(nb) * signo
      }
      return String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")) * signo
    })
  }, [items, sort, dir, nombres])

  return (
    <div className="rounded-xl border border-black/[.08] dark:border-white/[.12]">
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
            <th className={cn(TH, "w-10")}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map((t, i) => (
            <tr
              key={t.id}
              className={cn(
                "bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
                i > 0 && "border-t border-black/[.06] dark:border-white/[.08]",
              )}
            >
              <td className={TD}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      t.color ? TASK_COLOR_STYLES[t.color].bar : "bg-transparent",
                    )}
                  />
                  <span className="truncate font-medium">{t.titulo}</span>
                </div>
              </td>
              <td className={cn(TD, "hidden text-zinc-500 md:table-cell")}>{t.proyectoNombre}</td>
              <td className={TD}>
                <ColorSelect
                  className="w-32"
                  value={t.estado}
                  onChange={(v) => onChange(t.id, v as TaskColumn)}
                  ariaLabel="Estado"
                  options={TASK_COLUMNS.map((e) => ({ value: e, label: STATUS_LABELS[e] }))}
                />
              </td>
              <td className={cn(TD, "hidden text-zinc-500 lg:table-cell")}>
                {asignadoNombres(t.asignados, nombres).join(", ") || "—"}
              </td>
              <td
                className={cn(TD, "hidden whitespace-nowrap text-xs text-zinc-400 xl:table-cell")}
              >
                {formatDate(t.createdAt)}
              </td>
              <td className={cn(TD, "hidden whitespace-nowrap text-xs sm:table-cell")}>
                {t.cerradoAt ? (
                  <Badge tone="green">hecha</Badge>
                ) : (
                  <span className="text-zinc-400">{formatDate(t.venceAt) || "—"}</span>
                )}
              </td>
              <td className={cn(TD, "text-right")}>
                <KebabMenu onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
