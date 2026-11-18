import { zodResolver } from "@hookform/resolvers/zod";
import type { OpportunityCardDto } from "@crm/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogActions } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { money } from "../../lib/format";
import { useServerErrors } from "../clients/useServerErrors";
import { useTeam } from "../tasks/api";
import { addDays, toInstant, todayAr, weekday } from "../tasks/time";
import { useLoseOpportunity, useWinOpportunity } from "./api";

/** Próximo día hábil (para sugerir el kickoff). */
function nextWorkday(from: string): string {
  let d = addDays(from, 1);
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
  return d;
}

const winSchema = z
  .object({
    projectName: z.string().trim().min(1, { message: "Poné el nombre del proyecto" }).max(160),
    implementerId: z.string().min(1, { message: "Elegí quién implementa" }),
    paymentTerms: z.string().trim().min(1, { message: "Indicá la forma de pago" }).max(200),
    scope: z.string().max(4000),
    startsOn: z.iso.date({ message: "Fecha inválida" }),
    dueOn: z.string(),
    estimatedHours: z.string().regex(/^\d*$/, { message: "Solo números" }),
    kickoffDate: z.iso.date({ message: "Fecha inválida" }),
    kickoffTime: z.string().regex(/^\d{2}:\d{2}$/, { message: "Hora inválida" }),
  })
  .refine((v) => !v.dueOn || v.dueOn >= v.startsOn, { message: "No puede ser antes del inicio", path: ["dueOn"] });
type WinValues = z.infer<typeof winSchema>;

/**
 * "Venta ganada": pide lo mínimo para arrancar el proyecto. Al confirmar, el
 * server crea el proyecto, activa al cliente y agenda el kickoff.
 */
export function WinDialog({
  opp,
  onClose,
  onDone,
}: {
  opp: OpportunityCardDto | null;
  onClose: () => void;
  onDone: (msg: string, projectId: string) => void;
}) {
  const team = useTeam();
  const win = useWinOpportunity(opp?.id ?? "");
  const form = useForm<WinValues>({ resolver: zodResolver(winSchema) });
  const serverError = useServerErrors(form, win.error);
  const err = form.formState.errors;

  useEffect(() => {
    if (!opp) return;
    win.reset();
    const today = todayAr();
    form.reset({
      projectName: opp.title,
      implementerId: "",
      paymentTerms: "",
      scope: "",
      startsOn: today,
      dueOn: "",
      estimatedHours: "",
      kickoffDate: nextWorkday(today),
      kickoffTime: "10:00",
    });
  }, [opp]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!opp) return;
    const res = await win.mutateAsync({
      projectName: v.projectName,
      implementerId: v.implementerId,
      paymentTerms: v.paymentTerms,
      scope: v.scope,
      startsOn: v.startsOn,
      dueOn: v.dueOn || null,
      estimatedHours: v.estimatedHours ? Number(v.estimatedHours) : null,
      kickoffAt: toInstant(v.kickoffDate, v.kickoffTime),
    });
    const who = team.data?.find((u) => u.id === v.implementerId)?.name ?? "el implementador";
    onDone(
      `${opp.client.name} pasó a Implementación: se creó el proyecto "${v.projectName}", asignado a ${who}, con el kickoff agendado.`,
      res.projectId,
    );
    onClose();
  });

  return (
    <Dialog
      open={!!opp}
      onClose={onClose}
      title="Venta ganada"
      description={opp ? `${opp.client.name} · ${opp.title} · ${money(opp.amount)}` : undefined}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proyecto" error={err.projectName?.message}>
            <Input aria-invalid={!!err.projectName} {...form.register("projectName")} />
          </Field>
          <Field label="Implementa" error={err.implementerId?.message}>
            <Select aria-invalid={!!err.implementerId} {...form.register("implementerId")}>
              <option value="">Elegí…</option>
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Forma de pago" error={err.paymentTerms?.message}>
          <Input placeholder="50% anticipo + 2 cuotas" aria-invalid={!!err.paymentTerms} {...form.register("paymentTerms")} />
        </Field>
        <Field label="Qué se vendió">
          <textarea
            rows={3}
            placeholder="Alcance acordado con el cliente…"
            className="w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            {...form.register("scope")}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Inicio" error={err.startsOn?.message}>
            <Input type="date" aria-invalid={!!err.startsOn} {...form.register("startsOn")} />
          </Field>
          <Field label="Entrega estimada" error={err.dueOn?.message}>
            <Input type="date" aria-invalid={!!err.dueOn} {...form.register("dueOn")} />
          </Field>
          <Field label="Horas estimadas" error={err.estimatedHours?.message}>
            <Input inputMode="numeric" placeholder="80" aria-invalid={!!err.estimatedHours} {...form.register("estimatedHours")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kickoff (llamada)" error={err.kickoffDate?.message}>
            <Input type="date" aria-invalid={!!err.kickoffDate} {...form.register("kickoffDate")} />
          </Field>
          <Field label="Hora" error={err.kickoffTime?.message}>
            <Input type="time" step={300} aria-invalid={!!err.kickoffTime} {...form.register("kickoffTime")} />
          </Field>
        </div>
        <p className="rounded-[10px] bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          Se crea el proyecto con los datos de la venta y del contacto, el cliente pasa a Activo y el kickoff queda en la agenda
          del implementador. El plan de cuotas se arma en Finanzas.
        </p>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <DialogActions className="flex flex-wrap justify-end gap-2 pt-1 max-sm:[&>:last-child]:flex-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Pasar a implementación
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const loseSchema = z.object({ reason: z.string().trim().min(1, { message: "Indicá el motivo" }).max(500) });

export function LoseDialog({
  opp,
  onClose,
  onDone,
}: {
  opp: OpportunityCardDto | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const lose = useLoseOpportunity(opp?.id ?? "");
  const form = useForm<{ reason: string }>({ resolver: zodResolver(loseSchema), defaultValues: { reason: "" } });
  const serverError = useServerErrors(form, lose.error);

  useEffect(() => {
    if (opp) {
      lose.reset();
      form.reset({ reason: "" });
    }
  }, [opp]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!opp) return;
    await lose.mutateAsync(v);
    onDone(`${opp.client.name} salió del embudo: ${v.reason}.`);
    onClose();
  });

  return (
    <Dialog open={!!opp} onClose={onClose} title="Marcar como perdida" description={opp ? `${opp.client.name} · ${opp.title}` : undefined}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field label="Motivo" error={form.formState.errors.reason?.message}>
          <Input autoFocus data-autofocus aria-invalid={!!form.formState.errors.reason} placeholder="Ej: precio, eligió otro proveedor, no responde…" {...form.register("reason")} />
        </Field>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <DialogActions className="flex flex-wrap justify-end gap-2 max-sm:[&>:last-child]:flex-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" disabled={form.formState.isSubmitting}>
            Marcar perdida
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
