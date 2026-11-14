import { zodResolver } from "@hookform/resolvers/zod";
import {
  CLIENT_STATUSES,
  type ClientDetail,
  type ClientStatusChange,
  clientStatusChange,
  STATUSES_WITH_REASON,
} from "@crm/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { useChangeStatus } from "./api";
import { STATUS } from "./labels";
import { useServerErrors } from "./useServerErrors";

const needsReason = (s: string) => (STATUSES_WITH_REASON as readonly string[]).includes(s);

export function StatusDialog({ client, open, onClose }: { client: ClientDetail; open: boolean; onClose: () => void }) {
  const change = useChangeStatus(client.id);
  const form = useForm<ClientStatusChange>({
    resolver: zodResolver(clientStatusChange),
    defaultValues: { status: client.status, reason: client.statusReason ?? "" },
  });
  const status = form.watch("status");
  const serverError = useServerErrors(form, change.error);

  // Al abrir arranca limpio: con el estado actual y sin el error de un intento anterior.
  useEffect(() => {
    if (!open) return;
    change.reset();
    form.reset({ status: client.status, reason: client.statusReason ?? "" });
  }, [open, client.status, client.statusReason, form, change.reset]);

  const onSubmit = form.handleSubmit((values) =>
    change
      .mutateAsync({ ...values, reason: needsReason(values.status) ? values.reason : null })
      // Si falla, el mensaje queda a la vista en el diálogo.
      .then(onClose, () => {}),
  );

  return (
    <Dialog open={open} onClose={onClose} title="Cambiar estado" description="El cambio queda registrado en la actividad del cliente.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field label="Estado">
          <Select {...form.register("status")}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>
        {needsReason(status) && (
          <Field label="Motivo" error={form.formState.errors.reason?.message}>
            <Input placeholder="Ej: precio, se va con otro proveedor, cuota vencida…" {...form.register("reason")} />
          </Field>
        )}
        {serverError && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant={status === "baja" ? "danger" : "primary"} disabled={form.formState.isSubmitting}>
            {status === "baja" ? "Dar de baja" : "Guardar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
