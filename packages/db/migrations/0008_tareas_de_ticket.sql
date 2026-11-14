CREATE TYPE "public"."ticket_task_role" AS ENUM('principal', 'adicional', 'confirmacion');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ticket_role" "ticket_task_role";--> statement-breakpoint
-- Tareas de tickets ya cargadas: hasta ahora el flujo creaba solo dos clases de
-- tareas y las distinguía por el tipo. Las de tipo "Llamada" son la llamada de
-- confirmación; todas las demás, el trabajo del responsable del ticket.
UPDATE "tasks" t SET "ticket_role" = CASE
  WHEN tt."name" = 'Llamada' THEN 'confirmacion'::"ticket_task_role"
  ELSE 'principal'::"ticket_task_role"
END
FROM "task_types" tt
WHERE tt."id" = t."type_id" AND t."ticket_id" IS NOT NULL;
