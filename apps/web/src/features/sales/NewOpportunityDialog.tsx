import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { parsePesos } from "../../lib/format";
import { useServerErrors } from "../clients/useServerErrors";
import { useClientOptions, useMyId, useTeam } from "../tasks/api";
import { addDays, toInstant, todayAr } from "../tasks/time";
import { useCreateOpportunity } from "./api";

const NEW = "__nuevo__";

const formSchema = z
  .object({
    clientId: z.string(),
    clientName: z.string().trim().max(160),
    contactName: z.string().trim().max(160),
    phone: z.string().trim().max(40),
    title: z.string().trim().min(1, { message: "Contá qué se le vende" }).max(200),
    amount: z.string().refine((v) => parsePesos(v) !== null, { message: "Monto inválido" }),
    ownerId: z.string().min(1),
    callDate: z.string(),
    callTime: z.string(),
  })
  .refine((v) => v.clientId !== "" , { message: "Elegí un cliente", path: ["clientId"] })
  .refine((v) => v.clientId !== NEW || v.clientName !== "", { message: "Poné el nombre del negocio", path: ["clientName"] });

type FormValues = z.infer<typeof formSchema>;

/** "+ Potencial": un cliente que todavía no compró entra al embudo con su primer llamado agendado. */
export function NewOpportunityDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const me = useMyId();
  const clients = useClientOptions();
  const team = useTeam();
  const create = useCreateOpportunity();
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const serverError = useServerErrors(form, create.error);
  const clientId = form.watch("clientId");
  const err = form.formState.errors;

  useEffect(() => {
    if (!open) return;
    create.reset();
    form.reset({
      clientId: NEW,
      clientName: "",
      contactName: "",
      phone: "",
      title: "",
      amount: "",
      ownerId: me,
      callDate: addDays(todayAr(), 1),
      callTime: "10:00",
    });
  }, [open]);

  const onSubmit = form.handleSubmit(async (v) => {
    const isNew = v.clientId === NEW;
    await create.mutateAsync({
      ...(isNew
        ? { newClient: { name: v.clientName, ...(v.contactName && { contactName: v.contactName }), ...(v.phone && { phone: v.phone }) } }
        : { clientId: v.clientId }),
      title: v.title,
      amount: parsePesos(v.amount) ?? 0,
      ownerId: v.ownerId,
      firstCallAt: v.callDate && v.callTime ? toInstant(v.callDate, v.callTime) : null,
    });
    const name = isNew ? v.clientName : clients.data?.find((c) => c.id === v.clientId)?.name;
    onCreated(`${name} entró al embudo como potencial${v.callDate ? " con el primer llamado agendado" : ""}.`);
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} title="Nuevo potencial" description="Entra en la etapa Potencial; el embudo avanza solo con sus tareas.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field label="Cliente" error={err.clientId?.message}>
          <Select {...form.register("clientId")}>
            <option value={NEW}>+ Cliente nuevo</option>
            {clients.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {clientId === NEW && (
          <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
            <Field label="Negocio" error={err.clientName?.message}>
              <Input autoFocus placeholder="Óptica Central" aria-invalid={!!err.clientName} {...form.register("clientName")} />
            </Field>
            <Field label="Contacto">
              <Input placeholder="Martín Sosa" {...form.register("contactName")} />
            </Field>
            <Field label="Teléfono">
              <Input type="tel" placeholder="+54 11…" {...form.register("phone")} />
            </Field>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="Qué se le vende" error={err.title?.message}>
            <Input placeholder="Web institucional + turnos" aria-invalid={!!err.title} {...form.register("title")} />
          </Field>
          <Field label="Monto estimado ($)" error={err.amount?.message}>
            <Input inputMode="decimal" placeholder="380.000" {...form.register("amount")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Responsable">
            <Select {...form.register("ownerId")}>
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me ? `${u.name} (yo)` : u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Primer llamado" hint="Dejalo vacío para no agendar">
            <Input type="date" {...form.register("callDate")} />
          </Field>
          <Field label="Hora">
            <Input type="time" step={300} {...form.register("callTime")} />
          </Field>
        </div>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Agregar al embudo
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
