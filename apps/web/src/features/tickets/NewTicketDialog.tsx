import { zodResolver } from "@hookform/resolvers/zod";
import { bodyText, TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_TYPES, ticketCreate } from "@crm/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogActions } from "../../components/ui/Dialog";
import { Field, Input, Select, TextArea } from "../../components/ui/Field";
import { day } from "../../lib/format";
import { useServerErrors } from "../clients/useServerErrors";
import { useProjects } from "../projects/api";
import { useClientOptions, useMyId, useTeam } from "../tasks/api";
import { arParts, nextSlot, toInstant, todayAr } from "../tasks/time";
import { useCreateTicket } from "./api";
import { TICKET_CHANNEL, TICKET_PRIORITY, TICKET_TYPE } from "./labels";

const schema = z
  .object({
    clientId: z.string().min(1, { message: "Elegí el cliente" }),
    projectId: z.string(),
    type: z.enum(TICKET_TYPES),
    channel: z.enum(TICKET_CHANNELS),
    reportedById: z.string().min(1),
    receivedDate: z.iso.date({ message: "Fecha inválida" }).refine((d) => d <= todayAr(), { message: "No puede ser futura" }),
    receivedTime: z.string().regex(/^\d{2}:\d{2}$/, { message: "Hora inválida" }),
    assigneeId: z.string(),
    workDate: z.string(),
    workTime: z.string(),
    dueOn: z.string(),
    priority: z.enum(TICKET_PRIORITIES),
    title: ticketCreate.shape.title,
    description: bodyText(),
  })
  .refine((v) => !v.dueOn || v.dueOn >= v.receivedDate, { message: "No puede ser antes de la carga", path: ["dueOn"] })
  .refine((v) => !v.assigneeId || (/^\d{4}-\d{2}-\d{2}$/.test(v.workDate) && /^\d{2}:\d{2}$/.test(v.workTime)), {
    message: "Indicá cuándo lo trabaja",
    path: ["workDate"],
  });
type Values = z.infer<typeof schema>;

const textarea =
  "w-full resize-y rounded-[10px] border border-line bg-white px-3 py-2 text-sm break-words text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

/** "Cargar ticket": si ya se sabe quién lo hace, queda asignado y agendado de una. */
export function NewTicketDialog({
  open,
  onClose,
  onCreated,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, number: number) => void;
  /** Cuando se carga desde un proyecto: el cliente y el proyecto ya vienen puestos. */
  preset?: { clientId: string; projectId: string } | undefined;
}) {
  const me = useMyId();
  const clients = useClientOptions();
  const team = useTeam();
  const projects = useProjects();
  const create = useCreateTicket();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const serverError = useServerErrors(form, create.error);
  const err = form.formState.errors;
  const [clientId, assigneeId, workDate, workTime] = form.watch(["clientId", "assigneeId", "workDate", "workTime"]);
  const clientProjects = (projects.data ?? []).filter(
    (p) => p.client.id === clientId && (p.id === preset?.projectId || (p.status !== "entregado" && p.status !== "cancelado")),
  );

  useEffect(() => {
    if (!open) return;
    create.reset();
    const now = arParts(new Date().toISOString());
    form.reset({
      clientId: preset?.clientId ?? "",
      projectId: preset?.projectId ?? "",
      type: "falla",
      channel: "whatsapp",
      reportedById: me,
      receivedDate: now.date,
      receivedTime: now.time,
      assigneeId: "",
      workDate: todayAr(),
      workTime: nextSlot(),
      dueOn: "",
      priority: "normal",
      title: "",
      description: "",
    });
  }, [open]);

  // Si el cliente tiene un solo proyecto activo, se sugiere solo. Desde un proyecto, queda ese.
  useEffect(() => {
    const fromPreset = preset && clientId === preset.clientId && clientProjects.some((p) => p.id === preset.projectId);
    form.setValue("projectId", fromPreset ? preset.projectId : clientProjects.length === 1 ? (clientProjects[0]?.id ?? "") : "");
  }, [clientId, clientProjects.length]);

  const onSubmit = form.handleSubmit(async (v) => {
    // Si falla, el error queda en `create.error` y se muestra en el formulario.
    const res = await create
      .mutateAsync({
      clientId: v.clientId,
      projectId: v.projectId || null,
      type: v.type,
      channel: v.channel,
      priority: v.priority,
      title: v.title,
      description: v.description.trim() || undefined,
      reportedById: v.reportedById,
      receivedAt: toInstant(v.receivedDate, v.receivedTime),
      dueOn: v.dueOn || null,
      ...(v.assigneeId && { assignTo: { assigneeId: v.assigneeId, scheduledAt: toInstant(v.workDate, v.workTime) } }),
      })
      .catch(() => null);
    if (!res) return;
    onCreated(res.id, res.number);
    onClose();
  });

  const who = team.data?.find((u) => u.id === assigneeId)?.name;
  const people = team.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} title="Cargar ticket" className="max-w-2xl">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente" error={err.clientId?.message}>
            <Select autoFocus data-autofocus aria-invalid={!!err.clientId} {...form.register("clientId")}>
              <option value="">Elegí…</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Proyecto">
            <Select disabled={!clientProjects.length} {...form.register("projectId")}>
              <option value="">{clientProjects.length ? "Sin proyecto" : "El cliente no tiene proyectos activos"}</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo">
            <Select {...form.register("type")}>
              {TICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TICKET_TYPE[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entró por">
            <Select {...form.register("channel")}>
              {TICKET_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {TICKET_CHANNEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Urgencia">
            <Select {...form.register("priority")}>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lo cargó">
            <Select {...form.register("reportedById")}>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me ? `${u.name} (yo)` : u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha de carga" error={err.receivedDate?.message}>
            <Input type="date" max={todayAr()} aria-invalid={!!err.receivedDate} {...form.register("receivedDate")} />
          </Field>
          <Field label="Hora" error={err.receivedTime?.message}>
            <Input type="time" aria-invalid={!!err.receivedTime} {...form.register("receivedTime")} />
          </Field>
          <Field label="Se le entrega a">
            <Select {...form.register("assigneeId")}>
              <option value="">Sin asignar todavía</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          {assigneeId ? (
            <>
              <Field label="Lo trabaja el día" error={err.workDate?.message}>
                <Input type="date" aria-invalid={!!err.workDate} {...form.register("workDate")} />
              </Field>
              <Field label="A las">
                <Input type="time" step={300} {...form.register("workTime")} />
              </Field>
            </>
          ) : (
            <div className="hidden sm:col-span-2 sm:block" aria-hidden />
          )}
          <Field label="Compromiso con el cliente" error={err.dueOn?.message}>
            <Input type="date" min={form.watch("receivedDate")} aria-invalid={!!err.dueOn} {...form.register("dueOn")} />
          </Field>
        </div>
        <Field label="Título" error={err.title?.message}>
          <TextArea singleLine placeholder="Ej: No imprime la factura desde la caja 2" aria-invalid={!!err.title} {...form.register("title")} />
        </Field>
        <Field label="Descripción">
          <textarea rows={3} placeholder="Qué pasa, qué pidió el cliente, datos para resolverlo…" className={textarea} {...form.register("description")} />
        </Field>
        <p className="rounded-[10px] bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          {who
            ? `Al cargarlo se crea la tarea en la agenda de ${who} para el ${day(workDate)} a las ${workTime} y el ticket pasa a "En trabajo".`
            : "Queda como Nuevo, sin asignar, hasta que alguien lo tome."}
        </p>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <DialogActions className="flex justify-end gap-2 max-sm:[&>:last-child]:flex-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Cargar ticket
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
