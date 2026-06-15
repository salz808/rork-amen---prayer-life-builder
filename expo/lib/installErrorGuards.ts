import { Platform } from 'react-native';

/**
 * Installs global guards that prevent benign, unhandled async errors (offline
 * network failures, aborted fetches, Supabase auth retry errors) from bubbling
 * up to the runtime as fatal/unserializable errors.
 *
 * The web path uses `unhandledrejection`; the native path enables the same
 * promise rejection tracking React Native itself uses, since the web event
 * listener never fires inside the iOS/Android runtime.
 */
let installed = false;

function reasonToString(reason: unknown): string {
  if (typeof reason === 'string') {
    return reason;
  }

  if (reason && typeof reason === 'object') {
    const candidate = reason as { message?: unknown; name?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.name, candidate.code].filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    );
    return parts.join(' ');
  }

  return '';
}

/**
 * Network / offline / transient rejections we never want to surface as a crash.
 * An empty reason (`{}` / null) is also treated as benign since it is never
 * actionable and is the signature of the spurious "Runtime error" overlay.
 */
function isBenignRejection(reason: unknown): boolean {
  if (reason === null || reason === undefined) {
    return true;
  }

  const message = reasonToString(reason).toLowerCase();

  if (message.length === 0) {
    return true;
  }

  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('abort') ||
    message.includes('offline') ||
    message.includes('authretryablefetcherror') ||
    message.includes('timeout')
  );
}

export function installErrorGuards(): void {
  if (installed) {
    return;
  }
  installed = true;

  const globalScope = globalThis as unknown as {
    addEventListener?: (type: string, listener: (event: any) => void) => void;
  };

  if (typeof globalScope.addEventListener === 'function') {
    globalScope.addEventListener('unhandledrejection', (event: any) => {
      if (isBenignRejection(event?.reason)) {
        if (typeof event?.preventDefault === 'function') {
          event.preventDefault();
        }
      }
    });
  }

  if (Platform.OS !== 'web') {
    try {
      // Same module React Native uses internally to wire promise rejection
      // tracking. Enabling it here lets us swallow benign async failures that
      // would otherwise surface as a fatal, unserializable runtime error.
      const tracking = require('promise/setimmediate/rejection-tracking');
      tracking.enable({
        allRejections: true,
        onUnhandled: (_id: number, error: unknown) => {
          if (isBenignRejection(error)) {
            return;
          }
          if (__DEV__) {
            console.warn('[ErrorGuards] Unhandled promise rejection:', error);
          }
        },
        onHandled: () => undefined,
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('[ErrorGuards] Failed to enable native rejection tracking:', error);
      }
    }
  }
}
