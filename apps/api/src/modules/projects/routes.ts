/** Rutas HTTP de Proyectos. Todas exigen sesión. */
import { idParams, projectCreate, projectListQuery, projectUpdate } from "@crm/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { access, canSee, requireArea, requireUser, sessionOf } from "../auth/guard";
import * as service from "./service";

/** El monto y la forma de pago de la venta son de Finanzas: quien no la ve tampoco los carga ni los pisa. */
const touchesSale = (req: FastifyRequest, body: { saleAmount?: unknown; paymentTerms?: unknown }) =>
  !canSee(req, "finanzas") && (body.saleAmount !== undefined || body.paymentTerms !== undefined);

const forbidSale = (reply: FastifyReply) =>
  reply.forbidden("No tenés permiso para cargar el monto ni la forma de pago (hace falta ver Finanzas). Pedíselo a un administrador.");

export const projectRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", requireUser);
  app.addHook("onRequest", requireArea("proyectos"));

  app.get("/api/projects", { config: { access: access(["proyectos", "tickets"], "read") }, schema: { querystring: projectListQuery } }, (req) =>
    service.listProjects(db, { archived: req.query.archived === "1" }),
  );

  app.get("/api/projects/:id", { config: { access: access(["proyectos", "finanzas"], "read") }, schema: { params: idParams } }, (req) =>
    service.getProject(db, req.params.id, { money: canSee(req, "finanzas") }),
  );

  app.post("/api/projects", { schema: { body: projectCreate } }, async (req, reply) => {
    if (touchesSale(req, req.body)) return forbidSale(reply);
    const project = await service.createProject(db, sessionOf(req).user.id, req.body);
    return reply.status(201).send(project);
  });

  app.patch("/api/projects/:id", { schema: { params: idParams, body: projectUpdate } }, async (req, reply) => {
    if (touchesSale(req, req.body)) return forbidSale(reply);
    await service.updateProject(db, sessionOf(req).user.id, req.params.id, req.body);
    return reply.status(204).send();
  });
};
