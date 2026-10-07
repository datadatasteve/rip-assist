-- rip-assist V1 schema
-- Every table carries user_id (defaults to auth.uid() so the frontend can insert
-- without passing it) and has RLS restricting rows to their owner.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- lanes
-- ---------------------------------------------------------------------------
create table public.lanes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  name text not null,
  type text not null check (type in ('persistent', 'project', 'temporary')),
  color text,
  icon text,
  end_date date,
  sort_order int default 0,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  lane_id uuid references public.lanes on delete set null,
  title text not null,
  description text,
  priority_user int check (priority_user between 1 and 10),
  priority_app int check (priority_app between 1 and 10),
  momentum int default 50 check (momentum between 0 and 100),
  momentum_trend text check (momentum_trend in ('rising', 'flat', 'falling')),
  status text default 'active' check (status in ('active', 'waiting_on', 'dead', 'complete', 'archived')),
  waiting_on_whom text,
  waiting_since timestamptz,
  last_interaction timestamptz default now(),
  decay_threshold_days int default 3,
  dead_at timestamptz,
  due_date date,
  completed_at timestamptz,
  -- engine bookkeeping (added beyond spec, see build-overview.md)
  decay_applied_on date,
  due_penalty_applied bool default false,
  low_since timestamptz,
  waiting_prompted_at timestamptz,
  red_alerted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  goal_id uuid references public.goals on delete set null,
  lane_id uuid references public.lanes on delete set null,
  title text not null,
  description text,
  priority_user int check (priority_user between 1 and 10),
  priority_app int check (priority_app between 1 and 10),
  momentum int default 50 check (momentum between 0 and 100),
  momentum_trend text check (momentum_trend in ('rising', 'flat', 'falling')),
  status text default 'active' check (status in ('active', 'waiting_on', 'dead', 'complete', 'archived')),
  waiting_on_whom text,
  waiting_since timestamptz,
  last_interaction timestamptz default now(),
  decay_threshold_days int default 3,
  dead_at timestamptz,
  due_date date,
  completed_at timestamptz,
  decay_applied_on date,
  due_penalty_applied bool default false,
  low_since timestamptz,
  waiting_prompted_at timestamptz,
  red_alerted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- chunks
-- ---------------------------------------------------------------------------
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  task_id uuid references public.tasks on delete cascade,
  goal_id uuid references public.goals on delete cascade,
  lane_id uuid references public.lanes on delete set null,
  title text not null,
  duration_minutes int not null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  gcal_event_id text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- habits
-- ---------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  lane_id uuid references public.lanes on delete set null,
  title text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'custom')),
  custom_days int[],
  current_streak int default 0,
  longest_streak int default 0,
  last_completed date,
  archived_at timestamptz,
  created_at timestamptz default now()
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  habit_id uuid references public.habits on delete cascade not null,
  completed_date date not null,
  note text,
  created_at timestamptz default now(),
  unique (habit_id, completed_date)
);

-- ---------------------------------------------------------------------------
-- check-ins
-- ---------------------------------------------------------------------------
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  mood text check (mood in ('green', 'yellow', 'red')),
  energy int check (energy between 1 and 5),
  reflection text,
  notes text,
  behavioral_signals jsonb,
  triggered_by text check (triggered_by in ('scheduled', 'on_demand', 'random')),
  plan_resuggest_triggered bool default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------------
create table public.model_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  provider text not null,
  model_name text not null,
  endpoint_url text,
  api_key_env_var text,
  enabled bool default true,
  priority_order int,
  per_feature_overrides jsonb,
  version text default '1',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  provider text not null,
  model text not null,
  feature text not null,
  prompt_hash text,
  system_prompt text,
  user_prompt text,
  response text,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 6) default 0,
  agent_config_version text,
  user_rating_major int check (user_rating_major between 0 and 5),
  user_rating_sub text check (user_rating_sub in ('low', 'mid', 'high')),
  outcome_followed bool,
  -- added: every attempt is logged, including failed fallbacks
  success bool default true,
  error text,
  model_config_id uuid references public.model_configs on delete set null,
  created_at timestamptz default now()
);

create table public.agent_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  feature text not null,
  system_prompt text not null,
  version text not null,
  active bool default true,
  notes text,
  created_at timestamptz default now()
);

create table public.benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  scenario_id text not null,
  provider text not null,
  model text not null,
  agent_config_version text,
  prompt text not null,
  response text,
  rubric_scores jsonb,
  rubric_total int,
  rubric_max int,
  notes text,
  latency_ms int,
  run_group uuid,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  device_label text,
  subscription jsonb not null,
  created_at timestamptz default now()
);

-- in-app notification feed + dedup log for pushes
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  type text not null,
  title text not null,
  body text,
  url text,
  entity_id uuid,
  channels text[],
  read_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- settings / history / calendar (added beyond spec)
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references auth.users default auth.uid(),
  timezone text default 'UTC',
  workday_start time default '08:00',
  workday_end time default '22:00',
  checkin_times text[] default '{}',          -- 'HH:MM' local
  checkin_random_per_day int default 0,
  checkin_window_start time default '09:00',
  checkin_window_end time default '21:00',
  checkin_state jsonb default '{}'::jsonb,    -- {date, random_times[], sent[]}
  dev_mode bool default false,
  push_prompted bool default false,
  infeasible_offered_on date,
  updated_at timestamptz default now()
);

create table public.momentum_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  entity_type text not null check (entity_type in ('task', 'goal')),
  entity_id uuid not null,
  momentum int not null,
  delta int,
  event text,
  created_at timestamptz default now()
);
create index momentum_history_entity_idx on public.momentum_history (entity_id, created_at desc);

create table public.calendar_connections (
  user_id uuid primary key references auth.users default auth.uid(),
  google_email text,
  vault_secret_id uuid,                         -- refresh token lives in Supabase Vault
  calendars jsonb default '[]'::jsonb,          -- [{id, name, color, lane_id, enabled}]
  connected_at timestamptz default now(),
  last_synced_at timestamptz
);

create table public.gcal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  gcal_event_id text not null,
  calendar_id text not null,
  title text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day bool default false,
  synced_at timestamptz default now(),
  unique (user_id, calendar_id, gcal_event_id)
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------
create index on public.lanes (user_id);
create index on public.goals (user_id, status);
create index on public.tasks (user_id, status);
create index on public.chunks (user_id, scheduled_start);
create index on public.habits (user_id);
create index on public.habit_logs (user_id, completed_date);
create index on public.checkins (user_id, created_at desc);
create index on public.ai_interactions (user_id, created_at desc);
create index on public.benchmark_runs (user_id, created_at desc);
create index on public.notifications (user_id, created_at desc);
create index on public.gcal_events (user_id, start_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger lanes_updated before update on public.lanes for each row execute function public.set_updated_at();
create trigger goals_updated before update on public.goals for each row execute function public.set_updated_at();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger model_configs_updated before update on public.model_configs for each row execute function public.set_updated_at();
create trigger user_settings_updated before update on public.user_settings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: owner-only on every table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'lanes','goals','tasks','chunks','habits','habit_logs','checkins',
    'model_configs','ai_interactions','agent_configs','benchmark_runs',
    'push_subscriptions','notifications','user_settings','momentum_history',
    'calendar_connections','gcal_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes so every device stays in sync
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.lanes, public.goals, public.tasks, public.chunks, public.habits,
  public.habit_logs, public.checkins, public.ai_interactions, public.notifications,
  public.user_settings, public.gcal_events, public.calendar_connections,
  public.model_configs, public.agent_configs, public.benchmark_runs;

-- ---------------------------------------------------------------------------
-- Vault helpers for the Google refresh token (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.gcal_store_refresh_token(p_user uuid, p_token text, p_email text)
returns uuid
language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  select vault_secret_id into v_id from public.calendar_connections where user_id = p_user;
  if v_id is null then
    v_id := vault.create_secret(p_token, 'gcal_refresh_' || p_user::text, 'Google Calendar refresh token');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
  insert into public.calendar_connections (user_id, google_email, vault_secret_id, connected_at)
  values (p_user, p_email, v_id, now())
  on conflict (user_id) do update
    set google_email = excluded.google_email, vault_secret_id = excluded.vault_secret_id, connected_at = now();
  return v_id;
end $$;

create or replace function public.gcal_get_refresh_token(p_user uuid)
returns text
language sql security definer set search_path = public, vault as $$
  select ds.decrypted_secret
  from public.calendar_connections cc
  join vault.decrypted_secrets ds on ds.id = cc.vault_secret_id
  where cc.user_id = p_user;
$$;

create or replace function public.gcal_disconnect(p_user uuid)
returns void
language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  select vault_secret_id into v_id from public.calendar_connections where user_id = p_user;
  if v_id is not null then
    delete from vault.secrets where id = v_id;
  end if;
  delete from public.calendar_connections where user_id = p_user;
  delete from public.gcal_events where user_id = p_user;
end $$;

revoke all on function public.gcal_store_refresh_token(uuid, text, text) from public, anon, authenticated;
revoke all on function public.gcal_get_refresh_token(uuid) from public, anon, authenticated;
revoke all on function public.gcal_disconnect(uuid) from public, anon, authenticated;
grant execute on function public.gcal_store_refresh_token(uuid, text, text) to service_role;
grant execute on function public.gcal_get_refresh_token(uuid) to service_role;
grant execute on function public.gcal_disconnect(uuid) to service_role;
