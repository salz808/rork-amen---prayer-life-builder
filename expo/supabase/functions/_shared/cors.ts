const DEFAULT_ALLOWED_ORIGINS = [
  'https://iammadewhole.com',
  'https://www.iammadewhole.com',
  'http://localhost:8081',
  'http://localhost:19006',
];

function getAllowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  const parsed = configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...parsed]));
}

function resolveAllowedOrigin(request: Request): string {
  const origin = request.headers.get('origin') ?? '';
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  return allowedOrigins[0] ?? 'https://iammadewhole.com';
}

export function getCorsHeaders(request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(request),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-revenuecat-signature',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function handleCors(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request) });
  }

  return null;
}
