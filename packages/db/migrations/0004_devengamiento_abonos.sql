ALTER TABLE "documents" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "period" date;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_subscription_period_uq" ON "documents" USING btree ("subscription_id","period") WHERE "documents"."subscription_id" IS NOT NULL;