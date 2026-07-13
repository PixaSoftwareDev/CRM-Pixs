CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"contenido" text,
	"archivo_url" text,
	"autor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"empresa" text,
	"email" text,
	"telefono" text,
	"sitio_web" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"motor" text DEFAULT 'postgres' NOT NULL,
	"server_id" uuid,
	"host" text,
	"puerto" text,
	"entorno" text DEFAULT 'prod' NOT NULL,
	"credencial_ref" text,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fts" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', coalesce("nombre",'') || ' ' || coalesce("motor",'') || ' ' || coalesce("host",'') || ' ' || coalesce("descripcion",''))) STORED
);
--> statement-breakpoint
CREATE TABLE "project_infra" (
	"project_id" uuid NOT NULL,
	"server_id" uuid,
	"database_id" uuid,
	CONSTRAINT "project_infra_project_id_server_id_database_id_pk" PRIMARY KEY("project_id","server_id","database_id")
);
--> statement-breakpoint
CREATE TABLE "project_tech_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"label" text NOT NULL,
	"valor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"proveedor" text,
	"ip_hostname" text,
	"specs" text,
	"os" text,
	"costo_mensual" numeric(12, 2),
	"estado" text DEFAULT 'activo' NOT NULL,
	"renovacion_at" timestamp with time zone,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fts" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', coalesce("nombre",'') || ' ' || coalesce("proveedor",'') || ' ' || coalesce("ip_hostname",'') || ' ' || coalesce("descripcion",'') || ' ' || coalesce("os",''))) STORED
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"monto_total" numeric(14, 2) NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"vence_at" date NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"metodo_pago" text,
	"comprobante_url" text,
	"pagada_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"categoria" text,
	"realizado_por" uuid,
	"project_id" uuid,
	"fecha" date NOT NULL,
	"comprobante_url" text,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"estado" text DEFAULT 'consultado' NOT NULL,
	"motivo_perdida" text,
	"valor_estimado" numeric(14, 2),
	"probabilidad" numeric(5, 2),
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"scraping_campaign_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"estado_cambiado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"fecha_inicio" date,
	"fecha_fin_estimada" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraping_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"query" text NOT NULL,
	"ubicacion" text,
	"cantidad" integer DEFAULT 20 NOT NULL,
	"campos_extra" jsonb,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraping_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"email" text,
	"telefono" text,
	"contacto_nombre" text,
	"contacto_area" text,
	"sitio_web" text,
	"descripcion" text,
	"datos_extra" jsonb,
	"estado" text DEFAULT 'nuevo' NOT NULL,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"completado" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"estado" text DEFAULT 'backlog' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"asignado_a" uuid,
	"vence_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_autor_id_users_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_infra" ADD CONSTRAINT "project_infra_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_infra" ADD CONSTRAINT "project_infra_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_infra" ADD CONSTRAINT "project_infra_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tech_info" ADD CONSTRAINT "project_tech_info_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_realizado_por_users_id_fk" FOREIGN KEY ("realizado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraping_campaigns" ADD CONSTRAINT "scraping_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraping_leads" ADD CONSTRAINT "scraping_leads_campaign_id_scraping_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."scraping_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraping_leads" ADD CONSTRAINT "scraping_leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_asignado_a_users_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_entity_idx" ON "activities" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "contacts_nombre_idx" ON "contacts" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "databases_nombre_idx" ON "databases" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "databases_fts_idx" ON "databases" USING gin ("fts");--> statement-breakpoint
CREATE INDEX "project_tech_info_project_idx" ON "project_tech_info" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "servers_nombre_idx" ON "servers" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "servers_fts_idx" ON "servers" USING gin ("fts");--> statement-breakpoint
CREATE INDEX "installments_vence_estado_idx" ON "installments" USING btree ("vence_at","estado");--> statement-breakpoint
CREATE INDEX "transactions_fecha_idx" ON "transactions" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "opportunities_estado_idx" ON "opportunities" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "opportunities_contact_idx" ON "opportunities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "projects_opportunity_idx" ON "projects" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "scraping_leads_campaign_idx" ON "scraping_leads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "scraping_leads_estado_idx" ON "scraping_leads" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id","estado","orden");--> statement-breakpoint

-- =====================================================================
-- RLS en TODAS las tablas nuevas (§4.2): acceso total para autenticados por ahora.
-- Cuando haya permisos por rol, se refinan las policies sin migrar datos.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contacts','opportunities','activities','projects','tasks','task_checklist_items',
    'servers','databases','project_infra','project_tech_info',
    'budgets','installments','transactions','scraping_campaigns','scraping_leads'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t || '_authenticated_all', t
    );
  END LOOP;
END $$;