/**
 * One shared Partner purchase hook for the three purchase surfaces
 * (paywall, Give, lock sheet). Thin React wrapper over
 * `createPartnerPurchaseClient` (`lib/partnerPurchase`): it wires the
 * lazily-required Purchases SDK and AppProvider state into the client,
 * and exposes the module-level in-flight guard as `isBusy` so every
 * surface's CTAs disable while any surface is buying or restoring.
 *
 * The client owns the flow — guard, entitlement sync, monthly-start
 * marker, haptics, purchase-error alerts. Each surface keeps only its
 * success UI via the `onPurchaseSuccess` / `onRestoreSuccess` /
 * `onRestoreError` callbacks (thank-you state, alerts, the paywall's
 * no-entitlement re-check).
 */
import { usePurchaseOperationInFlight } from '@/lib/purchaseInFlight';
import {
  createPartnerPurchaseClient,
  type PartnerBillingPeriod,
  type PartnerPurchaseClient,
  type PartnerPurchasePackage,
  type PartnerPurchaseSuccess,
  type PartnerRestoreResult,
} from '@/lib/partnerPurchase';
import { useApp } from '@/providers/AppProvider';

const getPurchases = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- react-native-purchases is lazily required so Expo Go (no native module) degrades to null instead of crashing at import time.
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
};

export interface UsePartnerPurchaseOptions {
  onPurchaseSuccess?: (result: PartnerPurchaseSuccess) => void | Promise<void>;
  onRestoreSuccess?: (result: PartnerRestoreResult) => void | Promise<void>;
  onRestoreError?: (error: unknown) => void;
}

export type {
  PartnerBillingPeriod,
  PartnerPurchasePackage,
  PartnerPurchaseSuccess,
  PartnerRestoreResult,
};

export function usePartnerPurchase(
  options: UsePartnerPurchaseOptions = {},
): PartnerPurchaseClient & { isBusy: boolean } {
  const { state, syncSubscription, setSubscribedSinceMonthly } = useApp();
  const inFlight = usePurchaseOperationInFlight();

  // The client is rebuilt every render so its callbacks and the monthly
  // start marker always see the latest state — it holds no state of its
  // own; the in-flight guard is module-level.
  const client = createPartnerPurchaseClient({
    purchases: getPurchases(),
    syncSubscription,
    setSubscribedSinceMonthly,
    subscribedSinceMonthly: state.subscribedSinceMonthly,
    onPurchaseSuccess: options.onPurchaseSuccess,
    onRestoreSuccess: options.onRestoreSuccess,
    onRestoreError: options.onRestoreError,
  });

  return { ...client, isBusy: inFlight };
}
