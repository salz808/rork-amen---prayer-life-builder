/**
 * Diagnostic startup trap (build 10, temporary).
 *
 * Build 9 crashes ~0.4s after launch with a JavaScript fatal error, but the
 * App Store crash log contains no JavaScript message or stack, so the exact
 * throw cannot be named from the log alone. This handler is installed as the
 * VERY FIRST import in app/_layout.tsx, before every other module evaluates,
 * so it survives even a throw during module load or first render. It shows
 * the error message and stack in an alert on device instead of a silent
 * close, so the next TestFlight install reveals the actual cause.
 *
 * It chains with installErrorGuards (which calls the previous handler), and
 * it must be removed once the launch crash is fixed.
 */
import { Alert } from 'react-native';

const errorUtils = globalThis as unknown as {
  ErrorUtils?: {
    setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  };
};

if (typeof errorUtils.ErrorUtils?.setGlobalHandler === 'function') {
  errorUtils.ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';
    try {
      Alert.alert(
        isFatal ? 'Startup fatal error' : 'Startup error',
        `${message}\n\n${stack.slice(0, 1200)}`
      );
    } catch {
      // If even the alert cannot show, there is nothing else to do here.
    }
  });
}
