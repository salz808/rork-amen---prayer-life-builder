-- Audit must-fix #1 (2026-10-24): crash reports must NOT be linkable to users.
--
-- The client never sent user_id, but this column's DEFAULT auth.uid()
-- stamped every signed-in report server-side, contradicting the App Store
-- "Crash Data: Not Linked to You" label. Drop the default so future rows
-- are anonymous unless a caller explicitly attributes one, and scrub the
-- historical rows that were stamped by the default.
ALTER TABLE public.error_reports ALTER COLUMN user_id DROP DEFAULT;

UPDATE public.error_reports SET user_id = NULL WHERE user_id IS NOT NULL;
