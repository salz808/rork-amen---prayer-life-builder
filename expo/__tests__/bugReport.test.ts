import {
  MAX_BUG_REPORT_DESCRIPTION_LENGTH,
  buildBugReportDiagnostics,
  validateBugReportDescription,
} from '@/lib/bugReport';

describe('validateBugReportDescription', () => {
  it('rejects empty and whitespace-only descriptions', () => {
    expect(validateBugReportDescription('')).toEqual({
      ok: false,
      error: 'Please describe what happened.',
    });
    expect(validateBugReportDescription('   \n  ')).toEqual({
      ok: false,
      error: 'Please describe what happened.',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(validateBugReportDescription('  App crashed on open  ')).toEqual({
      ok: true,
      value: 'App crashed on open',
    });
  });

  it('accepts exactly the 2000-char limit and rejects one char over', () => {
    expect(validateBugReportDescription('x'.repeat(2000))).toEqual({
      ok: true,
      value: 'x'.repeat(2000),
    });
    expect(validateBugReportDescription('x'.repeat(2001)).ok).toBe(false);
    expect(MAX_BUG_REPORT_DESCRIPTION_LENGTH).toBe(2000);
  });
});

describe('bug report diagnostics payload', () => {
  it('builds the exact shape the bug_reports insert expects', () => {
    expect(
      buildBugReportDiagnostics({
        appVersion: '1.0.0',
        buildNumber: '7',
        platform: 'ios',
        osVersion: '26.1',
      }),
    ).toEqual({
      appVersion: '1.0.0',
      buildNumber: '7',
      platform: 'ios',
      osVersion: '26.1',
    });
  });

  it('defaults missing diagnostics to null, never undefined', () => {
    expect(buildBugReportDiagnostics({ platform: 'android' })).toEqual({
      appVersion: null,
      buildNumber: null,
      platform: 'android',
      osVersion: null,
    });
  });

  // No live-device test here by design: this repo's jest setup cannot
  // load react-native, so the Constants/Platform reader lives in
  // database.ts (typechecked by tsc) while this module stays pure.
});
