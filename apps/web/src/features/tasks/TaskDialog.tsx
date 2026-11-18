import { type TaskDetailDto, type TaskDto, type TaskStatus, type TaskUpdate, taskTitle } from "@crm/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, FolderOpen, Receipt, Users } from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Dialog, DialogActions } from "../../components/ui/Dialog";
import { Field, Input, Select, TextArea } from "../../components/ui/Field";
import { InlineConfirm } from "../../components/ui/InlineConfirm";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { useAccess } from "../../hooks/useAccess";
import { useEnterFlow } from "../../hooks/useEnterFlow";
import { ago, clip, initials } from "../../lib/format";
import { useClient, useClientTasks } from "../clients/api";
import { ContactsSection } from "../clients/tabs/DataTab";
import { StatementTab } from "../clients/tabs/StatementTab";
import { FilesCard } from "../files/FilesCard";
import { useAddTaskComment, useMyId, useTask, useTaskTypes, useTeam, useUpdateTask } from "./api";
import { EDITABLE_STATUSES, TASK_STATUS, tint } from "./labels";
import { clashText, isOverlapError, useAvailability, useOverlapGate } from "./availability";
import { SlotPicker } from "./SlotPicker";
import { arParts, durationLabel, shiftEnd, shortDay, spanMinutes, toHHMM, toInstant } from "./time";

const isOpenStatus = (s: TaskStatus) => s !== "hecha" && s !== "cancelada";

interface Edit {
  title: string;
  typeId: string;
  date: string;
  start: string;
  end: string;
  assigneeId: string;
  status: TaskStatus;
}

function editOf(t: TaskDetailDto): Edit {
  const p = t.startsAt ? arParts(t.startsAt) : null;
  return {
    title: t.title,
    typeId: t.type.id,
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
    // Si solo cambió el día, se conserva la duración. "Hasta" menor que "Desde" = termina al día siguiente.
    if (e.start !== o.start || e.end !== o.end) patch.durationMinutes = spanMinutes(e.start, e.end);
  }
  if (e.title.trim() !== o.title) patch.title = e.title.trim();
  if (e.typeId !== o.typeId) patch.typeId = e.typeId;
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
    <Dialog open={!!taskId} onClose={() => requestClose.current()} title="Tarea" size="full">
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
  const types = useTaskTypes();
  const navigate = useNavigate();
  const update = useUpdateTask();
  const addComment = useAddTaskComment(id);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [comment, setComment] = useState("");
  /** Acción que quedó esperando porque había cambios sin guardar. */
  const [pending, setPending] = useState<(() => void) | null>(null);
  /** Contactos o cuenta corriente del cliente, en un modal encima de este. */
  const [panel, setPanel] = useState<ClientPanelKind | null>(null);
  /** Contenedor de archivos de la tarea, en un modal encima de este. */
  const [filesOpen, setFilesOpen] = useState(false);
  const showMoney = useAccess().can("finanzas", "read");
  // Enter pasa de campo en campo (título → … → responsable) y en el último pide confirmar.
  const flow = useEnterFlow();
  // Agenda del responsable ese día (sin contar esta tarea): turnos libres y choques.
  const availability = useAvailability({ assigneeId: edit?.assigneeId, date: edit?.date, start: edit?.start, end: edit?.end, excludeId: id });
  const overlap = useOverlapGate(edit ? `${edit.date}|${edit.start}|${edit.end}|${edit.assigneeId}` : "");

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
  const saved = editOf(t);
  const scheduleChanged = edit.date !== saved.date || edit.start !== saved.start || edit.end !== saved.end;
  // Un horario a medio cargar no entra en el PATCH, pero cuenta como cambio: si no,
  // "Guardar" cerraba sin guardar y "Cerrar" no avisaba.
  const dirty = Object.keys(patch).length > 0 || scheduleChanged;
  const minutes = edit.start && edit.end ? spanMinutes(edit.start, edit.end) : 0;
  const scheduleError =
    scheduleChanged && !(edit.date && edit.start && edit.end)
      ? "Completá fecha, desde y hasta"
      : edit.start && edit.end && minutes <= 0
        ? "Revisá el horario"
        : edit.start && edit.end && minutes < 5
          ? "Mínimo 5 minutos"
          : undefined;
  // La misma validación que el server (taskUpdate): sin título no se puede guardar.
  const titleCheck = taskTitle.safeParse(edit.title);
  const titleError = titleCheck.success ? undefined : titleCheck.error.issues[0]?.message;
  const badRange = !!scheduleError || !!titleError;
  const type = types.data?.find((x) => x.id === edit.typeId) ?? t.type;
  const set = (k: keyof Edit) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEdit({ ...edit, [k]: e.target.value });
  // Mover "desde" corre "hasta" con la misma duración (1 h si no había una válida).
  const setStart = (e: React.ChangeEvent<HTMLInputElement>) =>
    setEdit({ ...edit, start: e.target.value, end: shiftEnd(edit.start, edit.end, e.target.value) });

  const guard = (action: () => void) => (dirty ? setPending(() => action) : action());
  requestClose.current = () => guard(onClose);

  const save = async (extra: TaskUpdate = {}) => {
    const body = { ...patch, ...extra };
    if (Object.keys(body).length) await update.mutateAsync({ id, ...body });
    const who = body.assigneeId ? team.data?.find((u) => u.id === body.assigneeId)?.name : null;
    const when = body.startsAt ? ` para el ${shortDay(edit.date)} ${edit.start}` : "";
    const name = clip(body.title ?? t.title);
    onSaved?.(
      body.status === "hecha"
        ? `Finalizada "${name}".`
        : `Guardado "${name}"${who ? `: ahora está en la agenda de ${who}` : ""}${when}.`,
    );
  };

  // Solo importa si se pisa cuando cambió cuándo o de quién es y la tarea sigue abierta.
  const moved = scheduleChanged || edit.assigneeId !== saved.assigneeId;
  const clash = moved && isOpenStatus(edit.status) ? availability.clash : undefined;
  const whoName = edit.assigneeId === me ? "vos" : (team.data?.find((u) => u.id === edit.assigneeId)?.name ?? "el responsable");

  const saveAnd = async (after: () => void, extra?: TaskUpdate) => {
    const askFirst = clash && isOpenStatus(extra?.status ?? edit.status) ? clashText(clash, whoName) : null;
    await overlap.run(askFirst, async (allowOverlap) => {
      await save({ ...extra, ...(allowOverlap && { allowOverlap }) });
      setPending(null);
      after();
    });
  };
  // Lo mismo que el botón "Guardar": sin cambios, cierra.
  const saveAndClose = () => void (dirty ? saveAnd(onClose) : onClose());

  const sendComment = async () => {
    // Enter dos veces rápido duplicaba el comentario.
    if (!comment.trim() || addComment.isPending) return;
    await addComment.mutateAsync({ body: comment.trim() });
    setComment("");
  };

  const resp = t.assignee.id === me ? "vos" : t.assignee.name;
  const passedBy = originOf(t, me);
  const when = t.startsAt ? `${shortDay(arParts(t.startsAt).date)} ${arParts(t.startsAt).time}` : "Sin fecha";
  const contactLine = t.contact ? [t.contact.name, t.contact.phone, t.contact.email].filter(Boolean).join(" · ") : "";

  return (
    <div className="flex min-h-full flex-col gap-4 md:h-full" {...flow.container(() => dirty && !badRange && !update.isPending)}>
      {t.client && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <Link
              to="/clientes/$clientId"
              params={{ clientId: t.client.id }}
              className="font-bold break-words text-ink hover:underline"
              onClick={(e) => {
                // Salir al cliente también pasa por el aviso de cambios sin guardar.
                if (!dirty || !t.client) return;
                e.preventDefault();
                const clientId = t.client.id;
                guard(() => void navigate({ to: "/clientes/$clientId", params: { clientId } }));
              }}
            >
              {t.client.name} ↗
            </Link>
            {t.contact && (
              <p className="truncate text-xs text-muted" title={contactLine}>
                {contactLine}
              </p>
            )}
          </div>
          <div className="flex gap-2 max-sm:w-full max-sm:*:flex-1">
            <Button size="sm" variant="secondary" onClick={() => setPanel("contactos")}>
              <Users size={14} aria-hidden /> Contactos
            </Button>
            {showMoney && (
              <Button size="sm" variant="secondary" onClick={() => setPanel("cuenta")}>
                <Receipt size={14} aria-hidden /> Cta. cte.
              </Button>
            )}
          </div>
        </div>
      )}

      <div className={cn("grid gap-4 md:min-h-72 md:flex-1 md:grid-rows-[minmax(0,1fr)]", t.client && "md:grid-cols-[320px_1fr]")}>
        {t.client && <ClientTasks clientId={t.client.id} currentId={id} onPick={(next) => guard(() => onSwitch(next))} />}

        {/* En desktop la columna tiene alto fijo: los comentarios ocupan lo que necesitan y,
            si no entra todo (título muy largo, pantalla baja), scrollea la columna entera. */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3 md:-mx-1 md:overflow-y-auto md:px-1">
          <div
            className="flex shrink-0 flex-col gap-2 rounded-xl px-3 py-3 sm:px-4"
            style={{ background: tint(type.color), boxShadow: `inset 5px 0 0 ${type.color}` }}
          >
            {/* El título ocupa todo el ancho y crece con el texto (hasta ~12 líneas; después, scroll). */}
            <TextArea
              singleLine
              aria-label="Título de la tarea"
              {...flow.field}
              value={edit.title}
              onChange={set("title")}
              aria-invalid={!!titleError}
              className={cn(
                "max-h-64 bg-white/80 text-[15px] leading-6 font-bold",
                (t.status === "hecha" || t.status === "cancelada") && "line-through",
              )}
            />
            {titleError && (
              <p role="alert" className="text-xs text-red-700">
                {titleError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="min-w-0 text-xs break-words text-slate-600">
                {when} · responsable: {resp}
                {passedBy}
              </p>
              {/* En el celular: tipo y estado lado a lado a todo el ancho, el contenedor debajo. */}
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:max-w-full sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
              <Button size="sm" variant="secondary" onClick={() => setFilesOpen(true)} className="max-sm:order-last max-sm:col-span-2">
                <FolderOpen size={14} aria-hidden /> Contenedor
              </Button>
              <label className="flex max-w-full min-w-0 flex-col gap-1 text-xs font-medium text-slate-600 sm:flex-row sm:items-center sm:gap-2">
                Tipo
                <Select aria-label="Tipo de tarea" {...flow.field} value={edit.typeId} onChange={set("typeId")} className="h-10 min-w-0 bg-white sm:h-8 sm:w-auto sm:max-w-48">
                  {/* Mientras cargan los tipos, el de la tarea (para no mostrar otro). */}
                  {(types.data ?? [t.type]).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex max-w-full min-w-0 flex-col gap-1 text-xs font-medium text-slate-600 sm:flex-row sm:items-center sm:gap-2">
                Estado
                <Select aria-label="Estado de la tarea" {...flow.field} value={edit.status} onChange={set("status")} className="h-10 min-w-0 bg-white sm:h-8 sm:w-auto">
                  {EDITABLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS[s].label}
                    </option>
                  ))}
                </Select>
              </label>
              </div>
            </div>
          </div>

          <h3 className="shrink-0 text-sm font-bold">Comentarios</h3>
          {/* Solo el alto que necesitan (cada comentario entero), con el campo para comentar justo debajo. */}
          <ol className="flex shrink-0 flex-col gap-2.5">
            {t.comments.length === 0 && <li className="text-sm text-muted">Todavía no hay comentarios en esta tarea.</li>}
            {t.comments.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-800">
                  {initials(c.authorName ?? "Sistema")}
                </span>
                <div className="min-w-0">
                  <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">{c.body}</p>
                  <p className="text-xs text-muted">
                    {c.authorName ?? "Sistema"} · {ago(c.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {/* Si son muchos, la columna scrollea y el campo queda siempre a mano abajo. */}
          <div className="flex shrink-0 flex-col gap-2 bg-white sm:flex-row sm:items-start md:sticky md:bottom-0 md:pt-1 md:pb-0.5">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Comentario</span>
              <TextArea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                // Enter manda el comentario; Shift+Enter agrega un renglón.
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void sendComment())}
                placeholder="Escribí un comentario sobre la tarea…"
              />
            </label>
            <Button
              variant="secondary"
              onClick={() => void sendComment()}
              disabled={!comment.trim() || addComment.isPending}
              className="max-sm:w-full"
            >
              Comentar
            </Button>
          </div>
        </section>
      </div>

      {t.client && (
        <ClientPanel
          clientId={t.client.id}
          clientName={t.client.name}
          panel={panel}
          onClose={() => {
            setPanel(null);
            // Si cambiaron los contactos, el encabezado de la tarea los muestra al día.
            void task.refetch();
          }}
        />
      )}

      <Dialog open={filesOpen} onClose={() => setFilesOpen(false)} title="Contenedor" description={t.title} size="xl">
        {filesOpen && <FilesCard owner={{ taskId: t.id }} area="tareas" className="border-0 p-0" />}
      </Dialog>

      <footer className="flex flex-col gap-3 border-t border-line pt-4">
        {/* En el celular, grilla de dos columnas: fecha y responsable a lo ancho, desde/hasta lado a lado. */}
        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          <Field label="Fecha" className="col-span-2">
            <Input type="date" {...flow.field} value={edit.date} onChange={set("date")} className="sm:w-40" />
          </Field>
          <Field label="De" className="min-w-0">
            <Input type="time" step={300} {...flow.field} value={edit.start} onChange={setStart} className="min-w-0 sm:w-28" />
          </Field>
          <Field label="Hasta" error={scheduleError} className="min-w-0">
            <Input type="time" step={300} {...flow.field} value={edit.end} onChange={set("end")} aria-invalid={badRange} className="min-w-0 sm:w-28" />
          </Field>
          {minutes > 0 && <span className="col-span-2 -mt-1.5 text-xs text-muted sm:mt-0 sm:pb-2.5">{durationLabel(minutes)}</span>}
          <Field label="Responsable" className="col-span-2 max-w-full sm:ml-auto">
            <Select {...flow.field} value={edit.assigneeId} onChange={set("assigneeId")} className="max-w-full sm:w-auto sm:min-w-44">
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me ? `${u.name} (yo)` : u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {isOpenStatus(edit.status) && (
          <SlotPicker
            availability={{ ...availability, clash: overlap.ask ? undefined : clash }}
            start={edit.start}
            duration={minutes > 0 ? minutes : 60}
            who={whoName}
            onPick={(next) => setEdit({ ...edit, start: next, end: shiftEnd(edit.start, edit.end, next) })}
          />
        )}

        {/* El 409 de horario ocupado no es un error: se pregunta si guardar igual. */}
        {((isOverlapError(update.error) ? null : update.error) ?? addComment.error) && (
          <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">
            {((isOverlapError(update.error) ? null : update.error) ?? addComment.error)?.message}
          </p>
        )}
      </footer>

      {/* En el celular, siempre a mano abajo de la hoja (fuera del pie, para poder quedar pegada). */}
      <DialogActions className="-mt-1">
        {overlap.ask ? (
          <InlineConfirm
            message={overlap.ask.message}
            confirmLabel="Agendar igual"
            cancelLabel="Elegir otro horario"
            onConfirm={overlap.ask.retry}
            onCancel={overlap.cancel}
            disabled={update.isPending}
          />
        ) : pending ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <span>
              <strong>Tenés cambios sin guardar.</strong> Si salís ahora se pierden.
            </span>
            <span className="flex flex-wrap gap-2 max-sm:w-full max-sm:*:flex-1">
              <Button size="sm" variant="secondary" onClick={() => (pending(), setPending(null))}>
                Descartar y salir
              </Button>
              <Button size="sm" onClick={() => void saveAnd(pending)} disabled={badRange || update.isPending}>
                Guardar y salir
              </Button>
            </span>
          </div>
        ) : flow.confirming ? (
          <InlineConfirm
            message="¿Guardar los cambios?"
            confirmLabel="Guardar"
            cancelLabel="Seguir editando"
            onConfirm={() => flow.accept(saveAndClose)}
            onCancel={flow.cancel}
            disabled={badRange || update.isPending}
          />
        ) : (
          <div className="flex flex-wrap justify-end gap-2 max-sm:*:flex-1">
            <Button variant="secondary" onClick={() => guard(onClose)}>
              Cerrar
            </Button>
            {t.status !== "hecha" && t.status !== "cancelada" && (
              <Button
                variant="secondary"
                onClick={() => void saveAnd(onClose, { status: "hecha" })}
                disabled={badRange || update.isPending}
              >
                <Check size={16} aria-hidden /> Finalizar
              </Button>
            )}
            {/* Siempre activo: tras "Comentar" no queda nada pendiente y apagarlo parecía un error; sin cambios, cierra. */}
            <Button onClick={saveAndClose} disabled={badRange || update.isPending}>
              Guardar
            </Button>
          </div>
        )}
      </DialogActions>
    </div>
  );
}

type ClientPanelKind = "contactos" | "cuenta";

/** Contactos o cuenta corriente del cliente sin salir de la tarea. */
function ClientPanel({
  clientId,
  clientName,
  panel,
  onClose,
}: {
  clientId: string;
  clientName: string;
  panel: ClientPanelKind | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!panel}
      onClose={onClose}
      title={panel === "cuenta" ? "Cuenta corriente" : "Contactos"}
      description={clientName}
      size="xl"
    >
      {panel && <ClientPanelBody clientId={clientId} panel={panel} />}
    </Dialog>
  );
}

function ClientPanelBody({ clientId, panel }: { clientId: string; panel: ClientPanelKind }) {
  const client = useClient(clientId);
  if (client.error) return <ErrorBox error={client.error} onRetry={() => void client.refetch()} />;
  if (!client.data) return <Skeleton className="h-40" />;
  return panel === "cuenta" ? <StatementTab client={client.data} /> : <ContactsSection client={client.data} />;
}

type ListFilter = "pend" | "res" | "todas";

function ClientTasks({ clientId, currentId, onPick }: { clientId: string; currentId: string; onPick: (id: string) => void }) {
  const tasks = useClientTasks(clientId);
  const [filter, setFilter] = useState<ListFilter>("pend");
  /** En el celular la lista arranca plegada: primero se ve la tarea abierta. */
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
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
    <aside className="flex min-h-0 min-w-0 flex-col gap-2.5">
      <h3 className="text-sm font-bold max-md:hidden">Tareas del cliente</h3>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((x) => !x)}
        className="flex min-h-10 items-center justify-between gap-2 rounded-[10px] border border-line bg-white px-3 text-left text-sm font-bold md:hidden"
      >
        <span>
          Tareas del cliente <span className="font-normal text-muted">· {counts.pend} pendientes</span>
        </span>
        <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-slate-500 transition", expanded && "rotate-180")} />
      </button>
      <div id={listId} className={cn("min-h-0 flex-col gap-2.5 md:flex md:flex-1", expanded ? "flex" : "hidden")}>
      <div role="group" aria-label="Filtrar tareas del cliente" className="flex gap-0.5 rounded-[10px] bg-slate-100 p-0.5">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "min-h-9 flex-1 rounded-lg px-2 py-1 text-xs md:min-h-0",
              filter === key ? "bg-white font-semibold text-ink shadow-sm" : "text-slate-600",
            )}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>
      {/* En desktop la columna scrollea sola; en el celular la lista va en el flujo (un solo scroll). */}
      <div className="flex flex-col gap-1.5 md:min-h-0 md:flex-1 md:overflow-y-auto">
        {tasks.isPending && <Skeleton className="h-16" />}
        {shown.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => x.id !== currentId && onPick(x.id)}
            aria-current={x.id === currentId ? "true" : undefined}
            className={cn(
              "flex shrink-0 items-stretch gap-2.5 rounded-[10px] border bg-white px-3 py-2 text-left",
              x.id === currentId ? "border-indigo-400 ring-2 ring-indigo-100" : "border-line hover:bg-slate-50",
            )}
          >
            <span className="w-1 shrink-0 rounded-full" style={{ background: x.typeColor }} aria-hidden />
            {/* El texto entero arriba; fecha, responsable y estado debajo, sin robarle ancho. */}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn("text-sm font-medium break-words", done(x.status) && "text-muted line-through")}>{x.title}</span>
              <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="text-xs text-muted">
                  {x.startsAt ? `${shortDay(arParts(x.startsAt).date)} ${arParts(x.startsAt).time}` : "Sin fecha"} · {x.assigneeName}
                </span>
                <Chip tone={TASK_STATUS[x.status].tone}>{TASK_STATUS[x.status].label}</Chip>
              </span>
            </span>
          </button>
        ))}
        {!tasks.isPending && shown.length === 0 && <p className="text-xs text-muted">No hay tareas en este filtro.</p>}
      </div>
      </div>
    </aside>
  );
}

/** De dónde viene la tarea: quién se la pasó al responsable y, si fue otro, quién la cargó. */
function originOf(t: TaskDto, me: string | undefined): string {
  const parts: string[] = [];
  const by = t.assignedBy && t.assignedBy.id !== t.assignee.id ? t.assignedBy : null;
  if (by) parts.push(`${t.assignee.id === me ? "te" : "se"} la pasó ${by.id === me ? "vos" : by.name}`);
  const created = t.createdBy;
  if (created && created.id !== t.assignee.id && created.id !== by?.id) parts.push(`la cargó ${created.id === me ? "vos" : created.name}`);
  return parts.map((p) => ` · ${p}`).join("");
}
