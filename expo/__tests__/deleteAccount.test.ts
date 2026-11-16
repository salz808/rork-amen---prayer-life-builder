// P0-5 (2026-11-16): the server only deletes when the last sign-in is
// within 10 minutes (401 otherwise). The client must check freshness
// before the call, and must classify a failed call by the error's
// status — supabase-js throws a FunctionsHttpError whose message is
// the generic "Edge Function returned a non-2xx status code"; the
// server's "last 10 minutes" text is in the response body, never in
// error.message, so the old message.includes check was a dead branch.
import { isRecentLogin, isRecentLoginError, RECENT_LOGIN_WINDOW_MS } from '../lib/deleteAccount';

function httpError(status: number): Error {
  const error = new Error('Edge Function returned a non-2xx status code') as Error & {
    name: string;
    context: { status: number };
  };
  error.name = 'FunctionsHttpError';
  // FunctionsHttpError carries the Response as context.
  error.context = { status };
  return error;
}

describe('isRecentLogin', () => {
  const now = Date.parse('2026-11-16T10:00:00.000Z');

  it('is fresh inside the 10-minute window', () => {
    expect(isRecentLogin('2026-11-16T09:55:00.000Z', now)).toBe(true);
  });

  it('is fresh exactly at the boundary', () => {
    expect(isRecentLogin('2026-11-16T09:50:00.000Z', now)).toBe(true);
  });

  it('is stale one millisecond past the window', () => {
    expect(isRecentLogin('2026-11-16T09:49:59.999Z', now)).toBe(false);
  });

  it('treats a missing or unparseable sign-in time as stale, never fresh', () => {
    expect(isRecentLogin(null, now)).toBe(false);
    expect(isRecentLogin(undefined, now)).toBe(false);
    expect(isRecentLogin('not-a-date', now)).toBe(false);
    expect(isRecentLogin('', now)).toBe(false);
  });

  it('exposes the 10-minute window the server enforces', () => {
    expect(RECENT_LOGIN_WINDOW_MS).toBe(10 * 60 * 1000);
  });
});

describe('isRecentLoginError', () => {
  it('reads a 401 from error.context.status — the FunctionsHttpError shape', () => {
    expect(isRecentLoginError(httpError(401))).toBe(true);
  });

  it('does not treat other statuses as a recent-login error', () => {
    expect(isRecentLoginError(httpError(500))).toBe(false);
    expect(isRecentLoginError(httpError(400))).toBe(false);
    expect(isRecentLoginError(httpError(404))).toBe(false);
  });

  it('falls back to the message when there is no status (plain Error)', () => {
    expect(
      isRecentLoginError(new Error('Please sign in again within the last 10 minutes')),
    ).toBe(true);
    expect(isRecentLoginError(new Error('Unable to delete account right now'))).toBe(false);
  });

  it('does not treat a network failure (no context, generic message) as recent-login', () => {
    expect(isRecentLoginError(new Error('Failed to send a request to the Edge Function'))).toBe(
      false,
    );
    expect(isRecentLoginError(new TypeError('Network request failed'))).toBe(false);
    expect(isRecentLoginError(null)).toBe(false);
    expect(isRecentLoginError(undefined)).toBe(false);
  });

  it('trusts the numeric status over the message when both are present', () => {
    const error = httpError(500) as Error & { message: string };
    error.message = 'Please sign in again within the last 10 minutes';
    expect(isRecentLoginError(error)).toBe(false);
  });
});
