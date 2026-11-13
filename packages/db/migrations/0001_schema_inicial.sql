CREATE TYPE "public"."activity_kind" AS ENUM('nota', 'llamada', 'reunion', 'whatsapp', 'email', 'ticket', 'cobro', 'factura', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."automation_action" AS ENUM('enviar_whatsapp', 'enviar_email', 'crear_ticket', 'crear_proyecto_y_cuotas', 'generar_facturas_abonos', 'crear_tarea', 'marcar_en_riesgo');--> statement-breakpoint
CREATE TYPE "public"."automation_run_status" AS ENUM('ok', 'error', 'omitida');--> statement-breakpoint
CREATE TYPE "public"."automation_trigger" AS ENUM('cuota_vence', 'mensaje_entrante', 'oportunidad_ganada', 'inicio_de_mes', 'tarea_reasignada', 'resumen_diario', 'proyecto_excede_horas', 'cliente_sin_contacto');--> statement-breakpoint
CREATE TYPE "public"."client_priority" AS ENUM('alta', 'media', 'baja');--> statement-breakpoint
CREATE TYPE "public"."client_source" AS ENUM('referido', 'web', 'captacion', 'otro');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('potencial', 'activo', 'en_riesgo', 'baja');--> statement-breakpoint
CREATE TYPE "public"."invoice_letter" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."tax_condition" AS ENUM('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final');--> statement-breakpoint
CREATE TYPE "public"."cash_direction" AS ENUM('ingreso', 'egreso');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('factura', 'nota_debito', 'nota_credito', 'recibo');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('borrador', 'emitido', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('transferencia', 'efectivo', 'tarjeta', 'mercado_pago', 'cheque', 'otro');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'miembro');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('nuevo', 'en_curso', 'en_riesgo', 'pausado', 'entregado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('abierta', 'ganada', 'perdida');--> statement-breakpoint
CREATE TYPE "public"."ticket_channel" AS ENUM('telefono', 'whatsapp', 'email', 'web', 'presencial');--> statement-breakpoint
CREATE TYPE "public"."ticket_event_kind" AS ENUM('creado', 'asignado', 'estado', 'nota', 'adjunto', 'confirmado');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('normal', 'alta', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('nuevo', 'en_curso', 'a_confirmar', 'resuelto', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('falla', 'implementacion', 'consulta', 'mejora');--> statement-breakpoint
CREATE TYPE "public"."credential_action" AS ENUM('ver', 'copiar', 'crear', 'editar', 'eliminar');--> statement-breakpoint
CREATE TYPE "public"."credential_kind" AS ENUM('panel', 'hosting', 'base_de_datos', 'acceso_remoto', 'tienda_apps', 'email', 'red_social', 'dominio', 'otro');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pendiente', 'en_curso', 'hecha', 'cancelada');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"actor_id" uuid,
	"project_id" uuid,
	"ticket_id" uuid,
	"document_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger" "automation_trigger" NOT NULL,
	"action" "automation_action" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"status" "automation_run_status" NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_billing_profiles" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"invoice_letter" "invoice_letter" DEFAULT 'B' NOT NULL,
	"fiscal_address" text,
	"billing_email" text,
	"payment_term_days" smallint DEFAULT 10 NOT NULL,
	"bank_account" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text,
	"phone" text,
	"email" text,
	"is_decision_maker" boolean DEFAULT false NOT NULL,
	"handles_payments" boolean DEFAULT false NOT NULL,
	"handles_support" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"tax_id" varchar(11),
	"tax_condition" "tax_condition",
	"address" text,
	"phone" text,
	"email" text,
	"status" "client_status" DEFAULT 'potencial' NOT NULL,
	"priority" "client_priority" DEFAULT 'media' NOT NULL,
	"source" "client_source",
	"owner_id" uuid,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"ticket_id" uuid,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_one_owner_ck" CHECK (num_nonnulls("attachments"."client_id", "attachments"."project_id", "attachments"."ticket_id") = 1),
	CONSTRAINT "attachments_size_ck" CHECK ("attachments"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_on" date NOT NULL,
	"direction" "cash_direction" NOT NULL,
	"amount" bigint NOT NULL,
	"concept" text NOT NULL,
	"category" text,
	"client_id" uuid,
	"document_id" uuid,
	"paid_by_id" uuid,
	"reimbursable" boolean DEFAULT false NOT NULL,
	"reimbursed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_amount_ck" CHECK ("cash_movements"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "document_allocations" (
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_allocations_source_id_target_id_pk" PRIMARY KEY("source_id","target_id"),
	CONSTRAINT "document_allocations_amount_ck" CHECK ("document_allocations"."amount" > 0),
	CONSTRAINT "document_allocations_self_ck" CHECK ("document_allocations"."source_id" <> "document_allocations"."target_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" "document_kind" NOT NULL,
	"letter" "invoice_letter",
	"point_of_sale" smallint NOT NULL,
	"number" integer NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date,
	"concept" text NOT NULL,
	"amount" bigint NOT NULL,
	"status" "document_status" DEFAULT 'emitido' NOT NULL,
	"payment_method" "payment_method",
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_number_uq" UNIQUE NULLS NOT DISTINCT("kind","letter","point_of_sale","number"),
	CONSTRAINT "documents_amount_ck" CHECK ("documents"."amount" > 0),
	CONSTRAINT "documents_receipt_ck" CHECK (("documents"."kind" = 'recibo') = ("documents"."payment_method" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"description" text NOT NULL,
	"total" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installment_plans_total_ck" CHECK ("installment_plans"."total" > 0)
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"amount" bigint NOT NULL,
	"due_on" date NOT NULL,
	"invoice_id" uuid,
	"auto_reminder" boolean DEFAULT true NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_amount_ck" CHECK ("installments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "price_adjustment_items" (
	"adjustment_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"previous_amount" bigint NOT NULL,
	"new_amount" bigint NOT NULL,
	CONSTRAINT "price_adjustment_items_adjustment_id_subscription_id_pk" PRIMARY KEY("adjustment_id","subscription_id")
);
--> statement-breakpoint
CREATE TABLE "price_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"effective_on" date NOT NULL,
	"percent" numeric(6, 2) NOT NULL,
	"note" text,
	"applied_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" bigint NOT NULL,
	"billing_day" smallint DEFAULT 1 NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_amount_ck" CHECK ("subscriptions"."amount" > 0),
	CONSTRAINT "subscriptions_billing_day_ck" CHECK ("subscriptions"."billing_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'miembro' NOT NULL,
	"color" varchar(7),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"implementer_id" uuid,
	"status" "project_status" DEFAULT 'nuevo' NOT NULL,
	"starts_on" date,
	"due_on" date,
	"due_is_estimate" boolean DEFAULT true NOT NULL,
	"estimated_hours" integer,
	"scope" text,
	"sale_amount" bigint,
	"payment_terms" text,
	"seller_id" uuid,
	"sold_on" date,
	"created_automatically" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_estimated_hours_ck" CHECK ("projects"."estimated_hours" IS NULL OR "projects"."estimated_hours" > 0),
	CONSTRAINT "projects_dates_ck" CHECK ("projects"."starts_on" IS NULL OR "projects"."due_on" IS NULL OR "projects"."due_on" >= "projects"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid,
	"title" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"stage_id" uuid NOT NULL,
	"status" "opportunity_status" DEFAULT 'abierta' NOT NULL,
	"owner_id" uuid,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_close_on" date,
	"closed_at" timestamp with time zone,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_amount_ck" CHECK ("opportunities"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "opportunity_stage_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"reason" text,
	"changed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" varchar(7) NOT NULL,
	"position" smallint NOT NULL,
	"closes_as" "opportunity_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"kind" "ticket_event_kind" NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "tickets_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 100 CACHE 1),
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"type" "ticket_type" NOT NULL,
	"channel" "ticket_channel" NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"status" "ticket_status" DEFAULT 'nuevo' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"reported_by_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"suggested_assignee_id" uuid,
	"assignee_id" uuid,
	"scheduled_at" timestamp with time zone,
	"confirmer_id" uuid,
	"confirm_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_access_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"credential_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" "credential_action" NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "credential_kind" NOT NULL,
	"label" text NOT NULL,
	"username" text,
	"secret_ciphertext" text NOT NULL,
	"key_version" smallint DEFAULT 1 NOT NULL,
	"connect_url" text,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" varchar(7) NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type_id" uuid NOT NULL,
	"status" "task_status" DEFAULT 'pendiente' NOT NULL,
	"assignee_id" uuid NOT NULL,
	"assigned_by_id" uuid,
	"created_by_id" uuid,
	"client_id" uuid,
	"project_id" uuid,
	"opportunity_id" uuid,
	"ticket_id" uuid,
	"starts_at" timestamp with time zone,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_duration_ck" CHECK ("tasks"."duration_minutes" > 0),
	CONSTRAINT "tasks_completed_ck" CHECK (("tasks"."status" = 'hecha') = ("tasks"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"ticket_id" uuid,
	"task_id" uuid,
	"worked_on" date NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_minutes_ck" CHECK ("time_entries"."minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD CONSTRAINT "client_billing_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_allocations" ADD CONSTRAINT "document_allocations_source_id_documents_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_allocations" ADD CONSTRAINT "document_allocations_target_id_documents_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_plan_id_installment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_invoice_id_documents_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustment_items" ADD CONSTRAINT "price_adjustment_items_adjustment_id_price_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."price_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustment_items" ADD CONSTRAINT "price_adjustment_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_applied_by_id_users_id_fk" FOREIGN KEY ("applied_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_implementer_id_users_id_fk" FOREIGN KEY ("implementer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_changes" ADD CONSTRAINT "opportunity_stage_changes_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_changes" ADD CONSTRAINT "opportunity_stage_changes_from_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_changes" ADD CONSTRAINT "opportunity_stage_changes_to_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_changes" ADD CONSTRAINT "opportunity_stage_changes_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_suggested_assignee_id_users_id_fk" FOREIGN KEY ("suggested_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_confirmer_id_users_id_fk" FOREIGN KEY ("confirmer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_access_logs" ADD CONSTRAINT "credential_access_logs_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_access_logs" ADD CONSTRAINT "credential_access_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_id_task_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."task_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_client_timeline_idx" ON "activities" USING btree ("client_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_client_contact_idx" ON "activities" USING btree ("client_id","occurred_at" DESC NULLS LAST) WHERE "activities"."kind" IN ('llamada', 'reunion', 'whatsapp', 'email');--> statement-breakpoint
CREATE INDEX "automation_runs_rule_idx" ON "automation_runs" USING btree ("rule_id","started_at");--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_tax_id_uq" ON "clients" USING btree ("tax_id") WHERE "clients"."tax_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_owner_idx" ON "clients" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "clients_name_trgm" ON "clients" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_key_uq" ON "attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "attachments_client_idx" ON "attachments" USING btree ("client_id") WHERE "attachments"."client_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "attachments_project_idx" ON "attachments" USING btree ("project_id") WHERE "attachments"."project_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "attachments_ticket_idx" ON "attachments" USING btree ("ticket_id") WHERE "attachments"."ticket_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cash_movements_occurred_idx" ON "cash_movements" USING btree ("occurred_on");--> statement-breakpoint
CREATE INDEX "cash_movements_pending_refund_idx" ON "cash_movements" USING btree ("paid_by_id") WHERE "cash_movements"."reimbursable" AND "cash_movements"."reimbursed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cash_movements_client_idx" ON "cash_movements" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "document_allocations_target_idx" ON "document_allocations" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "documents_client_issued_idx" ON "documents" USING btree ("client_id","issued_on");--> statement-breakpoint
CREATE INDEX "documents_due_idx" ON "documents" USING btree ("due_on") WHERE "documents"."kind" IN ('factura', 'nota_debito') AND "documents"."status" = 'emitido';--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "installment_plans_client_idx" ON "installment_plans" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "installment_plans_project_idx" ON "installment_plans" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_plan_number_uq" ON "installments" USING btree ("plan_id","number");--> statement-breakpoint
CREATE INDEX "installments_due_idx" ON "installments" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "installments_invoice_idx" ON "installments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "price_adjustment_items_sub_idx" ON "price_adjustment_items" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_client_idx" ON "subscriptions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "subscriptions_active_day_idx" ON "subscriptions" USING btree ("billing_day") WHERE "subscriptions"."active";--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_uq" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_opportunity_uq" ON "projects" USING btree ("opportunity_id") WHERE "projects"."opportunity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_implementer_status_idx" ON "projects" USING btree ("implementer_id","status");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_name_trgm" ON "projects" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "opportunities_open_stage_idx" ON "opportunities" USING btree ("stage_id","stage_entered_at") WHERE "opportunities"."status" = 'abierta';--> statement-breakpoint
CREATE INDEX "opportunities_client_idx" ON "opportunities" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "opportunities_owner_idx" ON "opportunities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "opp_stage_changes_opp_idx" ON "opportunity_stage_changes" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "opp_stage_changes_created_idx" ON "opportunity_stage_changes" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_position_uq" ON "pipeline_stages" USING btree ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_name_uq" ON "pipeline_stages" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_number_uq" ON "tickets" USING btree ("number");--> statement-breakpoint
CREATE INDEX "tickets_open_status_due_idx" ON "tickets" USING btree ("status","due_at") WHERE "tickets"."status" NOT IN ('resuelto', 'cancelado');--> statement-breakpoint
CREATE INDEX "tickets_assignee_status_idx" ON "tickets" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "tickets_client_idx" ON "tickets" USING btree ("client_id","received_at");--> statement-breakpoint
CREATE INDEX "tickets_project_idx" ON "tickets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tickets_title_trgm" ON "tickets" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "credential_logs_credential_idx" ON "credential_access_logs" USING btree ("credential_id","created_at");--> statement-breakpoint
CREATE INDEX "credential_logs_user_idx" ON "credential_access_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credential_logs_created_idx" ON "credential_access_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "credentials_client_idx" ON "credentials" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "task_comments_task_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_types_name_uq" ON "task_types" USING btree ("name");--> statement-breakpoint
CREATE INDEX "tasks_assignee_starts_idx" ON "tasks" USING btree ("assignee_id","starts_at") WHERE "tasks"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tasks_starts_idx" ON "tasks" USING btree ("starts_at") WHERE "tasks"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tasks_done_idx" ON "tasks" USING btree ("completed_at") WHERE "tasks"."status" = 'hecha' AND "tasks"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tasks_client_idx" ON "tasks" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_opportunity_idx" ON "tasks" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "tasks_ticket_idx" ON "tasks" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "time_entries_project_idx" ON "time_entries" USING btree ("project_id","worked_on");--> statement-breakpoint
CREATE INDEX "time_entries_user_idx" ON "time_entries" USING btree ("user_id","worked_on");