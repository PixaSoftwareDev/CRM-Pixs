"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import {
  DownloadIcon,
  FileIcon,
  FilePdfIcon,
  ImageIcon,
  SheetIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui"
import type { DocumentEntity } from "@/db/schema"
import { asset } from "@/lib/basePath"
import { cn, formatDate } from "@/lib/utils"
import { deleteDocument, uploadDocument } from "@/modules/documents/actions"
import type { DocumentRow } from "@/modules/documents/queries"
import {
  ALLOWED_DOCUMENT_TYPES,
  documentKind,
  formatBytes,
  isPreviewable,
  MAX_DOCUMENT_SIZE,
} from "@/modules/documents/shared"

const KIND_ICON = {
  pdf: FilePdfIcon,
  image: ImageIcon,
  sheet: SheetIcon,
  doc: FileIcon,
  other: FileIcon,
}

const KIND_TONE = {
  pdf: "text-red-500",
  image: "text-violet-500",
  sheet: "text-green-600",
  doc: "text-blue-500",
  other: "text-zinc-400",
}

export function DocumentsClient({
  entityType,
  entityId,
  initial,
}: {
  entityType: DocumentEntity
  entityId: string
  initial: DocumentRow[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [error, setError] = useState<string>()
  const [uploading, startUpload] = useTransition()
  const [, startDelete] = useTransition()
  const [preview, setPreview] = useState<DocumentRow | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Resync tras revalidación del server.
  useEffect(() => setItems(initial), [initial])

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Permite re-subir el mismo archivo (limpia el value).
    e.target.value = ""
    if (!file) return

    setError(undefined)
    if (file.size > MAX_DOCUMENT_SIZE) {
      setError("El archivo supera los 20 MB")
      return
    }
    if (!ALLOWED_DOCUMENT_TYPES[file.type]) {
      setError("Tipo no permitido (PDF, imágenes, Office, texto o ZIP)")
      return
    }

    const fd = new FormData()
    fd.set("entityType", entityType)
    fd.set("entityId", entityId)
    fd.set("file", file)

    startUpload(async () => {
      const res = await uploadDocument({}, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function remove(doc: DocumentRow) {
    const prev = items
    setItems((cur) => cur.filter((d) => d.id !== doc.id))
    if (preview?.id === doc.id) setPreview(null)
    startDelete(async () => {
      const res = await deleteDocument(doc.id)
      if (res.error) {
        setItems(prev) // rollback
        setError(res.error)
      }
    })
  }

  function open(doc: DocumentRow) {
    if (isPreviewable(doc.mimeType)) setPreview(doc)
    else window.open(asset(`/api/documentos/${doc.id}?download=1`), "_blank")
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Documentos</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <UploadIcon size={15} />
          {uploading ? "Subiendo…" : "Subir"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onPick}
          accept={Object.keys(ALLOWED_DOCUMENT_TYPES).join(",")}
        />
      </div>

      {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-black/[.14] px-4 py-8 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-white/[.16] dark:hover:border-zinc-500 dark:hover:text-zinc-300"
        >
          <UploadIcon size={22} className="opacity-70" />
          Subí contratos, propuestas u otros archivos (PDF, imágenes, Office… hasta 20 MB)
        </button>
      ) : (
        <ul className="space-y-2">
          {items.map((doc) => {
            const kind = documentKind(doc.mimeType)
            const Icon = KIND_ICON[kind]
            return (
              <li
                key={doc.id}
                className="group flex items-center gap-3 rounded-lg border border-black/[.08] bg-white px-3 py-2.5 transition-colors hover:border-zinc-300 dark:border-white/[.12] dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                <button
                  type="button"
                  onClick={() => open(doc)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Icon size={22} className={cn("shrink-0", KIND_TONE[kind])} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{doc.nombre}</div>
                    <div className="truncate text-xs text-zinc-400">
                      {formatBytes(doc.tamano)} · {formatDate(doc.createdAt)}
                      {doc.subidoPorNombre ? ` · ${doc.subidoPorNombre}` : ""}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <a
                    href={asset(`/api/documentos/${doc.id}?download=1`)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-black/[.05] hover:text-zinc-700 dark:hover:bg-white/[.08] dark:hover:text-zinc-200"
                    title="Descargar"
                    aria-label={`Descargar ${doc.nombre}`}
                  >
                    <DownloadIcon size={17} />
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(doc)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    title="Eliminar"
                    aria-label={`Eliminar ${doc.nombre}`}
                  >
                    <TrashIcon size={17} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {preview ? (
        <Modal
          title={preview.nombre}
          description={`${formatBytes(preview.tamano)} · ${formatDate(preview.createdAt)}`}
          onClose={() => setPreview(null)}
          className="max-w-4xl"
        >
          <div className="space-y-3">
            {preview.mimeType === "application/pdf" ? (
              <iframe
                src={asset(`/api/documentos/${preview.id}`)}
                title={preview.nombre}
                className="h-[72vh] w-full rounded-lg border border-black/[.08] dark:border-white/[.12]"
              />
            ) : (
              // biome-ignore lint/performance/noImgElement: contenido dinámico servido por nuestra API, no optimizable por next/image
              <img
                src={asset(`/api/documentos/${preview.id}`)}
                alt={preview.nombre}
                className="mx-auto max-h-[72vh] rounded-lg"
              />
            )}
            <div className="flex justify-end">
              <a href={asset(`/api/documentos/${preview.id}?download=1`)}>
                <Button size="sm" variant="secondary">
                  <DownloadIcon size={15} />
                  Descargar
                </Button>
              </a>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
