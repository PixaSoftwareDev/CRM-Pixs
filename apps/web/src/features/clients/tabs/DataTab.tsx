import { zodResolver } from "@hookform/resolvers/zod";
import {
  type BillingProfileInput,
  billingProfileInput,
  CLIENT_PRIORITIES,
  CLIENT_SOURCES,
  type ClientDetail,
  type ClientUpdate,
  clientUpdate,
  type ContactDto,
  type ContactInput,
  contactInput,
  formatCuit,
  INVOICE_LETTERS,
  TAX_CONDITIONS,
} from "@crm/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Chip } from "../../../components/ui/Chip";
import { Dialog } from "../../../components/ui/Dialog";
import { Field, Input, Select } from "../../../components/ui/Field";
import { Empty } from "../../../components/ui/States";
import { useRemoveContact, useSaveBilling, useSaveContact, useUpdateClient } from "../api";
import { PRIORITY, SOURCE, TAX_CONDITION } from "../labels";
import { useServerErrors } from "../useServerErrors";

export function DataTab({ client }: { client: ClientDetail }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <ClientInfoForm client={client} />
      <div className="flex flex-col gap-4">
        <ContactsSection client={client} />
        <BillingForm client={client} />
      </div>
    </div>
  );
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string | undefined; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function SaveBar({ dirty, saving, saved }: { dirty: boolean; saving: boolean; saved: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3 sm:col-span-2">
      {saved && !dirty && <span className="text-xs text-green-700">Guardado ✓</span>}
      <Button type="submit" disabled={!dirty || saving}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </Button>
    </div>
  );
}

// ─── Datos de la empresa ────────────────────────────────────────────────────

function clientDefaults(c: ClientDetail): ClientUpdate {
  return {
    name: c.name,
    legalName: c.legalName ?? "",
    taxId: c.taxId ? formatCuit(c.taxId) : "",
    taxCondition: (c.taxCondition as ClientUpdate["taxCondition"]) ?? null,
    address: c.address ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    priority: c.priority,
    source: (c.source as ClientUpdate["source"]) ?? null,
  };
}

function ClientInfoForm({ client }: { client: ClientDetail }) {
  const update = useUpdateClient(client.id);
  const form = useForm<ClientUpdate>({ resolver: zodResolver(clientUpdate), defaultValues: clientDefaults(client) });
  const { errors, isDirty, isSubmitting } = form.formState;
  const serverError = useServerErrors(form, update.error);

  // Si la ficha cambia desde otro lado (p. ej. prioridad en el listado), se refleja acá.
  useEffect(() => form.reset(clientDefaults(client)), [client, form]);

  const onSubmit = form.handleSubmit((values) => update.mutateAsync(values));

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SectionTitle title="Datos de la empresa" />
        </div>
        <Field label="Nombre comercial" error={errors.name?.message} className="sm:col-span-2">
          <Input {...form.register("name")} />
        </Field>
        <Field label="Razón social" error={errors.legalName?.message}>
          <Input {...form.register("legalName")} />
        </Field>
        <Field label="CUIT" error={errors.taxId?.message}>
          <Input inputMode="numeric" placeholder="30-12345678-9" {...form.register("taxId")} />
        </Field>
        <Field label="Condición frente al IVA">
          <Select {...form.register("taxCondition", { setValueAs: (v) => v || null })}>
            <option value="">Sin definir</option>
            {TAX_CONDITIONS.map((t) => (
              <option key={t} value={t}>
                {TAX_CONDITION[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cómo llegó">
          <Select {...form.register("source", { setValueAs: (v) => v || null })}>
            <option value="">Sin definir</option>
            {CLIENT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dirección" error={errors.address?.message} className="sm:col-span-2">
          <Input {...form.register("address")} />
        </Field>
        <Field label="Teléfono / WhatsApp" error={errors.phone?.message}>
          <Input type="tel" {...form.register("phone")} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...form.register("email")} />
        </Field>
        <Field label="Prioridad">
          <Select {...form.register("priority")}>
            {CLIENT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p].label}
              </option>
            ))}
          </Select>
        </Field>
        {serverError && (
          <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {serverError}
          </p>
        )}
        <SaveBar dirty={isDirty} saving={isSubmitting} saved={update.isSuccess} />
      </form>
    </Card>
  );
}

// ─── Personas del negocio ───────────────────────────────────────────────────

function ContactsSection({ client }: { client: ClientDetail }) {
  const [editing, setEditing] = useState<ContactDto | "new" | null>(null);
  const remove = useRemoveContact(client.id);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionTitle
        title="Personas del negocio"
        hint="Quién decide, quién paga y a quién llamar por soporte."
        action={
          <Button variant="secondary" size="sm" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden /> Agregar
          </Button>
        }
      />
      {client.contacts.length === 0 ? (
        <Empty>Todavía no cargaste personas de este cliente.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {client.contacts.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-sm">{p.name}</strong>
                  {p.jobTitle && <span className="text-xs text-muted">· {p.jobTitle}</span>}
                </div>
                <div className="mt-0.5 text-xs break-all text-slate-600">
                  {[p.phone, p.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.isDecisionMaker && <Chip tone="indigo">Decide</Chip>}
                  {p.handlesPayments && <Chip tone="green">Pagos</Chip>}
                  {p.handlesSupport && <Chip tone="blue">Soporte</Chip>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" aria-label={`Editar a ${p.name}`} onClick={() => setEditing(p)}>
                  <Pencil size={14} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Quitar a ${p.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`¿Quitar a ${p.name} de las personas del negocio?`)) remove.mutate(p.id);
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ContactDialog clientId={client.id} contact={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

const EMPTY_CONTACT: ContactInput = {
  name: "",
  jobTitle: "",
  phone: "",
  email: "",
  isDecisionMaker: false,
  handlesPayments: false,
  handlesSupport: false,
};

function ContactDialog({
  clientId,
  contact,
  onClose,
}: {
  clientId: string;
  contact: ContactDto | "new" | null;
  onClose: () => void;
}) {
  const save = useSaveContact(clientId);
  const form = useForm<ContactInput>({ resolver: zodResolver(contactInput), defaultValues: EMPTY_CONTACT });
  const { errors, isSubmitting } = form.formState;
  const serverError = useServerErrors(form, save.error);
  const isNew = contact === "new";

  useEffect(() => {
    if (contact === null) return;
    save.reset();
    form.reset(
      isNew
        ? EMPTY_CONTACT
        : {
            name: contact.name,
            jobTitle: contact.jobTitle ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
            isDecisionMaker: contact.isDecisionMaker,
            handlesPayments: contact.handlesPayments,
            handlesSupport: contact.handlesSupport,
          },
    );
  }, [contact, isNew, form, save.reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync(isNew || contact === null ? values : { ...values, contactId: contact.id });
    onClose();
  });

  return (
    <Dialog open={contact !== null} onClose={onClose} title={isNew ? "Agregar persona" : "Editar persona"}>
      <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" error={errors.name?.message}>
          <Input autoFocus {...form.register("name")} />
        </Field>
        <Field label="Cargo" error={errors.jobTitle?.message}>
          <Input placeholder="Ej: Dueña, administración…" {...form.register("jobTitle")} />
        </Field>
        <Field label="Teléfono" error={errors.phone?.message}>
          <Input type="tel" {...form.register("phone")} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...form.register("email")} />
        </Field>
        <fieldset className="flex flex-wrap gap-4 sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium text-muted">Rol en la relación</legend>
          {(
            [
              ["isDecisionMaker", "Decide"],
              ["handlesPayments", "Se encarga de los pagos"],
              ["handlesSupport", "Contacto de soporte"],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand" {...form.register(name)} />
              {label}
            </label>
          ))}
        </fieldset>
        {serverError && (
          <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {serverError}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Facturación ────────────────────────────────────────────────────────────

function billingDefaults(c: ClientDetail): BillingProfileInput {
  const b = c.billingProfile;
  return {
    invoiceLetter: b?.invoiceLetter ?? (c.taxCondition === "responsable_inscripto" ? "A" : "B"),
    fiscalAddress: b?.fiscalAddress ?? c.address ?? "",
    billingEmail: b?.billingEmail ?? c.email ?? "",
    paymentTermDays: b?.paymentTermDays ?? 10,
    bankAccount: b?.bankAccount ?? "",
  };
}

function BillingForm({ client }: { client: ClientDetail }) {
  const save = useSaveBilling(client.id);
  const form = useForm<BillingProfileInput>({
    resolver: zodResolver(billingProfileInput),
    defaultValues: billingDefaults(client),
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const serverError = useServerErrors(form, save.error);

  useEffect(() => form.reset(billingDefaults(client)), [client, form]);

  const onSubmit = form.handleSubmit((values) => save.mutateAsync(values));

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SectionTitle
            title="Facturación"
            hint={client.billingProfile ? undefined : "Sin cargar todavía: te propongo valores según sus datos."}
          />
        </div>
        <Field label="Tipo de factura">
          <Select {...form.register("invoiceLetter")}>
            {INVOICE_LETTERS.map((l) => (
              <option key={l} value={l}>
                Factura {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plazo de pago (días)" error={errors.paymentTermDays?.message}>
          <Input type="number" min={0} max={180} {...form.register("paymentTermDays", { valueAsNumber: true })} />
        </Field>
        <Field label="Domicilio fiscal" error={errors.fiscalAddress?.message} className="sm:col-span-2">
          <Input {...form.register("fiscalAddress")} />
        </Field>
        <Field label="Email para facturas" error={errors.billingEmail?.message}>
          <Input type="email" {...form.register("billingEmail")} />
        </Field>
        <Field label="CBU / alias" error={errors.bankAccount?.message}>
          <Input {...form.register("bankAccount")} />
        </Field>
        {serverError && (
          <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {serverError}
          </p>
        )}
        <SaveBar dirty={isDirty || !client.billingProfile} saving={isSubmitting} saved={save.isSuccess} />
      </form>
    </Card>
  );
}
