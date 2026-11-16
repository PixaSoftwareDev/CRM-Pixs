import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { useServerErrors } from "../clients/useServerErrors";
import { useClientOptions, useCreateTask, useMyId, useTaskTypes, useTeam } from "./api";
import { durationLabel, spanMinutes, toHHMM, toInstant, toMinutes } from "./time";

const formSchema = z
  .object({
    title: z.string().trim().min(1, { message: "Escribí qué hay que hacer" }).max(200),
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
  const serverError = useServerErrors(form, create.error);
  const [start, end] = form.watch(["start", "end"]);

  const typeOf = (d: TaskDraft) =>
    types.data?.find((t) => t.id === d.typeId) ?? types.data?.find((t) => t.name === d.typeName) ?? types.data?.[0];

  useEffect(() => {
    if (!draft) return;
    create.reset();
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
      await save(v);
    } finally {
      sending.current = false;
    }
  });

  const save = async (v: FormValues) => {
    await create.mutateAsync({
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
    onCreated?.(`Agendada "${v.title}"${v.assigneeId !== me && who ? ` en la agenda de ${who.name}` : ""}.`);
    onClose();
  };

  const minutes = start && end ? spanMinutes(start, end) : 0;
  const err = form.formState.errors;

  return (
    <Dialog open={!!draft} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field label="Tarea" error={err.title?.message}>
          <Input autoFocus placeholder="Qué hay que hacer…" aria-invalid={!!err.title} {...form.register("title")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {draft?.ticketId ? (
            <Field label="Cliente" hint="El del ticket">
              <Input value={draft.clientName ?? ""} readOnly disabled />
            </Field>
          ) : (
            <Field label="Cliente">
              <Select {...form.register("clientId")}>
                <option value="">Sin cliente</option>
                {clients.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Tipo de tarea" error={err.typeId?.message}>
            <Select {...form.register("typeId")}>
              {types.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Día" error={err.date?.message}>
            <Input type="date" {...form.register("date")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Desde" error={err.start?.message}>
              <Input type="time" step={300} {...form.register("start")} />
            </Field>
            <Field label="Hasta" error={err.end?.message} hint={minutes > 0 ? durationLabel(minutes) : undefined}>
              <Input type="time" step={300} aria-invalid={!!err.end} {...form.register("end")} />
            </Field>
          </div>
          <Field label="Responsable" className="sm:col-span-2">
            <Select {...form.register("assigneeId")}>
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me ? `${u.name} (yo)` : u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Confirmar y agendar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
