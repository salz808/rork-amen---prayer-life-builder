import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

type CrashContext = Record<string, unknown>;

const MAX_REPORTS_PER_SESSION = 10;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 6000;

let reportsThisSession = 0;

/**
 * Sends a crash or unexpected-error report to the error_reports table.
 * Fire-and-forget by design: diagnostics must never break the app, and a
 * failed insert (offline, table missing) is silently dropped. Reports are
 * rate-limited per session so a crash loop cannot flood the table.
 */
export function reportError(source: string, error: unknown, context?: CrashContext): void {
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
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? null,
      message: `${source}: ${detail}`.slice(0, MAX_MESSAGE_LENGTH),
      stack: stack ? stack.slice(0, MAX_STACK_LENGTH) : null,
      context: context ?? null,
    })
    .then(() => undefined, () => undefined);
}
