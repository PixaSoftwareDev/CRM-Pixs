import { zodResolver } from "@hookform/resolvers/zod";
import type { ProjectDetail } from "@crm/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { centsToInput, parsePesos } from "../../lib/format";
import { useServerErrors } from "../clients/useServerErrors";
import { useClientOptions, useTeam } from "../tasks/api";
import { todayAr } from "../tasks/time";
import { useCreateProject, useUpdateProject } from "./api";

const schema = z
  .object({
    name: z.string().trim().min(1, { message: "Poné un nombre" }).max(160),
    clientId: z.string().min(1, { message: "Elegí el cliente" }),
    implementerId: z.string(),
    startsOn: z.string(),
    dueOn: z.string(),
    estimatedHours: z.string().regex(/^\d*$/, { message: "Solo números" }),
    saleAmount: z.string().refine((v) => parsePesos(v) !== null, { message: "Monto inválido" }),
    paymentTerms: z.string().max(200),
    scope: z.string().max(4000),
  })
  .refine((v) => !v.startsOn || !v.dueOn || v.dueOn >= v.startsOn, { message: "No puede ser antes del inicio", path: ["dueOn"] });
type Values = z.infer<typeof schema>;

const textarea =
  "w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

/**
 * Alta manual (ventas anteriores al embudo) o edición de un proyecto. Sin
 * `project` crea; con `project` edita (el cliente no se cambia).
 */
export function ProjectFormDialog({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  project?: ProjectDetail;
  onClose: () => void;
  onSaved: (msg: string, id: string) => void;
}) {
  const clients = useClientOptions();
  const team = useTeam();
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? "");
  const mutation = project ? update : create;
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const serverError = useServerErrors(form, mutation.error);
  const err = form.formState.errors;

  useEffect(() => {
    if (!open) return;
    mutation.reset();
    form.reset({
      name: project?.name ?? "",
      clientId: project?.client.id ?? "",
      implementerId: project?.implementer?.id ?? "",
      // Hoy solo como sugerencia en el alta: al editar, un proyecto sin inicio sigue sin inicio.
      startsOn: project ? (project.startsOn ?? "") : todayAr(),
      dueOn: project?.dueOn ?? "",
      estimatedHours: project?.estimatedHours?.toString() ?? "",
      saleAmount: project?.sale.amount ? centsToInput(project.sale.amount) : "",
      paymentTerms: project?.sale.paymentTerms ?? "",
      scope: project?.scope ?? "",
    });
  }, [open]);

  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      name: v.name,
      implementerId: v.implementerId || null,
      startsOn: v.startsOn || null,
      dueOn: v.dueOn || null,
      estimatedHours: v.estimatedHours ? Number(v.estimatedHours) : null,
      saleAmount: v.saleAmount ? parsePesos(v.saleAmount) : null,
      paymentTerms: v.paymentTerms.trim() || null,
      scope: v.scope.trim() || null,
    };
    if (project) {
      await update.mutateAsync(body);
      onSaved(`Proyecto "${v.name}" actualizado.`, project.id);
    } else {
      const res = await create.mutateAsync({ ...body, clientId: v.clientId });
      onSaved(`Proyecto "${v.name}" creado.`, res.id);
    }
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project ? "Editar proyecto" : "Proyecto manual"}
      description={project ? undefined : "Para ventas que no pasaron por el embudo."}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proyecto" error={err.name?.message}>
            <Input autoFocus aria-invalid={!!err.name} {...form.register("name")} />
          </Field>
          <Field label="Cliente" error={err.clientId?.message}>
            <Select disabled={!!project} aria-invalid={!!err.clientId} {...form.register("clientId")}>
              <option value="">Elegí…</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {project && <option value={project.client.id}>{project.client.name}</option>}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Implementa" className="sm:col-span-2">
            <Select {...form.register("implementerId")}>
              <option value="">Sin asignar</option>
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Inicio">
            <Input type="date" {...form.register("startsOn")} />
          </Field>
          <Field label="Entrega" error={err.dueOn?.message}>
            <Input type="date" {...form.register("dueOn")} />
          </Field>
          <Field label="Horas estimadas" error={err.estimatedHours?.message}>
            <Input inputMode="numeric" {...form.register("estimatedHours")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monto de la venta ($)" error={err.saleAmount?.message}>
            <Input inputMode="decimal" {...form.register("saleAmount")} />
          </Field>
          <Field label="Forma de pago">
            <Input placeholder="3 cuotas" {...form.register("paymentTerms")} />
          </Field>
        </div>
        <Field label="Qué se vendió">
          <textarea rows={3} className={textarea} {...form.register("scope")} />
        </Field>
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {project ? "Guardar" : "Crear proyecto"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
