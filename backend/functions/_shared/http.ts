import { getCorsHeaders } from './cors.ts';

const encoder = new TextEncoder();

export function json(request: Request, data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request),
      ...(init?.headers ?? {}),
    },
  });
}

export function errorResponse(request: Request, message: string, status = 400, details?: unknown): Response {
  const safeDetails = status >= 500 ? null : (details ?? null);

  return json(
    request,
    {
      error: message,
      details: safeDetails,
    },
    { status }
  );
}

export async function safeCompare(input: string, expected: string): Promise<boolean> {
  const inputBytes = encoder.encode(input);
  const expectedBytes = encoder.encode(expected);

  const [inputDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', inputBytes),
    crypto.subtle.digest('SHA-256', expectedBytes),
  ]);

  const inputHash = Array.from(new Uint8Array(inputDigest));
  const expectedHash = Array.from(new Uint8Array(expectedDigest));

  if (inputHash.length !== expectedHash.length) {
    return false;
  }

  let mismatch = inputBytes.length === expectedBytes.length ? 0 : 1;

  for (let index = 0; index < inputHash.length; index += 1) {
    mismatch |= inputHash[index] ^ expectedHash[index];
  }

  return mismatch === 0;
}

/**
 * Audit round 4, fix lane 3 (E-L8, E-L9, D-L-7): read a JSON body with a
 * byte cap enforced BEFORE parsing, so a huge body is rejected without
 * being parsed. Throws Error('Request body too large') (caller maps to
 * 413) or Error('Malformed JSON') (caller maps to 400, never 500 — a body
 * that can never parse must not invite futile retries). The Content-
 * Length header is checked first (no body read at all); the byte-length
 * check after reading covers missing or lying headers.
 */
export async function readCappedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new Error('Request body too large');
    }
  }
  const text = await request.text();
  if (encoder.encode(text).length > maxBytes) {
    throw new Error('Request body too large');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Malformed JSON');
  }
}

/**
 * Audit round 4, fix lane 3 (E-L3): classify auth failures by message
 * pattern, not exact-string equality. The old check matched only
 * 'Missing bearer token' / 'Unauthorized', so an expired JWT surfaced as
 * a generic 500 instead of a 401 re-login signal. Any requireUser throw
 * whose message names an auth failure is a 401; anything else (e.g. a
 * missing env var) stays a 500.
 */
export function isAuthErrorMessage(message: string): boolean {
  return /missing bearer|unauthorized|jwt|expired|invalid token|invalid login|not authenticated/i.test(message);
}
