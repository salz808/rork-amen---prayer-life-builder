import { corsHeaders } from './cors.ts';

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

export function errorResponse(message: string, status = 400, details?: unknown): Response {
  return json(
    {
      error: message,
      details: details ?? null,
    },
    { status }
  );
}
