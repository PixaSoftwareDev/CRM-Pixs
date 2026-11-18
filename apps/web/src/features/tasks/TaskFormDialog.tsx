import { taskTitle } from "@crm/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogActions } from "../../components/ui/Dialog";
import { Field, Input, Select, TextArea } from "../../components/ui/Field";
import { InlineConfirm } from "../../components/ui/InlineConfirm";
import { useEnterFlow } from "../../hooks/useEnterFlow";
import { ClientCombobox } from "../clients/ClientCombobox";
import { clip } from "../../lib/format";
import { useServerErrors } from "../clients/useServerErrors";
import { useClientOptions, useCreateTask, useMyId, useTaskTypes, useTeam } from "./api";
import { clashText, isOverlapError, useAvailability, useOverlapGate } from "./availability";
import { SlotPicker } from "./SlotPicker";
import { dayTitle, durationLabel, shiftEnd, spanMinutes, toHHMM, toInstant, toMinutes, todayAr } from "./time";

const formSchema = z
  .object({
    title: taskTitle,
    clientId: z.string(),
    typeId: z.string().min(1, { message: "Elegí un tipo" }),
    assigneeId: z.string().min(1),
    date: z.iso.date({ message: "Elegí el día" }),
    start: z.string().regex(/^\d{2}:\d{2}$/, { message: "Hora inválida" }),
    end: z.string().regex(/^\d{2}:\d{2}$/, { message: "Hora inválida" }),
  })
  // "Hasta" menor que "Desde" = termina al día siguiente (22:00 a 01:00).
  .refine((v) => spanMinutes(v.start, v.end) > 0, { message: "Tiene que terminar después de empezar", path: ["end"] })
  // El server no acepta menos de 5 minutos: avisarlo acá en vez de fallar al guardar.
  .refine((v) => spanMinutes(v.start, v.end) === 0 || spanMinutes(v.start, v.end) >= 5, {
    message: "Mínimo 5 minutos",
    path: ["end"],
  });

type FormValues = z.infer<typeof formSchema>;

export interface TaskDraft {
  title?: string;
  clientId?: string | null;
  /** Se guarda sin mostrarse (tareas creadas desde un proyecto). */
  projectId?: string;
  /** Tarea agregada a un ticket: hereda su cliente y proyecto (no se elige cliente). */
  ticketId?: string;
  /** Cliente que se muestra cuando no se puede elegir (el del ticket). */
  clientName?: string;
  typeName?: string | null;
  typeId?: string;
  assigneeId?: string;
  date: string;
  start: string;
  durationMinutes?: number;
}

/**
 * Confirmar y agendar una tarea. Llega con lo que se pudo deducir (carga rápida,
 * hueco de la agenda, cliente abierto) y el usuario lo revisa antes de guardar.
 */
export function TaskFormDialog({
  draft,
  onClose,
  onCreated,
  title = "Agendar tarea",
}: {
  draft: TaskDraft | null;
  onClose: () => void;
  onCreated?: (summary: string) => void;
  title?: string;
}) {
  const me = useMyId();
  const types = useTaskTypes();
  const team = useTeam();
  const clients = useClientOptions();
  const create = useCreateTask();
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  // El 409 de horario ocupado no es un error: se pregunta si agendar igual.
  const serverError = useServerErrors(form, isOverlapError(create.error) ? null : create.error);
  const [start, end, clientId, date, assigneeId] = form.watch(["start", "end", "clientId", "date", "assigneeId"]);
  // Agenda del responsable ese día: turnos libres y si el horario se pisa con algo.
  const availability = useAvailability({ assigneeId, date, start, end });
  const overlap = useOverlapGate(`${date}|${start}|${end}|${assigneeId}`);
  const whoName = assigneeId === me ? "vos" : (team.data?.find((u) => u.id === assigneeId)?.name ?? "el responsable");
  // Enter pasa de campo en campo y en el último pide confirmar (no agenda directo).
  const flow = useEnterFlow();
  const startField = form.register("start");

  const typeOf = (d: TaskDraft) =>
    types.data?.find((t) => t.id === d.typeId) ?? types.data?.find((t) => t.name === d.typeName) ?? types.data?.[0];

  useEffect(() => {
    if (!draft) return;
    create.reset();
    flow.reset();
    form.reset({
      title: draft.title ?? "",
      clientId: draft.clientId ?? "",
      typeId: typeOf(draft)?.id ?? "",
      assigneeId: draft.assigneeId ?? me,
      date: draft.date,
      start: draft.start,
      end: toHHMM(toMinutes(draft.start) + (draft.durationMinutes ?? 30)),
    });
    // Solo al abrir con un borrador nuevo: si se resetea cuando se refrescan los
    // tipos, se borra lo que el usuario ya tipeó.
  }, [draft]);

  // Si los tipos llegan con el formulario ya abierto, se completa solo el tipo.
  useEffect(() => {
    if (draft && types.data && !form.getValues("typeId")) form.setValue("typeId", typeOf(draft)?.id ?? "");
  }, [types.data]);

  // Doble clic en "Confirmar y agendar": una sola tarea.
  const sending = useRef(false);
  const onSubmit = form.handleSubmit(async (v) => {
    if (sending.current) return;
    sending.current = true;
    try {
      const clash = availability.clash ? clashText(availability.clash, whoName) : null;
      await overlap.run(clash, (allowOverlap) => save(v, allowOverlap));
    } finally {
      sending.current = false;
    }
  });

  const save = async (v: FormValues, allowOverlap = false) => {
    await create.mutateAsync({
      ...(allowOverlap && { allowOverlap }),
      title: v.title,
      typeId: v.typeId,
      clientId: v.clientId || null,
      ...(draft?.projectId && { projectId: draft.projectId }),
      ...(draft?.ticketId && { ticketId: draft.ticketId }),
      assigneeId: v.assigneeId,
      startsAt: toInstant(v.date, v.start),
      durationMinutes: spanMinutes(v.start, v.end),
    });
    const who = team.data?.find((u) => u.id === v.assigneeId);
    onCreated?.(`Agendada "${clip(v.title)}"${v.assigneeId !== me && who ? ` en la agenda de ${who.name}` : ""}.`);
    onClose();
  };

  const minutes = start && end ? spanMinutes(start, end) : 0;
  const err = form.formState.errors;

  return (
    <Dialog open={!!draft} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3" {...flow.container()}>
        <Field label="Tarea" error={err.title?.message}>
          <TextArea singleLine autoFocus data-autofocus placeholder="Qué hay que hacer…" aria-invalid={!!err.title} {...flow.field} {...form.register("title")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {draft?.ticketId ? (
            <Field label="Cliente" hint="El del ticket">
              <Input value={draft.clientName ?? ""} readOnly disabled />
            </Field>
          ) : (
            <Field label="Cliente">
              <ClientCombobox
                value={clientId ?? ""}
                selectedName={clients.data?.find((c) => c.id === clientId)?.name}
                onChange={(id) => form.setValue("clientId", id, { shouldDirty: true })}
                inputProps={flow.field}
              />
            </Field>
          )}
          <Field label="Tipo de tarea" error={err.typeId?.message}>
            <Select aria-invalid={!!err.typeId} {...flow.field} {...form.register("typeId")}>
              {types.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Día" error={err.date?.message} hint={dayHint(date)}>
            <Input type="date" aria-invalid={!!err.date} {...flow.field} {...form.register("date")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Desde" error={err.start?.message}>
              <Input
                type="time"
                step={300}
                aria-invalid={!!err.start}
                {...flow.field}
                {...startField}
                onChange={(e) => {
                  // Mover "desde" corre "hasta" con la misma duración (1 h si no había una válida).
                  const v = form.getValues();
                  form.setValue("end", shiftEnd(v.start, v.end, e.target.value), {
                    shouldDirty: true,
                    shouldValidate: form.formState.isSubmitted,
                  });
                  return startField.onChange(e);
                }}
              />
            </Field>
            <Field label="Hasta" error={err.end?.message} hint={minutes > 0 ? durationLabel(minutes) : undefined}>
              <Input type="time" step={300} aria-invalid={!!err.end} {...flow.field} {...form.register("end")} />
            </Field>
          </div>
          <Field label="Responsable" className="sm:col-span-2">
            <Select {...flow.field} {...form.register("assigneeId")}>
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me ? `${u.name} (yo)` : u.name}
                </option>
              ))}
            </Select>
          </Field>
          <SlotPicker
            className="sm:col-span-2"
            // Con la pregunta "¿agendar igual?" a la vista, el aviso no se repite.
            availability={overlap.ask ? { ...availability, clash: undefined } : availability}
            start={start ?? ""}
            duration={minutes > 0 ? minutes : 60}
            who={whoName}
            onPick={(next) => {
              // Igual que mover "desde" a mano: "hasta" acompaña con la misma duración.
              const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted };
              form.setValue("end", shiftEnd(form.getValues("start"), form.getValues("end"), next), opts);
              form.setValue("start", next, opts);
            }}
          />
        </div>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <DialogActions>
          {overlap.ask ? (
            <InlineConfirm
              message={overlap.ask.message}
              confirmLabel="Agendar igual"
              cancelLabel="Elegir otro horario"
              onConfirm={overlap.ask.retry}
              onCancel={overlap.cancel}
              disabled={create.isPending}
            />
          ) : flow.confirming ? (
            <InlineConfirm
              message="¿Agendar la tarea?"
              confirmLabel="Agendar"
              cancelLabel="Seguir editando"
              onConfirm={() => flow.accept(() => void onSubmit())}
              onCancel={flow.cancel}
              disabled={form.formState.isSubmitting}
            />
          ) : (
            <div className="flex flex-wrap justify-end gap-2 pt-1 max-sm:pt-0 max-sm:[&>:last-child]:flex-1">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Confirmar y agendar
              </Button>
            </div>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Debajo del día: "Hoy", o qué día es si no es hoy (para que no se agende en otra fecha sin querer). */
function dayHint(date: string | undefined): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const today = todayAr();
  if (date === today) return "Hoy";
  return `${dayTitle(date)}${date < today ? " · ya pasó" : ""}`;
}
