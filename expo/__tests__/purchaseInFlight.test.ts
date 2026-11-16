/**
 * Module-level in-flight guard for store operations (lib/purchaseInFlight).
 *
 * One guard is shared by all three purchase surfaces through
 * `usePartnerPurchase`, so a double-tap across surfaces cannot fire two
 * purchase calls. These tests pin the guard's contract: first claim
 * wins, concurrent claims are refused, release re-opens it, and a
 * double release is safe.
 */
import {
  endPurchaseOperation,
  isPurchaseOperationInFlight,
  tryBeginPurchaseOperation,
} from '../lib/purchaseInFlight';

describe('purchaseInFlight guard', () => {
  afterEach(() => {
    // Every test must leave the guard released — a leaked claim would
    // block purchases for every surface in the same module registry.
    endPurchaseOperation();
    expect(isPurchaseOperationInFlight()).toBe(false);
  });

  it('starts released', () => {
    expect(isPurchaseOperationInFlight()).toBe(false);
  });

  it('first claim wins and marks the guard held', () => {
    expect(tryBeginPurchaseOperation()).toBe(true);
    expect(isPurchaseOperationInFlight()).toBe(true);
  });

  it('a concurrent claim is refused while held', () => {
    expect(tryBeginPurchaseOperation()).toBe(true);
    expect(tryBeginPurchaseOperation()).toBe(false);
    expect(tryBeginPurchaseOperation()).toBe(false);
    expect(isPurchaseOperationInFlight()).toBe(true);
  });

  it('release re-opens the guard for the next operation', () => {
    expect(tryBeginPurchaseOperation()).toBe(true);
    endPurchaseOperation();
    expect(isPurchaseOperationInFlight()).toBe(false);
    expect(tryBeginPurchaseOperation()).toBe(true);
  });

  it('a double release is safe and leaves the guard released', () => {
    expect(tryBeginPurchaseOperation()).toBe(true);
    endPurchaseOperation();
    endPurchaseOperation();
    expect(isPurchaseOperationInFlight()).toBe(false);
    expect(tryBeginPurchaseOperation()).toBe(true);
  });
});
