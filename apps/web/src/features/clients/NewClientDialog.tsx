import { zodResolver } from "@hookform/resolvers/zod";
import { CLIENT_PRIORITIES, type ClientCreate, clientCreate } from "@crm/shared";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { useCreateClient } from "./api";
import { PRIORITY } from "./labels";
import { useServerErrors } from "./useServerErrors";

/** Alta rápida: lo mínimo para empezar; el resto se completa en la ficha. */
export function NewClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateClient();
  const form = useForm<ClientCreate>({
    resolver: zodResolver(clientCreate),
    defaultValues: { name: "", taxId: "", phone: "", email: "", priority: "alta", status: "potencial" },
  });
  const { errors } = form.formState;
  const serverError = useServerErrors(form, create.error);

  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    // Si falla (p. ej. CUIT repetido) el mensaje ya se muestra en el formulario.
    const created = await create.mutateAsync(values).catch(() => null);
    if (!created) return;
    close();
    void navigate({ to: "/clientes/$clientId", params: { clientId: created.id }, search: { tab: "datos" } });
  });

  return (
    <Dialog open={open} onClose={close} title="Nuevo cliente" description="Después completás el resto en su ficha.">
      <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" error={errors.name?.message} className="sm:col-span-2">
          <Input autoFocus placeholder="Ej: Óptica Central" {...form.register("name")} />
        </Field>
        <Field label="CUIT" error={errors.taxId?.message} hint="Opcional">
          <Input inputMode="numeric" placeholder="30-12345678-1" {...form.register("taxId")} />
        </Field>
        <Field label="Prioridad" error={errors.priority?.message}>
          <Select {...form.register("priority")}>
            {CLIENT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Teléfono / WhatsApp" error={errors.phone?.message}>
          <Input type="tel" placeholder="+54 11…" {...form.register("phone")} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" placeholder="hola@empresa.com" {...form.register("email")} />
        </Field>
        <Field label="Estado" className="sm:col-span-2">
          <Select {...form.register("status")}>
            <option value="potencial">Potencial (todavía no compró)</option>
            <option value="activo">Activo</option>
          </Select>
        </Field>

        {serverError && (
          <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {serverError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
