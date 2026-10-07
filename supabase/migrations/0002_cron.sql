-- Scheduled jobs. The Fly backend scales to zero; pg_cron + pg_net wake it on a
-- schedule by POSTing to protected job endpoints.
--
-- BEFORE running this file, store two Vault secrets (SQL editor):
--   select vault.create_secret('https://<your-fly-app>.fly.dev', 'rip_backend_url');
--   select vault.create_secret('<same value as CRON_SECRET on Fly>', 'rip_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.rip_call_job(job text)
returns bigint
language sql security definer set search_path = public, vault, net as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rip_backend_url') || '/api/jobs/' || job,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rip_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$;
revoke all on function public.rip_call_job(text) from public, anon, authenticated;

-- momentum decay, dead detection, waiting-on prompts, red alerts: hourly
select cron.schedule('rip-momentum-decay', '0 * * * *', $$ select public.rip_call_job('momentum-decay') $$);
-- google calendar pull: every 30 minutes
select cron.schedule('rip-calendar-sync', '*/30 * * * *', $$ select public.rip_call_job('calendar-sync') $$);
-- scheduled + random check-in reminders and infeasibility alerts: every 15 minutes
select cron.schedule('rip-checkin-dispatch', '*/15 * * * *', $$ select public.rip_call_job('checkin-dispatch') $$);
