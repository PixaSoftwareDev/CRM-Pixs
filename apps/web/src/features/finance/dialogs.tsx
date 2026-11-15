import { zodResolver } from "@hookform/resolvers/zod";
import { PAYMENT_METHODS, type PaymentMethod } from "@crm/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { centsToInput, money, parsePesos } from "../../lib/format";
import { useServerErrors } from "../clients/useServerErrors";
import { useClientOptions, useTeam } from "../tasks/api";
import { todayAr } from "../tasks/time";
import { type PaymentResult, useCreateCash, useCreateInvoice, useCreateSubscription, usePayInstallment, useRegisterPayment } from "./api";

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
/** Algo que ya pasó (cobro, gasto): hasta hoy en Argentina, como valida el server. */
const pastDateField = z.iso.date({ message: "Fecha inválida" }).refine((d) => d <= todayAr(), { message: "La fecha no puede ser futura" });
/**
 * El error ya quedó en `mutation.error` y se muestra en el formulario: acá solo
 * se evita el rechazo sin manejar (y que el diálogo se cierre como si nada).
 */
async function settled<R>(p: Promise<R>): Promise<{ value: R } | null> {
  try {
    return { value: await p };
  } catch {
    return null;
  }
}

/** "Cobro de $ X registrado (recibo N)…" o, si la cuota la cubrió el saldo a favor, eso. */
export function paymentMessage(res: PaymentResult): string {
  const credit = res.fromCredit ? `${money(res.fromCredit)} se cubrieron con el saldo a favor del cliente` : "";
  if (res.number === null) return `Cuota cubierta: ${credit}. No hubo cobro nuevo.`;
  const extra = [credit, res.credit ? `${money(res.credit)} quedan a favor del cliente` : ""].filter(Boolean).join("; ");
  return `Cobro de ${money(res.allocated + res.credit)} registrado (recibo ${String(res.number).padStart(8, "0")})${extra ? `: ${extra}` : ""}.`;
}
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

const paySchema = z.object({ amount: z.string(), method: z.enum(PAYMENT_METHODS), receivedOn: pastDateField, note: z.string().max(200) });

/** Registrar un cobro: del cliente (se imputa a lo más viejo), de una factura o de una cuota. */
export function PaymentDialog({ target, onClose, onDone }: { target: PaymentTarget | null; onClose: () => void; onDone: (m: string) => void }) {
  const pay = useRegisterPayment();
  const payInst = usePayInstallment();
  const mutation = target?.installmentId ? payInst : pay;
  const form = useForm<z.infer<typeof paySchema>>({ resolver: zodResolver(paySchema) });
  const fixed = !!target?.installmentId;
  const serverError = useServerErrors(form, mutation.error, fixed ? ["receivedOn", "method"] : ["amount", "receivedOn", "method", "note"]);
  const err = form.formState.errors;

  useEffect(() => {
    if (!target) return;
    pay.reset();
    payInst.reset();
    form.reset({ amount: target.amount !== undefined ? centsToInput(target.amount) : "", method: "transferencia", receivedOn: todayAr(), note: "" });
  }, [target]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!target) return;
    const cents = parsePesos(v.amount) ?? 0;
    if (!fixed && cents <= 0) return form.setError("amount", { message: "Importe inválido" });
    const res = await settled(
      target.installmentId
        ? payInst.mutateAsync({ id: target.installmentId, method: v.method, receivedOn: v.receivedOn })
        : pay.mutateAsync({
            clientId: target.clientId,
            amount: cents,
            method: v.method,
            receivedOn: v.receivedOn,
            ...(v.note.trim() && { note: v.note.trim() }),
            ...(target.invoiceId && { invoiceIds: [target.invoiceId] }),
          }),
    );
    if (!res) return;
    onDone(paymentMessage(res.value));
    onClose();
  });

  return (
    <Dialog open={!!target} onClose={onClose} title="Registrar cobro" description={target ? [target.clientName, target.concept].filter(Boolean).join(" · ") : undefined}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Importe ($)" error={err.amount?.message} className="sm:col-span-1">
            <Input inputMode="decimal" autoFocus={!fixed} disabled={fixed} {...form.register("amount")} />
          </Field>
          <Field label="Medio" error={err.method?.message}>
            <Select {...form.register("method")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha" error={err.receivedOn?.message}>
            <Input type="date" max={todayAr()} {...form.register("receivedOn")} />
          </Field>
        </div>
        {!fixed && (
          <Field label="Nota (opcional)" error={err.note?.message}>
            <Input placeholder="Ej: transferencia del Banco Galicia" {...form.register("note")} />
          </Field>
        )}
        <p className="text-xs text-muted">
          {fixed && target?.amount === 0
            ? "El saldo a favor del cliente ya cubre esta cuota: se factura y se imputa, sin recibo ni ingreso nuevo."
            : `${
                target?.invoiceId || fixed
                  ? "Se emite el recibo y se imputa a esta factura."
                  : "Se emite el recibo y se imputa a las facturas más viejas primero; lo que sobre queda a favor del cliente."
              } Entra también como ingreso en la caja.`}
        </p>
        {errorBox(serverError)}
        <Actions onClose={onClose} label="Registrar cobro" busy={form.formState.isSubmitting} />
      </form>
    </Dialog>
  );
}

// ─── Factura manual ─────────────────────────────────────────────────────────

const invoiceSchema = z
  .object({ concept: z.string().trim().min(1, { message: "Indicá el concepto" }).max(200), amount: pesosField(), issuedOn: z.iso.date({ message: "Fecha inválida" }).refine((d) => d <= todayAr(), { message: "No puede ser futura" }), dueOn: z.string() })
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
  const serverError = useServerErrors(form, create.error, ["concept", "amount", "issuedOn", "dueOn"]);
  const err = form.formState.errors;

  useEffect(() => {
    if (!client) return;
    create.reset();
    form.reset({ concept: "", amount: "", issuedOn: todayAr(), dueOn: "" });
  }, [client]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!client) return;
    // Sin vencimiento, el server usa el plazo de pago del perfil de facturación.
    const res = await settled(
      create.mutateAsync({ clientId: client.id, concept: v.concept, amount: parsePesos(v.amount) ?? 0, issuedOn: v.issuedOn, ...(v.dueOn && { dueOn: v.dueOn }) }),
    );
    if (!res) return;
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
          <Field label="Emisión" error={err.issuedOn?.message}>
            <Input type="date" max={todayAr()} {...form.register("issuedOn")} />
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
    occurredOn: pastDateField,
    category: z.string().max(60),
    paidById: z.string(),
    reimbursable: z.boolean(),
  })
  .refine((v) => !v.reimbursable || !!v.paidById, { message: "Indicá quién puso la plata", path: ["paidById"] });

export function CashDialog({ draft, onClose, onDone }: { draft: CashDraft | null; onClose: () => void; onDone: (m: string) => void }) {
  const team = useTeam();
  const create = useCreateCash();
  const form = useForm<z.infer<typeof cashSchema>>({ resolver: zodResolver(cashSchema) });
  const serverError = useServerErrors(form, create.error, ["direction", "amount", "concept", "occurredOn", "category", "paidById"]);
  const [direction, reimbursable] = form.watch(["direction", "reimbursable"]);
  const err = form.formState.errors;

  useEffect(() => {
    if (!draft) return;
    create.reset();
    form.reset({
      direction: draft.direction,
      amount: draft.amount ? centsToInput(draft.amount) : "",
      concept: draft.concept,
      occurredOn: todayAr(),
      category: "",
      paidById: "",
      reimbursable: false,
    });
  }, [draft]);

  const onSubmit = form.handleSubmit(async (v) => {
    const res = await settled(
      create.mutateAsync({
        direction: v.direction,
        amount: parsePesos(v.amount) ?? 0,
        concept: v.concept,
        occurredOn: v.occurredOn,
        ...(v.category.trim() && { category: v.category.trim() }),
        paidById: v.paidById || null,
        reimbursable: v.reimbursable,
      }),
    );
    if (!res) return;
    onDone(`${v.direction === "ingreso" ? "Ingreso" : "Gasto"} cargado: ${v.concept}.`);
    onClose();
  });

  return (
    <Dialog open={!!draft} onClose={onClose} title="Movimiento de caja">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo" error={err.direction?.message}>
            <Select {...form.register("direction")}>
              <option value="egreso">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </Select>
          </Field>
          <Field label="Importe ($)" error={err.amount?.message}>
            <Input inputMode="decimal" autoFocus {...form.register("amount")} />
          </Field>
          <Field label="Fecha" error={err.occurredOn?.message}>
            <Input type="date" max={todayAr()} {...form.register("occurredOn")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Concepto" error={err.concept?.message}>
            <Input {...form.register("concept")} />
          </Field>
          <Field label="Categoría (opcional)" error={err.category?.message}>
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
  const serverError = useServerErrors(form, create.error, ["clientId", "name", "amount", "billingDay", "startsOn"]);
  const err = form.formState.errors;

  useEffect(() => {
    if (!open) return;
    create.reset();
    form.reset({ clientId: "", name: "", amount: "", billingDay: 1, startsOn: todayAr() });
  }, [open]);

  const onSubmit = form.handleSubmit(async (v) => {
    const res = await settled(create.mutateAsync({ ...v, amount: parsePesos(v.amount) ?? 0 }));
    if (!res) return;
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
          <Field label="Desde" error={err.startsOn?.message}>
            <Input type="date" {...form.register("startsOn")} />
          </Field>
        </div>
        {errorBox(serverError)}
        <Actions onClose={onClose} label="Crear abono" busy={form.formState.isSubmitting} />
      </form>
    </Dialog>
  );
}
