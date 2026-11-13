/**
 * Clientes (pantallas "Clientes", "Cliente 360" y panel rápido).
 * Saldo, deuda vencida y "próxima acción" NO se guardan acá: se calculan
 * desde finanzas y tareas para que nunca queden desincronizados.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { id, ref, timestamps, tstz } from "./_shared/columns";
import { trgmIndex } from "./_shared/indexes";
import { users } from "./identity";

export const clientStatus = pgEnum("client_status", ["potencial", "activo", "en_riesgo", "baja"]);
export const clientPriority = pgEnum("client_priority", ["alta", "media", "baja"]);
export const clientSource = pgEnum("client_source", ["referido", "web", "captacion", "otro"]);
export const taxCondition = pgEnum("tax_condition", [
  "responsable_inscripto",
  "monotributo",
  "exento",
  "consumidor_final",
]);
export const invoiceLetter = pgEnum("invoice_letter", ["A", "B", "C"]);

export const clients = pgTable(
  "clients",
  {
    id: id(),
    /** Nombre comercial ("Panadería La Espiga"). */
    name: text().notNull(),
    legalName: text(),
    /** CUIT sin guiones (11 dígitos). */
    taxId: varchar({ length: 11 }),
    taxCondition: taxCondition(),
    address: text(),
    phone: text(),
    email: text(),
    status: clientStatus().notNull().default("potencial"),
    priority: clientPriority().notNull().default("media"),
    source: clientSource(),
    ownerId: ref().references(() => users.id, { onDelete: "set null" }),
    /** Obligatorio al pasar a "en_riesgo" o "baja" (lo exige el servicio). */
    statusReason: text(),
    statusChangedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("clients_tax_id_uq").on(t.taxId).where(sql`${t.taxId} IS NOT NULL`),
    index("clients_status_idx").on(t.status),
    index("clients_owner_idx").on(t.ownerId),
    trgmIndex("clients_name_trgm", t.name),
  ],
);

/** Personas del negocio del cliente, con su rol en la relación. */
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text().notNull(),
    jobTitle: text(),
    phone: text(),
    email: text(),
    isDecisionMaker: boolean().notNull().default(false),
    handlesPayments: boolean().notNull().default(false),
    handlesSupport: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index("client_contacts_client_idx").on(t.clientId)],
);

/** Datos de facturación (1:1 con el cliente; se separa porque cambia poco y se lee poco). */
export const clientBillingProfiles = pgTable("client_billing_profiles", {
  clientId: ref()
    .primaryKey()
    .references(() => clients.id, { onDelete: "cascade" }),
  invoiceLetter: invoiceLetter().notNull().default("B"),
  fiscalAddress: text(),
  billingEmail: text(),
  paymentTermDays: smallint().notNull().default(10),
  /** CBU/CVU o alias para cobros. */
  bankAccount: text(),
  ...timestamps,
});
