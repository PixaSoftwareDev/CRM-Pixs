/**
 * Contratos de Finanzas. Importes siempre en centavos y positivos; el sentido
 * lo da el tipo (factura = debe, recibo = haber; ingreso / egreso en caja).
 * Los comprobantes son internos: la factura electrónica (AFIP) se enchufa aparte.
 */
import { z } from "zod";

export const PAYMENT_METHODS = ["transferencia", "efectivo", "tarjeta", "mercado_pago", "cheque", "otro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const cents = z.number().int().positive({ message: "El importe tiene que ser mayor a 0" }).max(1e13);
const isoDate = z.iso.date({ message: "Fecha inválida" });
/** Hoy + n días como "YYYY-MM-DD" (con margen por husos horarios). */
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Hoy en Argentina como "YYYY-MM-DD" (la zona del negocio, sea donde sea que corra el código). */
export const todayInArgentina = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(now);
/** Algo que ya pasó (un cobro, un gasto): hasta hoy en Argentina, nunca en el futuro ni antes de 2000. */
const pastDate = isoDate
  .refine((d) => d <= todayInArgentina(), { message: "La fecha no puede ser futura" })
  .refine((d) => d >= "2000-01-01", { message: "Fecha inválida" });
/** Fecha de un comprobante o vencimiento: dentro de un rango razonable (2000 → dentro de 5 años). */
const docDate = isoDate.refine((d) => d >= "2000-01-01" && d <= daysFromNow(5 * 366), { message: "Fecha fuera de rango" });
const text = (max: number, msg: string) => z.string().trim().min(1, { message: msg }).max(max);
/** Mes como "YYYY-MM". */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Mes inválido" });

/** Cobro de un cliente. Sin `invoiceIds`, se imputa a las facturas más viejas primero. */
export const paymentCreate = z.object({
  amount: cents,
  method: z.enum(PAYMENT_METHODS),
  receivedOn: pastDate,
  note: z.string().trim().max(200).optional(),
  invoiceIds: z.array(z.uuid()).max(50).optional(),
});
export type PaymentCreate = z.input<typeof paymentCreate>;

export const invoiceCreate = z.object({
  concept: text(200, "Indicá el concepto"),
  amount: cents,
  // Ni a futuro (el saldo de hoy la sumaba) ni, en el server, antes de la última del talonario.
  issuedOn: pastDate,
  dueOn: docDate.nullable().optional(),
  projectId: z.uuid().nullable().optional(),
});
export type InvoiceCreate = z.input<typeof invoiceCreate>;

/** Cobrar una cuota que todavía no se facturó: se factura y se cobra en un paso. */
export const installmentPay = z.object({
  method: z.enum(PAYMENT_METHODS),
  receivedOn: pastDate,
});
export type InstallmentPay = z.input<typeof installmentPay>;

/**
 * Plan de cuotas. `total` y `advancePercent` son lo que se pidió en pantalla:
 * si vienen, las cuotas tienen que sumar el total y el anticipo (cuota 0)
 * corresponder al porcentaje, así un plan mal armado no se guarda a medias.
 */
export const installmentPlanCreate = z
  .object({
    description: text(200, "Describí el plan"),
    total: cents.optional(),
    advancePercent: z
      .number()
      .min(0, { message: "El anticipo va de 0 a 100%" })
      .max(100, { message: "El anticipo va de 0 a 100%" })
      .optional(),
    items: z
      .array(z.object({ number: z.number().int().min(0).max(120), amount: cents, dueOn: docDate }))
      .min(1, { message: "Agregá al menos una cuota" })
      .max(120),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((i) => i.number)).size !== v.items.length) {
      ctx.addIssue({ code: "custom", message: "Hay cuotas con el mismo número", path: ["items"] });
    }
    const sum = v.items.reduce((a, i) => a + i.amount, 0);
    if (v.total !== undefined && sum !== v.total) {
      ctx.addIssue({ code: "custom", message: "Las cuotas no suman el total del plan", path: ["items"] });
    }
    if (v.advancePercent !== undefined) {
      if (v.total === undefined) {
        ctx.addIssue({ code: "custom", message: "Falta el total del plan", path: ["total"] });
        return;
      }
      const advance = v.items.find((i) => i.number === 0)?.amount ?? 0;
      // El anticipo se redondea al peso: se tolera esa diferencia.
      if (Math.abs(advance - (v.total * v.advancePercent) / 100) > 100) {
        ctx.addIssue({ code: "custom", message: "El anticipo no coincide con el porcentaje", path: ["advancePercent"] });
      }
    }
  });
export type InstallmentPlanCreate = z.input<typeof installmentPlanCreate>;

export const subscriptionCreate = z.object({
  clientId: z.uuid({ message: "Elegí el cliente" }),
  name: text(120, "Poné el nombre del abono"),
  amount: cents,
  billingDay: z.number().int().min(1).max(28).default(1),
  startsOn: docDate,
});
export type SubscriptionCreate = z.input<typeof subscriptionCreate>;

export const subscriptionUpdate = z
  .object({ name: text(120, "Poné el nombre"), amount: cents, billingDay: z.number().int().min(1).max(28), active: z.boolean() })
  .partial();
export type SubscriptionUpdate = z.input<typeof subscriptionUpdate>;

/** Aumento masivo (IPC): porcentaje con hasta 2 decimales, a los abonos elegidos. */
export const priceAdjustmentCreate = z.object({
  percent: z.number().gt(0, { message: "El porcentaje tiene que ser mayor a 0" }).max(1000),
  effectiveOn: docDate,
  subscriptionIds: z.array(z.uuid()).min(1, { message: "Elegí al menos un abono" }).max(500),
  note: z.string().trim().max(200).optional(),
});
export type PriceAdjustmentCreate = z.input<typeof priceAdjustmentCreate>;

/** Genera la factura del mes de cada abono activo (idempotente). */
export const accrualRun = z.object({ month: monthSchema });
export type AccrualRun = z.input<typeof accrualRun>;

export const cashMovementCreate = z.object({
  direction: z.enum(["ingreso", "egreso"]),
  amount: cents,
  concept: text(200, "Indicá el concepto"),
  occurredOn: pastDate,
  category: z.string().trim().max(60).optional(),
  /** Quién puso la plata (gasto adelantado por un socio). */
  paidById: z.uuid().nullable().optional(),
  reimbursable: z.boolean().default(false),
});
export type CashMovementCreate = z.input<typeof cashMovementCreate>;

export const cashListQuery = z.object({ month: monthSchema });

export const statementPrintQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
