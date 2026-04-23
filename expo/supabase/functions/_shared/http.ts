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
