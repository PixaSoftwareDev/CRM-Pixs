"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useConfirm } from "@/components/ConfirmDialog"
import {
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  GridIcon,
  KeyIcon,
  ListIcon,
  UserIcon,
} from "@/components/icons"
import { KebabMenu } from "@/components/KebabMenu"
import { Modal } from "@/components/Modal"
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui"
import { ViewToggle } from "@/components/ViewToggle"
import { CREDENTIAL_TYPES, type CredentialType } from "@/db/schema"
import { cn, formatDate } from "@/lib/utils"
import {
  createCredential,
  deleteCredential,
  revealSecret,
  updateCredential,
} from "@/modules/credentials/actions"
import type { CredentialRow, ProjectOption } from "@/modules/credentials/queries"
import { CREDENTIAL_TYPE_LABELS, CREDENTIAL_TYPE_TONE } from "@/modules/credentials/shared"

type Form = {
  titulo: string
  tipo: CredentialType
  usuario: string
  secreto: string
  url: string
  projectId: string
  notas: string
}

const EMPTY: Form = {
  titulo: "",
  tipo: "otro",
  usuario: "",
  secreto: "",
  url: "",
  projectId: "",
  notas: "",
}

export function AccesosClient({
  initial,
  proyectos,
}: {
  initial: CredentialRow[]
  proyectos: ProjectOption[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [items, setItems] = useState(initial)
  const [q, setQ] = useState("")
  const [projectFilter, setProjectFilter] = useState("")
  const [tipoFilter, setTipoFilter] = useState("")
  const [view, setView] = useState<"card" | "list">("card")

  useEffect(() => {
    const saved = localStorage.getItem("accesos_view")
    if (saved === "card" || saved === "list") setView(saved)
  }, [])

  function changeView(v: "card" | "list") {
    setView(v)
    localStorage.setItem("accesos_view", v)
  }

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [error, setError] = useState<string>()
  const [saving, startSave] = useTransition()
  const [, startDelete] = useTransition()

  useEffect(() => setItems(initial), [initial])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((c) => {
      if (projectFilter && c.projectId !== projectFilter) return false
      if (tipoFilter && c.tipo !== tipoFilter) return false
      if (!term) return true
      return [c.titulo, c.usuario, c.url, c.notas, c.proyectoNombre]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term))
    })
  }, [items, q, projectFilter, tipoFilter])

  function setField<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function openNew() {
    setError(undefined)
    setEditingId(null)
    setForm({ ...EMPTY, projectId: projectFilter })
    setShowForm(true)
  }

  function openEdit(c: CredentialRow) {
    setError(undefined)
    setEditingId(c.id)
    setForm({
      titulo: c.titulo,
      tipo: c.tipo,
      usuario: c.usuario ?? "",
      secreto: "",
      url: c.url ?? "",
      projectId: c.projectId ?? "",
      notas: c.notas ?? "",
    })
    setShowForm(true)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (!form.titulo.trim()) {
      setError("El título es obligatorio")
      return
    }
    const fd = new FormData()
    fd.set("titulo", form.titulo)
    fd.set("tipo", form.tipo)
    fd.set("usuario", form.usuario)
    fd.set("secreto", form.secreto)
    fd.set("url", form.url)
    fd.set("projectId", form.projectId)
    fd.set("notas", form.notas)

    startSave(async () => {
      const res = editingId
        ? await updateCredential(editingId, {}, fd)
        : await createCredential({}, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      setShowForm(false)
      router.refresh()
    })
  }

  async function remove(c: CredentialRow) {
    const ok = await confirm({
      title: "Eliminar acceso",
      message: `¿Eliminar "${c.titulo}"? Esta acción no se puede deshacer.`,
      danger: true,
    })
    if (!ok) return
    const prev = items
    setItems((cur) => cur.filter((x) => x.id !== c.id))
    if (editingId === c.id) setShowForm(false)
    startDelete(async () => {
      const res = await deleteCredential(c.id)
      if (res.error) setItems(prev)
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título, usuario, URL…"
          className="h-9 max-w-xs flex-1"
        />
        {proyectos.length > 0 ? (
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
        ) : null}
        <Select
          className="w-auto min-w-36"
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {CREDENTIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {CREDENTIAL_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-500">
            {filtered.length} {filtered.length === 1 ? "acceso" : "accesos"}
          </span>
          <ViewToggle
            value={view}
            onChange={changeView}
            options={[
              { value: "card", label: "Tarjetas", icon: <GridIcon /> },
              { value: "list", label: "Lista", icon: <ListIcon /> },
            ]}
          />
          <Button size="sm" onClick={openNew}>
            + Nuevo acceso
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>
          {items.length === 0
            ? "Todavía no cargaste accesos. Sumá servidores, bases, paneles o servicios."
            : "Ningún acceso coincide con los filtros."}
        </EmptyState>
      ) : view === "card" ? (
        <div className="grid animate-slide-up gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CredentialCard
              key={c.id}
              cred={c}
              view="card"
              onEdit={() => openEdit(c)}
              onDelete={() => remove(c)}
            />
          ))}
        </div>
      ) : (
        <div className="animate-slide-up overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
          {filtered.map((c) => (
            <CredentialCard
              key={c.id}
              cred={c}
              view="list"
              onEdit={() => openEdit(c)}
              onDelete={() => remove(c)}
            />
          ))}
        </div>
      )}

      {showForm ? (
        <Modal
          title={editingId ? "Editar acceso" : "Nuevo acceso"}
          description="Usuario, contraseña/token y URL. El secreto se guarda cifrado."
          onClose={() => setShowForm(false)}
          className="max-w-2xl"
        >
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Título">
                <Input
                  autoFocus
                  value={form.titulo}
                  onChange={(e) => setField("titulo", e.target.value)}
                  placeholder="VPS Hetzner, Panel de Vercel…"
                />
              </Field>
              <Field label="Tipo">
                <Select
                  value={form.tipo}
                  onChange={(e) => setField("tipo", e.target.value as CredentialType)}
                >
                  {CREDENTIAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CREDENTIAL_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Usuario / email">
                <Input
                  value={form.usuario}
                  onChange={(e) => setField("usuario", e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field
                label={
                  editingId ? "Contraseña / token (vacío = sin cambios)" : "Contraseña / token"
                }
              >
                <Input
                  type="password"
                  value={form.secreto}
                  onChange={(e) => setField("secreto", e.target.value)}
                  autoComplete="new-password"
                  placeholder={editingId ? "••••••••" : ""}
                />
              </Field>
              <Field label="URL">
                <Input
                  value={form.url}
                  onChange={(e) => setField("url", e.target.value)}
                  placeholder="https://…"
                  autoComplete="off"
                />
              </Field>
              <Field label="Proyecto">
                <Select
                  value={form.projectId}
                  onChange={(e) => setField("projectId", e.target.value)}
                >
                  <option value="">— sin asignar —</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notas">
              <Textarea
                rows={2}
                value={form.notas}
                onChange={(e) => setField("notas", e.target.value)}
                placeholder="Detalles, 2FA, contacto de soporte…"
              />
            </Field>
            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear acceso"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

function CredentialCard({
  cred,
  view,
  onEdit,
  onDelete,
}: {
  cred: CredentialRow
  view: "card" | "list"
  onEdit: () => void
  onDelete: () => void
}) {
  const [secret, setSecret] = useState<string | null>(null)
  const [loading, startReveal] = useTransition()
  const [copied, setCopied] = useState(false)
  const tieneSecreto = Boolean(cred.tieneSecreto)

  // Trae el secreto (descifrado en el server) una sola vez y lo cachea en memoria.
  function ensureSecret(then?: (v: string) => void) {
    if (secret !== null) {
      then?.(secret)
      return
    }
    startReveal(async () => {
      const res = await revealSecret(cred.id)
      if (res.value !== undefined) {
        setSecret(res.value)
        then?.(res.value)
      }
    })
  }

  const [shown, setShown] = useState(false)
  function toggle() {
    if (shown) {
      setShown(false)
      return
    }
    ensureSecret(() => setShown(true))
  }

  async function copy() {
    ensureSecret(async (v) => {
      try {
        await navigator.clipboard.writeText(v)
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      } catch {
        // Sin permiso de portapapeles: al menos lo mostramos.
        setShown(true)
      }
    })
  }

  const secretControls = tieneSecreto ? (
    <>
      <IconBtn label={shown ? "Ocultar" : "Mostrar"} onClick={toggle} disabled={loading}>
        {shown ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
      </IconBtn>
      <IconBtn label={copied ? "Copiado" : "Copiar"} onClick={copy} disabled={loading}>
        <CopyIcon size={16} className={cn(copied && "text-green-600 dark:text-green-400")} />
      </IconBtn>
    </>
  ) : null

  // Vista lista: fila compacta.
  if (view === "list") {
    return (
      <div className="flex items-center gap-3 border-b border-black/[.06] bg-white px-4 py-3 transition-colors last:border-0 hover:bg-zinc-50 dark:border-white/[.08] dark:bg-zinc-900 dark:hover:bg-zinc-800/50">
        <Badge tone={CREDENTIAL_TYPE_TONE[cred.tipo]}>{CREDENTIAL_TYPE_LABELS[cred.tipo]}</Badge>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-tight" title={cred.titulo}>
            {cred.titulo}
          </div>
          <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-500">
            {cred.usuario ? <span className="truncate">{cred.usuario}</span> : null}
            {cred.usuario && cred.proyectoNombre ? <span className="text-zinc-300">·</span> : null}
            {cred.proyectoNombre ? (
              <span className="truncate text-zinc-400">{cred.proyectoNombre}</span>
            ) : null}
            {cred.notas ? (
              <>
                {cred.usuario || cred.proyectoNombre ? (
                  <span className="text-zinc-300">·</span>
                ) : null}
                <span className="truncate text-zinc-400" title={cred.notas}>
                  {cred.notas}
                </span>
              </>
            ) : null}
            {!cred.usuario && !cred.proyectoNombre && !cred.notas ? (
              <span className="text-zinc-400">—</span>
            ) : null}
          </div>
        </div>
        {tieneSecreto && shown ? (
          <code className="hidden max-w-[10rem] truncate rounded bg-black/[.04] px-2 py-1 text-xs sm:block dark:bg-white/[.08]">
            {secret ?? "…"}
          </code>
        ) : null}
        <div className="flex shrink-0 items-center gap-0.5">
          {secretControls}
          {cred.url ? (
            <a
              href={cred.url}
              target="_blank"
              rel="noreferrer"
              title="Abrir"
              aria-label="Abrir enlace"
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-black/[.05] hover:text-blue-600 dark:hover:bg-white/[.08] dark:hover:text-blue-400"
            >
              <ExternalLinkIcon size={16} />
            </a>
          ) : null}
          <KebabMenu onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    )
  }

  return (
    <div className="group relative flex flex-col rounded-xl border border-black/[.08] bg-white p-4 transition-colors hover:border-zinc-300 dark:border-white/[.12] dark:bg-zinc-900 dark:hover:border-zinc-600">
      <div className="absolute right-2 top-2">
        <KebabMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      <div className="flex items-start gap-2 pr-6">
        <Badge tone={CREDENTIAL_TYPE_TONE[cred.tipo]}>{CREDENTIAL_TYPE_LABELS[cred.tipo]}</Badge>
      </div>
      <div className="mt-2 truncate font-semibold leading-tight" title={cred.titulo}>
        {cred.titulo}
      </div>

      {cred.usuario ? (
        <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-zinc-500">
          <UserIcon size={13} className="shrink-0 opacity-70" />
          <span className="truncate">{cred.usuario}</span>
        </div>
      ) : null}

      {/* Secreto */}
      <div className="mt-3 flex items-center gap-1.5">
        <KeyIcon size={14} className="shrink-0 text-zinc-400" />
        {tieneSecreto ? (
          <>
            <code className="min-w-0 flex-1 truncate rounded bg-black/[.04] px-2 py-1 text-xs dark:bg-white/[.08]">
              {shown ? (secret ?? "…") : "••••••••••"}
            </code>
            <IconBtn label={shown ? "Ocultar" : "Mostrar"} onClick={toggle} disabled={loading}>
              {shown ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </IconBtn>
            <IconBtn label={copied ? "Copiado" : "Copiar"} onClick={copy} disabled={loading}>
              <CopyIcon size={16} className={cn(copied && "text-green-600 dark:text-green-400")} />
            </IconBtn>
          </>
        ) : (
          <span className="text-xs text-zinc-400">Sin contraseña</span>
        )}
      </div>

      {/* URL + proyecto */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/[.06] pt-3 text-xs dark:border-white/[.08]">
        {cred.url ? (
          <a
            href={cred.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLinkIcon size={13} />
            Abrir
          </a>
        ) : null}
        {cred.proyectoNombre ? <span className="text-zinc-400">{cred.proyectoNombre}</span> : null}
        <span className="ml-auto text-zinc-400">{formatDate(cred.updatedAt)}</span>
      </div>

      {cred.notas ? (
        <p className="mt-2 line-clamp-2 text-xs text-zinc-500" title={cred.notas}>
          {cred.notas}
        </p>
      ) : null}
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-black/[.05] hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/[.08] dark:hover:text-zinc-200"
    >
      {children}
    </button>
  )
}
