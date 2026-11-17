/**
 * Shared Partner purchase client (lib/partnerPurchase), used by
 * `usePartnerPurchase` on all four purchase surfaces (paywall, Give,
 * lock sheet, Settings restore).
 *
 * The client is a plain factory (no React) so it is testable in this
 * repo's Node-only Jest setup. These tests pin its contract:
 * - a second purchase/restore while one is in flight is refused and
 *   fires no second SDK call;
 * - the guard is released after success AND after failure;
 * - success syncs entitlements, sets/clears the monthly-start marker
 *   from the period captured at purchase time, and reports
 *   `hasActiveEntitlement` to the surface instead of deciding the
 *   thank-you wording itself;
 * - purchase failures go through the shared error mapper, whose
 *   Restore action runs the client's own restore;
 * - restore with an active subscription syncs it; without one it
 *   reports `hasActiveEntitlement: false` and syncs nothing;
 * - recheckEntitlement re-reads CustomerInfo and reports whether an
 *   active entitlement is now present.
 */
import { Alert } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import {
  createPartnerPurchaseClient,
  type PartnerPurchaseClientDeps,
  type PartnerPurchases,
} from '../lib/partnerPurchase';
import { PURCHASE_ERROR_CODE } from '../lib/purchaseErrors';
import { isPurchaseOperationInFlight, endPurchaseOperation, tryBeginPurchaseOperation } from '../lib/purchaseInFlight';

// The client reads the SDK error shape through the PurchasesError type
// only (erased at runtime), so the only react-native surface it needs
// is Alert — stub it like the other tests do.
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

// The client plays the success haptic; stub expo-haptics so the real
// (native) module never loads in Node Jest.
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

const alertMock = Alert.alert as jest.Mock;

const MONTHLY_PKG = {
  identifier: 'triad_missions_monthly',
  product: { identifier: 'triad_missions_monthly', priceString: '$4.99' },
};

function customerInfo(activeIds: string[]): CustomerInfo {
  const active: Record<string, unknown> = {};
  for (const id of activeIds) {
    active[id] = { identifier: id };
  }
  return { entitlements: { active } } as unknown as CustomerInfo;
}

function sdkError(code: string) {
  return {
    code,
    message: `sdk error ${code}`,
    readableErrorCode: code,
    userInfo: { readableErrorCode: code },
    underlyingErrorMessage: '',
    userCancelled: false,
  };
}

describe('partnerPurchase client', () => {
  let purchases: jest.Mocked<PartnerPurchases>;
  let syncSubscription: jest.Mock;
  let setSubscribedSinceMonthly: jest.Mock;
  let onPurchaseSuccess: jest.Mock;
  let onRestoreSuccess: jest.Mock;
  let onRestoreError: jest.Mock;

  function makeClient(
    overrides: Partial<PartnerPurchaseClientDeps> = {},
  ) {
    return createPartnerPurchaseClient({
      purchases,
      syncSubscription,
      setSubscribedSinceMonthly,
      subscribedSinceMonthly: null,
      onPurchaseSuccess,
      onRestoreSuccess,
      onRestoreError,
      ...overrides,
    });
  }

  beforeEach(() => {
    alertMock.mockClear();
    purchases = {
      purchasePackage: jest.fn(),
      restorePurchases: jest.fn(),
      getCustomerInfo: jest.fn(),
    };
    syncSubscription = jest.fn();
    setSubscribedSinceMonthly = jest.fn();
    onPurchaseSuccess = jest.fn();
    onRestoreSuccess = jest.fn();
    onRestoreError = jest.fn();
    // A leaked guard from a previous test would block every purchase
    // here; fail loudly instead of letting it mask a real failure.
    endPurchaseOperation();
  });

  afterEach(() => {
    expect(isPurchaseOperationInFlight()).toBe(false);
  });

  describe('purchase', () => {
    it('success with an entitlement syncs it and reports hasActiveEntitlement', async () => {
      purchases.purchasePackage.mockResolvedValue({
        customerInfo: customerInfo(['partner']),
      });
      const client = makeClient();

      const attempted = await client.purchase(MONTHLY_PKG, 'monthly');

      expect(attempted).toBe(true);
      expect(purchases.purchasePackage).toHaveBeenCalledTimes(1);
      expect(purchases.purchasePackage).toHaveBeenCalledWith(MONTHLY_PKG);
      expect(syncSubscription).toHaveBeenCalledWith(['partner']);
      expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);
      expect(onPurchaseSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          pkg: MONTHLY_PKG,
          period: 'monthly',
          hasActiveEntitlement: true,
        }),
      );
      expect(alertMock).not.toHaveBeenCalled();
    });

    it('monthly purchase sets the monthly-start marker when none is set', async () => {
      purchases.purchasePackage.mockResolvedValue({
        customerInfo: customerInfo(['partner']),
      });
      const client = makeClient();

      await client.purchase(MONTHLY_PKG, 'monthly');

      expect(setSubscribedSinceMonthly).toHaveBeenCalledTimes(1);
      const marker = setSubscribedSinceMonthly.mock.calls[0][0] as string;
      expect(typeof marker).toBe('string');
      expect(Number.isNaN(Date.parse(marker))).toBe(false);
    });

    it('monthly purchase keeps an existing monthly-start marker', async () => {
      purchases.purchasePackage.mockResolvedValue({
        customerInfo: customerInfo(['partner']),
      });
      const client = makeClient({ subscribedSinceMonthly: '2026-01-01T00:00:00.000Z' });

      await client.purchase(MONTHLY_PKG, 'monthly');

      expect(setSubscribedSinceMonthly).not.toHaveBeenCalled();
    });

    it('annual purchase clears the monthly-start marker', async () => {
      purchases.purchasePackage.mockResolvedValue({
        customerInfo: customerInfo(['partner']),
      });
      const client = makeClient({ subscribedSinceMonthly: '2026-01-01T00:00:00.000Z' });

      await client.purchase(MONTHLY_PKG, 'annual');

      expect(setSubscribedSinceMonthly).toHaveBeenCalledTimes(1);
      expect(setSubscribedSinceMonthly).toHaveBeenCalledWith(null);
    });

    it('success with NO entitlement still reports it and syncs an empty list', async () => {
      purchases.purchasePackage.mockResolvedValue({
        customerInfo: customerInfo([]),
      });
      const client = makeClient();

      await client.purchase(MONTHLY_PKG, 'monthly');

      expect(syncSubscription).toHaveBeenCalledWith([]);
      expect(onPurchaseSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ hasActiveEntitlement: false }),
      );
      // The client never shows a thank-you itself — the surface decides
      // the words from hasActiveEntitlement (paywall re-checks first).
      expect(alertMock).not.toHaveBeenCalled();
    });

    it('a second purchase while one is in flight is refused and fires no SDK call', async () => {
      let resolvePurchase!: (value: { customerInfo: CustomerInfo }) => void;
      purchases.purchasePackage.mockImplementation(
        () =>
          new Promise<{ customerInfo: CustomerInfo }>((resolve) => {
            resolvePurchase = resolve;
          }),
      );
      const client = makeClient();

      const first = client.purchase(MONTHLY_PKG, 'monthly');
      const second = await client.purchase(MONTHLY_PKG, 'monthly');

      expect(second).toBe(false);
      expect(purchases.purchasePackage).toHaveBeenCalledTimes(1);
      expect(onPurchaseSuccess).not.toHaveBeenCalled();

      resolvePurchase({ customerInfo: customerInfo(['partner']) });
      await expect(first).resolves.toBe(true);
      expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);
    });

    it('the guard is released after a failure, so the next purchase can proceed', async () => {
      purchases.purchasePackage
        .mockRejectedValueOnce(sdkError(PURCHASE_ERROR_CODE.NETWORK_ERROR))
        .mockResolvedValueOnce({ customerInfo: customerInfo(['partner']) });
      const client = makeClient();

      await client.purchase(MONTHLY_PKG, 'monthly');
      const attempted = await client.purchase(MONTHLY_PKG, 'monthly');

      expect(attempted).toBe(true);
      expect(purchases.purchasePackage).toHaveBeenCalledTimes(2);
    });

    it('a purchase failure shows the shared mapper alert with a Restore action', async () => {
      purchases.purchasePackage.mockRejectedValue(
        sdkError(PURCHASE_ERROR_CODE.NETWORK_ERROR),
      );
      purchases.restorePurchases.mockResolvedValue(customerInfo([]));
      const client = makeClient();

      await client.purchase(MONTHLY_PKG, 'monthly');

      expect(alertMock).toHaveBeenCalledTimes(1);
      const [title, body, buttons] = alertMock.mock.calls[0] as [
        string,
        string,
        { text: string; onPress?: () => void }[],
      ];
      expect(title).toMatch(/couldn't confirm your purchase/i);
      expect(body).not.toContain('No charge was made');
      expect(buttons.map((b) => b.text)).toEqual(['Restore purchases', 'OK']);
      expect(onPurchaseSuccess).not.toHaveBeenCalled();

      // The Restore action runs the client's own restore.
      buttons[0]?.onPress?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(purchases.restorePurchases).toHaveBeenCalledTimes(1);
      expect(onRestoreSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ hasActiveEntitlement: false }),
      );
    });

    it('cancellation shows no alert', async () => {
      purchases.purchasePackage.mockRejectedValue(
        sdkError(PURCHASE_ERROR_CODE.PURCHASE_CANCELLED_ERROR),
      );
      const client = makeClient();

      await client.purchase(MONTHLY_PKG, 'monthly');

      expect(alertMock).not.toHaveBeenCalled();
      expect(onPurchaseSuccess).not.toHaveBeenCalled();
    });

    it('no Purchases SDK shows the neutral unknown alert, not a crash', async () => {
      const client = makeClient({ purchases: null });

      const attempted = await client.purchase(MONTHLY_PKG, 'monthly');

      expect(attempted).toBe(true);
      expect(alertMock).toHaveBeenCalledTimes(1);
      expect(alertMock.mock.calls[0][1]).not.toContain('No charge was made');
    });
  });

  describe('restore', () => {
    it('restore with an active subscription syncs it and reports hasActiveEntitlement', async () => {
      purchases.restorePurchases.mockResolvedValue(customerInfo(['partner']));
      const client = makeClient();

      const attempted = await client.restore();

      expect(attempted).toBe(true);
      expect(purchases.restorePurchases).toHaveBeenCalledTimes(1);
      expect(syncSubscription).toHaveBeenCalledWith(['partner']);
      expect(onRestoreSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ hasActiveEntitlement: true }),
      );
      expect(alertMock).not.toHaveBeenCalled();
    });

    it('restore with nothing to restore reports false and syncs nothing', async () => {
      purchases.restorePurchases.mockResolvedValue(customerInfo([]));
      const client = makeClient();

      await client.restore();

      expect(syncSubscription).not.toHaveBeenCalled();
      expect(onRestoreSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ hasActiveEntitlement: false }),
      );
      expect(alertMock).not.toHaveBeenCalled();
    });

    it('a restore while a purchase is in flight is refused', async () => {
      let resolvePurchase!: (value: { customerInfo: CustomerInfo }) => void;
      purchases.purchasePackage.mockImplementation(
        () =>
          new Promise<{ customerInfo: CustomerInfo }>((resolve) => {
            resolvePurchase = resolve;
          }),
      );
      const client = makeClient();

      const first = client.purchase(MONTHLY_PKG, 'monthly');
      const restoreAttempted = await client.restore();

      expect(restoreAttempted).toBe(false);
      expect(purchases.restorePurchases).not.toHaveBeenCalled();

      resolvePurchase({ customerInfo: customerInfo(['partner']) });
      await first;
    });

    it('Settings restore: a restore while ANOTHER surface holds the guard is refused with no SDK call', async () => {
      // SettingsSheet routes its restore through this client's
      // restore(), so the seam test holds the guard directly — as
      // the paywall's purchase would — instead of via this client.
      // The handler is a component closure (Node-only Jest, no
      // renderer), so the refusal contract is pinned here: restore()
      // returns false and fires no restorePurchases call, and the
      // Settings handler turns that false into its in-progress alert.
      purchases.restorePurchases.mockResolvedValue(customerInfo(['partner']));
      const client = makeClient();

      expect(tryBeginPurchaseOperation()).toBe(true);
      const restoreAttempted = await client.restore();
      expect(restoreAttempted).toBe(false);
      expect(purchases.restorePurchases).not.toHaveBeenCalled();
      expect(onRestoreSuccess).not.toHaveBeenCalled();
      expect(syncSubscription).not.toHaveBeenCalled();
      expect(alertMock).not.toHaveBeenCalled();

      endPurchaseOperation();
      // Guard released: the same restore now proceeds.
      await expect(client.restore()).resolves.toBe(true);
      expect(purchases.restorePurchases).toHaveBeenCalledTimes(1);
    });

    it('restore with no Purchases SDK shows the shared restore-failure alert, not a crash', async () => {
      // Same as the purchase no-SDK case: the surface gets the
      // default alert (Settings wires no onRestoreError override).
      const client = makeClient({ purchases: null, onRestoreError: undefined });

      const attempted = await client.restore();

      expect(attempted).toBe(true);
      expect(alertMock).toHaveBeenCalledTimes(1);
      expect(alertMock.mock.calls[0][0]).toBe('Restore failed');
      expect(alertMock.mock.calls[0][1]).toMatch(/unaffected/i);
      expect(onRestoreSuccess).not.toHaveBeenCalled();
    });

    it('a restore failure shows the shared restore-failure alert by default', async () => {
      purchases.restorePurchases.mockRejectedValue(new Error('offline'));
      const client = makeClient({ onRestoreError: undefined });

      await client.restore();

      expect(alertMock).toHaveBeenCalledTimes(1);
      expect(alertMock.mock.calls[0][0]).toBe('Restore failed');
      expect(alertMock.mock.calls[0][1]).toMatch(/unaffected/i);
      expect(onRestoreSuccess).not.toHaveBeenCalled();
    });

    it('a surface-provided onRestoreError replaces the default alert', async () => {
      purchases.restorePurchases.mockRejectedValue(new Error('offline'));
      const client = makeClient();

      await client.restore();

      expect(onRestoreError).toHaveBeenCalledTimes(1);
      expect(alertMock).not.toHaveBeenCalled();
    });
  });

  describe('recheckEntitlement', () => {
    it('returns true and syncs when an entitlement is now present', async () => {
      purchases.getCustomerInfo.mockResolvedValue(customerInfo(['partner']));
      const client = makeClient();

      await expect(client.recheckEntitlement()).resolves.toBe(true);
      expect(syncSubscription).toHaveBeenCalledWith(['partner']);
    });

    it('returns false and syncs nothing when still no entitlement', async () => {
      purchases.getCustomerInfo.mockResolvedValue(customerInfo([]));
      const client = makeClient();

      await expect(client.recheckEntitlement()).resolves.toBe(false);
      expect(syncSubscription).not.toHaveBeenCalled();
    });

    it('returns false when the re-check itself fails', async () => {
      purchases.getCustomerInfo.mockRejectedValue(new Error('offline'));
      const client = makeClient();

      await expect(client.recheckEntitlement()).resolves.toBe(false);
      expect(alertMock).not.toHaveBeenCalled();
    });

    it('returns false with no Purchases SDK', async () => {
      const client = makeClient({ purchases: null });

      await expect(client.recheckEntitlement()).resolves.toBe(false);
    });
  });
});
