import { FEATURES } from '../constants/features';

// While Circles are hidden for launch (Posture C), invite links and any
// circle route resolve to the Prayer Wall instead of a dead end.
function gateCircles(route: string): string {
  if (FEATURES.circles) return route;
  const pathOnly = route.split(/[?#]/)[0];
  if (pathOnly === '/circles' || pathOnly.startsWith('/circle/')) {
    return '/(tabs)/community';
  }
  return route;
}

export function redirectSystemPath({
  path,
}: { path: string; initial: boolean }): string {
  if (path.startsWith('/')) {
    return gateCircles(path);
  }

  try {
    const url = new URL(path);
    if (url.protocol === 'amen-app:') {
      const route = `/${url.host}${url.pathname}`.replace(/\/{2,}/g, '/');
      return gateCircles(`${route}${url.search}${url.hash}`);
    }
  } catch {
    // Malformed external intents should never crash app startup.
  }

  return '/';
}
