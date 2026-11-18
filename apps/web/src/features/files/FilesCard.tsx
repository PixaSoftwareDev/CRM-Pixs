import { type Area, FILE_MAX_BYTES, FILE_MAX_LABEL, type FileDto, type FileOwnerQuery } from "@crm/shared";
import { Link } from "@tanstack/react-router";
import { Download, File, FileArchive, FileImage, FileSpreadsheet, FileText, Trash2, Upload } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { cn } from "../../components/ui/cn";
import { Empty, ErrorBox, Skeleton } from "../../components/ui/States";
import { useAccess } from "../../hooks/useAccess";
import { ago } from "../../lib/format";
import { fileUrl, uploadFile, useDeleteFile, useFiles, useFilesChanged } from "./api";

interface Upload {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function FileIcon({ file }: { file: FileDto }) {
  const m = file.mimeType;
  const name = file.filename.toLowerCase();
  const Icon = m.startsWith("image/")
    ? FileImage
    : /zip|rar|7z|tar|gzip/.test(m) || /\.(zip|rar|7z|tar|gz)$/.test(name)
      ? FileArchive
      : /sheet|excel|csv/.test(m) || /\.(xlsx?|ods|csv)$/.test(name)
        ? FileSpreadsheet
        : m === "application/pdf" || /word|document|text/.test(m)
          ? FileText
          : File;
  return <Icon size={18} aria-hidden className="shrink-0 text-slate-500" />;
}

/**
 * Contenedor de archivos de un cliente, un proyecto o un ticket. Se suben
 * varios a la vez (botón o arrastrando) y cada uno muestra su avance.
 * En la ficha del cliente aparecen también los de sus proyectos y tickets,
 * agrupados; en la del proyecto, los de sus tickets.
 */
export function FilesCard({ owner, area, className }: { owner: FileOwnerQuery; area: Area; className?: string }) {
  const files = useFiles(owner);
  const { can } = useAccess();
  const canEdit = can(area, "edit");
  const changed = useFilesChanged();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = uploads.some((u) => !u.error && u.progress < 1);

  const patch = (key: string, p: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...p } : u)));

  const send = async (list: FileList | File[]) => {
    const picked = [...list].map((file) => ({ file, key: `${file.name}-${file.size}-${Math.random()}` }));
    if (!picked.length) return;
    setUploads((u) => [
      ...u.filter((x) => x.error),
      ...picked.map(({ file, key }) => ({
        key,
        name: file.name,
        progress: 0,
        ...(file.size > FILE_MAX_BYTES && { error: `Pesa ${fileSize(file.size)}: el máximo es ${FILE_MAX_LABEL}.` }),
      })),
    ]);
    // De a uno: así cada pedido entra en el límite del servidor y el avance se entiende.
    for (const { file, key } of picked) {
      if (file.size > FILE_MAX_BYTES) continue;
      try {
        await uploadFile(owner, file, (f) => patch(key, { progress: Math.min(f, 0.99) }));
        setUploads((u) => u.filter((x) => x.key !== key));
        await changed();
      } catch (err) {
        patch(key, { error: err instanceof Error ? err.message : "No se pudo subir." });
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (canEdit && e.dataTransfer.files.length) void send(e.dataTransfer.files);
  };

  const mainId = owner.clientId ?? owner.projectId ?? owner.ticketId ?? owner.taskId;
  const groups = groupByOwner(files.data ?? [], mainId);

  return (
    <Card
      className={cn("relative flex flex-col gap-3 p-5", dragging && "ring-2 ring-brand", className)}
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">
          Archivos
          {files.data && files.data.length > 0 && <span className="ml-1.5 text-sm font-normal text-muted">({files.data.length})</span>}
        </h2>
        {canEdit && (
          <>
            <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
              <Upload size={14} aria-hidden /> {busy ? "Subiendo…" : "Subir archivos"}
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              aria-label="Elegir archivos para subir"
              onChange={(e) => {
                if (e.target.files) void send(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {uploads.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.key} className={cn("rounded-[10px] px-3 py-2 text-sm", u.error ? "bg-red-50 text-red-800" : "bg-slate-50")}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium" title={u.name}>
                  {u.name}
                </span>
                {u.error ? (
                  <button
                    type="button"
                    aria-label={`Cerrar el aviso de ${u.name}`}
                    className="shrink-0 text-xs underline"
                    onClick={() => setUploads((l) => l.filter((x) => x.key !== u.key))}
                  >
                    Cerrar
                  </button>
                ) : (
                  <span className="text-xs text-muted tabular-nums">{Math.round(u.progress * 100)}%</span>
                )}
              </div>
              {u.error ? (
                <p role="alert" className="text-xs">
                  {u.error}
                </p>
              ) : (
                <span
                  role="progressbar"
                  aria-label={`Subiendo ${u.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(u.progress * 100)}
                  className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200"
                >
                  <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.max(u.progress * 100, 3)}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.error ? (
        <ErrorBox error={files.error} onRetry={() => void files.refetch()} />
      ) : files.isPending ? (
        <Skeleton className="h-16" />
      ) : groups.length === 0 ? (
        <Empty>
          {canEdit
            ? `Todavía no hay archivos. Subí contratos, presupuestos, capturas o lo que haga falta (hasta ${FILE_MAX_LABEL} cada uno), con el botón o arrastrándolos acá.`
            : "Todavía no hay archivos."}
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-1">
              {groups.length > 1 || g.key !== "main" ? <GroupTitle group={g} main={owner.clientId ? "Del cliente" : owner.projectId ? "Del proyecto" : owner.ticketId ? "Del ticket" : "De la tarea"} /> : null}
              <ul className="flex flex-col divide-y divide-slate-100">
                {g.files.map((f) => (
                  <FileRow key={f.id} file={f} canEdit={canEdit} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[14px] bg-indigo-50/90 text-sm font-semibold text-brand">
          Soltá los archivos para subirlos
        </div>
      )}
    </Card>
  );
}

interface Group {
  key: string;
  owner: FileDto["owner"] | null;
  files: FileDto[];
}

/** Los del dueño principal primero; después uno por proyecto o ticket. */
function groupByOwner(files: FileDto[], mainId: string | undefined): Group[] {
  const main: Group = { key: "main", owner: null, files: [] };
  const others = new Map<string, Group>();
  for (const f of files) {
    if (f.owner.id === mainId) {
      main.files.push(f);
      continue;
    }
    const g = others.get(f.owner.id) ?? { key: f.owner.id, owner: f.owner, files: [] };
    g.files.push(f);
    others.set(f.owner.id, g);
  }
  const rest = [...others.values()].sort((a, b) => (a.owner?.kind ?? "").localeCompare(b.owner?.kind ?? "") || (a.owner?.name ?? "").localeCompare(b.owner?.name ?? ""));
  return [...(main.files.length ? [main] : []), ...rest];
}

function GroupTitle({ group, main }: { group: Group; main: string }) {
  const o = group.owner;
  const cls = "text-xs font-semibold tracking-wide text-muted uppercase";
  if (!o) return <h3 className={cls}>{main}</h3>;
  if (o.kind === "project") {
    return (
      <h3 className={cls}>
        Proyecto{" "}
        <Link to="/proyectos/$projectId" params={{ projectId: o.id }} className="normal-case text-brand hover:underline">
          {o.name}
        </Link>
      </h3>
    );
  }
  if (o.kind === "ticket") {
    return (
      <h3 className={cls}>
        Ticket{" "}
        <Link to="/tickets/$ticketId" params={{ ticketId: o.id }} className="normal-case text-brand hover:underline">
          {o.name}
        </Link>
      </h3>
    );
  }
  return <h3 className={cls}>Del cliente</h3>;
}

function FileRow({ file: f, canEdit }: { file: FileDto; canEdit: boolean }) {
  const del = useDeleteFile();
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <FileIcon file={f} />
      <span className="min-w-0 flex-1">
        <a href={fileUrl(f.id)} target="_blank" rel="noopener" className="block truncate text-sm font-medium hover:underline" title={f.filename}>
          {f.filename}
        </a>
        <span className="block text-xs text-muted">
          {fileSize(f.sizeBytes)} · {f.uploadedBy?.name ?? "Alguien"} · {ago(f.createdAt)}
        </span>
      </span>
      {confirming ? (
        <span className="flex flex-wrap items-center gap-1.5 text-xs">
          ¿Borrarlo?
          <Button size="sm" variant="danger" disabled={del.isPending} onClick={() => del.mutate(f.id)}>
            Sí, borrar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            No
          </Button>
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <a
            href={fileUrl(f.id, true)}
            download
            aria-label={`Descargar ${f.filename}`}
            title="Descargar"
            className="flex size-8 items-center justify-center rounded-[10px] text-slate-600 hover:bg-slate-100"
          >
            <Download size={15} aria-hidden />
          </a>
          {canEdit && f.canDelete && (
            <button
              type="button"
              aria-label={`Borrar ${f.filename}`}
              title="Borrar"
              onClick={() => setConfirming(true)}
              className="flex size-8 items-center justify-center rounded-[10px] text-slate-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          )}
        </span>
      )}
      {del.error && (
        <p role="alert" className="w-full text-xs text-red-700">
          {del.error.message}
        </p>
      )}
    </li>
  );
}
