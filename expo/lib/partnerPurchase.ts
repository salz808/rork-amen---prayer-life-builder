/**
 * Shared Partner purchase + restore orchestration for the three purchase
 * surfaces (paywall, Give, lock sheet). Used through
 * `usePartnerPurchase`; kept as a plain factory (no React) so the flow
 * is testable without a renderer — this repo's Jest setup is Node-only
 * (no @testing-library/react-native, no react-test-renderer, no jsdom).
 *
 * What the client owns, identically on every surface:
 * - the module-level in-flight guard (`lib/purchaseInFlight`): a second
 *   purchase/restore call while one is running is refused, so a
 *   double-tap across surfaces can never fire two store calls;
 * - syncing the granted entitlements into AppProvider state;
 * - the annual-upsell clock: the monthly start marker is set from the
 *   period captured at purchase time (the billing toggle can change
 *   while the Apple sheet is open);
 * - the success haptic on a purchase, and on a restore that finds an
 *   active subscription;
 * - purchase failures go through the shared mapper
 *   (`showPurchaseErrorAlert`), whose Restore action runs this client's
 *   own restore.
 *
 * What stays with each surface: the success UI — the thank-you state,
 * the alerts, and (paywall only) what happens when a purchase succeeds
 * with no entitlement yet. The client reports that case via
 * `hasActiveEntitlement` instead of deciding the words itself.
 */
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { CustomerInfo } from 'react-native-purchases';
import { showPurchaseErrorAlert } from '@/lib/purchaseErrors';
import { endPurchaseOperation, tryBeginPurchaseOperation } from '@/lib/purchaseInFlight';

export interface PartnerPurchasePackage {
  identifier: string;
  product: {
    identifier: string;
    priceString: string;
  };
}

export type PartnerBillingPeriod = 'monthly' | 'annual';

export interface PartnerPurchaseSuccess {
  customerInfo: CustomerInfo;
  pkg: PartnerPurchasePackage;
  period: PartnerBillingPeriod;
  /** False when the store took the payment but no entitlement landed yet. */
  hasActiveEntitlement: boolean;
}

export interface PartnerRestoreResult {
  customerInfo: CustomerInfo;
  hasActiveEntitlement: boolean;
}

/**
 * Minimal Purchases surface the client needs. The SDK itself is lazily
 * required by the hook (same pattern as the surfaces), never imported
 * here, so Expo Go degrades instead of crashing at import time.
 */
export interface PartnerPurchases {
  purchasePackage: (pkg: PartnerPurchasePackage) => Promise<{ customerInfo: CustomerInfo }>;
  restorePurchases: () => Promise<CustomerInfo>;
  getCustomerInfo: () => Promise<CustomerInfo>;
}

export interface PartnerPurchaseClientDeps {
  purchases: PartnerPurchases | null;
  syncSubscription: (entitlements: string[]) => void;
  setSubscribedSinceMonthly: (value: string | null) => void;
  subscribedSinceMonthly: string | null | undefined;
  /** Surface's success UI. Runs after entitlements are synced. */
  onPurchaseSuccess?: (result: PartnerPurchaseSuccess) => void | Promise<void>;
  /** Surface's restore UI. Runs after entitlements are synced. */
  onRestoreSuccess?: (result: PartnerRestoreResult) => void | Promise<void>;
  /** Overrides the shared "Restore failed" alert when a surface has its own copy (Give). */
  onRestoreError?: (error: unknown) => void;
}

export interface PartnerPurchaseClient {
  /**
   * Buy a package. Returns false when another store operation is
   * already in flight (no purchase call was fired); true when this
   * call owned the operation, whether it succeeded or failed.
   */
  purchase: (pkg: PartnerPurchasePackage, period: PartnerBillingPeriod) => Promise<boolean>;
  /** Restore past purchases. Same return contract as `purchase`. */
  restore: () => Promise<boolean>;
  /**
   * Re-read CustomerInfo from RevenueCat and sync it. True when an
   * active entitlement is now present — used when a purchase succeeded
   * with no entitlement yet (a deferred/pending approval can resolve
   * between the purchase call and this read).
   */
  recheckEntitlement: () => Promise<boolean>;
}

function activeEntitlementIds(customerInfo: CustomerInfo): string[] {
  return Object.keys(customerInfo.entitlements.active);
}

/** Shared restore-failure copy (paywall + lock sheet). */
function showDefaultRestoreError(): void {
  Alert.alert(
    'Restore failed',
    "Restore didn't work right now. Check your connection and try again. Your existing purchases are unaffected.",
  );
}

export function createPartnerPurchaseClient(
  deps: PartnerPurchaseClientDeps,
): PartnerPurchaseClient {
  function recordPurchasePeriod(period: PartnerBillingPeriod): void {
    // Billing period captured at purchase time: the annual upsell clock
    // runs off the monthly start.
    if (period === 'monthly') {
      if (!deps.subscribedSinceMonthly) {
        deps.setSubscribedSinceMonthly(new Date().toISOString());
      }
    } else {
      deps.setSubscribedSinceMonthly(null);
    }
  }

  async function purchase(
    pkg: PartnerPurchasePackage,
    period: PartnerBillingPeriod,
  ): Promise<boolean> {
    if (!tryBeginPurchaseOperation()) {
      return false;
    }
    try {
      if (!deps.purchases) {
        throw new Error('Purchases not available');
      }
      const { customerInfo } = await deps.purchases.purchasePackage(pkg);
      const active = activeEntitlementIds(customerInfo);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      deps.syncSubscription(active);
      recordPurchasePeriod(period);
      await deps.onPurchaseSuccess?.({
        customerInfo,
        pkg,
        period,
        hasActiveEntitlement: active.length > 0,
      });
      return true;
    } catch (error) {
      showPurchaseErrorAlert(error, () => {
        void restore();
      });
      return true;
    } finally {
      endPurchaseOperation();
    }
  }

  async function restore(): Promise<boolean> {
    if (!tryBeginPurchaseOperation()) {
      return false;
    }
    try {
      if (!deps.purchases) {
        throw new Error('Purchases not available');
      }
      const customerInfo = await deps.purchases.restorePurchases();
      const active = activeEntitlementIds(customerInfo);
      if (active.length > 0) {
        deps.syncSubscription(active);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await deps.onRestoreSuccess?.({
        customerInfo,
        hasActiveEntitlement: active.length > 0,
      });
      return true;
    } catch (error) {
      if (deps.onRestoreError) {
        deps.onRestoreError(error);
      } else {
        showDefaultRestoreError();
      }
      return true;
    } finally {
      endPurchaseOperation();
    }
  }

  async function recheckEntitlement(): Promise<boolean> {
    if (!deps.purchases) {
      return false;
    }
    try {
      const customerInfo = await deps.purchases.getCustomerInfo();
      const active = activeEntitlementIds(customerInfo);
      if (active.length > 0) {
        deps.syncSubscription(active);
      }
      return active.length > 0;
    } catch {
      return false;
    }
  }

  return { purchase, restore, recheckEntitlement };
}
