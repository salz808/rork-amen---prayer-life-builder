/**
 * In-app bug report form (build 7, migration 00016).
 *
 * Privacy boundary, enforced here and in the form: a report carries a
 * user-written description plus version/device/OS diagnostics and
 * nothing else. Never prayer text, journal content, message content,
 * or wall post content — the form has no field for any of it, and
 * these helpers accept no user-content input of any kind.
 *
 * Deliberately dependency-free: this repo's jest setup cannot load
 * react-native (ESM transform), so the live Constants/Platform reader
 * lives in database.ts and this module stays pure and unit-testable.
 */

export const MAX_BUG_REPORT_DESCRIPTION_LENGTH = 2000;

export type BugReportDescriptionValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Mirrors the migration 00016 CHECKs: non-blank, max 2000 chars. */
export function validateBugReportDescription(description: string): BugReportDescriptionValidation {
  const value = description.trim();
  if (!value) {
    return { ok: false, error: 'Please describe what happened.' };
  }
  if (value.length > MAX_BUG_REPORT_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `Please keep it under ${MAX_BUG_REPORT_DESCRIPTION_LENGTH} characters.`,
    };
  }
  return { ok: true, value };
}

export interface BugReportDiagnostics {
  appVersion: string | null;
  buildNumber: string | null;
  platform: string;
  osVersion: string | null;
}

export interface BugReportDiagnosticsSource {
  appVersion?: string | null;
  buildNumber?: string | null;
  platform: string;
  osVersion?: string | null;
}

/** Pure shape builder — the unit-testable part of the diagnostics. */
export function buildBugReportDiagnostics(source: BugReportDiagnosticsSource): BugReportDiagnostics {
  return {
    appVersion: source.appVersion ?? null,
    buildNumber: source.buildNumber ?? null,
    platform: source.platform,
    osVersion: source.osVersion ?? null,
  };
}
