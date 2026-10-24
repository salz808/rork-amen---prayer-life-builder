-- Tighten error_reports inserts: the original policy allowed any client to
-- file a report attributed to any user id. Reports are still append-only
-- and still unreadable by clients; only the attribution is now constrained
-- to the caller's own id (or anonymous).

drop policy if exists "Clients can append error reports"
  on public.error_reports;

create policy "Clients can append error reports"
  on public.error_reports
  for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
