/** Rutas HTTP de Tickets. Todas exigen sesión. */
import {
  idParams,
  ticketAssign,
  ticketCancel,
  ticketConfirm,
  ticketCreate,
  ticketListQuery,
  ticketNote,
  ticketUpdate,
  ticketWorkDone,
} from "@crm/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { requireUser, sessionOf } from "../auth/guard";
import * as service from "./service";

export const ticketRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);
  const actor = (req: Parameters<typeof sessionOf>[0]) => sessionOf(req).user.id;

  app.get("/api/tickets", { schema: { querystring: ticketListQuery } }, (req) => service.listTickets(db, req.query));

  app.get("/api/tickets/:id", { schema: { params: idParams } }, (req) => service.getTicket(db, req.params.id));

  app.post("/api/tickets", { schema: { body: ticketCreate } }, async (req, reply) =>
    reply.status(201).send(await service.createTicket(db, actor(req), req.body)),
  );

  app.patch("/api/tickets/:id", { schema: { params: idParams, body: ticketUpdate } }, async (req, reply) => {
    await service.updateTicket(db, actor(req), req.params.id, req.body);
    return reply.status(204).send();
  });

  // Acciones del flujo: cada una responde 204 y el front vuelve a pedir el detalle.
  const action = <B>(path: string, body: import("zod").ZodType<B>, run: (actorId: string, id: string, b: B) => Promise<void>) =>
    app.post(`/api/tickets/:id/${path}`, { schema: { params: idParams, body } }, async (req, reply) => {
      await run(actor(req), req.params.id, req.body as B);
      return reply.status(204).send();
    });

  action("notes", ticketNote, (a, id, b) => service.addNote(db, a, id, b));
  action("assign", ticketAssign, (a, id, b) => service.assignTicket(db, a, id, b));
  action("work-done", ticketWorkDone, (a, id, b) => service.workDone(db, a, id, b));
  action("confirm", ticketConfirm, (a, id, b) => service.confirmTicket(db, a, id, b));
  action("cancel", ticketCancel, (a, id, b) => service.cancelTicket(db, a, id, b));
};
