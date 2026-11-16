/**
 * Module-level in-flight guard for store operations (purchase + restore).
 *
 * The three purchase surfaces (paywall, Give, lock sheet) each used to
 * track their own `isPending`, so a double-tap across two surfaces —
 * or a tap on one surface while another surface's sheet was already
 * buying — could fire two `purchasePackage` calls. RevenueCat rejects
 * the second with OPERATION_ALREADY_IN_PROGRESS_ERROR, but only after
 * the store sheet may already be open twice, and the first transaction
 * may still complete and charge.
 *
 * One guard, shared by every surface through `usePartnerPurchase`:
 * the first call claims it, any concurrent call is refused, and the
 * guard is released when the operation settles (success or failure).
 * Surfaces read it reactively via `usePurchaseOperationInFlight` so
 * every CTA disables while any surface is buying.
 */
import { useSyncExternalStore } from 'react';

let purchaseOperationInFlight = false;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

/** Whether any purchase or restore operation is currently running. */
export function isPurchaseOperationInFlight(): boolean {
  return purchaseOperationInFlight;
}

/**
 * Claim the guard for one store operation. Returns false when another
 * store operation is already running — the caller must not fire a
 * second purchase/restore call in that case.
 */
export function tryBeginPurchaseOperation(): boolean {
  if (purchaseOperationInFlight) {
    return false;
  }
  purchaseOperationInFlight = true;
  notifyListeners();
  return true;
}

/** Release the guard. Safe to call when it is not held. */
export function endPurchaseOperation(): void {
  if (!purchaseOperationInFlight) {
    return;
  }
  purchaseOperationInFlight = false;
  notifyListeners();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reactive read of the guard for components (disables CTAs app-wide). */
export function usePurchaseOperationInFlight(): boolean {
  return useSyncExternalStore(subscribe, isPurchaseOperationInFlight);
}
