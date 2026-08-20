-- Crash and error reporting for TRIAD Prayer.
-- Clients can only append reports; reading them requires the service role.

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  platform text not null,
  app_version text,
  message text not null,
  stack text,
  context jsonb,
  created_at timestamptz not null default now()
);

alter table public.error_reports enable row level security;

revoke all on public.error_reports from anon, authenticated;
grant insert on public.error_reports to anon, authenticated;

create policy "Clients can append error reports"
  on public.error_reports
  for insert
  to anon, authenticated
  with check (true);

create index if not exists error_reports_created_at_idx
  on public.error_reports (created_at desc);
