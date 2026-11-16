/**
 * Delete-account client helpers (P0-5, 2026-11-16).
 *
 * The server (backend/functions/delete-account/index.ts) only deletes
 * when the user's last sign-in is within the last 10 minutes
 * (RECENT_LOGIN_WINDOW_MS) and answers 401 otherwise. Two client
 * rules follow from that:
 *
 * 1. Check freshness BEFORE the call (isRecentLogin): burning the
 *    function call to learn the session is stale wastes a round-trip
 *    and shows a failure for what is really a re-sign-in step.
 * 2. Classify a failed call by the error's status (isRecentLoginError):
 *    supabase-js throws a FunctionsHttpError whose message is the
 *    generic "Edge Function returned a non-2xx status code" — the
 *    server's "last 10 minutes" text lives in the response BODY, not
 *    in error.message, so matching on the message never fires (the
 *    dead branch this replaces in AppProvider.deleteAccount). The
 *    status lives on error.context (the Response) instead.
 */

export const RECENT_LOGIN_WINDOW_MS = 10 * 60 * 1000;

/**
 * True when lastSignInAt (a Supabase User.last_sign_in_at ISO string)
 * is within the recent-login window at nowMs. Missing or unparseable
 * values are stale — never treat an unknown sign-in time as fresh.
 */
export function isRecentLogin(
  lastSignInAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!lastSignInAt) return false;
  const last = Date.parse(lastSignInAt);
  if (!Number.isFinite(last)) return false;
  return nowMs - last <= RECENT_LOGIN_WINDOW_MS;
}

/**
 * True when an edge-function failure means "sign in again first".
 * Reads error.context.status (FunctionsHttpError carries the Response
 * as context); falls back to the message text for errors that carry
 * the server's wording directly. A non-401 numeric status is NOT a
 * recent-login error, even if some message text matches — the status
 * is authoritative when present.
 */
export function isRecentLoginError(error: unknown): boolean {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  if (typeof status === 'number') {
    return status === 401;
  }
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.includes('last 10 minutes');
}
