import { FEATURES } from '../constants/features';

// Audit round 4, lane 5 (G-M4): deep links used to pass ANY '/'-prefixed
// path through unchanged. Only routes the app actually owns are
// reachable now; anything else (including '..' traversal segments and
// unknown first segments) resolves to Home. This is a navigation guard
// only — screens holding another user's data still re-check server-side
// (moderation via RPC, circle join via RPC, wall writes via RLS) — but
// an untrusted link can no longer land the app on an arbitrary route.
// First segments kept in sync with the Stack screens in _layout.tsx
// plus the (tabs) group; add a segment here when a new top-level
// route ships, or its deep links will (safely) land on Home.
const KNOWN_ROUTE_SEGMENTS = new Set([
  '(tabs)',
  'onboarding',
  'auth',
  'tracks',
  'session',
  'paywall',
  'settings',
  'circles',
  'profile',
  'circle',
  'moderation',
  // Pre-launch audit M-4: /report-problem shipped in build 7 without a
  // segment, so amen-app://report-problem resolved to Home. In-app
  // Settings navigation was never affected (file routing), only the
  // deep link. Stack.Screen parity with /moderation landed in the
  // coordinator merge (_layout.tsx, directly after the moderation
  // block).
  'report-problem',
]);

function validateRoute(route: string): string {
  const pathOnly = route.split(/[?#]/)[0];
  if (pathOnly === '/') return route;
  const segments = pathOnly.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return '/';
  if (segments.some((s) => s === '..' || s === '.' || s.includes('\\'))) return '/';
  if (!KNOWN_ROUTE_SEGMENTS.has(segments[0])) return '/';
  return route;
}

// While Circles are hidden for launch (Posture C), invite links and any
// circle route resolve to the Prayer Wall instead of a dead end.
// Round-2 L4: the rewrite carries a ?circles_notice=1 param so the wall
// can tell the user an invite was swallowed, instead of silently
// landing them somewhere they did not ask to go.
function gateCircles(route: string): string {
  if (FEATURES.circles) return route;
  const pathOnly = route.split(/[?#]/)[0];
  if (pathOnly === '/circles' || pathOnly.startsWith('/circle/')) {
    return '/(tabs)/community?circles_notice=1';
  }
  return route;
}

export function redirectSystemPath({
  path,
}: { path: string; initial: boolean }): string {
  if (path.startsWith('/')) {
    return gateCircles(validateRoute(path));
  }

  try {
    const url = new URL(path);
    if (url.protocol === 'amen-app:') {
      const route = `/${url.host}${url.pathname}`.replace(/\/{2,}/g, '/');
      return gateCircles(validateRoute(`${route}${url.search}${url.hash}`));
    }
  } catch {
    // Malformed external intents should never crash app startup.
  }

  return '/';
}
