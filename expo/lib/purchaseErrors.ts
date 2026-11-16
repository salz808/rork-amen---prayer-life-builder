/**
 * Shared purchase-error handling (RevenueCat 10.16.0).
 *
 * One mapper serves all three purchase surfaces (paywall, Give, lock
 * sheet) so the same SDK outcome always gets the same words.
 *
 * Classification is by the SDK error `code` (PURCHASES_ERROR_CODE), not
 * by guessing from the message:
 *
 * - cancelled — PURCHASE_CANCELLED_ERROR, or the deprecated
 *   `userCancelled` flag the bridges still set on purchase flows.
 *   Shows nothing; dismissing the store sheet is not a failure.
 * - pending — PAYMENT_PENDING_ERROR. The payment is awaiting approval
 *   (for example Ask to Buy). It has NOT failed, and the user must not
 *   be prompted to buy again — a second purchase would double-charge
 *   once the first is approved.
 * - alreadyPurchased — the subscription already exists on the store
 *   account (PRODUCT_ALREADY_PURCHASED_ERROR, or a receipt belonging
 *   to another user). The way back is Restore, not a new purchase.
 * - noCharge — errors that can only happen before any store transaction
 *   completes (store problem, purchases not allowed, invalid/unavailable
 *   product, another purchase already in progress, product request
 *   timed out, configuration/credentials/eligibility problems, broken
 *   promotional-offer data). Only these may say "No charge was made."
 * - uncertain — errors that can fire AFTER the store transaction, while
 *   the receipt is being posted or validated (network/offline, invalid
 *   or already-in-use receipts, backend errors, receipt verification).
 *   A charge may already exist and the entitlement may arrive later, so
 *   the copy never claims no charge was made; it points at Restore and
 *   at checking App Store subscriptions.
 * - unknown — any other code, or a non-SDK error (including the
 *   "Purchases not available" throw when the native module is absent).
 *   Safe neutral fallback, never a charge claim, with a Restore action.
 *
 * Why the codes are string literals here instead of importing the SDK
 * enum: react-native-purchases is lazily required in this app so Expo
 * Go (no native module) degrades to null instead of crashing at import
 * time. A static import of the enum would break that. The values below
 * mirror PURCHASES_ERROR_CODE from the installed SDK exactly (verified
 * against the real enum in __tests__/purchaseErrors.test.ts), and the
 * error shape is read through the SDK's own `PurchasesError` type.
 */
import { Alert } from 'react-native';
import type { AlertButton } from 'react-native';
import type { PurchasesError } from 'react-native-purchases';

export type PurchaseErrorKind =
  | 'cancelled'
  | 'pending'
  | 'alreadyPurchased'
  | 'noCharge'
  | 'uncertain'
  | 'unknown';

export interface PurchaseErrorOutcome {
  kind: PurchaseErrorKind;
  /** Alert title. Empty for 'cancelled' (no alert is shown). */
  title: string;
  /** Alert body. Empty for 'cancelled'. */
  body: string;
  /** Whether the alert should offer a Restore purchases action. */
  suggestRestore: boolean;
}

// Mirror of PURCHASES_ERROR_CODE (react-native-purchases 10.16.0).
// See the header comment for why these are literals, not an import.
// Exported so tests can cross-check every value against the real enum.
export const PURCHASE_ERROR_CODE = {
  UNKNOWN_ERROR: '0',
  PURCHASE_CANCELLED_ERROR: '1',
  STORE_PROBLEM_ERROR: '2',
  PURCHASE_NOT_ALLOWED_ERROR: '3',
  PURCHASE_INVALID_ERROR: '4',
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: '5',
  PRODUCT_ALREADY_PURCHASED_ERROR: '6',
  RECEIPT_ALREADY_IN_USE_ERROR: '7',
  INVALID_RECEIPT_ERROR: '8',
  MISSING_RECEIPT_FILE_ERROR: '9',
  NETWORK_ERROR: '10',
  INVALID_CREDENTIALS_ERROR: '11',
  UNEXPECTED_BACKEND_RESPONSE_ERROR: '12',
  RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR: '13',
  INVALID_APP_USER_ID_ERROR: '14',
  OPERATION_ALREADY_IN_PROGRESS_ERROR: '15',
  UNKNOWN_BACKEND_ERROR: '16',
  INVALID_APPLE_SUBSCRIPTION_KEY_ERROR: '17',
  INELIGIBLE_ERROR: '18',
  INSUFFICIENT_PERMISSIONS_ERROR: '19',
  PAYMENT_PENDING_ERROR: '20',
  INVALID_SUBSCRIBER_ATTRIBUTES_ERROR: '21',
  LOG_OUT_ANONYMOUS_USER_ERROR: '22',
  CONFIGURATION_ERROR: '23',
  UNSUPPORTED_ERROR: '24',
  EMPTY_SUBSCRIBER_ATTRIBUTES_ERROR: '25',
  PRODUCT_DISCOUNT_MISSING_IDENTIFIER_ERROR: '26',
  PRODUCT_DISCOUNT_MISSING_SUBSCRIPTION_GROUP_IDENTIFIER_ERROR: '28',
  CUSTOMER_INFO_ERROR: '29',
  SYSTEM_INFO_ERROR: '30',
  BEGIN_REFUND_REQUEST_ERROR: '31',
  PRODUCT_REQUEST_TIMED_OUT_ERROR: '32',
  API_ENDPOINT_BLOCKED: '33',
  INVALID_PROMOTIONAL_OFFER_ERROR: '34',
  OFFLINE_CONNECTION_ERROR: '35',
  FEATURE_NOT_AVAILABLE_IN_CUSTOM_ENTITLEMENTS_COMPUTATION_MODE: '36',
  SIGNATURE_VERIFICATION_ERROR: '37',
  FEATURE_NOT_SUPPORTED_WITH_STORE_KIT_1: '38',
  INVALID_WEB_PURCHASE_TOKEN: '39',
  PURCHASE_BELONGS_TO_OTHER_USER: '40',
  EXPIRED_WEB_PURCHASE_TOKEN: '41',
  TEST_STORE_SIMULATED_PURCHASE_ERROR: '42',
} as const;

/** Errors that can only happen before any store transaction completes. */
const NO_CHARGE_CODES: ReadonlySet<string> = new Set([
  PURCHASE_ERROR_CODE.STORE_PROBLEM_ERROR,
  PURCHASE_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR,
  PURCHASE_ERROR_CODE.PURCHASE_INVALID_ERROR,
  PURCHASE_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR,
  PURCHASE_ERROR_CODE.OPERATION_ALREADY_IN_PROGRESS_ERROR,
  PURCHASE_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR,
  PURCHASE_ERROR_CODE.CONFIGURATION_ERROR,
  PURCHASE_ERROR_CODE.INVALID_CREDENTIALS_ERROR,
  PURCHASE_ERROR_CODE.INELIGIBLE_ERROR,
  PURCHASE_ERROR_CODE.INSUFFICIENT_PERMISSIONS_ERROR,
  PURCHASE_ERROR_CODE.INVALID_APP_USER_ID_ERROR,
  PURCHASE_ERROR_CODE.PRODUCT_DISCOUNT_MISSING_IDENTIFIER_ERROR,
  PURCHASE_ERROR_CODE.PRODUCT_DISCOUNT_MISSING_SUBSCRIPTION_GROUP_IDENTIFIER_ERROR,
  PURCHASE_ERROR_CODE.INVALID_PROMOTIONAL_OFFER_ERROR,
]);

/**
 * Errors that can fire while the receipt is being posted or validated,
 * i.e. after the store transaction may already have completed.
 */
const UNCERTAIN_CODES: ReadonlySet<string> = new Set([
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
]);

/** The subscription already exists — the way back is Restore. */
const ALREADY_PURCHASED_CODES: ReadonlySet<string> = new Set([
  PURCHASE_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR,
  PURCHASE_ERROR_CODE.PURCHASE_BELONGS_TO_OTHER_USER,
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as Partial<PurchasesError>).code;
  return typeof code === 'string' ? code : undefined;
}

function errorWasCancelled(error: unknown): boolean {
  if (errorCode(error) === PURCHASE_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return true;
  // The bridges still set userCancelled on purchase-flow errors
  // (deprecated in favour of the code, but sent all the same).
  if (typeof error === 'object' && error !== null && 'userCancelled' in error) {
    return (error as Partial<PurchasesError>).userCancelled === true;
  }
  return false;
}

/** Classify a purchase failure into the shared outcome + wording. Never throws. */
export function describePurchaseError(error: unknown): PurchaseErrorOutcome {
  if (errorWasCancelled(error)) {
    return { kind: 'cancelled', title: '', body: '', suggestRestore: false };
  }
  const code = errorCode(error);
  if (code === PURCHASE_ERROR_CODE.PAYMENT_PENDING_ERROR) {
    return {
      kind: 'pending',
      title: 'Waiting for approval',
      body: "Your purchase is waiting for approval — for example, if a parent or guardian needs to approve it. There's nothing else you need to do. Your Partner access will unlock as soon as it's approved.",
      suggestRestore: false,
    };
  }
  if (code !== undefined && ALREADY_PURCHASED_CODES.has(code)) {
    return {
      kind: 'alreadyPurchased',
      title: 'Already purchased',
      body: 'This subscription already exists on this store account. Restore purchases to bring it back here.',
      suggestRestore: true,
    };
  }
  if (code !== undefined && NO_CHARGE_CODES.has(code)) {
    return {
      kind: 'noCharge',
      title: 'Something went wrong',
      body: "Something didn't go through. No charge was made. Try again?",
      suggestRestore: false,
    };
  }
  if (code !== undefined && UNCERTAIN_CODES.has(code)) {
    return {
      kind: 'uncertain',
      title: "We couldn't confirm your purchase",
      body: "Something didn't go through, and we can't confirm whether you were charged. If the subscription is on this store account, restoring purchases will unlock it — if you subscribed with a different Apple ID or Google account, sign in with that one first.",
      suggestRestore: true,
    };
  }
  return {
    kind: 'unknown',
    title: 'Something went wrong',
    body: "Something didn't go through, and we couldn't confirm what happened. If you're unsure whether you were charged, check your App Store subscriptions, or restore purchases to unlock it if it's there.",
    suggestRestore: true,
  };
}

/**
 * Show the alert for a purchase error, or nothing for a cancellation.
 * `onRestore` runs the calling surface's own restore flow; it is only
 * invoked if the user taps "Restore purchases".
 */
export function showPurchaseErrorAlert(error: unknown, onRestore: () => void): void {
  const outcome = describePurchaseError(error);
  if (outcome.kind === 'cancelled') return;
  if (outcome.suggestRestore) {
    const buttons: AlertButton[] = [
      { text: 'Restore purchases', onPress: onRestore },
      { text: 'OK', style: 'cancel' },
    ];
    Alert.alert(outcome.title, outcome.body, buttons);
    return;
  }
  Alert.alert(outcome.title, outcome.body);
}
