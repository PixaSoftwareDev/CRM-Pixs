import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'

interface FileDropzoneProps {
  onFile: (file: File) => void
  pending?: boolean
  hint?: string
  compact?: boolean
}

// FileDropzone is a drag-and-drop area (with click-to-browse) for a single file.
export function FileDropzone({ onFile, pending, hint, compact }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (files: FileList | null) => {
    const f = files?.[0]
    if (f) onFile(f)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !pending && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !pending) inputRef.current?.click()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!pending) pick(e.dataTransfer.files)
      }}
      className={
        'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors ' +
        (compact ? 'gap-1 px-4 py-4' : 'gap-2 px-6 py-8') + ' ' +
        (dragging
          ? 'border-brand bg-brand/10'
          : 'border-border bg-surface-subtle hover:border-brand/60 hover:bg-surface')
      }
    >
      <UploadCloud size={compact ? 20 : 28} className={dragging ? 'text-brand' : 'text-text-tertiary'} />
      <p className="text-sm font-medium text-text">
        {pending ? 'Subiendo…' : 'Arrastrá un archivo o hacé clic para elegir'}
      </p>
      {hint && !pending && <p className="text-xs text-text-tertiary">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        disabled={pending}
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
