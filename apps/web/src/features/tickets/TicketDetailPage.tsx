import { TICKET_PRIORITIES, type TicketDetail, type TicketTaskRole, type TaskDto } from "@crm/shared";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarCheck, Check, Phone, Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ArchiveButton, ArchivedBanner } from "../../components/ui/Archive";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { ApiError } from "../../lib/api";
import { ago, initials, when } from "../../lib/format";
import { ticketRoute } from "../../router";
import { FilesCard } from "../files/FilesCard";
import { useMyId, useTeam } from "../tasks/api";
import { TASK_STATUS, tint } from "../tasks/labels";
import { TaskDialog } from "../tasks/TaskDialog";
import { type TaskDraft, TaskFormDialog } from "../tasks/TaskFormDialog";
import { addDays, arParts, nextSlot, toInstant, todayAr } from "../tasks/time";
import {
  useAssignTicket,
  useCancelTicket,
  useConfirmTicket,
  useTicket,
  useTicketNote,
  useUpdateTicket,
  useWorkDone,
} from "./api";
import { confirmSlots, validDue } from "./dates";
import { STEPS, TICKET_CHANNEL, TICKET_PRIORITY, TICKET_STATUS, TICKET_TYPE } from "./labels";

export function TicketDetailPage() {
  const { ticketId } = ticketRoute.useParams();
  const ticket = useTicket(ticketId);
  const notice = useNotice();

  // Link viejo o mal copiado (id inválido o ticket inexistente): no tiene sentido "Reintentar".
  if (ticket.error instanceof ApiError && (ticket.error.status === 400 || ticket.error.status === 404)) return <TicketNotFound />;
  if (ticket.error) return <ErrorBox error={ticket.error} onRetry={() => void ticket.refetch()} />;
  if (!ticket.data) return <Skeleton className="h-[500px]" />;
  const t = ticket.data;

  return (
    <>
      <Link to="/tickets" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Volver al buscador
      </Link>
      <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <ClientSection ticket={t} onNotice={notice.show} />
          <DetailSection ticket={t} />
          <FilesCard owner={{ ticketId: t.id }} area="tickets" />
        </div>
        <TasksSection ticket={t} onNotice={notice.show} />
      </div>
      <Notice message={notice.message} />
    </>
  );
}

function TicketNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h1 className="text-xl font-bold">Este ticket no existe</h1>
      <p className="text-sm text-muted">Puede ser un link viejo o mal copiado.</p>
      <Link to="/tickets" className="rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
        Ir al buscador de tickets
      </Link>
    </div>
  );
}

/**
 * Corre la acción una sola vez aunque se haga doble clic: `isPending` llega un
 * render tarde y dos clics seguidos alcanzaban a mandar dos pedidos.
 */
function useSingleFlight() {
  const busy = useRef(false);
  return (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    void action()
      .catch(() => undefined) // el error ya lo muestra la mutación
      .finally(() => {
        busy.current = false;
      });
  };
}

function Section({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{n}</span>
        <h2 className="font-bold">{title}</h2>
        {aside && <span className="ml-auto text-xs text-muted">{aside}</span>}
      </header>
      {children}
    </Card>
  );
}

// ─── 1. Cliente y ticket ────────────────────────────────────────────────────

function ClientSection({ ticket: t, onNotice }: { ticket: TicketDetail; onNotice: (m: string) => void }) {
  const update = useUpdateTicket(t.id);
  const [cancelling, setCancelling] = useState(false);
  const type = TICKET_TYPE[t.type];
  const stepIdx = STEPS.findIndex((s) => s.status === t.status);
  const closed = t.status === "resuelto" || t.status === "cancelado";

  return (
    <Section n={1} title="Datos del cliente y del ticket">
      {t.archivedAt && (
        <ArchivedBanner
          label="Este ticket está dado de baja"
          archivedAt={t.archivedAt}
          pending={update.isPending}
          onRestore={() => update.mutate({ archived: false }, { onSuccess: () => onNotice("Ticket reactivado.") })}
        />
      )}
      {!t.archivedAt && t.projectArchived && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Su proyecto está dado de baja: el ticket no aparece en los listados hasta que se reactive el proyecto.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-lg">Ticket #{t.number}</strong>
          <Chip tone="slate">
            <span className="size-2 rounded-full" style={{ background: type.color }} aria-hidden />
            {type.label}
          </Chip>
          <Chip tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Chip>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {!closed && (
            <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
              Cancelar ticket
            </Button>
          )}
          {!t.archivedAt && (
            <ArchiveButton
              what={`el ticket #${t.number}`}
              consequences="Deja de aparecer en Tickets, en el proyecto y en los contadores del cliente. Sus tareas, horas e historial quedan como están."
              pending={update.isPending}
              onConfirm={() => update.mutateAsync({ archived: true }).then(() => onNotice(`Ticket #${t.number} dado de baja.`))}
            />
          )}
        </span>
      </div>

      <Link
        to="/clientes/$clientId"
        params={{ clientId: t.client.id }}
        className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 hover:bg-slate-100"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-800">
          {initials(t.client.name)}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">{t.client.name} ↗</strong>
          <span className="block truncate text-xs text-muted">
            {t.contact ? [t.contact.name, t.contact.phone, t.contact.email].filter(Boolean).join(" · ") : "Sin contacto cargado"}
          </span>
        </span>
        <Chip tone={t.clientPriority === "alta" ? "red" : t.clientPriority === "media" ? "amber" : "slate"}>
          Cliente prioridad {t.clientPriority}
        </Chip>
      </Link>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Info label="Cargó el ticket" value={t.reportedBy?.name ?? `Entró solo (${TICKET_CHANNEL[t.channel]})`} />
        <Info label="Fecha de carga" value={`${when(t.receivedAt)} · ${TICKET_CHANNEL[t.channel]}`} />
        <Info label="Se le asignó a" value={t.assignee?.name ?? "Sin asignar"} />
        <Info label="Proyecto" value={t.project ? <Link to="/proyectos/$projectId" params={{ projectId: t.project.id }} className="text-brand hover:underline">{t.project.name}</Link> : "—"} />
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted">Urgencia</dt>
          <dd>
            <Select
              value={t.priority}
              disabled={closed}
              onChange={(e) =>
                update.mutate({ priority: e.target.value as TicketDetail["priority"] }, { onSuccess: () => onNotice("Urgencia actualizada.") })
              }
              className="h-8 w-36"
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY[p].label}
                </option>
              ))}
            </Select>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted">Compromiso</dt>
          <dd className="flex items-center gap-2">
            <DueDateInput
              saved={t.dueAt ? arParts(t.dueAt).date : ""}
              disabled={closed}
              overdue={t.overdue}
              onSave={(dueOn) => update.mutate({ dueOn }, { onSuccess: () => onNotice("Compromiso actualizado.") })}
            />
            {t.overdue && <span className="text-xs font-bold text-red-700">vencido</span>}
          </dd>
        </div>
      </dl>
      {update.error && <p role="alert" className="text-sm text-red-700">{update.error.message}</p>}

      {t.status !== "cancelado" && (
        <ol className="grid grid-cols-4 gap-2" aria-label="Avance del ticket">
          {STEPS.map((s, i) => (
            <li key={s.status} className="flex flex-col gap-1.5" aria-current={i === stepIdx ? "step" : undefined}>
              <span className={cn("h-1.5 rounded-full", i <= stepIdx ? "bg-brand" : "bg-slate-200")} />
              <span className={cn("text-xs", i <= stepIdx ? "font-semibold text-ink" : "text-slate-400")}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      <CancelDialog ticket={t} open={cancelling} onClose={() => setCancelling(false)} onDone={onNotice} />
    </Section>
  );
}

/**
 * Fecha de compromiso: se edita en un estado local y se guarda al salir del
 * campo (o con Enter) solo si quedó una fecha completa y válida, o vacía.
 * Antes se mandaba cada tecla y el historial se llenaba de fechas a medio tipear.
 */
function DueDateInput({
  saved,
  disabled,
  overdue,
  onSave,
}: {
  saved: string;
  disabled: boolean;
  overdue: boolean;
  onSave: (dueOn: string | null) => void;
}) {
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const invalid = value !== "" && !validDue(value);
  const commit = () => {
    if (value === saved) return;
    if (value === "") onSave(null);
    else if (validDue(value)) onSave(value);
  };
  return (
    <Input
      type="date"
      aria-label="Fecha de compromiso"
      value={value}
      disabled={disabled}
      min="2000-01-01"
      max="2100-12-31"
      aria-invalid={invalid}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
      className={cn("h-8 w-40", overdue && "border-red-400 text-red-700")}
    />
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// ─── 2. Detalle ─────────────────────────────────────────────────────────────

function DetailSection({ ticket: t }: { ticket: TicketDetail }) {
  return (
    <Section n={2} title="Detalle del ticket">
      <div>
        <p className="text-xs text-muted">Título</p>
        <h1 className="text-xl font-bold">{t.title}</h1>
      </div>
      <div>
        <p className="text-xs text-muted">Detalle</p>
        <p className="mt-0.5 text-sm whitespace-pre-line">{t.description ?? "Sin descripción."}</p>
      </div>
    </Section>
  );
}

// ─── 3. Tareas, acción del paso y historial ────────────────────────────────

const isOpen = (x: TaskDto) => x.status !== "hecha" && x.status !== "cancelada";

function TasksSection({ ticket: t, onNotice }: { ticket: TicketDetail; onNotice: (m: string) => void }) {
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const open = t.tasks.filter(isOpen).length;
  // Se agregan tareas mientras el trabajo está por hacerse (en un ticket nuevo, la primera lo asigna).
  const canAdd = (t.status === "nuevo" || t.status === "en_curso") && !t.archivedAt;

  return (
    <Section n={3} title="Tareas del ticket" aside={`${open} abiertas · ${t.tasks.length} en total`}>
      <div className="flex flex-col gap-2">
        {t.tasks.length === 0 && (
          <p className="text-sm text-muted">Todavía no hay tareas: asigná el trabajo o agregá una tarea para que aparezca en la agenda.</p>
        )}
        {t.tasks.map((x) => (
          <TaskRow key={x.id} task={x} onOpen={() => setOpenTask(x.id)} />
        ))}
        {canAdd && (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() =>
              setDraft({
                ticketId: t.id,
                clientName: t.client.name,
                title: `#${t.number} · ${t.title}`,
                date: todayAr(),
                start: nextSlot(),
                durationMinutes: 60,
              })
            }
          >
            <Plus size={14} aria-hidden /> Agregar tarea
          </Button>
        )}
        {canAdd && t.status === "en_curso" && (
          <p className="text-xs text-muted">
            Para repartir el trabajo: cada tarea queda en la agenda de su responsable. El ticket pasa solo a confirmar cuando se
            finaliza la última.
          </p>
        )}
      </div>

      {t.status === "nuevo" && <AssignPanel ticket={t} onNotice={onNotice} />}
      {t.status === "en_curso" && <WorkDonePanel ticket={t} onNotice={onNotice} />}
      {t.status === "a_confirmar" && <ConfirmPanel ticket={t} onNotice={onNotice} />}
      {t.status === "resuelto" && (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
          <strong>Ticket cerrado.</strong> Lo resolvió {t.resolvedBy?.name ?? "el equipo"}
          {t.confirmer && ` y ${t.confirmer.name} confirmó con el cliente`}.{t.resolutionNote && ` "${t.resolutionNote}"`}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Historial</h3>
        <NoteInput ticketId={t.id} />
        <ol className="flex flex-col gap-2">
          {t.events.map((e) => (
            <li key={e.id} className="flex gap-2.5 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
              <span>
                {e.kind === "nota" && <strong>{e.actorName ?? "Alguien"}: </strong>}
                {e.message} <span className="text-xs text-muted">· {ago(e.createdAt)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <TaskDialog taskId={openTask} onClose={() => setOpenTask(null)} onSaved={onNotice} />
      <TaskFormDialog draft={draft} onClose={() => setDraft(null)} onCreated={onNotice} title={`Agregar tarea al ticket #${t.number}`} />
    </Section>
  );
}

/** Cómo se muestra el papel de la tarea en el ticket. */
const ROLE_LABEL: Record<TicketTaskRole, string | null> = {
  principal: "Responsable",
  adicional: null,
  confirmacion: "Confirmación",
};

function TaskRow({ task: x, onOpen }: { task: TaskDto; onOpen: () => void }) {
  const isDone = x.status === "hecha";
  const closed = !isOpen(x);
  const role = x.ticketRole ? ROLE_LABEL[x.ticketRole] : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left hover:brightness-95", closed && "opacity-70")}
      style={{ background: tint(x.type.color, closed), boxShadow: `inset 4px 0 0 ${x.type.color}` }}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold" title={x.assignee.name}>
        {initials(x.assignee.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-semibold", closed && "line-through")}>{x.title}</span>
        <span className="block text-xs text-slate-600">
          {x.assignee.name}
          {x.assignedBy && x.assignedBy.id !== x.assignee.id && ` (se la pasó ${x.assignedBy.name})`} · {x.type.name} · {when(x.startsAt)}
          {role && <strong className="ml-1.5 font-semibold text-slate-700">· {role}</strong>}
        </span>
      </span>
      <Chip tone={TASK_STATUS[x.status].tone} className="bg-white/70">
        {isDone ? "✓ Finalizada" : TASK_STATUS[x.status].label}
      </Chip>
    </button>
  );
}

function NoteInput({ ticketId }: { ticketId: string }) {
  const note = useTicketNote(ticketId);
  const once = useSingleFlight();
  const [body, setBody] = useState("");
  const send = () => {
    const text = body.trim();
    if (text) once(() => note.mutateAsync({ body: text }).then(() => setBody("")));
  };
  return (
    <div className="flex gap-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Nota</span>
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), send())}
          placeholder="Agregar una nota al historial…"
          maxLength={2000}
        />
      </label>
      <Button variant="secondary" onClick={send} disabled={!body.trim() || note.isPending}>
        Anotar
      </Button>
    </div>
  );
}

/** Caja de acción del paso actual. */
function StepPanel({ title, hint, error, children }: { title: string; hint: string; error: Error | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <strong className="text-sm">{title}</strong>
      {children}
      <p className="text-xs text-muted">{hint}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
    </div>
  );
}

function PersonSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const team = useTeam();
  const me = useMyId();
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {/* Sin esto el desplegable mostraba a la primera persona aunque no hubiera nadie elegido. */}
        {!value && (
          <option value="" disabled>
            Elegí a alguien…
          </option>
        )}
        {team.data?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.id === me ? `${u.name} (yo)` : u.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function AssignPanel({ ticket: t, onNotice }: { ticket: TicketDetail; onNotice: (m: string) => void }) {
  const assign = useAssignTicket(t.id);
  const once = useSingleFlight();
  const team = useTeam();
  const [who, setWho] = useState(t.suggestedAssignee?.id ?? "");
  const [date, setDate] = useState(todayAr());
  const [time, setTime] = useState(nextSlot());
  const name = team.data?.find((u) => u.id === who)?.name ?? "la persona elegida";

  return (
    <StepPanel
      title="1. Asignar el trabajo"
      hint={`Se crea sola una tarea en la agenda de ${name} con el trabajo a realizar.`}
      error={assign.error}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <PersonSelect label={`Lo hace${t.suggestedAssignee ? ` (sugerido: ${t.suggestedAssignee.name})` : ""}`} value={who} onChange={setWho} />
        <Field label="Día">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button
          disabled={!who || !date || !time || assign.isPending}
          onClick={() =>
            once(() =>
              assign
                .mutateAsync({ assigneeId: who, scheduledAt: toInstant(date, time) })
                .then(() => onNotice(`Asignado a ${name}: quedó en su agenda.`)),
            )
          }
        >
          <CalendarCheck size={16} aria-hidden /> Asignar y agendar
        </Button>
      </div>
    </StepPanel>
  );
}

function WorkDonePanel({ ticket: t, onNotice }: { ticket: TicketDetail; onNotice: (m: string) => void }) {
  const done = useWorkDone(t.id);
  const assign = useAssignTicket(t.id);
  const once = useSingleFlight();
  const me = useMyId();
  const team = useTeam();
  const [slots] = useState(() => confirmSlots(arParts(new Date().toISOString()).minutes, todayAr()));
  const [confirmer, setConfirmer] = useState(t.reportedBy?.id ?? me);
  // Por defecto, mañana a las 10.
  const [slot, setSlot] = useState(() => slots.findIndex((s) => s.label.startsWith("Mañana")));
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const work = t.tasks.find((x) => isOpen(x) && x.ticketRole === "principal");
  const others = t.tasks.filter((x) => isOpen(x) && x.ticketRole === "adicional");
  const tech = t.assignee?.name ?? "el técnico";
  const name = team.data?.find((u) => u.id === confirmer)?.name ?? "";

  return (
    <StepPanel
      title={`2. Cuando ${tech} termina el trabajo`}
      hint={`Se agenda sola la llamada de confirmación. El ticket no se cierra hasta que el cliente confirme.${
        others.length
          ? ` Quedan ${others.length === 1 ? "1 tarea abierta" : `${others.length} tareas abiertas`} de otras personas: "Trabajo terminado" las finaliza todas.`
          : ""
      }`}
      error={done.error ?? assign.error}
    >
      <p className="text-sm">
        <CalendarCheck size={16} aria-hidden className="mr-1.5 inline align-[-3px] text-brand" />
        {work ? (
          <>
            Tarea en la agenda de <strong>{tech}</strong> · {when(work.startsAt)}
          </>
        ) : (
          <>El responsable no tiene una tarea abierta</>
        )}
        <Button size="sm" variant="ghost" onClick={() => setReassigning((r) => !r)}>
          {reassigning ? "No reasignar" : "Reasignar"}
        </Button>
      </p>
      {reassigning ? (
        <ReassignForm
          onSubmit={(assigneeId, at, who) =>
            once(() =>
              assign.mutateAsync({ assigneeId, scheduledAt: at }).then(() => (setReassigning(false), onNotice(`Reasignado a ${who}.`))),
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <PersonSelect label="Quién llama al cliente para confirmar" value={confirmer} onChange={setConfirmer} />
            <Field label="Cuándo">
              <Select value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
                {slots.map((s, i) => (
                  <option key={s.label} value={i}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            {t.project && (
              <Field label="Horas que llevó (opcional)" hint="Se suman al proyecto">
                <Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="1,5" />
              </Field>
            )}
            <Field label="Qué se hizo (opcional)" className={t.project ? "" : "sm:col-span-2"}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: era el driver de la impresora" />
            </Field>
          </div>
          <Button
            className="self-start"
            disabled={done.isPending}
            onClick={() => {
              const h = Number(hours.replace(",", "."));
              const at = slots[slot]?.at ?? slots[0]!.at;
              once(() =>
                done
                  .mutateAsync({
                    confirmerId: confirmer,
                    confirmAt: at,
                    ...(h > 0 && { minutes: Math.round(h * 60) }),
                    ...(note.trim() && { note: note.trim() }),
                  })
                  .then(() => onNotice(`Listo: la llamada de confirmación quedó en la agenda de ${name}.`)),
              );
            }}
          >
            <Check size={16} aria-hidden /> Trabajo terminado
          </Button>
        </>
      )}
    </StepPanel>
  );
}

function ReassignForm({ onSubmit }: { onSubmit: (assigneeId: string, at: string, name: string) => void }) {
  const team = useTeam();
  const [who, setWho] = useState(team.data?.[0]?.id ?? "");
  const [date, setDate] = useState(todayAr());
  const [time, setTime] = useState(nextSlot());
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
      <PersonSelect label="Pasárselo a" value={who} onChange={setWho} />
      <Field label="Día">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Hora">
        <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <Button onClick={() => onSubmit(who, toInstant(date, time), team.data?.find((u) => u.id === who)?.name ?? "")}>Reasignar</Button>
    </div>
  );
}

function ConfirmPanel({ ticket: t, onNotice }: { ticket: TicketDetail; onNotice: (m: string) => void }) {
  const confirm = useConfirmTicket(t.id);
  const once = useSingleFlight();
  const [note, setNote] = useState("");
  const [retry, setRetry] = useState(false);
  const [date, setDate] = useState(addDays(todayAr(), 1));
  const [time, setTime] = useState("10:00");
  const tech = t.assignee?.name ?? "el técnico";
  const extra = note.trim() ? { note: note.trim() } : {};

  return (
    <StepPanel title="3. ¿Qué dijo el cliente?" hint="Si no quedó bien, vuelve a la agenda del técnico y el ticket sigue abierto." error={confirm.error}>
      <p className="text-sm">
        <Phone size={16} aria-hidden className="mr-1.5 inline align-[-3px] text-brand" />
        Llamada de confirmación en la agenda de <strong>{t.confirmer?.name ?? "—"}</strong> · {when(t.confirmAt)}
        {t.contact && ` · llamar a ${t.contact.name}${t.contact.phone ? ` (${t.contact.phone})` : ""}`}
      </p>
      <Field label="Comentario de la llamada (opcional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: ya imprime bien" />
      </Field>
      {retry && (
        <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
          <Field label={`${tech} lo retoma el día`}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="A las">
            <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!retry && (
          <Button
            disabled={confirm.isPending}
            onClick={() => once(() => confirm.mutateAsync({ ok: true, ...extra }).then(() => onNotice(`Ticket #${t.number} cerrado.`)))}
          >
            <Check size={16} aria-hidden /> Confirmó que quedó bien → Cerrar ticket
          </Button>
        )}
        {retry ? (
          <>
            <Button
              variant="danger"
              disabled={confirm.isPending || !date || !time}
              onClick={() =>
                once(() =>
                  confirm
                    .mutateAsync({ ok: false, retryAt: toInstant(date, time), ...extra })
                    .then(() => (setRetry(false), onNotice(`Vuelve a ${tech}: quedó en su agenda.`))),
                )
              }
            >
              Volver a {tech}
            </Button>
            <Button variant="ghost" onClick={() => setRetry(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setRetry(true)}>
            <X size={16} aria-hidden /> No quedó bien → vuelve a {tech}
          </Button>
        )}
      </div>
    </StepPanel>
  );
}

function CancelDialog({ ticket: t, open, onClose, onDone }: { ticket: TicketDetail; open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const cancel = useCancelTicket(t.id);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={`Cancelar ticket #${t.number}`} description="Se cancelan también sus tareas pendientes.">
      <div className="flex flex-col gap-3">
        <Field label="Motivo">
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: el cliente lo resolvió solo, era un duplicado…" />
        </Field>
        {cancel.error && <p role="alert" className="text-sm text-red-700">{cancel.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || cancel.isPending}
            onClick={() => cancel.mutate({ reason: reason.trim() }, { onSuccess: () => (onClose(), onDone(`Ticket #${t.number} cancelado.`)) })}
          >
            Cancelar ticket
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
