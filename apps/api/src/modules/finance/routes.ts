/** Rutas HTTP de Finanzas. Todas exigen sesión. */
import {
  accrualRun,
  cashListQuery,
  cashMovementCreate,
  idParams,
  installmentPay,
  installmentPlanCreate,
  invoiceCreate,
  paymentCreate,
  priceAdjustmentCreate,
  subscriptionCreate,
  subscriptionUpdate,
} from "@crm/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../lib/db";
import { requireAdmin, requireUser, sessionOf } from "../auth/guard";
import * as service from "./service";

export const financeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", requireUser);
  const actor = (req: Parameters<typeof sessionOf>[0]) => sessionOf(req).user.id;

  app.get("/api/finance/summary", () => service.getSummary(db));
  app.get("/api/finance/receivables", () => service.listReceivables(db));

  // Cuenta corriente del cliente
  app.post("/api/clients/:id/payments", { schema: { params: idParams, body: paymentCreate } }, async (req, reply) =>
    reply.status(201).send(await service.registerPayment(db, actor(req), req.params.id, req.body)),
  );
  app.post("/api/clients/:id/invoices", { schema: { params: idParams, body: invoiceCreate } }, async (req, reply) =>
    reply.status(201).send(await service.createInvoice(db, actor(req), req.params.id, req.body)),
  );

  // Cuotas
  app.get("/api/projects/:id/installment-plans", { schema: { params: idParams } }, (req) =>
    service.getProjectPlans(db, req.params.id),
  );
  app.post("/api/projects/:id/installment-plans", { schema: { params: idParams, body: installmentPlanCreate } }, async (req, reply) =>
    reply.status(201).send(await service.createInstallmentPlan(db, req.params.id, req.body)),
  );
  app.post("/api/installments/:id/pay", { schema: { params: idParams, body: installmentPay } }, async (req, reply) =>
    reply.status(201).send(await service.payInstallment(db, actor(req), req.params.id, req.body)),
  );
  app.patch(
    "/api/installments/:id",
    { schema: { params: idParams, body: z.object({ autoReminder: z.boolean() }) } },
    async (req, reply) => {
      await service.setInstallmentReminder(db, req.params.id, req.body.autoReminder);
      return reply.status(204).send();
    },
  );

  // Abonos
  app.get("/api/subscriptions", () => service.listSubscriptions(db));
  app.post("/api/subscriptions", { onRequest: requireAdmin, schema: { body: subscriptionCreate } }, async (req, reply) =>
    reply.status(201).send(await service.createSubscription(db, req.body)),
  );
  app.patch("/api/subscriptions/:id", { onRequest: requireAdmin, schema: { params: idParams, body: subscriptionUpdate } }, async (req, reply) => {
    await service.updateSubscription(db, req.params.id, req.body);
    return reply.status(204).send();
  });
  app.get("/api/price-adjustments", () => service.listAdjustments(db));
  app.post("/api/price-adjustments", { onRequest: requireAdmin, schema: { body: priceAdjustmentCreate } }, async (req, reply) =>
    reply.status(201).send(await service.adjustPrices(db, actor(req), req.body)),
  );
  app.post("/api/accruals", { onRequest: requireAdmin, schema: { body: accrualRun } }, (req) => service.runAccrual(db, actor(req), req.body));

  // Caja
  app.get("/api/cash", { schema: { querystring: cashListQuery } }, (req) => service.listCash(db, req.query.month));
  app.post("/api/cash", { schema: { body: cashMovementCreate } }, async (req, reply) =>
    reply.status(201).send(await service.createCashMovement(db, actor(req), req.body)),
  );
  app.post("/api/cash/:id/reimburse", { schema: { params: idParams } }, async (req, reply) => {
    await service.markReimbursed(db, req.params.id);
    return reply.status(204).send();
  });
};
