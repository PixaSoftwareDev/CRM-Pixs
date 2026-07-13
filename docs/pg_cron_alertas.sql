-- Programación de las alertas diarias de pagos (§7 Fase 3).
-- Ejecutar UNA vez en el SQL editor de Supabase, reemplazando el dominio y el secreto.
-- Requiere las extensiones pg_cron y pg_net (disponibles en Supabase).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guardá el secreto del cron como setting de la base (o pásalo inline abajo).
-- alter database postgres set app.cron_secret = 'EL_MISMO_VALOR_QUE_CRON_SECRET';

-- Todos los días a las 09:00 (UTC) pega al endpoint del CRM, que marca las
-- cuotas vencidas y manda el digest por email (Resend).
select cron.schedule(
  'alertas-pagos-diarias',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://TU-DOMINIO.vercel.app/api/cron/alertas-pagos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver los jobs:   select * from cron.job;
-- Para borrar el job:  select cron.unschedule('alertas-pagos-diarias');
