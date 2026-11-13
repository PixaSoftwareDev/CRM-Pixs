ALTER TYPE "public"."automation_action" ADD VALUE 'avanzar_ticket';--> statement-breakpoint
ALTER TYPE "public"."automation_trigger" ADD VALUE 'tarea_de_ticket_hecha';--> statement-breakpoint
DROP INDEX "credentials_client_idx";--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "credentials_client_idx" ON "credentials" USING btree ("client_id") WHERE "credentials"."deleted_at" IS NULL;