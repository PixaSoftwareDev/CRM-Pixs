ALTER TABLE "attachments" DROP CONSTRAINT "attachments_one_owner_ck";--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_task_idx" ON "attachments" USING btree ("task_id") WHERE "attachments"."task_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_owner_ck" CHECK (num_nonnulls("attachments"."client_id", "attachments"."project_id", "attachments"."ticket_id", "attachments"."task_id") = 1);