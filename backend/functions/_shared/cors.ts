const DEFAULT_ALLOWED_ORIGINS = [
  'https://iammadewhole.com',
  'https://www.iammadewhole.com',
];

// Localhost origins are dev-only: production edge functions must never
// trust a browser origin running on the developer's own machine.
const DEV_ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
];

function getAllowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  const parsed = configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const devOrigins = Deno.env.get('ALLOW_LOCALHOST_ORIGINS') === 'true' ? DEV_ALLOWED_ORIGINS : [];
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...devOrigins, ...parsed]));
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
    // Audit round 4, fix lane 3 (D-L-7): x-revenuecat-signature REMOVED.
    // RevenueCat webhooks carry no HMAC signature and no function ever
    // verified one — advertising the header implied a check that did not
    // exist. The webhook's sole auth factor is the shared-secret Bearer
    // check in revenuecat-webhook/index.ts.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
