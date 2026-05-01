create table if not exists public.agency_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.agency_state enable row level security;

-- No browser/client policies are needed.
-- The deployed API uses the server-only SUPABASE_SERVICE_ROLE_KEY.
