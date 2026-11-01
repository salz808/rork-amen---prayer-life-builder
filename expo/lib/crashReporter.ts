import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

type CrashContext = Record<string, unknown>;

const MAX_REPORTS_PER_SESSION = 10;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 6000;

// Audit round 4, lane 5 (G-L5): error_reports.context is caller-controlled
// jsonb. Every current call site uses only these keys ({ key }, { label },
// { flow }, { environment, platform }, componentStack from ErrorBoundary),
// so anything else is dropped here before it can carry user content
// (prayer text, names) into a diagnostics row. String values are capped;
// the server-side 8 KB CHECK in migration 20261025000012 is the backstop.
const ALLOWED_CONTEXT_KEYS = new Set([
  'key',
  'label',
  'flow',
  'environment',
  'platform',
  'componentStack',
]);

function sanitizeContext(context?: CrashContext): Record<string, unknown> | null {
  if (!context) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 1000) : v;
  }
  return out;
}

let reportsThisSession = 0;

/**
 * Sends a crash or unexpected-error report to the error_reports table.
 * Fire-and-forget by design: diagnostics must never break the app, and a
 * failed insert (offline, table missing) is silently dropped. Reports are
 * rate-limited per session so a crash loop cannot flood the table.
 */
export function reportError(source: string, error: unknown, context?: CrashContext): void {
  if (!supabase) {
    if (__DEV__) {
      console.warn('[CrashReporter] Supabase not configured, skipping remote report');
    }
    return;
  }
  if (reportsThisSession >= MAX_REPORTS_PER_SESSION) {
    return;
  }

  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : null;

  reportsThisSession += 1;

  void supabase
    .from('error_reports')
    .insert({
      // Audit must-fix #1: explicit NULL, never the server-side default.
      // error_reports.user_id used to default to auth.uid(), which linked
      // every signed-in crash report to an account despite the App Store
      // "Crash Data: Not Linked to You" label. The column default is also
      // dropped by migration 20261025000003; this explicit NULL is the
      // belt-and-braces that keeps the label true even if a default returns.
      user_id: null,
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? null,
      message: `${source}: ${detail}`.slice(0, MAX_MESSAGE_LENGTH),
      stack: stack ? stack.slice(0, MAX_STACK_LENGTH) : null,
      context: sanitizeContext(context),
    })
    .then(() => undefined, () => undefined);
}
