export function redirectSystemPath({
  path,
}: { path: string; initial: boolean }): string {
  if (path.startsWith('/')) {
    return path;
  }

  try {
    const url = new URL(path);
    if (url.protocol === 'amen-app:') {
      const route = `/${url.host}${url.pathname}`.replace(/\/{2,}/g, '/');
      return `${route}${url.search}${url.hash}`;
    }
  } catch {
    // Malformed external intents should never crash app startup.
  }

  return '/';
}