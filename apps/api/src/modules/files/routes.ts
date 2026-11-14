/** Rutas del contenedor de archivos. El permiso depende de a qué pertenece cada archivo. */
import multipart from "@fastify/multipart";
import { type Area, FILE_MAX_BYTES, FILE_MAX_LABEL, type FileOwnerKind, fileDownloadQuery, fileOwnerQuery, hasLevel, idParams, type Level } from "@crm/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { AppError, BadRequestError } from "../../lib/errors";
import { FileTooLargeError, openFile } from "../../lib/storage";
import { requireUser, sessionOf } from "../auth/guard";
import * as service from "./service";

const AREA: Record<FileOwnerKind, Area> = { client: "clientes", project: "proyectos", ticket: "tickets" };

function viewerOf(req: FastifyRequest): service.Viewer {
  const perms = req.access?.permissions;
  const sees = (k: FileOwnerKind) => !!perms && hasLevel(perms[AREA[k]], "read");
  return {
    id: sessionOf(req).user.id,
    isAdmin: req.access?.role === "admin",
    sees: { client: sees("client"), project: sees("project"), ticket: sees("ticket") },
  };
}

function need(req: FastifyRequest, kind: FileOwnerKind, level: Level) {
  const perms = req.access?.permissions;
  if (perms && hasLevel(perms[AREA[kind]], level)) return;
  const what = { client: "Clientes", project: "Proyectos", ticket: "Tickets" }[kind];
  throw new AppError(403, `No tenés permiso para ${level === "read" ? "ver" : "cambiar"} archivos de ${what}. Pedíselo a un administrador.`);
}

/** Lo que el navegador puede mostrar sin riesgo; todo lo demás se descarga (un HTML o SVG subido no corre en el CRM). */
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"]);

/** Content-Disposition con el nombre original (RFC 6266/5987: acentos y espacios incluidos). */
function disposition(type: "inline" | "attachment", filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const fileRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, { limits: { fileSize: FILE_MAX_BYTES, files: 1, fields: 0, parts: 1 } });
  app.addHook("onRequest", requireUser);

  app.get("/api/files", { schema: { querystring: fileOwnerQuery } }, (req) => {
    need(req, service.ownerOf(req.query).kind, "read");
    return service.listFiles(db, viewerOf(req), req.query);
  });

  app.post("/api/files", { schema: { querystring: fileOwnerQuery } }, async (req, reply) => {
    need(req, service.ownerOf(req.query).kind, "edit");
    if (!req.isMultipart()) throw new BadRequestError("Mandá el archivo como multipart/form-data");
    const file = await req.file().catch((err: { code?: string }) => {
      if (err.code === "FST_FILES_LIMIT" || err.code === "FST_PARTS_LIMIT") throw new BadRequestError("Subí de a un archivo por vez");
      throw err;
    });
    if (!file) throw new BadRequestError("Elegí un archivo");
    try {
      return reply.status(201).send(await service.uploadFile(db, viewerOf(req), req.query, file));
    } catch (err) {
      if (err instanceof FileTooLargeError || (err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        throw new AppError(413, `"${file.filename}" pesa más de ${FILE_MAX_LABEL}. Comprimilo o subilo partido.`);
      }
      throw err;
    }
  });

  app.get("/api/files/:id", { schema: { params: idParams, querystring: fileDownloadQuery } }, async (req, reply) => {
    const row = await service.getFile(db, req.params.id);
    need(req, row.owner_kind, "read");
    const inline = req.query.download !== "1" && INLINE.has(row.mime_type);
    const stream = openFile(row.storage_key);
    await new Promise<void>((resolve, reject) => {
      stream.once("open", () => resolve());
      stream.once("error", reject);
    }).catch(() => {
      throw new AppError(410, "El archivo ya no está en el servidor. Avisale a un administrador.");
    });
    // El visor de PDF del navegador no anda con CSP restrictiva; al resto (imágenes, texto) se le cierra todo.
    if (row.mime_type !== "application/pdf") {
      reply.header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    }
    return reply
      .header("Content-Type", inline ? (row.mime_type === "text/plain" ? "text/plain; charset=utf-8" : row.mime_type) : "application/octet-stream")
      .header("Content-Length", String(row.size_bytes))
      .header("Content-Disposition", disposition(inline ? "inline" : "attachment", row.filename))
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=3600")
      .send(stream);
  });

  app.delete("/api/files/:id", { schema: { params: idParams } }, async (req, reply) => {
    const row = await service.getFile(db, req.params.id);
    need(req, row.owner_kind, "edit");
    const viewer = viewerOf(req);
    if (!viewer.isAdmin && row.uploaded_by_id !== viewer.id) {
      throw new AppError(403, "Solo quien subió el archivo o un administrador lo puede borrar.");
    }
    await service.deleteFile(db, viewer, req.params.id);
    return reply.status(204).send();
  });
};
