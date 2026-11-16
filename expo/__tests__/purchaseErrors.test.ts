/**
 * Purchase-error handling: classification, wording, and alert wiring.
 *
 * The mapper in lib/purchaseErrors.ts classifies by the RevenueCat SDK
 * error code. These tests pin the contract Justin approved:
 * - cancellation shows nothing;
 * - a pending/deferred payment says "waiting for approval" and never
 *   prompts another purchase;
 * - "No charge was made" appears ONLY for errors that can happen before
 *   any store transaction completes;
 * - uncertain/unknown outcomes get neutral copy plus a Restore action.
 *
 * The local code mirror is checked against the real SDK enum loaded from
 * the installed package, so a drifted literal fails here first.
 */
import { Alert } from 'react-native';
import {
  describePurchaseError,
  showPurchaseErrorAlert,
  PURCHASE_ERROR_CODE,
} from '../lib/purchaseErrors';

// The lib under test reads the SDK error shape through the PurchasesError
// type only (erased at runtime), so the only react-native surface it needs
// is Alert — stub it like the other tests do (Node jest cannot load the
// real react-native module).
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

const alertMock = Alert.alert as jest.Mock;

// The real SDK enum, loaded from the installed package (plain JS, no
// native module involved), so the mirror is checked against the source
// of truth rather than against itself.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PURCHASES_ERROR_CODE: SDK_CODES } = require(
  '@revenuecat/purchases-typescript-internal/dist/generated/error-codes',
) as { PURCHASES_ERROR_CODE: Record<string, string> };

function sdkError(code: string, extra: Record<string, unknown> = {}) {
  return {
    code,
    message: `sdk error ${code}`,
    readableErrorCode: code,
    userInfo: { readableErrorCode: code },
    underlyingErrorMessage: '',
    userCancelled: false,
    ...extra,
  };
}

describe('purchaseErrors mirror', () => {
  it('matches every value of the installed SDK enum', () => {
    for (const [key, value] of Object.entries(SDK_CODES)) {
      expect(
        (PURCHASE_ERROR_CODE as Record<string, string>)[key],
      ).toBe(value);
    }
    expect(Object.keys(PURCHASE_ERROR_CODE).sort()).toEqual(
      Object.keys(SDK_CODES).sort(),
    );
  });
});

describe('describePurchaseError', () => {
  beforeEach(() => {
    alertMock.mockClear();
  });

  it('cancellation by code shows nothing', () => {
    const outcome = describePurchaseError(
      sdkError(PURCHASE_ERROR_CODE.PURCHASE_CANCELLED_ERROR, {
        userCancelled: true,
      }),
    );
    expect(outcome.kind).toBe('cancelled');
    expect(outcome.title).toBe('');
    expect(outcome.body).toBe('');
    expect(outcome.suggestRestore).toBe(false);
  });

  it('cancellation by the deprecated userCancelled flag shows nothing', () => {
    // Bridges still set userCancelled on purchase-flow errors; the code
    // is the primary signal, the flag is the fallback.
    const outcome = describePurchaseError({ userCancelled: true });
    expect(outcome.kind).toBe('cancelled');
  });

  it('a non-cancelled error is never swallowed by the flag', () => {
    const outcome = describePurchaseError(
      sdkError(PURCHASE_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR, {
        userCancelled: false,
      }),
    );
    expect(outcome.kind).toBe('noCharge');
  });

  it('pending explains approval and never prompts another purchase', () => {
    const outcome = describePurchaseError(
      sdkError(PURCHASE_ERROR_CODE.PAYMENT_PENDING_ERROR),
    );
    expect(outcome.kind).toBe('pending');
    expect(outcome.body).toMatch(/waiting for approval/i);
    expect(outcome.body).not.toMatch(/try again/i);
    expect(outcome.body).not.toMatch(/purchase again/i);
    expect(outcome.suggestRestore).toBe(false);
  });

  it('known pre-transaction failures may say no charge was made', () => {
    // Doc-reviewed 2026-11-15: a code is here only if no RevenueCat
    // backend response can produce it — a purchase call posts the receipt
    // AFTER the store transaction, so any backend-mapped code cannot
    // guarantee no charge. Six codes failed that test (store problem,
    // purchase invalid, invalid credentials, invalid app user ID,
    // ineligible, configuration) and live in `uncertain` instead.
    const noChargeCodes = [
      PURCHASE_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR,
      PURCHASE_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR,
      PURCHASE_ERROR_CODE.OPERATION_ALREADY_IN_PROGRESS_ERROR,
      PURCHASE_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR,
      PURCHASE_ERROR_CODE.INSUFFICIENT_PERMISSIONS_ERROR,
      PURCHASE_ERROR_CODE.PRODUCT_DISCOUNT_MISSING_IDENTIFIER_ERROR,
      PURCHASE_ERROR_CODE.PRODUCT_DISCOUNT_MISSING_SUBSCRIPTION_GROUP_IDENTIFIER_ERROR,
      PURCHASE_ERROR_CODE.INVALID_PROMOTIONAL_OFFER_ERROR,
    ];
    expect(noChargeCodes.length).toBeGreaterThan(0);
    for (const code of noChargeCodes) {
      const outcome = describePurchaseError(sdkError(code));
      expect(outcome.kind).toBe('noCharge');
      expect(outcome.body).toContain('No charge was made');
      expect(outcome.suggestRestore).toBe(false);
    }
  });

  it('uncertain outcomes never claim no charge was made and offer Restore', () => {
    const uncertainCodes = [
      // Doc review 2026-11-15: each of these can be produced by a
      // RevenueCat backend response during receipt posting — after the
      // store transaction — so none guarantees no charge. Store problem
      // can also mean the receipt could not be verified, leaving the
      // transaction unfinished on the payment queue.
      PURCHASE_ERROR_CODE.STORE_PROBLEM_ERROR,
      PURCHASE_ERROR_CODE.PURCHASE_INVALID_ERROR,
      PURCHASE_ERROR_CODE.INVALID_CREDENTIALS_ERROR,
      PURCHASE_ERROR_CODE.INVALID_APP_USER_ID_ERROR,
      PURCHASE_ERROR_CODE.INELIGIBLE_ERROR,
      PURCHASE_ERROR_CODE.CONFIGURATION_ERROR,
      PURCHASE_ERROR_CODE.NETWORK_ERROR,
      PURCHASE_ERROR_CODE.OFFLINE_CONNECTION_ERROR,
      PURCHASE_ERROR_CODE.INVALID_RECEIPT_ERROR,
      PURCHASE_ERROR_CODE.MISSING_RECEIPT_FILE_ERROR,
      PURCHASE_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR,
      PURCHASE_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR,
      PURCHASE_ERROR_CODE.UNEXPECTED_BACKEND_RESPONSE_ERROR,
      PURCHASE_ERROR_CODE.UNKNOWN_BACKEND_ERROR,
      PURCHASE_ERROR_CODE.INVALID_APPLE_SUBSCRIPTION_KEY_ERROR,
      PURCHASE_ERROR_CODE.API_ENDPOINT_BLOCKED,
      PURCHASE_ERROR_CODE.SIGNATURE_VERIFICATION_ERROR,
      PURCHASE_ERROR_CODE.CUSTOMER_INFO_ERROR,
      PURCHASE_ERROR_CODE.SYSTEM_INFO_ERROR,
      PURCHASE_ERROR_CODE.INVALID_SUBSCRIBER_ATTRIBUTES_ERROR,
      PURCHASE_ERROR_CODE.EMPTY_SUBSCRIBER_ATTRIBUTES_ERROR,
    ];
    expect(uncertainCodes.length).toBeGreaterThan(0);
    for (const code of uncertainCodes) {
      const outcome = describePurchaseError(sdkError(code));
      expect(outcome.kind).toBe('uncertain');
      expect(outcome.body).not.toContain('No charge was made');
      expect(outcome.suggestRestore).toBe(true);
    }
  });

  it('already-purchased points at Restore, not a new purchase', () => {
    for (const code of [
      PURCHASE_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR,
      PURCHASE_ERROR_CODE.PURCHASE_BELONGS_TO_OTHER_USER,
    ]) {
      const outcome = describePurchaseError(sdkError(code));
      expect(outcome.kind).toBe('alreadyPurchased');
      expect(outcome.body).not.toContain('No charge was made');
      expect(outcome.body).toMatch(/restore/i);
      expect(outcome.suggestRestore).toBe(true);
    }
  });

  it('unknown codes and non-SDK errors get the safe neutral fallback', () => {
    for (const error of [
      sdkError(PURCHASE_ERROR_CODE.UNKNOWN_ERROR),
      sdkError(PURCHASE_ERROR_CODE.UNSUPPORTED_ERROR),
      sdkError('999'),
      new Error('Purchases not available'),
      new Error('boom'),
      'a string error',
      null,
      undefined,
    ]) {
      const outcome = describePurchaseError(error);
      expect(outcome.kind).toBe('unknown');
      expect(outcome.body).not.toContain('No charge was made');
      expect(outcome.suggestRestore).toBe(true);
    }
  });

  it('every SDK error code classifies, and only noCharge claims no charge', () => {
    for (const code of Object.values(SDK_CODES)) {
      const outcome = describePurchaseError(sdkError(code));
      expect([
        'cancelled',
        'pending',
        'alreadyPurchased',
        'noCharge',
        'uncertain',
        'unknown',
      ]).toContain(outcome.kind);
      if (outcome.kind === 'noCharge') {
        expect(outcome.body).toContain('No charge was made');
      } else {
        expect(outcome.body).not.toContain('No charge was made');
      }
      if (outcome.kind === 'pending') {
        expect(outcome.body).not.toMatch(/try again/i);
      }
    }
  });
});

describe('showPurchaseErrorAlert', () => {
  beforeEach(() => {
    alertMock.mockClear();
  });

  it('cancellation shows no alert', () => {
    const onRestore = jest.fn();
    showPurchaseErrorAlert(
      sdkError(PURCHASE_ERROR_CODE.PURCHASE_CANCELLED_ERROR),
      onRestore,
    );
    expect(alertMock).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('pending shows one alert with no Restore button', () => {
    const onRestore = jest.fn();
    showPurchaseErrorAlert(
      sdkError(PURCHASE_ERROR_CODE.PAYMENT_PENDING_ERROR),
      onRestore,
    );
    expect(alertMock).toHaveBeenCalledTimes(1);
    const [title, body] = alertMock.mock.calls[0] as [string, string];
    expect(title).toMatch(/waiting for approval/i);
    expect(body).not.toMatch(/try again/i);
    // No buttons argument: a single dismiss, no Restore, no re-purchase.
    expect(alertMock.mock.calls[0]).toHaveLength(2);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('a known failure shows the no-charge copy with no Restore button', () => {
    const onRestore = jest.fn();
    showPurchaseErrorAlert(
      sdkError(PURCHASE_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR),
      onRestore,
    );
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock.mock.calls[0][1]).toContain('No charge was made');
    expect(alertMock.mock.calls[0]).toHaveLength(2);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('an uncertain outcome offers Restore and runs it on tap', () => {
    const onRestore = jest.fn();
    showPurchaseErrorAlert(
      sdkError(PURCHASE_ERROR_CODE.NETWORK_ERROR),
      onRestore,
    );
    expect(alertMock).toHaveBeenCalledTimes(1);
    const buttons = alertMock.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    expect(buttons.map((b) => b.text)).toEqual([
      'Restore purchases',
      'OK',
    ]);
    expect(onRestore).not.toHaveBeenCalled();
    buttons[0]?.onPress?.();
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('an unknown error offers Restore and never claims no charge', () => {
    const onRestore = jest.fn();
    showPurchaseErrorAlert(new Error('boom'), onRestore);
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock.mock.calls[0][1]).not.toContain('No charge was made');
    const buttons = alertMock.mock.calls[0][2] as { text: string }[];
    expect(buttons.map((b) => b.text)).toContain('Restore purchases');
  });
});
