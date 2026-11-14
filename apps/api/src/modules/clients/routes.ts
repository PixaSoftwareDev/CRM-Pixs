/**
 * Rutas HTTP de Clientes: validan la entrada (Zod), llaman al servicio y responden.
 * Toda ruta de este plugin exige sesión.
 */
import {
  activityCreate,
  billingProfileInput,
  clientCreate,
  clientListQuery,
  clientStatusChange,
  clientUpdate,
  contactInput,
  contactUpdate,
  cursorQuery,
  dateRangeQuery,
  idParams,
} from "@crm/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../lib/db";
import { requireUser, sessionOf } from "../auth/guard";
import * as service from "./service";

const contactParams = idParams.extend({ contactId: z.uuid() });

export const clientRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", requireUser);

  app.get("/api/clients", { schema: { querystring: clientListQuery } }, (req) =>
    service.listClients(db, req.query),
  );

  app.get("/api/clients/summary", () => service.countClients(db));

  app.get("/api/clients/options", () => service.listClientOptions(db));

  app.post("/api/clients", { schema: { body: clientCreate } }, async (req, reply) => {
    const client = await service.createClient(db, sessionOf(req).user.id, req.body);
    return reply.status(201).send(client);
  });

  app.get("/api/clients/:id", { schema: { params: idParams } }, (req) =>
    service.getClient(db, req.params.id),
  );

  app.patch(
    "/api/clients/:id",
    { schema: { params: idParams, body: clientUpdate } },
    async (req, reply) => {
      await service.updateClient(db, req.params.id, req.body);
      return reply.status(204).send();
    },
  );

  app.post(
    "/api/clients/:id/status",
    { schema: { params: idParams, body: clientStatusChange } },
    async (req, reply) => {
      await service.changeStatus(db, sessionOf(req).user.id, req.params.id, req.body);
      return reply.status(204).send();
    },
  );

  // Personas
  app.post(
    "/api/clients/:id/contacts",
    { schema: { params: idParams, body: contactInput } },
    async (req, reply) => reply.status(201).send(await service.addContact(db, req.params.id, req.body)),
  );

  app.patch(
    "/api/clients/:id/contacts/:contactId",
    { schema: { params: contactParams, body: contactUpdate } },
    async (req, reply) => {
      await service.updateContact(db, req.params.id, req.params.contactId, req.body);
      return reply.status(204).send();
    },
  );

  app.delete(
    "/api/clients/:id/contacts/:contactId",
    { schema: { params: contactParams } },
    async (req, reply) => {
      await service.removeContact(db, req.params.id, req.params.contactId);
      return reply.status(204).send();
    },
  );

  // Facturación
  app.put(
    "/api/clients/:id/billing",
    { schema: { params: idParams, body: billingProfileInput } },
    async (req, reply) => {
      await service.saveBillingProfile(db, req.params.id, req.body);
      return reply.status(204).send();
    },
  );

  // Actividad
  app.get(
    "/api/clients/:id/activities",
    { schema: { params: idParams, querystring: cursorQuery } },
    (req) => service.getActivities(db, req.params.id, req.query),
  );

  app.post(
    "/api/clients/:id/activities",
    { schema: { params: idParams, body: activityCreate } },
    async (req, reply) =>
      reply.status(201).send(await service.addActivity(db, sessionOf(req).user.id, req.params.id, req.body)),
  );

  // Pestañas de lectura
  app.get("/api/clients/:id/tasks", { schema: { params: idParams } }, (req) =>
    service.getTasks(db, req.params.id),
  );

  app.get(
    "/api/clients/:id/statement",
    { schema: { params: idParams, querystring: dateRangeQuery } },
    (req) => service.getStatement(db, req.params.id, req.query),
  );

  app.get("/api/clients/:id/projects", { schema: { params: idParams } }, (req) =>
    service.getProjects(db, req.params.id),
  );
};
