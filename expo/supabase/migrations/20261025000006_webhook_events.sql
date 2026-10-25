-- Audit must-fix #12c (2026-10-24): RevenueCat webhook idempotency +
-- ordering state, so a redelivered or stale event cannot re-grant a
-- lapsed subscriber or double-apply a transfer.
--
-- webhook_events: one row per processed RevenueCat event id. The webhook
-- claims the id before processing (insert ... on conflict do nothing);
-- a duplicate delivery finds the row already claimed and is skipped.
-- webhook_user_state: the newest event timestamp seen per user, so a
-- stale redelivery (older than the last processed event) is ignored even
-- when it carries a new delivery id.
-- Both tables are service-role only: RLS enabled, no policies, no grants
-- to anon/authenticated. The service role bypasses RLS; clients cannot
-- read or write either table.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id text PRIMARY KEY,
  user_id uuid,
  event_type text,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_events FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.webhook_user_state (
  user_id uuid PRIMARY KEY,
  last_event_ms bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_user_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_user_state FROM anon, authenticated;
