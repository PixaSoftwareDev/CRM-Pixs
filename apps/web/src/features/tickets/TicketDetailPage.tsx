import { TICKET_PRIORITIES, type TicketDetail, type TaskDto } from "@crm/shared";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarCheck, Check, Phone, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ArchiveButton, ArchivedBanner } from "../../components/ui/Archive";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { ago, initials, when } from "../../lib/format";
import { ticketRoute } from "../../router";
import { useMyId, useTeam } from "../tasks/api";
import { TASK_STATUS, tint } from "../tasks/labels";
import { TaskDialog } from "../tasks/TaskDialog";
import { addDays, arParts, nextSlot, toHHMM, toInstant, todayAr } from "../tasks/time";
import {
  useAssignTicket,
  useCancelTicket,
  useConfirmTicket,
  useTicket,
  useTicketNote,
  useUpdateTicket,
  useWorkDone,
} from "./api";
import { STEPS, TICKET_CHANNEL, TICKET_PRIORITY, TICKET_STATUS, TICKET_TYPE } from "./labels";

export function TicketDetailPage() {
  const { ticketId } = ticketRoute.useParams();
  const ticket = useTicket(ticketId);
  const notice = useNotice();

  if (ticket.error) return <ErrorBox error={ticket.error} onRetry={() => void ticket.refetch()} />;
  if (!ticket.data) return <Skeleton className="h-[500px]" />;
  const t = ticket.data;

  return (
    <>
      <Link to="/tickets" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Volver al buscador
      </Link>
      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <ClientSection ticket={t} onNotice={notice.show} />
          <DetailSection ticket={t} />
        </div>
        <TasksSection ticket={t} onNotice={notice.show} />
      </div>
      <Notice message={notice.message} />
    </>
  );
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
            <Input
              type="date"
              value={t.dueAt ? arParts(t.dueAt).date : ""}
              disabled={closed}
              onChange={(e) => update.mutate({ dueOn: e.target.value || null }, { onSuccess: () => onNotice("Compromiso actualizado.") })}
              className={cn("h-8 w-40", t.overdue && "border-red-400 text-red-700")}
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

function TasksSection({ ticket: t, onNotice }: { ticket: TicketDetail; onNotice: (m: string) => void }) {
  const [openTask, setOpenTask] = useState<string | null>(null);
  const live = t.tasks.filter((x) => x.status !== "hecha");
  const done = t.tasks.filter((x) => x.status === "hecha");

  return (
    <Section n={3} title="Tareas" aside={`${live.length} vigentes · ${done.length + t.events.length} en historial`}>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Vigentes</h3>
        {live.length === 0 && (
          <p className="text-sm text-muted">
            {t.tasks.length === 0 ? "Todavía no hay tareas: asigná el trabajo para que aparezca en la agenda." : "No quedan tareas pendientes en este ticket."}
          </p>
        )}
        {live.map((x) => (
          <TaskRow key={x.id} task={x} onOpen={() => setOpenTask(x.id)} />
        ))}
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
        {done.map((x) => (
          <TaskRow key={x.id} task={x} onOpen={() => setOpenTask(x.id)} />
        ))}
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
    </Section>
  );
}

function TaskRow({ task: x, onOpen }: { task: TaskDto; onOpen: () => void }) {
  const isDone = x.status === "hecha";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left hover:brightness-95", isDone && "opacity-70")}
      style={{ background: tint(x.type.color, isDone), boxShadow: `inset 4px 0 0 ${x.type.color}` }}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold">
        {initials(x.assignee.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-semibold", isDone && "line-through")}>{x.title}</span>
        <span className="block text-xs text-slate-600">
          {x.assignee.name} · {when(x.startsAt)}
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
  const [body, setBody] = useState("");
  const send = () => body.trim() && note.mutate({ body: body.trim() }, { onSuccess: () => setBody("") });
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
            assign.mutate(
              { assigneeId: who, scheduledAt: toInstant(date, time) },
              { onSuccess: () => onNotice(`Asignado a ${name}: quedó en su agenda.`) },
            )
          }
        >
          <CalendarCheck size={16} aria-hidden /> Asignar y agendar
        </Button>
      </div>
    </StepPanel>
  );
}

/** Opciones rápidas para agendar la llamada de confirmación. */
function confirmSlots() {
  const now = arParts(new Date().toISOString());
  const inTwo = Math.min(now.minutes + 120, 19 * 60);
  const tomorrow = addDays(todayAr(), 1);
  return [
    { label: `Hoy ${toHHMM(Math.ceil(inTwo / 15) * 15)}`, at: toInstant(todayAr(), toHHMM(Math.ceil(inTwo / 15) * 15)) },
    { label: "Mañana 10:00", at: toInstant(tomorrow, "10:00") },
    { label: "Pasado mañana 10:00", at: toInstant(addDays(tomorrow, 1), "10:00") },
  ];
}

function WorkDonePanel({ ticket: t, onNotice }: { ticket: TicketDetail; onNotice: (m: string) => void }) {
  const done = useWorkDone(t.id);
  const assign = useAssignTicket(t.id);
  const me = useMyId();
  const team = useTeam();
  const slots = confirmSlots();
  const [confirmer, setConfirmer] = useState(t.reportedBy?.id ?? me);
  const [slot, setSlot] = useState(1);
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const work = t.tasks.find((x) => x.status !== "hecha");
  const tech = t.assignee?.name ?? "el técnico";
  const name = team.data?.find((u) => u.id === confirmer)?.name ?? "";

  return (
    <StepPanel
      title={`2. Cuando ${tech} termina el trabajo`}
      hint="Se agenda sola la llamada de confirmación. El ticket no se cierra hasta que el cliente confirme."
      error={done.error ?? assign.error}
    >
      {work && (
        <p className="text-sm">
          <CalendarCheck size={16} aria-hidden className="mr-1.5 inline align-[-3px] text-brand" />
          Tarea en la agenda de <strong>{tech}</strong> · {when(work.startsAt)}
          <Button size="sm" variant="ghost" onClick={() => setReassigning((r) => !r)}>
            {reassigning ? "No reasignar" : "Reasignar"}
          </Button>
        </p>
      )}
      {reassigning ? (
        <ReassignForm
          onSubmit={(assigneeId, at, who) =>
            assign.mutate({ assigneeId, scheduledAt: at }, { onSuccess: () => (setReassigning(false), onNotice(`Reasignado a ${who}.`)) })
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
              const at = slots[slot]?.at ?? slots[1]!.at;
              done.mutate(
                { confirmerId: confirmer, confirmAt: at, ...(h > 0 && { minutes: Math.round(h * 60) }), ...(note.trim() && { note: note.trim() }) },
                { onSuccess: () => onNotice(`Listo: la llamada de confirmación quedó en la agenda de ${name}.`) },
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
            onClick={() => confirm.mutate({ ok: true, ...extra }, { onSuccess: () => onNotice(`Ticket #${t.number} cerrado.`) })}
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
                confirm.mutate(
                  { ok: false, retryAt: toInstant(date, time), ...extra },
                  { onSuccess: () => (setRetry(false), onNotice(`Vuelve a ${tech}: quedó en su agenda.`)) },
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
