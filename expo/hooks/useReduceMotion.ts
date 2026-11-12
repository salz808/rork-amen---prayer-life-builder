import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Shared Reduced Motion hook (F52, Phase 2b): moved here from the Prayer
// Wall, which kept its own local copy. All living motion is gated on it —
// with Reduce Motion on, everything renders still. Listens for live
// changes, so toggling the OS setting updates without a restart.
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}
