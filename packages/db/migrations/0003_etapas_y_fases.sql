CREATE TYPE "public"."project_phase" AS ENUM('kickoff', 'relevamiento', 'desarrollo', 'pruebas', 'entrega');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage_key" AS ENUM('potencial', 'primer_contacto', 'reunion', 'propuesta', 'seguimiento', 'cierre', 'implementacion');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "phase" "project_phase" DEFAULT 'kickoff' NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN "key" "pipeline_stage_key";--> statement-breakpoint
-- Bases ya sembradas: la clave sale de la posición original del embudo.
UPDATE "pipeline_stages" SET "key" = (ARRAY['potencial','primer_contacto','reunion','propuesta','seguimiento','cierre','implementacion']::"pipeline_stage_key"[])["position" + 1]
WHERE "key" IS NULL AND "position" BETWEEN 0 AND 6;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_key_uq" ON "pipeline_stages" USING btree ("key");