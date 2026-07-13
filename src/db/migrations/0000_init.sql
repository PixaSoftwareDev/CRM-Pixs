CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"accion" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"cambios" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"rol" text DEFAULT 'miembro' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint

-- =====================================================================
-- RLS base (§4.2 del plan): activo en TODAS las tablas desde el día 1.
-- Hoy los 3 usuarios tienen acceso total (cualquier usuario autenticado).
-- Cuando haya permisos por rol, se refinan las policies sin migrar datos.
-- =====================================================================
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "users_authenticated_all" ON "users"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);--> statement-breakpoint

-- El audit_log se lee por usuarios autenticados; escribir solo desde el server
-- (service role, que bypassa RLS). Sin policy de INSERT para authenticated.
CREATE POLICY "audit_log_authenticated_read" ON "audit_log"
  FOR SELECT TO authenticated USING (true);--> statement-breakpoint

-- =====================================================================
-- Sincronización auth.users -> public.users: al crear un usuario en Supabase
-- Auth, se crea su perfil. Corre con privilegios del definidor (bypassa RLS).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, nombre, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nombre', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();