-- MoodSync core schema
-- Design notes:
--   * We never store raw HealthKit samples. `health_summaries` holds only
--     daily aggregates the user has explicitly consented to sync.
--   * Diffuser provider credentials (Moodo/Pura account tokens) are stored
--     encrypted and are only ever decrypted inside Edge Functions using the
--     service role key — the client never receives them.
--   * All user-owned tables carry `user_id` + RLS so a user can only see
--     their own rows. Service-role Edge Functions bypass RLS deliberately.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  health_sync_consent boolean not null default false,
  health_sync_consent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- devices: a diffuser (or diffuser-controlling smart plug / HA entity)
-- ---------------------------------------------------------------------------
create type public.diffuser_provider_kind as enum (
  'moodo',
  'pura',
  'home_assistant',
  'homekit'
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.diffuser_provider_kind not null,
  external_id text not null, -- provider-specific device/entity id
  name text not null,
  room text,
  -- what this device can actually do; a smart-plug fallback device only
  -- supports power on/off, never intensity/scent.
  capabilities jsonb not null default '{"power": true, "intensity": false, "scent_selection": false}'::jsonb,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

alter table public.devices enable row level security;

create policy "devices_all_own" on public.devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- device_provider_credentials: encrypted per-user provider auth
-- Never selectable by the anon/authenticated role; only service_role
-- (used inside Edge Functions) can read/write this table.
-- ---------------------------------------------------------------------------
create table public.device_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.diffuser_provider_kind not null,
  -- pgsodium/pgcrypto symmetric-encrypted blob; decrypted only in Edge Functions
  encrypted_payload bytea not null,
  encryption_nonce bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.device_provider_credentials enable row level security;
-- Intentionally no policies granted to authenticated/anon roles: this table
-- is only reachable via the service_role key from within Edge Functions.
revoke all on public.device_provider_credentials from authenticated, anon;

-- ---------------------------------------------------------------------------
-- health_summaries: consented daily aggregates only (no raw samples)
-- ---------------------------------------------------------------------------
create table public.health_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  summary_date date not null,
  avg_heart_rate numeric,
  resting_heart_rate numeric,
  avg_hrv_sdnn numeric,
  avg_respiratory_rate numeric,
  sleep_minutes numeric,
  mindful_minutes numeric,
  workout_minutes numeric,
  created_at timestamptz not null default now(),
  unique (user_id, summary_date)
);

alter table public.health_summaries enable row level security;

create policy "health_summaries_all_own" on public.health_summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- mood_states: output of the on-device mood engine (scores, not raw health)
-- ---------------------------------------------------------------------------
create type public.mood_label as enum (
  'relaxed',
  'focused',
  'high_stress',
  'fatigued',
  'sleeping',
  'recovering',
  'energized'
);

create table public.mood_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  inferred_at timestamptz not null default now(),
  mood public.mood_label not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  -- per-mood weighted scores that produced this inference, for tuning/debugging
  component_scores jsonb not null,
  -- which metric categories contributed (no raw values), e.g. ["hrv","sleep"]
  contributing_factors text[] not null default '{}',
  engine_version text not null,
  created_at timestamptz not null default now()
);

alter table public.mood_states enable row level security;

create policy "mood_states_all_own" on public.mood_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index mood_states_user_time_idx on public.mood_states (user_id, inferred_at desc);

-- ---------------------------------------------------------------------------
-- fragrance_profiles: catalog of scents + their mood affinities
-- ---------------------------------------------------------------------------
create table public.fragrance_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade, -- null = global/system profile
  name text not null,
  notes text[] not null default '{}',
  -- affinity weight per mood label, e.g. {"relaxed": 0.9, "focused": 0.2}
  mood_affinity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.fragrance_profiles enable row level security;

create policy "fragrance_profiles_select" on public.fragrance_profiles
  for select using (user_id is null or auth.uid() = user_id);
create policy "fragrance_profiles_mutate_own" on public.fragrance_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- automation_rules: user-configurable mood -> fragrance/intensity/runtime
-- ---------------------------------------------------------------------------
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mood public.mood_label not null,
  fragrance_profile_id uuid references public.fragrance_profiles (id),
  intensity numeric not null default 0.5 check (intensity >= 0 and intensity <= 1),
  runtime_minutes int not null default 15 check (runtime_minutes > 0),
  cooldown_minutes int not null default 45 check (cooldown_minutes >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mood)
);

alter table public.automation_rules enable row level security;

create policy "automation_rules_all_own" on public.automation_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- automation_history: every dispatch attempt + outcome, for learning + audit
-- ---------------------------------------------------------------------------
create type public.automation_trigger_source as enum (
  'mood_engine',
  'manual_override',
  'schedule'
);

create type public.automation_outcome as enum (
  'dispatched',
  'skipped_cooldown',
  'skipped_user_override',
  'failed'
);

create table public.automation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  mood_state_id uuid references public.mood_states (id) on delete set null,
  fragrance_profile_id uuid references public.fragrance_profiles (id),
  intensity numeric,
  runtime_minutes int,
  trigger_source public.automation_trigger_source not null,
  outcome public.automation_outcome not null,
  failure_reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.automation_history enable row level security;

create policy "automation_history_all_own" on public.automation_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index automation_history_user_time_idx on public.automation_history (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- user_preferences: continuously-learned weights (not hardcoded)
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- learned scent affinity adjustments per fragrance_profile_id
  scent_affinity jsonb not null default '{}'::jsonb,
  -- learned intensity preference per mood label
  intensity_preference jsonb not null default '{}'::jsonb,
  -- learned quiet hours / do-not-disturb windows, e.g. [{"start":"22:00","end":"07:00"}]
  quiet_hours jsonb not null default '[]'::jsonb,
  override_count int not null default 0,
  successful_automation_count int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "user_preferences_all_own" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping trigger, reused across tables
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger devices_set_updated_at before update on public.devices
  for each row execute function public.set_updated_at();
create trigger device_provider_credentials_set_updated_at before update on public.device_provider_credentials
  for each row execute function public.set_updated_at();
create trigger automation_rules_set_updated_at before update on public.automation_rules
  for each row execute function public.set_updated_at();
