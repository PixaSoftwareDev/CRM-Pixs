"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useConfirm } from "@/components/ConfirmDialog"
import { CopyIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, UserIcon } from "@/components/icons"
import { KebabMenu } from "@/components/KebabMenu"
import { Modal } from "@/components/Modal"
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
} from "@/components/ui"
import { ColorSelect } from "@/components/ui/ColorSelect"

import { cn } from "@/lib/utils"
import {
  createCredential,
  deleteCredential,
  revealSecret,
  updateCredential,
} from "@/modules/credentials/actions"
import type { CredentialRow, ProjectOption } from "@/modules/credentials/queries"
import { etiquetaDeTipo, TIPOS_SUGERIDOS, tonoDeTipo } from "@/modules/credentials/shared"

type Form = {
  titulo: string
  tipo: string
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
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, startSave] = useTransition()
  const [, startDelete] = useTransition()

  useEffect(() => setItems(initial), [initial])

  // Tipos realmente cargados: alimentan el filtro y las sugerencias.
  const tiposUsados = useMemo(
    () => [...new Set(items.map((c) => c.tipo).filter(Boolean))].sort(),
    [items],
  )
  const sugerencias = useMemo(
    () => [...new Set([...tiposUsados, ...TIPOS_SUGERIDOS])],
    [tiposUsados],
  )

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
    setShowSecret(false)
    setEditingId(null)
    setForm({ ...EMPTY, projectId: projectFilter })
    setShowForm(true)
  }

  function openEdit(c: CredentialRow) {
    setError(undefined)
    setShowSecret(false)
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
      {/* Misma cabecera que Clientes y Proyectos: título, bajada y la acción
          principal arriba a la derecha. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Accesos"
          subtitle="Usuarios, contraseñas y URLs de todo lo que tenemos. Los secretos se guardan cifrados."
        />
        <Button onClick={openNew}>+ Nuevo acceso</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} />
        {proyectos.length > 0 ? (
          <ColorSelect
            className="w-52"
            value={projectFilter}
            onChange={setProjectFilter}
            ariaLabel="Proyecto"
            options={[
              { value: "", label: "Todos los proyectos" },
              ...proyectos.map((p) => ({ value: p.id, label: p.nombre })),
            ]}
          />
        ) : null}
        <ColorSelect
          className="w-44"
          value={tipoFilter}
          onChange={setTipoFilter}
          ariaLabel="Tipo"
          options={[
            { value: "", label: "Todos los tipos" },
            ...tiposUsados.map((t) => ({ value: t, label: etiquetaDeTipo(t) })),
          ]}
        />
        <span className="ml-auto text-sm text-zinc-500">
          {filtered.length} {filtered.length === 1 ? "acceso" : "accesos"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>
          {items.length === 0
            ? "Todavía no cargaste accesos. Sumá servidores, bases, paneles o servicios."
            : "Ningún acceso coincide con los filtros."}
        </EmptyState>
      ) : (
        <div className="animate-slide-up overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/[.08] bg-zinc-50 text-left dark:border-white/[.12] dark:bg-zinc-900">
                <th className={TH}>Tipo</th>
                <th className={TH}>Acceso</th>
                <th className={cn(TH, "hidden md:table-cell")}>Usuario</th>
                <th className={cn(TH, "hidden xl:table-cell")}>Proyecto</th>
                <th className={TH}>Contraseña</th>
                <th className={cn(TH, "w-24 text-right")}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <CredentialRowItem
                  key={c.id}
                  cred={c}
                  primera={i === 0}
                  onEdit={() => openEdit(c)}
                  onDelete={() => remove(c)}
                />
              ))}
            </tbody>
          </table>
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
                  placeholder="Nombre"
                />
              </Field>
              <Field label="Tipo">
                {/* Texto libre con sugerencias de lo ya usado: evita que el
                    mismo tipo termine escrito de cinco formas distintas. */}
                <Input
                  list="tipos-de-acceso"
                  value={form.tipo}
                  onChange={(e) => setField("tipo", e.target.value)}
                  placeholder="Tipo"
                  maxLength={60}
                />
                <datalist id="tipos-de-acceso">
                  {sugerencias.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
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
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={form.secreto}
                    onChange={(e) => setField("secreto", e.target.value)}
                    autoComplete="new-password"
                    placeholder={editingId ? "••••••••" : ""}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    title={showSecret ? "Ocultar" : "Mostrar"}
                    aria-label={showSecret ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    {showSecret ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
              </Field>
              <Field label="URL">
                <Input
                  value={form.url}
                  onChange={(e) => setField("url", e.target.value)}
                  placeholder="https://"
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
                placeholder="Notas"
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

// Clases compartidas de celda, para no repetirlas columna por columna.
const TH = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
const TD = "px-4 py-2.5 align-middle"

/**
 * Una fila de la tabla de accesos. El secreto se pide al server solo cuando se
 * lo muestra o copia, y queda cacheado en memoria mientras dure la vista.
 */
function CredentialRowItem({
  cred,
  primera,
  onEdit,
  onDelete,
}: {
  cred: CredentialRow
  primera: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [secret, setSecret] = useState<string | null>(null)
  const [loading, startReveal] = useTransition()
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState(false)
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

  return (
    <tr
      className={cn(
        "bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50",
        !primera && "border-t border-black/[.06] dark:border-white/[.08]",
      )}
    >
      <td className={TD}>
        <Badge tone={tonoDeTipo(cred.tipo)}>{etiquetaDeTipo(cred.tipo)}</Badge>
      </td>
      <td className={TD}>
        <div className="truncate font-medium" title={cred.titulo}>
          {cred.titulo}
        </div>
        {cred.notas ? (
          <div className="truncate text-xs text-zinc-400" title={cred.notas}>
            {cred.notas}
          </div>
        ) : null}
      </td>
      <td className={cn(TD, "hidden md:table-cell text-zinc-600 dark:text-zinc-300")}>
        {cred.usuario ? (
          <span className="flex items-center gap-1.5">
            <UserIcon size={13} className="shrink-0 opacity-60" />
            <span className="truncate">{cred.usuario}</span>
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className={cn(TD, "hidden xl:table-cell text-zinc-500")}>
        {cred.proyectoNombre ?? <span className="text-zinc-400">—</span>}
      </td>
      <td className={TD}>
        {tieneSecreto ? (
          <div className="flex items-center gap-1">
            <code className="max-w-[12rem] truncate rounded bg-black/[.04] px-2 py-1 text-xs dark:bg-white/[.08]">
              {shown ? (secret ?? "…") : "••••••••••"}
            </code>
            <IconBtn label={shown ? "Ocultar" : "Mostrar"} onClick={toggle} disabled={loading}>
              {shown ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </IconBtn>
            <IconBtn label={copied ? "Copiado" : "Copiar"} onClick={copy} disabled={loading}>
              <CopyIcon size={16} className={cn(copied && "text-green-600 dark:text-green-400")} />
            </IconBtn>
          </div>
        ) : (
          <span className="text-xs text-zinc-400">Sin contraseña</span>
        )}
      </td>
      <td className={cn(TD, "text-right")}>
        <div className="flex items-center justify-end gap-0.5">
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
      </td>
    </tr>
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
