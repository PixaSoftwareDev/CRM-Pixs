import type { TaskDetailDto, TaskStatus, TaskUpdate } from "@pixs/shared";
import { Link } from "@tanstack/react-router";
import { Check, Receipt, Users } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { ago, initials } from "../../lib/format";
import { useClientTasks } from "../clients/api";
import { useAddTaskComment, useMyId, useTask, useTeam, useUpdateTask } from "./api";
import { EDITABLE_STATUSES, TASK_STATUS, tint } from "./labels";
import { arParts, durationLabel, shortDay, toHHMM, toInstant, toMinutes } from "./time";

interface Edit {
  date: string;
  start: string;
  end: string;
  assigneeId: string;
  status: TaskStatus;
}

function editOf(t: TaskDetailDto): Edit {
  const p = t.startsAt ? arParts(t.startsAt) : null;
  return {
    date: p?.date ?? "",
    start: p?.time ?? "",
    end: p ? toHHMM(p.minutes + t.durationMinutes) : "",
    assigneeId: t.assignee.id,
    status: t.status,
  };
}

/** Lo que cambió respecto de la tarea guardada, listo para el PATCH. */
function diff(t: TaskDetailDto, e: Edit, comment: string): TaskUpdate {
  const o = editOf(t);
  const patch: TaskUpdate = {};
  if (e.date && e.start && e.end && (e.date !== o.date || e.start !== o.start || e.end !== o.end)) {
    patch.startsAt = toInstant(e.date, e.start);
    patch.durationMinutes = toMinutes(e.end) - toMinutes(e.start);
  }
  if (e.assigneeId !== o.assigneeId) patch.assigneeId = e.assigneeId;
  if (e.status !== o.status) patch.status = e.status;
  if (comment.trim()) patch.comment = comment.trim();
  return patch;
}

/**
 * Detalle de una tarea. Al costado, las demás tareas del mismo cliente para
 * saltar entre ellas sin cerrar. Si hay cambios sin guardar, avisa antes de salir.
 */
export function TaskDialog({
  taskId,
  onClose,
  onSaved,
}: {
  taskId: string | null;
  onClose: () => void;
  onSaved?: (summary: string) => void;
}) {
  const [currentId, setCurrentId] = useState(taskId);
  useEffect(() => setCurrentId(taskId), [taskId]);
  // Esc y el clic afuera pasan por el mismo control de cambios sin guardar que "Cerrar".
  const requestClose = useRef(onClose);

  return (
    <Dialog open={!!taskId} onClose={() => requestClose.current()} title="Tarea" size="xl">
      {currentId && (
        <TaskBody
          key={currentId}
          id={currentId}
          onSwitch={setCurrentId}
          onClose={onClose}
          onSaved={onSaved}
          requestClose={requestClose}
        />
      )}
    </Dialog>
  );
}

function TaskBody({
  id,
  onSwitch,
  onClose,
  onSaved,
  requestClose,
}: {
  id: string;
  onSwitch: (id: string) => void;
  onClose: () => void;
  onSaved?: ((summary: string) => void) | undefined;
  requestClose: RefObject<() => void>;
}) {
  const me = useMyId();
  const task = useTask(id);
  const team = useTeam();
  const update = useUpdateTask();
  const addComment = useAddTaskComment(id);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [comment, setComment] = useState("");
  /** Acción que quedó esperando porque había cambios sin guardar. */
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (task.data && !edit) setEdit(editOf(task.data));
  }, [task.data, edit]);

  // Mientras carga no hay nada que perder: cerrar cierra.
  requestClose.current = onClose;

  if (task.error) return <ErrorBox error={task.error} onRetry={() => void task.refetch()} />;
  if (!task.data || !edit) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const t = task.data;
  const patch = diff(t, edit, comment);
  const dirty = Object.keys(patch).length > 0;
  const minutes = edit.start && edit.end ? toMinutes(edit.end) - toMinutes(edit.start) : 0;
  const badRange = !!edit.start && !!edit.end && minutes <= 0;
  const set = (k: keyof Edit) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEdit({ ...edit, [k]: e.target.value });

  const guard = (action: () => void) => (dirty ? setPending(() => action) : action());
  requestClose.current = () => guard(onClose);

  const save = async (extra: TaskUpdate = {}) => {
    const body = { ...patch, ...extra };
    if (Object.keys(body).length) await update.mutateAsync({ id, ...body });
    const who = body.assigneeId ? team.data?.find((u) => u.id === body.assigneeId)?.name : null;
    const when = body.startsAt ? ` para el ${shortDay(edit.date)} ${edit.start}` : "";
    onSaved?.(
      body.status === "hecha"
        ? `Finalizada "${t.title}".`
        : `Guardado "${t.title}"${who ? `: ahora está en la agenda de ${who}` : ""}${when}.`,
    );
  };

  const saveAnd = async (after: () => void, extra?: TaskUpdate) => {
    await save(extra);
    setPending(null);
    after();
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    await addComment.mutateAsync({ body: comment.trim() });
    setComment("");
  };

  const resp = t.assignee.id === me ? "vos" : t.assignee.name;
  const passedBy = t.assignedBy && t.assignedBy.id !== t.assignee.id ? ` · te la pasó ${t.assignedBy.name}` : "";
  const when = t.startsAt ? `${shortDay(arParts(t.startsAt).date)} ${arParts(t.startsAt).time}` : "Sin fecha";

  return (
    <div className="flex flex-col gap-4">
      {t.client && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <Link
              to="/clientes/$clientId"
              params={{ clientId: t.client.id }}
              className="font-bold text-ink hover:underline"
            >
              {t.client.name} ↗
            </Link>
            {t.contact && (
              <p className="truncate text-xs text-muted">
                {[t.contact.name, t.contact.phone, t.contact.email].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              to="/clientes/$clientId"
              params={{ clientId: t.client.id }}
              search={{ tab: "datos" }}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line bg-white px-2.5 text-xs font-semibold hover:bg-slate-50"
            >
              <Users size={14} aria-hidden /> Contactos
            </Link>
            <Link
              to="/clientes/$clientId"
              params={{ clientId: t.client.id }}
              search={{ tab: "cuenta" }}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line bg-white px-2.5 text-xs font-semibold hover:bg-slate-50"
            >
              <Receipt size={14} aria-hidden /> Cta. cte.
            </Link>
          </div>
        </div>
      )}

      <div className={cn("grid gap-4", t.client && "md:grid-cols-[280px_1fr]")}>
        {t.client && <ClientTasks clientId={t.client.id} currentId={id} onPick={(next) => guard(() => onSwitch(next))} />}

        <section className="flex min-w-0 flex-col gap-3">
          <div
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl px-4 py-3"
            style={{ background: tint(t.type.color), boxShadow: `inset 5px 0 0 ${t.type.color}` }}
          >
            <div className="min-w-0">
              <h3 className={cn("font-bold", t.status === "hecha" && "line-through")}>{t.title}</h3>
              <p className="text-xs text-slate-600">
                {t.type.name} · {when} · responsable: {resp}
                {passedBy}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Estado
              <Select value={edit.status} onChange={set("status")} className="h-8 w-auto bg-white">
                {EDITABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <h4 className="text-sm font-bold">Comentarios</h4>
          <ol className="flex max-h-64 flex-col gap-2.5 overflow-y-auto">
            {t.comments.length === 0 && <li className="text-sm text-muted">Todavía no hay comentarios en esta tarea.</li>}
            {t.comments.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-800">
                  {initials(c.authorName ?? "Sistema")}
                </span>
                <div className="min-w-0">
                  <p className="text-sm">{c.body}</p>
                  <p className="text-xs text-muted">
                    {c.authorName ?? "Sistema"} · {ago(c.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Comentario</span>
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void sendComment())}
                placeholder="Escribí un comentario sobre la tarea…"
                maxLength={2000}
              />
            </label>
            <Button variant="secondary" onClick={() => void sendComment()} disabled={!comment.trim() || addComment.isPending}>
              Comentar
            </Button>
          </div>
        </section>
      </div>

      <footer className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Fecha">
            <Input type="date" value={edit.date} onChange={set("date")} className="w-40" />
          </Field>
          <Field label="De">
            <Input type="time" step={300} value={edit.start} onChange={set("start")} className="w-28" />
          </Field>
          <Field label="Hasta" error={badRange ? "Revisá el horario" : undefined}>
            <Input type="time" step={300} value={edit.end} onChange={set("end")} aria-invalid={badRange} className="w-28" />
          </Field>
          {minutes > 0 && <span className="pb-2.5 text-xs text-muted">{durationLabel(minutes)}</span>}
          <Field label="Responsable" className="ml-auto">
            <Select value={edit.assigneeId} onChange={set("assigneeId")} className="w-44">
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me ? `${u.name} (yo)` : u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {(update.error ?? addComment.error) && (
          <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">
            {(update.error ?? addComment.error)?.message}
          </p>
        )}

        {pending ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <span>
              <strong>Tenés cambios sin guardar.</strong> Si salís ahora se pierden.
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => (pending(), setPending(null))}>
                Descartar y salir
              </Button>
              <Button size="sm" onClick={() => void saveAnd(pending)} disabled={badRange || update.isPending}>
                Guardar y salir
              </Button>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => guard(onClose)}>
              Cerrar
            </Button>
            {t.status !== "hecha" && (
              <Button
                variant="secondary"
                onClick={() => void saveAnd(onClose, { status: "hecha" })}
                disabled={badRange || update.isPending}
              >
                <Check size={16} aria-hidden /> Finalizar
              </Button>
            )}
            <Button onClick={() => void saveAnd(onClose)} disabled={!dirty || badRange || update.isPending}>
              Guardar
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
}

type ListFilter = "pend" | "res" | "todas";

function ClientTasks({ clientId, currentId, onPick }: { clientId: string; currentId: string; onPick: (id: string) => void }) {
  const tasks = useClientTasks(clientId);
  const [filter, setFilter] = useState<ListFilter>("pend");
  const all = tasks.data ?? [];
  const done = (s: TaskStatus) => s === "hecha" || s === "cancelada";
  const counts = { pend: all.filter((x) => !done(x.status)).length, res: all.filter((x) => done(x.status)).length, todas: all.length };
  const shown = all.filter((x) => filter === "todas" || x.id === currentId || (filter === "res" ? done(x.status) : !done(x.status)));
  const tabs: [ListFilter, string][] = [
    ["pend", "Pendientes"],
    ["res", "Resueltas"],
    ["todas", "Todas"],
  ];

  return (
    <aside className="flex min-w-0 flex-col gap-2.5">
      <h3 className="text-sm font-bold">Tareas del cliente</h3>
      <div role="tablist" aria-label="Filtrar tareas del cliente" className="flex gap-0.5 rounded-[10px] bg-slate-100 p-0.5">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1 text-xs",
              filter === key ? "bg-white font-semibold text-ink shadow-sm" : "text-slate-600",
            )}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>
      <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto md:max-h-[420px]">
        {tasks.isPending && <Skeleton className="h-16" />}
        {shown.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => x.id !== currentId && onPick(x.id)}
            aria-current={x.id === currentId}
            className={cn(
              "flex items-start gap-2.5 rounded-[10px] border bg-white px-3 py-2 text-left",
              x.id === currentId ? "border-indigo-400 ring-2 ring-indigo-100" : "border-line hover:bg-slate-50",
            )}
          >
            <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: x.typeColor }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm font-medium", done(x.status) && "text-muted line-through")}>
                {x.title}
              </span>
              <span className="block text-xs text-muted">
                {x.startsAt ? `${shortDay(arParts(x.startsAt).date)} ${arParts(x.startsAt).time}` : "Sin fecha"} · {x.assigneeName}
              </span>
            </span>
            <Chip tone={TASK_STATUS[x.status].tone} className="shrink-0">
              {TASK_STATUS[x.status].label}
            </Chip>
          </button>
        ))}
        {!tasks.isPending && shown.length === 0 && <p className="text-xs text-muted">No hay tareas en este filtro.</p>}
      </div>
    </aside>
  );
}
