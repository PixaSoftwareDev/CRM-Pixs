/**
 * Datos de ejemplo para desarrollo (los del diseño "Pixs CRM — Vistas").
 * Borra y recrea solo los clientes de ejemplo; se niega a correr en producción.
 * Uso: pnpm seed:demo
 */
import {
  activities,
  clientBillingProfiles,
  cashMovements,
  clientContacts,
  credentialAccessLogs,
  credentials,
  clients,
  documentAllocations,
  documents,
  eq,
  inArray,
  installmentPlans,
  installments,
  opportunities,
  opportunityStageChanges,
  pipelineStages,
  priceAdjustmentItems,
  priceAdjustments,
  projects,
  sql,
  subscriptions,
  taskComments,
  taskTypes,
  tasks,
  ticketEvents,
  tickets,
  timeEntries,
  users,
} from "@pixs/db";
import { env } from "../env";
import { closeDb, db } from "../lib/db";
import { encryptSecret } from "../lib/vault";

if (env.NODE_ENV === "production") {
  console.error("seed-demo no se corre en producción.");
  process.exit(1);
}

const DAY = 86_400_000;
/** Instante a `days` días de hoy, a la hora `hour` de Argentina (11.5 = 11:30). */
const at = (days: number, hour = 10) => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(
    new Date(Date.now() + days * DAY),
  );
  const hh = String(Math.floor(hour)).padStart(2, "0");
  const mm = String(Math.round((hour % 1) * 60)).padStart(2, "0");
  return new Date(`${date}T${hh}:${mm}:00-03:00`);
};
const day = (days: number) => at(days).toISOString().slice(0, 10);
const pesos = (n: number) => n * 100;
/** Gastos de ejemplo (sin cliente): se borran al volver a sembrar. */
const DEMO_EXPENSES = ["Hosting VPS", "Licencias de diseño"];

const CLIENTS = [
  {
    key: "espiga",
    name: "Panadería La Espiga",
    legalName: "La Espiga S.R.L.",
    taxId: "30712345671",
    taxCondition: "responsable_inscripto",
    address: "Av. Rivadavia 4520, CABA",
    phone: "+54 11 4567-8910",
    email: "hola@laespiga.com.ar",
    status: "en_riesgo",
    statusReason: "Cuota vencida",
    priority: "media",
    source: "referido",
  },
  {
    key: "ruiz",
    name: "Estudio Ruiz & Asoc.",
    legalName: "Estudio Ruiz y Asociados S.A.",
    taxId: "30709876542",
    taxCondition: "responsable_inscripto",
    address: "Tucumán 1250, CABA",
    phone: "+54 11 5123-4455",
    email: "pruiz@estudioruiz.com",
    status: "activo",
    statusReason: null,
    priority: "alta",
    source: "web",
  },
  {
    key: "norte",
    name: "Colegio Norte",
    legalName: null,
    taxId: null,
    taxCondition: "exento",
    address: "Av. Cabildo 3300, CABA",
    phone: "+54 11 4788-1200",
    email: "direccion@colegionorte.edu.ar",
    status: "activo",
    statusReason: null,
    priority: "media",
    source: "referido",
  },
  {
    key: "fitzone",
    name: "Gimnasio FitZone",
    legalName: null,
    taxId: null,
    taxCondition: null,
    address: null,
    phone: "+54 11 6234-9087",
    email: "admin@fitzone.com.ar",
    status: "potencial",
    statusReason: null,
    priority: "alta",
    source: "captacion",
  },
  {
    key: "sol",
    name: "Clínica del Sol",
    legalName: null,
    taxId: null,
    taxCondition: null,
    address: null,
    phone: "+54 11 4900-1122",
    email: "direccion@clinicadelsol.com.ar",
    status: "potencial",
    statusReason: null,
    priority: "baja",
    source: "web",
  },
  ...(
    [
      ["optica", "Óptica Central", "+54 11 4321-7788", "web"],
      ["vete", "Veterinaria Lomas", "+54 11 4282-3300", "web"],
      ["kinesio", "Kinesio Sur", "+54 11 4205-1190", "referido"],
      ["panif", "Panificadora Oeste", "+54 11 4455-2210", "captacion"],
    ] as const
  ).map(([key, name, phone, source]) => ({
    key,
    name,
    legalName: null,
    taxId: null,
    taxCondition: null,
    address: null,
    phone,
    email: null,
    status: "potencial" as const,
    statusReason: null,
    priority: "alta" as const,
    source,
  })),
] as const;

const CONTACTS: Record<string, { name: string; jobTitle: string; phone: string; email: string; d?: boolean; p?: boolean; s?: boolean }[]> = {
  espiga: [
    { name: "María Gómez", jobTitle: "Dueña", phone: "+54 11 4567-8910", email: "maria@laespiga.com.ar", d: true },
    { name: "Julián Paz", jobTitle: "Encargado del local", phone: "+54 11 3344-5566", email: "julian@laespiga.com.ar", p: true },
    { name: "Camila Sosa", jobTitle: "Administración y sistemas", phone: "+54 11 2299-1188", email: "camila@laespiga.com.ar", s: true },
  ],
  ruiz: [
    { name: "Pablo Ruiz", jobTitle: "Socio", phone: "+54 11 5123-4455", email: "pruiz@estudioruiz.com", d: true, p: true },
    { name: "Laura Ibarra", jobTitle: "Recepción", phone: "+54 11 5123-4400", email: "recepcion@estudioruiz.com", s: true },
  ],
  norte: [{ name: "Sofía Ríos", jobTitle: "Directora", phone: "+54 11 4788-1201", email: "srios@colegionorte.edu.ar", d: true }],
  fitzone: [
    { name: "Lucía Fernández", jobTitle: "Gerente", phone: "+54 11 6234-9087", email: "admin@fitzone.com.ar", d: true },
    { name: "Martín Ortiz", jobTitle: "Encargado de sistemas", phone: "+54 11 6234-9000", email: "sistemas@fitzone.com.ar", s: true },
  ],
  sol: [{ name: "Dra. Paula Méndez", jobTitle: "Dirección", phone: "+54 11 4900-1123", email: "pmendez@clinicadelsol.com.ar", d: true }],
  optica: [{ name: "Martín Sosa", jobTitle: "Dueño", phone: "+54 11 4321-7788", email: "martin@opticacentral.com.ar", d: true }],
  vete: [{ name: "Dra. Carla Paz", jobTitle: "Veterinaria", phone: "+54 11 4282-3300", email: "carla@vetelomas.com.ar", d: true }],
  kinesio: [{ name: "Diego Ferrer", jobTitle: "Kinesiólogo", phone: "+54 11 4205-1190", email: "diego@kinesiosur.com.ar", d: true }],
  panif: [{ name: "Rubén Castro", jobTitle: "Dueño", phone: "+54 11 4455-2210", email: "ruben@panificadoraoeste.com", d: true }],
};

async function main() {
  const team = ["Guillermo", "Enzo", "Alejo"];
  const userIds: Record<string, string> = {};
  for (const name of team) {
    const email = `${name.toLowerCase()}@pixs.local`;
    const [u] = await db
      .insert(users)
      .values({ name, email, emailVerified: true })
      .onConflictDoUpdate({ target: users.email, set: { name } })
      .returning({ id: users.id });
    if (u) userIds[name] = u.id;
  }
  const uid = (n: string) => {
    const id = userIds[n];
    if (!id) throw new Error(`Falta el usuario ${n}`);
    return id;
  };

  const types = await db.select({ id: taskTypes.id, name: taskTypes.name }).from(taskTypes);
  const typeId = (n: string) => {
    const t = types.find((x) => x.name === n);
    if (!t) throw new Error(`Falta el tipo de tarea ${n}. Corré pnpm db:seed primero.`);
    return t.id;
  };

  await db.transaction(async (tx) => {
    const names = CLIENTS.map((c) => c.name);
    const old = await tx.select({ id: clients.id }).from(clients).where(inArray(clients.name, names));
    const oldIds = old.map((o) => o.id);
    if (oldIds.length) {
      // Orden por las FKs "restrict": primero lo que cuelga del cliente.
      await tx.delete(tasks).where(inArray(tasks.clientId, oldIds));
      await tx.delete(tickets).where(inArray(tickets.clientId, oldIds));
      await tx.delete(cashMovements).where(inArray(cashMovements.clientId, oldIds));
      await tx.delete(cashMovements).where(sql`${cashMovements.clientId} is null and ${inArray(cashMovements.concept, DEMO_EXPENSES)}`);
      await tx.delete(installmentPlans).where(inArray(installmentPlans.clientId, oldIds));
      await tx.delete(documents).where(inArray(documents.clientId, oldIds));
      await tx.delete(subscriptions).where(inArray(subscriptions.clientId, oldIds));
      // Aumentos que quedaron sin abonos (eran de los clientes de ejemplo).
      await tx.execute(sql`delete from price_adjustments pa where not exists (select 1 from price_adjustment_items i where i.adjustment_id = pa.id)`);
      await tx.delete(projects).where(inArray(projects.clientId, oldIds));
      await tx.delete(opportunities).where(inArray(opportunities.clientId, oldIds));
      await tx.delete(clients).where(inArray(clients.id, oldIds));
    }

    const ids: Record<string, string> = {};
    for (const { key, ...c } of CLIENTS) {
      const [row] = await tx
        .insert(clients)
        .values({ ...c, ownerId: uid("Guillermo"), createdAt: at(-400) })
        .returning({ id: clients.id });
      if (!row) throw new Error("insert");
      ids[key] = row.id;
      const people = CONTACTS[key] ?? [];
      if (people.length) {
        await tx.insert(clientContacts).values(
          people.map((p) => ({
            clientId: row.id,
            name: p.name,
            jobTitle: p.jobTitle,
            phone: p.phone,
            email: p.email,
            isDecisionMaker: !!p.d,
            handlesPayments: !!p.p,
            handlesSupport: !!p.s,
          })),
        );
      }
    }
    const id = (k: string) => {
      const v = ids[k];
      if (!v) throw new Error(k);
      return v;
    };

    await tx.insert(clientBillingProfiles).values({
      clientId: id("espiga"),
      invoiceLetter: "A",
      fiscalAddress: "Av. Rivadavia 5120, CABA",
      billingEmail: "facturas@laespiga.com.ar",
      paymentTermDays: 10,
      bankAccount: "CBU 0170099220000067891234",
    });

    // Cuenta corriente La Espiga: cuota 2/3 vencida e impaga.
    let n = 100;
    const doc = async (
      clientId: string,
      kind: "factura" | "recibo" | "nota_credito",
      issued: number,
      concept: string,
      amount: number,
      due?: number,
    ) => {
      const [d] = await tx
        .insert(documents)
        .values({
          clientId,
          kind,
          letter: kind === "recibo" ? null : "B",
          pointOfSale: 1,
          number: n++,
          issuedOn: day(issued),
          dueOn: due === undefined ? null : day(due),
          concept,
          amount: pesos(amount),
          paymentMethod: kind === "recibo" ? "transferencia" : null,
        })
        .returning({ id: documents.id });
      if (!d) throw new Error("doc");
      return d.id;
    };
    const pay = (source: string, target: string, amount: number) =>
      tx.insert(documentAllocations).values({ sourceId: source, targetId: target, amount: pesos(amount) });

    const e = id("espiga");
    const f1 = await doc(e, "factura", -60, "Cuota 1/3 · Web + e-commerce", 150000, -50);
    await pay(await doc(e, "recibo", -58, "Transferencia", 150000), f1, 150000);
    const f2 = await doc(e, "factura", -43, "Abono octubre", 45000, -33);
    await pay(await doc(e, "recibo", -41, "Transferencia", 45000), f2, 45000);
    const f3 = await doc(e, "factura", -30, "Cuota 2/3 · Web + e-commerce", 150000, -10);
    const f4 = await doc(e, "factura", -12, "Abono noviembre", 45000, -2);
    await pay(await doc(e, "recibo", -11, "Transferencia", 45000), f4, 45000);

    const r = id("ruiz");
    const g1 = await doc(r, "factura", -42, "Anticipo · Sistema de turnos", 300000, -32);
    await pay(await doc(r, "recibo", -42, "Transferencia", 300000), g1, 300000);
    const g2 = await doc(r, "factura", -12, "Cuota 1/3 · Sistema de turnos", 100000, 3);

    const c = id("norte");
    const h1 = await doc(c, "factura", -43, "Hosting + soporte octubre", 60000, -33);
    await pay(await doc(c, "recibo", -39, "Transferencia", 60000), h1, 60000);

    const subs = await tx
      .insert(subscriptions)
      .values([
        { clientId: e, name: "Mantenimiento web", amount: pesos(45000), startsOn: day(-400) },
        { clientId: r, name: "Soporte sistema de turnos", amount: pesos(45000), startsOn: day(-60) },
        { clientId: c, name: "Hosting + soporte", amount: pesos(60000), startsOn: day(-300) },
      ])
      .returning({ id: subscriptions.id, clientId: subscriptions.clientId });
    const subOf = (clientId: string) => subs.find((x) => x.clientId === clientId)?.id ?? null;
    // Las facturas de abono ya emitidas quedan atadas a su mes: el devengamiento no las repite.
    const monthStart = (offset: number) => {
      const d = new Date(`${day(0).slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + offset);
      return d.toISOString().slice(0, 10);
    };
    await tx.update(documents).set({ subscriptionId: subOf(e), period: monthStart(-1) }).where(eq(documents.id, f2));
    await tx.update(documents).set({ subscriptionId: subOf(e), period: monthStart(0) }).where(eq(documents.id, f4));
    await tx.update(documents).set({ subscriptionId: subOf(c), period: monthStart(-1) }).where(eq(documents.id, h1));

    // Historial de aumentos por IPC: el valor anterior sale de deshacer el aumento sobre el actual.
    const current: Record<string, number> = Object.fromEntries(
      (await tx.select({ id: subscriptions.id, amount: subscriptions.amount }).from(subscriptions).where(inArray(subscriptions.id, subs.map((x) => x.id)))).map((x) => [x.id, x.amount]),
    );
    for (const [days, pct, list] of [[-43, 3.5, [subOf(e), subOf(r), subOf(c)]], [-134, 4.2, [subOf(e), subOf(c)]]] as const) {
      const [adj] = await tx
        .insert(priceAdjustments)
        .values({ effectiveOn: day(days), percent: pct.toFixed(2), appliedById: uid("Guillermo"), createdAt: at(days) })
        .returning({ id: priceAdjustments.id });
      const valid = list.filter((x): x is string => !!x);
      if (!adj || !valid.length) continue;
      await tx.insert(priceAdjustmentItems).values(
        valid.map((subscriptionId) => {
          const after = current[subscriptionId] ?? 0;
          const before = Math.round(after / (1 + pct / 100) / 100) * 100;
          current[subscriptionId] = before; // el aumento anterior parte de este valor
          return { adjustmentId: adj.id, subscriptionId, previousAmount: before, newAmount: after };
        }),
      );
    }

    // Caja: cada recibo es un ingreso; más algunos gastos (uno adelantado por Alejo).
    const receipts = await tx
      .select({ id: documents.id, clientId: documents.clientId, issuedOn: documents.issuedOn, amount: documents.amount })
      .from(documents)
      .where(sql`${documents.kind} = 'recibo' and ${inArray(documents.clientId, Object.values(ids))}`);
    const nameOf = Object.fromEntries(CLIENTS.map((cl) => [ids[cl.key], cl.name]));
    if (receipts.length) {
      await tx.insert(cashMovements).values(
        receipts.map((d) => ({ occurredOn: d.issuedOn, direction: "ingreso" as const, amount: d.amount, concept: `Cobro · ${nameOf[d.clientId]}`, category: "Cobros", clientId: d.clientId, documentId: d.id })),
      );
    }
    await tx.insert(cashMovements).values([
      { occurredOn: day(-9), direction: "egreso", amount: pesos(25000), concept: "Hosting VPS", category: "Infraestructura", clientId: null, paidById: uid("Alejo"), reimbursable: true },
      { occurredOn: day(-12), direction: "egreso", amount: pesos(149200), concept: "Licencias de diseño", category: "Software", paidById: uid("Guillermo") },
    ]);


    const G0 = uid("Guillermo");
    // ─── Embudo (los del diseño) ───
    const stages = await tx.select({ id: pipelineStages.id, key: pipelineStages.key }).from(pipelineStages);
    const stage = (k: string) => {
      const st = stages.find((x) => x.key === k);
      if (!st) throw new Error(`Falta la etapa ${k}. Corré pnpm db:seed primero.`);
      return st.id;
    };
    const opp = async (client: string, title: string, amount: number, stageKey: string, days: number, owner: string, extra: Partial<typeof opportunities.$inferInsert> = {}) => {
      const [o] = await tx
        .insert(opportunities)
        .values({ clientId: id(client), title, amount: pesos(amount), stageId: stage(stageKey), ownerId: uid(owner), stageEnteredAt: at(-days, 9), createdAt: at(-days - 5), ...extra })
        .returning({ id: opportunities.id });
      if (!o) throw new Error("opp");
      return o.id;
    };
    await opp("optica", "Web institucional + turnos", 380000, "potencial", 1, "Alejo");
    await opp("vete", "Turnos online", 180000, "potencial", 3, "Guillermo");
    const kin = await opp("kinesio", "Agenda online", 250000, "primer_contacto", 0, "Alejo");
    await tx.insert(opportunityStageChanges).values({ opportunityId: kin, fromStageId: stage("potencial"), toStageId: stage("primer_contacto"), changedById: uid("Alejo"), reason: "llamada marcada hecha", createdAt: at(0, 9.67) });
    await opp("norte", "Segunda etapa: app para familias", 900000, "reunion", 9, "Guillermo");
    await opp("sol", "Mantenimiento mensual", 120000, "propuesta", 3, "Enzo");
    await opp("fitzone", "App de reservas", 1400000, "seguimiento", 2, "Guillermo");
    await opp("panif", "Tienda online", 520000, "cierre", 1, "Guillermo");
    const ruizOpp = await opp("ruiz", "Sistema de turnos", 600000, "implementacion", 42, "Alejo", { status: "ganada", closedAt: at(-42) });

    const [pe] = await tx
      .insert(projects)
      .values({
        name: "Web + e-commerce La Espiga",
        clientId: e,
        implementerId: uid("Alejo"),
        status: "en_curso",
        phase: "desarrollo",
        startsOn: day(-70),
        dueOn: day(20),
        estimatedHours: 120,
        scope: "Sitio institucional + tienda con pasarela de pago y cálculo de envíos.",
        saleAmount: pesos(450000),
        paymentTerms: "3 cuotas",
        sellerId: uid("Guillermo"),
        soldOn: day(-72),
      })
      .returning({ id: projects.id });
    await tx.insert(projects).values([
      {
        name: "Sistema de turnos",
        clientId: r,
        opportunityId: ruizOpp,
        implementerId: uid("Enzo"),
        status: "en_curso",
        phase: "pruebas",
        startsOn: day(-42),
        dueOn: day(45),
        estimatedHours: 160,
        scope: "Turnos online con recordatorios por mail y WhatsApp, panel para 5 abogados.",
        saleAmount: pesos(600000),
        paymentTerms: "Anticipo + 3 cuotas",
        sellerId: uid("Alejo"),
        soldOn: day(-42),
        createdAutomatically: true,
      },
      {
        name: "Portal de familias",
        clientId: id("norte"),
        implementerId: G0,
        status: "entregado",
        phase: "entrega",
        startsOn: day(-110),
        dueOn: day(-5),
        dueIsEstimate: false,
        estimatedHours: 60,
        scope: "Portal para que las familias vean notas y comunicados.",
        saleAmount: pesos(300000),
        paymentTerms: "Contado",
        sellerId: G0,
        soldOn: day(-112),
      },
    ]);
    // Planes de cuotas: las ya facturadas apuntan a su factura.
    const plan = async (projectId: string | undefined, clientId: string, description: string, items: [number, number, number, string | null][]) => {
      if (!projectId) return;
      const [pl] = await tx
        .insert(installmentPlans)
        .values({ clientId, projectId, description, total: pesos(items.reduce((a, i) => a + i[1], 0)) })
        .returning({ id: installmentPlans.id });
      if (pl) {
        await tx.insert(installments).values(
          items.map(([number, amount, due, invoiceId]) => ({ planId: pl.id, number, amount: pesos(amount), dueOn: day(due), invoiceId, autoReminder: number !== 3 })),
        );
      }
    };
    const [prj] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.name, "Sistema de turnos"));
    await plan(pe?.id, e, "3 cuotas", [[1, 150000, -50, f1], [2, 150000, -10, f3], [3, 150000, 20, null]]);
    await plan(prj?.id, r, "Anticipo + 3 cuotas", [[0, 300000, -32, g1], [1, 100000, 3, g2], [2, 100000, 33, null], [3, 100000, 63, null]]);

    if (pe) {
      await tx.insert(timeEntries).values([
        { userId: uid("Alejo"), projectId: pe.id, workedOn: day(-30), minutes: 60 * 40 },
        { userId: uid("Enzo"), projectId: pe.id, workedOn: day(-10), minutes: 60 * 22 },
      ]);
    }

    // ─── Tickets (los del diseño, en todos los pasos del flujo) ───
    const [pr] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.name, "Sistema de turnos"));
    type T = typeof tickets.$inferInsert & { log: [string | null, string, "creado" | "asignado" | "estado" | "confirmado", number][] };
    const ticketData: T[] = [
      { clientId: e, projectId: pe?.id ?? null, type: "falla", channel: "whatsapp", priority: "alta", status: "en_curso", title: "Revisar pasarela de pago", description: "El checkout con tarjeta da error al confirmar el pago. Pasa con Visa y Master.", reportedById: uid("Alejo"), receivedAt: at(-3, 18), assigneeId: G0, scheduledAt: at(0, 11.5), dueAt: at(-2, 23.98),
        log: [["Alejo", "Cargado por Alejo", "creado", -3], ["Alejo", "Asignado a Guillermo: tarea en su agenda", "asignado", -3]] },
      { clientId: e, projectId: pe?.id ?? null, type: "implementacion", channel: "telefono", priority: "normal", status: "a_confirmar", title: "Ajustar cálculo de envío a provincia", description: "Para provincias el envío tiene que calcularse por peso, no fijo.", reportedById: G0, receivedAt: at(-9, 16.33), assigneeId: uid("Alejo"), scheduledAt: at(-1, 10), confirmerId: G0, confirmAt: at(0, 16.75), dueAt: at(0, 23.98),
        log: [["Guillermo", "Cargado por Guillermo", "creado", -9], ["Guillermo", "Asignado a Alejo: tarea en su agenda", "asignado", -9], ["Alejo", "Alejo terminó el trabajo", "estado", -1], ["Alejo", "Llamada de confirmación agendada para Guillermo", "estado", -1]] },
      { clientId: e, projectId: pe?.id ?? null, type: "implementacion", channel: "email", priority: "normal", status: "nuevo", title: "Cargar fotos propias en la home", description: "Mandaron 12 fotos del local por mail para reemplazar las de stock.", reportedById: uid("Enzo"), receivedAt: at(-1, 12), dueAt: at(4, 23.98),
        log: [["Enzo", "Cargado por Enzo", "creado", -1]] },
      { clientId: e, projectId: pe?.id ?? null, type: "implementacion", channel: "telefono", priority: "normal", status: "resuelto", title: "Diseño de la home", reportedById: G0, receivedAt: at(-25, 10), assigneeId: uid("Alejo"), confirmerId: G0, resolvedById: uid("Alejo"), resolvedAt: at(-12, 15), resolutionNote: "Les encantó.", dueAt: at(-12, 23.98),
        log: [["Guillermo", "Cargado por Guillermo", "creado", -25], ["Guillermo", "Guillermo llamó al cliente: confirmó que quedó bien. Ticket cerrado", "confirmado", -12]] },
      { clientId: id("fitzone"), type: "falla", channel: "whatsapp", priority: "urgente", status: "en_curso", title: "Error al reservar la clase de las 19 hs", description: "La app no deja reservar la clase de las 19hs, les sale error a los socios.", receivedAt: at(0, 8.67), assigneeId: uid("Enzo"), scheduledAt: at(0, 10), dueAt: at(0, 23.98),
        log: [[null, "Entró por WhatsApp y se clasificó como Falla urgente", "creado", 0], ["Guillermo", "Asignado a Enzo: tarea en su agenda", "asignado", 0]] },
      { clientId: r, projectId: pr?.id ?? null, type: "falla", channel: "email", priority: "alta", status: "nuevo", title: "No llegan los mails de confirmación de turno", description: "Desde ayer los pacientes no reciben el mail de confirmación.", receivedAt: at(0, 9.25), dueAt: at(1, 23.98),
        log: [[null, "Entró por mail", "creado", 0]] },
      { clientId: r, projectId: pr?.id ?? null, type: "falla", channel: "telefono", priority: "normal", status: "resuelto", title: "No imprime la factura desde la caja 2", reportedById: uid("Alejo"), receivedAt: at(-5, 11), assigneeId: uid("Enzo"), confirmerId: uid("Alejo"), resolvedById: uid("Enzo"), resolvedAt: at(-3, 17), resolutionNote: "Era el driver de la impresora.", dueAt: at(-3, 23.98),
        log: [["Alejo", "Cargado por Alejo", "creado", -5], ["Alejo", "Alejo llamó al cliente: confirmó que quedó bien. Ticket cerrado", "confirmado", -3]] },
      { clientId: id("norte"), type: "consulta", channel: "email", priority: "normal", status: "resuelto", title: "Alta de usuarios para docentes nuevos", reportedById: G0, receivedAt: at(-10, 9), assigneeId: uid("Alejo"), confirmerId: G0, resolvedById: uid("Alejo"), resolvedAt: at(-8, 12), dueAt: at(-8, 23.98),
        log: [["Guillermo", "Cargado por Guillermo", "creado", -10], ["Guillermo", "Guillermo llamó al cliente: confirmó que quedó bien. Ticket cerrado", "confirmado", -8]] },
    ];
    const ticketIds: Record<string, string> = {};
    for (const { log, ...t } of ticketData) {
      const [row] = await tx.insert(tickets).values(t).returning({ id: tickets.id });
      if (!row) throw new Error("ticket");
      ticketIds[t.title] = row.id;
      await tx.insert(ticketEvents).values(
        log.map(([actor, message, kind, days], i) => ({ ticketId: row.id, actorId: actor ? uid(actor) : null, kind, message, createdAt: at(days, 9 + i * 0.25) })),
      );
    }
    const ticketId = (title: string) => ticketIds[title] ?? null;

    const G = uid("Guillermo");
    const demoTasks: (typeof tasks.$inferInsert & { notes?: [string, string][] })[] = [
      { title: "Implementación de turnos online", typeId: typeId("Implementación"), assigneeId: G, clientId: r, startsAt: at(0, 9), durationMinutes: 120, notes: [["Guillermo", "Llevar el checklist de migración."]] },
      { title: "Revisar pasarela de pago", typeId: typeId("Implementación"), ticketId: ticketId("Revisar pasarela de pago"), assigneeId: G, assignedById: uid("Alejo"), clientId: e, projectId: pe?.id ?? null, startsAt: at(0, 11.5), notes: [["Alejo", "Te la paso, el error es en el checkout con tarjeta."]] },
      { title: "Demo de la app de reservas", typeId: typeId("Reunión"), assigneeId: G, clientId: id("fitzone"), startsAt: at(0, 14) },
      { title: "Llamar por cuota vencida", typeId: typeId("Cobranza"), assigneeId: G, clientId: e, projectId: pe?.id ?? null, startsAt: at(0, 15.5), durationMinutes: 30, notes: [["Guillermo", "Ayer dijeron que transferían hoy; confirmar."]] },
      { title: "Reunión con Clínica del Sol", typeId: typeId("Reunión"), assigneeId: G, clientId: id("sol"), startsAt: at(0, 16) },
      { title: "Llamar a FitZone por la demo", typeId: typeId("Llamada"), assigneeId: G, clientId: id("fitzone"), startsAt: at(0, 16.5), durationMinutes: 30 },
      { title: "Recordatorio de pago", typeId: typeId("Cobranza"), assigneeId: G, clientId: r, startsAt: at(0, 17), durationMinutes: 30 },
      { title: "Arreglar error de reservas de las 19hs", typeId: typeId("Falla"), ticketId: ticketId("Error al reservar la clase de las 19 hs"), assigneeId: uid("Enzo"), assignedById: G, clientId: id("fitzone"), startsAt: at(0, 10), durationMinutes: 90, notes: [["Guillermo", "Urgente, los socios no pueden reservar."]] },
      { title: "Propuesta de mantenimiento", typeId: typeId("Ventas"), assigneeId: uid("Alejo"), clientId: id("sol"), startsAt: at(0, 12) },
      { title: "Revisión del catálogo", typeId: typeId("Reunión"), assigneeId: uid("Enzo"), clientId: e, projectId: pe?.id ?? null, startsAt: at(4, 10) },
      { title: "Seguimiento propuesta", typeId: typeId("Ventas"), assigneeId: uid("Alejo"), clientId: r, startsAt: at(1, 10), durationMinutes: 30 },
      { title: "Reunión de avance", typeId: typeId("Reunión"), assigneeId: uid("Enzo"), clientId: e, projectId: pe?.id ?? null, startsAt: at(-3, 10), status: "hecha", completedAt: at(-3, 11), notes: [["Enzo", "Les gustó la home; piden fotos propias."]] },
      { title: "Kickoff del sistema de turnos", typeId: typeId("Reunión"), assigneeId: G, clientId: r, startsAt: at(-4, 12), status: "hecha", completedAt: at(-4, 13), notes: [["Guillermo", "Arrancamos con 2 sucursales."]] },
      { title: "Llamada de ventas", typeId: typeId("Ventas"), assigneeId: uid("Alejo"), clientId: id("fitzone"), startsAt: at(-2, 15), durationMinutes: 30, status: "hecha", completedAt: at(-2, 15.5), notes: [["Alejo", "Interesados, piden demo."]] },
      { title: "Llamada · primer contacto", typeId: typeId("Llamada"), assigneeId: uid("Alejo"), clientId: id("optica"), startsAt: at(0, 11), durationMinutes: 30 },
      { title: "Llamada · primer contacto", typeId: typeId("Llamada"), assigneeId: G, clientId: id("vete"), startsAt: at(1, 10), durationMinutes: 30 },
      { title: "Reunión · conocer el negocio", typeId: typeId("Reunión"), assigneeId: uid("Alejo"), clientId: id("kinesio"), startsAt: at(3, 10) },
      { title: "Reunión · relevamiento", typeId: typeId("Reunión"), assigneeId: G, clientId: id("norte"), startsAt: at(-2, 10), status: "en_curso" },
      { title: "Ventas · cierre", typeId: typeId("Ventas"), assigneeId: G, clientId: id("panif"), startsAt: at(3, 12) },
      { title: "Revisión del catálogo con María", typeId: typeId("Reunión"), assigneeId: uid("Alejo"), clientId: e, projectId: pe?.id ?? null, startsAt: at(2, 10) },
      { title: "Ajustar cálculo de envío a provincia", typeId: typeId("Implementación"), ticketId: ticketId("Ajustar cálculo de envío a provincia"), assigneeId: uid("Alejo"), clientId: e, projectId: pe?.id ?? null, startsAt: at(-1, 10), status: "hecha", completedAt: at(-1, 12) },
      { title: "Confirmar con el cliente · Ajustar cálculo de envío a provincia", typeId: typeId("Llamada"), ticketId: ticketId("Ajustar cálculo de envío a provincia"), assigneeId: G, assignedById: uid("Alejo"), clientId: e, projectId: pe?.id ?? null, startsAt: at(0, 16.75), durationMinutes: 15 },
      { title: "Presentar diseño de la home", typeId: typeId("Reunión"), assigneeId: uid("Alejo"), clientId: e, projectId: pe?.id ?? null, startsAt: at(-13, 11), status: "hecha", completedAt: at(-13, 12) },
    ];
    for (const { notes, ...t } of demoTasks) {
      const [row] = await tx.insert(tasks).values({ ...t, createdById: t.assignedById ?? t.assigneeId }).returning({ id: tasks.id });
      if (row && notes?.length) {
        await tx.insert(taskComments).values(notes.map(([author, body]) => ({ taskId: row.id, authorId: uid(author), body })));
      }
    }

    // Accesos del diseño, cifrados igual que en la app. Claves de ejemplo, no reales.
    const vault = [
      { client: e, kind: "panel", label: "Admin de la tienda", username: "admin@laespiga.com.ar", secret: "Ej3mplo-Tienda!" },
      { client: e, kind: "hosting", label: "Panel del hosting", username: "laespiga", secret: "Ej3mplo-Host#" },
      { client: r, kind: "acceso_remoto", label: "PC recepción", username: "123 456 789", secret: "Ej3mplo-AD", connectUrl: "anydesk:123456789" },
      { client: r, kind: "base_de_datos", label: "Base de turnos", username: "turnos_app", secret: "Ej3mplo-DB$" },
      { client: id("fitzone"), kind: "tienda_apps", label: "Cuenta de App Store", username: "dev@fitzone.com.ar", secret: "Ej3mplo-Apple" },
    ] as const;
    for (const [i, v] of vault.entries()) {
      const enc = encryptSecret(v.secret);
      const [cred] = await tx
        .insert(credentials)
        .values({ clientId: v.client, kind: v.kind, label: v.label, username: v.username, secretCiphertext: enc.ciphertext, keyVersion: enc.keyVersion, connectUrl: "connectUrl" in v ? v.connectUrl : null, createdById: G })
        .returning({ id: credentials.id });
      if (!cred) continue;
      const who = ["Guillermo", "Alejo", "Enzo"][i % 3] ?? "Guillermo";
      await tx.insert(credentialAccessLogs).values([
        { credentialId: cred.id, userId: G, action: "crear", createdAt: at(-30 - i) },
        { credentialId: cred.id, userId: uid(who), action: i % 2 ? "copiar" : "ver", ipAddress: "192.168.0.10", createdAt: at(-i, 9 + i) },
      ]);
    }

    await tx.insert(activities).values([
      { clientId: e, kind: "ticket", title: "Ticket por WhatsApp", body: "“¿Pueden sumar envíos a domicilio?” → se creó el ticket y se asignó a Alejo.", occurredAt: at(-2, 9) },
      { clientId: e, kind: "reunion", title: "Reunión de avance", body: "Les gustó la home; piden fotos propias en lugar de stock.", actorId: uid("Enzo"), occurredAt: at(-3, 10) },
      { clientId: e, kind: "cobro", title: "Abono de noviembre cobrado", body: "$ 45.000 por transferencia.", occurredAt: at(-11, 12) },
      { clientId: e, kind: "llamada", title: "Llamada", body: "Confirmamos el alcance del catálogo.", actorId: uid("Guillermo"), occurredAt: at(-16, 16) },
      { clientId: r, kind: "reunion", title: "Kickoff sistema de turnos", body: "Arrancamos con la agenda de 3 profesionales.", actorId: uid("Guillermo"), occurredAt: at(-40, 12) },
      { clientId: id("norte"), kind: "email", title: "Email", body: "Pidieron sumar un formulario de inscripción.", actorId: uid("Alejo"), occurredAt: at(-20, 9) },
    ]);
  });

  const total = await db.$count(clients, eq(clients.ownerId, uid("Guillermo")));
  console.log(`Datos de ejemplo listos: ${total} clientes.`);
}

try {
  await main();
} finally {
  await closeDb();
}
