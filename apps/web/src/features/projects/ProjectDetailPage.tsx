import { PROJECT_PHASES, type ProjectDetail } from "@crm/shared";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, Mail, Pencil, Phone, Plus, Zap } from "lucide-react";
import { useState } from "react";
import { ArchiveButton, ArchivedBanner } from "../../components/ui/Archive";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { cn } from "../../components/ui/cn";
import { Select } from "../../components/ui/Field";
import { Notice, useNotice } from "../../components/ui/Notice";
import { ErrorBox, Skeleton } from "../../components/ui/States";
import { useCopy } from "../../hooks/useCopy";
import { isNotFound } from "../../lib/api";
import { day, initials, money, when } from "../../lib/format";
import { projectRoute } from "../../router";
import { TASK_STATUS, tint } from "../tasks/labels";
import { TaskDialog } from "../tasks/TaskDialog";
import { type TaskDraft, TaskFormDialog } from "../tasks/TaskFormDialog";
import { nextSlot, todayAr } from "../tasks/time";
import { useProject, useUpdateProject } from "./api";
import { NewTicketDialog } from "../tickets/NewTicketDialog";
import { TICKET_STATUS, TICKET_TYPE } from "../tickets/labels";
import { alertsOf, HEALTH, PHASE, STATUS_LABEL } from "./labels";
import { ProjectFormDialog } from "./ProjectFormDialog";

export function ProjectDetailPage() {
  const { projectId } = projectRoute.useParams();
  const project = useProject(projectId);
  const notice = useNotice();

  if (project.error) {
    return isNotFound(project.error) ? (
      <ErrorBox error={new Error("Este proyecto no existe: puede ser un link viejo o mal copiado.")} />
    ) : (
      <ErrorBox error={project.error} onRetry={() => void project.refetch()} />
    );
  }
  if (!project.data) return <Skeleton className="h-[400px]" />;

  return (
    <>
      <Link to="/proyectos" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Proyectos
      </Link>
      <Header project={project.data} onNotice={notice.show} />
      <div className="grid gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        <SaleCard project={project.data} />
        <ContactCard project={project.data} />
      </div>
      <TicketsCard project={project.data} onNotice={notice.show} />
      <TasksCard project={project.data} onNotice={notice.show} />
      <Notice message={notice.message} />
    </>
  );
}

function Header({ project: p, onNotice }: { project: ProjectDetail; onNotice: (m: string) => void }) {
  const update = useUpdateProject(p.id);
  const [editing, setEditing] = useState(false);
  const h = HEALTH[p.health];
  const alerts = alertsOf(p, todayAr());
  const phaseIdx = PROJECT_PHASES.indexOf(p.phase);
  const next = PROJECT_PHASES[phaseIdx + 1];
  const done = p.status === "entregado" || p.status === "cancelado";

  return (
    <Card className="flex flex-col gap-4 p-5">
      {p.archivedAt && (
        <ArchivedBanner
          label="Este proyecto está dado de baja"
          archivedAt={p.archivedAt}
          pending={update.isPending}
          onRestore={() => update.mutate({ archived: false }, { onSuccess: () => onNotice("Proyecto reactivado.") })}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Proyecto</p>
          <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
          <Link to="/clientes/$clientId" params={{ clientId: p.client.id }} className="text-sm font-medium text-brand hover:underline">
            {p.client.name}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.createdAutomatically && (
            <Chip tone="purple">
              <Zap size={12} aria-hidden /> Creado desde la venta · {when(p.createdAt, false)}
            </Chip>
          )}
          <Chip tone={h.tone}>{h.label}</Chip>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={13} aria-hidden /> Editar
          </Button>
          {!p.archivedAt && (
            <ArchiveButton
              what="el proyecto"
              consequences={`"${p.name}" y sus tickets dejan de aparecer en Proyectos, Tickets, la ficha del cliente y los selectores. Las facturas y cobros siguen en la cuenta corriente.`}
              pending={update.isPending}
              onConfirm={() => update.mutateAsync({ archived: true }).then(() => onNotice("Proyecto dado de baja."))}
            />
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-5">
        <Kpi label="Implementador" value={p.implementer?.name ?? "Sin asignar"} />
        <Kpi label="Etapa" value={p.status === "entregado" ? "Terminado" : PHASE[p.phase]} />
        <Kpi label="Inicio" value={day(p.startsOn)} />
        <Kpi label={p.dueIsEstimate ? "Entrega estimada" : "Entrega"} value={day(p.dueOn)} />
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted">Avance</dt>
          <dd className="flex items-center gap-2">
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(p.progress, 2)}%`, background: h.bar }} />
            </span>
            <strong className="text-sm">{p.progress}%</strong>
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted">
            Horas: <strong className="text-ink">{p.hoursUsed} h</strong>
            {p.estimatedHours !== null && ` de ${p.estimatedHours} h estimadas`}
          </span>
          {alerts.length > 0 && <span className="font-semibold text-red-700">{alerts.join(" · ")}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            Estado
            <Select
              value={p.status}
              onChange={(e) =>
                update.mutate(
                  { status: e.target.value as ProjectDetail["status"] },
                  { onSuccess: () => onNotice(`Estado: ${STATUS_LABEL[e.target.value as ProjectDetail["status"]]}.`) },
                )
              }
              className="h-8 w-auto"
            >
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </label>
          {!done && next && (
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ phase: next }, { onSuccess: () => onNotice(`Pasó a ${PHASE[next]}.`) })}
            >
              Pasar a {PHASE[next]} →
            </Button>
          )}
          {!done && !next && (
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: "entregado" }, { onSuccess: () => onNotice("Proyecto entregado.") })}
            >
              <Check size={14} aria-hidden /> Marcar entregado
            </Button>
          )}
        </div>
      </div>
      {update.error && <p role="alert" className="text-sm text-red-700">{update.error.message}</p>}

      <ProjectFormDialog open={editing} project={p} onClose={() => setEditing(false)} onSaved={onNotice} />
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

function SaleCard({ project: p }: { project: ProjectDetail }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-bold">Datos de la venta</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Monto" value={p.sale.amount === null ? "—" : money(p.sale.amount)} />
        <Kpi label="Forma de pago" value={p.sale.paymentTerms ?? "—"} />
        <Kpi label="Vendió" value={p.sale.seller?.name ?? "—"} />
        <Kpi label="Cierre" value={day(p.sale.soldOn)} />
      </dl>
      <div>
        <p className="text-xs text-muted">Qué se vendió</p>
        <p className="mt-0.5 text-sm whitespace-pre-line">{p.scope ?? "—"}</p>
      </div>
    </Card>
  );
}

function ContactCard({ project: p }: { project: ProjectDetail }) {
  const { copied, copy } = useCopy();
  const c = p.contact;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-bold">Contacto del cliente</h2>
      {c ? (
        <>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-800">
              {initials(c.name)}
            </span>
            <div>
              <strong>{c.name}</strong>
              {c.jobTitle && <p className="text-xs text-muted">{c.jobTitle}</p>}
            </div>
          </div>
          {[
            { key: "tel", icon: <Phone size={14} aria-hidden />, value: c.phone },
            { key: "mail", icon: <Mail size={14} aria-hidden />, value: c.email },
          ].map(
            ({ key, icon, value }) =>
              value && (
                <div key={key} className="flex items-center justify-between gap-2 rounded-[10px] bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    {icon} {value}
                  </span>
                  <Button size="sm" variant="ghost" aria-label={`Copiar ${value}`} onClick={() => void copy(key, value)}>
                    {copied === key ? <Check size={13} aria-hidden className="text-green-700" /> : <Copy size={13} aria-hidden />}
                  </Button>
                </div>
              ),
          )}
        </>
      ) : (
        <p className="text-sm text-muted">El cliente no tiene contactos cargados.</p>
      )}
    </Card>
  );
}

function TicketsCard({ project: p, onNotice }: { project: ProjectDetail; onNotice: (m: string) => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Tickets del proyecto</h2>
        <span className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {p.pendingTickets} pendientes · {p.resolvedTickets} resueltos
          {/* Un proyecto de baja no recibe tickets nuevos (no figura en los selectores). */}
          {!p.archivedAt && (
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden /> Cargar ticket
            </Button>
          )}
        </span>
      </div>
      <NewTicketDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(_id, number) => onNotice(`Ticket #${number} cargado en este proyecto.`)}
        preset={{ clientId: p.client.id, projectId: p.id }}
      />
      {p.tickets.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay tickets en este proyecto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Nro.</th>
                <th className="py-2 pr-3 font-medium">Ticket</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 pr-3 font-medium">Compromiso</th>
                <th className="py-2 font-medium">Lo tiene</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {p.tickets.map((t) => {
                const st = TICKET_STATUS[t.status as keyof typeof TICKET_STATUS] ?? { label: t.status, tone: "slate" as const };
                const closed = t.status === "resuelto" || t.status === "cancelado";
                return (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-3 text-muted tabular-nums">
                      <Link to="/tickets/$ticketId" params={{ ticketId: t.id }} className="hover:underline">
                        #{t.number}
                      </Link>
                    </td>
                    <td className={cn("py-2.5 pr-3", closed ? "text-muted" : "font-semibold")}>
                      <Link to="/tickets/$ticketId" params={{ ticketId: t.id }} className="hover:underline">
                        {t.title}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{TICKET_TYPE[t.type as keyof typeof TICKET_TYPE]?.label ?? t.type}</td>
                    <td className="py-2.5 pr-3">
                      <Chip tone={st.tone}>{st.label}</Chip>
                    </td>
                    <td className={cn("py-2.5 pr-3", t.overdue && "font-bold text-red-700")}>
                      {t.dueAt ? when(t.dueAt, false) : "—"}
                      {t.overdue && " · vencido"}
                    </td>
                    <td className="py-2.5">{t.assigneeName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TasksCard({ project: p, onNotice }: { project: ProjectDetail; onNotice: (m: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">Tareas del proyecto</h2>
          <p className="text-xs text-muted">Las mismas que ve cada uno en su agenda.</p>
        </div>
        <Button
          size="sm"
          onClick={() =>
            setDraft({ clientId: p.client.id, projectId: p.id, date: todayAr(), start: nextSlot(), ...(p.implementer && { assigneeId: p.implementer.id }) })
          }
        >
          Nueva tarea
        </Button>
      </div>
      {p.tasks.length === 0 ? (
        <p className="text-sm text-muted">No hay tareas para este proyecto.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {p.tasks.map((t) => {
            const isDone = t.status === "hecha";
            const overdue = !isDone && t.startsAt !== null && new Date(t.startsAt) < new Date();
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpenId(t.id)}
                className={cn("flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left hover:brightness-95", isDone && "opacity-70")}
                style={{ background: tint(t.type.color, isDone), boxShadow: `inset 4px 0 0 ${t.type.color}` }}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold">
                  {initials(t.assignee.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-semibold", isDone && "line-through", overdue && "text-red-700")}>
                    {t.title}
                  </span>
                  <span className="block text-xs text-slate-600">
                    {t.type.name} · {t.assignee.name} · {when(t.startsAt)}
                  </span>
                </span>
                <Chip tone={overdue ? "red" : TASK_STATUS[t.status].tone} className="bg-white/70">
                  {overdue ? "Vencida" : TASK_STATUS[t.status].label}
                </Chip>
              </button>
            );
          })}
        </div>
      )}
      <TaskDialog taskId={openId} onClose={() => setOpenId(null)} onSaved={onNotice} />
      <TaskFormDialog draft={draft} onClose={() => setDraft(null)} onCreated={onNotice} />
    </Card>
  );
}
