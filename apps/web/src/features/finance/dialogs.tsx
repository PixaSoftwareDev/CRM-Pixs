import { zodResolver } from "@hookform/resolvers/zod";
import { PAYMENT_METHODS, type PaymentMethod } from "@pixs/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { money, parsePesos } from "../../lib/format";
import { useServerErrors } from "../clients/useServerErrors";
import { useClientOptions, useTeam } from "../tasks/api";
import { todayAr } from "../tasks/time";
import { useCreateCash, useCreateInvoice, useCreateSubscription, usePayInstallment, useRegisterPayment } from "./api";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  mercado_pago: "Mercado Pago",
  cheque: "Cheque",
  otro: "Otro",
};

const pesosField = (msg = "Importe inválido") =>
  z.string().refine((v) => (parsePesos(v) ?? 0) > 0, { message: msg });
/** Centavos → "150000,5" para precargar un input. */
const toInput = (cents: number) => String(cents / 100).replace(".", ",");
const errorBox = (msg: string | null) =>
  msg && <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>;

function Actions({ onClose, label, busy, danger }: { onClose: () => void; label: string; busy: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy}>
        {label}
      </Button>
    </div>
  );
}

// ─── Cobro ──────────────────────────────────────────────────────────────────

export interface PaymentTarget {
  clientId: string;
  clientName: string;
  /** Centavos sugeridos (saldo de la factura o de la cuenta). */
  amount?: number;
  /** Cobrar una factura puntual. */
  invoiceId?: string;
  /** Cobrar una cuota sin facturar (el importe es el de la cuota). */
  installmentId?: string;
  concept?: string;
}

const paySchema = z.object({ amount: z.string(), method: z.enum(PAYMENT_METHODS), receivedOn: z.iso.date(), note: z.string().max(200) });

/** Registrar un cobro: del cliente (se imputa a lo más viejo), de una factura o de una cuota. */
export function PaymentDialog({ target, onClose, onDone }: { target: PaymentTarget | null; onClose: () => void; onDone: (m: string) => void }) {
  const pay = useRegisterPayment();
  const payInst = usePayInstallment();
  const mutation = target?.installmentId ? payInst : pay;
  const form = useForm<z.infer<typeof paySchema>>({ resolver: zodResolver(paySchema) });
  const serverError = useServerErrors(form, mutation.error);
  const fixed = !!target?.installmentId;

  useEffect(() => {
    if (!target) return;
    pay.reset();
    payInst.reset();
    form.reset({ amount: target.amount ? toInput(target.amount) : "", method: "transferencia", receivedOn: todayAr(), note: "" });
  }, [target]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!target) return;
    const cents = parsePesos(v.amount) ?? 0;
    if (!fixed && cents <= 0) return form.setError("amount", { message: "Importe inválido" });
    const res = target.installmentId
      ? await payInst.mutateAsync({ id: target.installmentId, method: v.method, receivedOn: v.receivedOn })
      : await pay.mutateAsync({
          clientId: target.clientId,
          amount: cents,
          method: v.method,
          receivedOn: v.receivedOn,
          ...(v.note.trim() && { note: v.note.trim() }),
          ...(target.invoiceId && { invoiceIds: [target.invoiceId] }),
        });
    onDone(
      `Cobro de ${money(res.allocated + res.credit)} registrado (recibo ${String(res.number).padStart(8, "0")})${res.credit ? `: ${money(res.credit)} quedan a favor del cliente` : ""}.`,
    );
    onClose();
  });

  return (
    <Dialog open={!!target} onClose={onClose} title="Registrar cobro" description={target ? [target.clientName, target.concept].filter(Boolean).join(" · ") : undefined}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Importe ($)" error={form.formState.errors.amount?.message} className="sm:col-span-1">
            <Input inputMode="decimal" autoFocus={!fixed} disabled={fixed} {...form.register("amount")} />
          </Field>
          <Field label="Medio">
            <Select {...form.register("method")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" {...form.register("receivedOn")} />
          </Field>
        </div>
        {!fixed && (
          <Field label="Nota (opcional)">
            <Input placeholder="Ej: transferencia del Banco Galicia" {...form.register("note")} />
          </Field>
        )}
        <p className="text-xs text-muted">
          {target?.invoiceId || fixed
            ? "Se emite el recibo y se imputa a esta factura."
            : "Se emite el recibo y se imputa a las facturas más viejas primero; lo que sobre queda a favor del cliente."}{" "}
          Entra también como ingreso en la caja.
        </p>
        {errorBox(serverError)}
        <Actions onClose={onClose} label="Registrar cobro" busy={form.formState.isSubmitting} />
      </form>
    </Dialog>
  );
}

// ─── Factura manual ─────────────────────────────────────────────────────────

const invoiceSchema = z
  .object({ concept: z.string().trim().min(1, { message: "Indicá el concepto" }).max(200), amount: pesosField(), issuedOn: z.iso.date(), dueOn: z.string() })
  .refine((v) => !v.dueOn || v.dueOn >= v.issuedOn, { message: "No puede vencer antes de emitirse", path: ["dueOn"] });

export function InvoiceDialog({
  client,
  onClose,
  onDone,
}: {
  client: { id: string; name: string } | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const create = useCreateInvoice();
  const form = useForm<z.infer<typeof invoiceSchema>>({ resolver: zodResolver(invoiceSchema) });
  const serverError = useServerErrors(form, create.error);
  const err = form.formState.errors;

  useEffect(() => {
    if (!client) return;
    create.reset();
    form.reset({ concept: "", amount: "", issuedOn: todayAr(), dueOn: "" });
  }, [client]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!client) return;
    // Sin vencimiento, el server usa el plazo de pago del perfil de facturación.
    await create.mutateAsync({ clientId: client.id, concept: v.concept, amount: parsePesos(v.amount) ?? 0, issuedOn: v.issuedOn, ...(v.dueOn && { dueOn: v.dueOn }) });
    onDone(`Factura emitida: ${v.concept}.`);
    onClose();
  });

  return (
    <Dialog open={!!client} onClose={onClose} title="Nueva factura" description={client ? `${client.name} · comprobante interno (sin AFIP)` : undefined}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field label="Concepto" error={err.concept?.message}>
          <Input autoFocus placeholder="Ej: Desarrollo extra · formulario de contacto" {...form.register("concept")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Importe ($)" error={err.amount?.message}>
            <Input inputMode="decimal" {...form.register("amount")} />
          </Field>
          <Field label="Emisión">
            <Input type="date" {...form.register("issuedOn")} />
          </Field>
          <Field label="Vence" error={err.dueOn?.message} hint="Vacío: según el plazo del cliente">
            <Input type="date" {...form.register("dueOn")} />
          </Field>
        </div>
        {errorBox(serverError)}
        <Actions onClose={onClose} label="Emitir factura" busy={form.formState.isSubmitting} />
      </form>
    </Dialog>
  );
}

// ─── Movimiento de caja ─────────────────────────────────────────────────────

export interface CashDraft {
  direction: "ingreso" | "egreso";
  amount: number;
  concept: string;
}

const cashSchema = z
  .object({
    direction: z.enum(["ingreso", "egreso"]),
    amount: pesosField(),
    concept: z.string().trim().min(1, { message: "Indicá el concepto" }).max(200),
    occurredOn: z.iso.date(),
    category: z.string().max(60),
    paidById: z.string(),
    reimbursable: z.boolean(),
  })
  .refine((v) => !v.reimbursable || !!v.paidById, { message: "Indicá quién puso la plata", path: ["paidById"] });

export function CashDialog({ draft, onClose, onDone }: { draft: CashDraft | null; onClose: () => void; onDone: (m: string) => void }) {
  const team = useTeam();
  const create = useCreateCash();
  const form = useForm<z.infer<typeof cashSchema>>({ resolver: zodResolver(cashSchema) });
  const serverError = useServerErrors(form, create.error);
  const [direction, reimbursable] = form.watch(["direction", "reimbursable"]);
  const err = form.formState.errors;

  useEffect(() => {
    if (!draft) return;
    create.reset();
    form.reset({
      direction: draft.direction,
      amount: draft.amount ? toInput(draft.amount) : "",
      concept: draft.concept,
      occurredOn: todayAr(),
      category: "",
      paidById: "",
      reimbursable: false,
    });
  }, [draft]);

  const onSubmit = form.handleSubmit(async (v) => {
    await create.mutateAsync({
      direction: v.direction,
      amount: parsePesos(v.amount) ?? 0,
      concept: v.concept,
      occurredOn: v.occurredOn,
      ...(v.category.trim() && { category: v.category.trim() }),
      paidById: v.paidById || null,
      reimbursable: v.reimbursable,
    });
    onDone(`${v.direction === "ingreso" ? "Ingreso" : "Gasto"} cargado: ${v.concept}.`);
    onClose();
  });

  return (
    <Dialog open={!!draft} onClose={onClose} title="Movimiento de caja">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo">
            <Select {...form.register("direction")}>
              <option value="egreso">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </Select>
          </Field>
          <Field label="Importe ($)" error={err.amount?.message}>
            <Input inputMode="decimal" autoFocus {...form.register("amount")} />
          </Field>
          <Field label="Fecha">
            <Input type="date" {...form.register("occurredOn")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Concepto" error={err.concept?.message}>
            <Input {...form.register("concept")} />
          </Field>
          <Field label="Categoría (opcional)">
            <Input placeholder="Software, Infraestructura…" {...form.register("category")} />
          </Field>
        </div>
        {direction === "egreso" && (
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Field label="Lo pagó" error={err.paidById?.message}>
              <Select {...form.register("paidById")}>
                <option value="">La empresa</option>
                {team.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex h-[38px] items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand" {...form.register("reimbursable")} />
              Hay que devolvérselo
            </label>
          </div>
        )}
        {reimbursable && <p className="text-xs text-muted">Queda en "a devolver" hasta que lo marques como devuelto.</p>}
        {errorBox(serverError)}
        <Actions onClose={onClose} label="Cargar" busy={form.formState.isSubmitting} />
      </form>
    </Dialog>
  );
}

// ─── Abono nuevo ────────────────────────────────────────────────────────────

const subSchema = z.object({
  clientId: z.string().min(1, { message: "Elegí el cliente" }),
  name: z.string().trim().min(1, { message: "Poné el nombre del abono" }).max(120),
  amount: pesosField(),
  billingDay: z.coerce.number().int().min(1).max(28),
  startsOn: z.iso.date(),
});

export function SubscriptionDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const clients = useClientOptions();
  const create = useCreateSubscription();
  const form = useForm<z.input<typeof subSchema>, unknown, z.output<typeof subSchema>>({ resolver: zodResolver(subSchema) });
  const serverError = useServerErrors(form, create.error);
  const err = form.formState.errors;

  useEffect(() => {
    if (!open) return;
    create.reset();
    form.reset({ clientId: "", name: "", amount: "", billingDay: 1, startsOn: todayAr() });
  }, [open]);

  const onSubmit = form.handleSubmit(async (v) => {
    await create.mutateAsync({ ...v, amount: parsePesos(v.amount) ?? 0 });
    onDone(`Abono "${v.name}" creado.`);
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} title="Nuevo abono" description="Se factura solo cada mes con el devengamiento.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente" error={err.clientId?.message}>
            <Select autoFocus {...form.register("clientId")}>
              <option value="">Elegí…</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plan" error={err.name?.message}>
            <Input placeholder="Mantenimiento web" {...form.register("name")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Valor mensual ($)" error={err.amount?.message}>
            <Input inputMode="decimal" {...form.register("amount")} />
          </Field>
          <Field label="Se factura el día" error={err.billingDay?.message}>
            <Input type="number" min={1} max={28} {...form.register("billingDay")} />
          </Field>
          <Field label="Desde">
            <Input type="date" {...form.register("startsOn")} />
          </Field>
        </div>
        {errorBox(serverError)}
        <Actions onClose={onClose} label="Crear abono" busy={form.formState.isSubmitting} />
      </form>
    </Dialog>
  );
}
