import { getCorsHeaders } from './cors.ts';

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
  return json(
    request,
    {
      error: message,
      details: details ?? null,
    },
    { status }
  );
}
