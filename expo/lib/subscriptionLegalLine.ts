/**
 * Single source of truth for the Partner subscription legal line, shared
 * by the Paywall and Give screens so both disclose the same facts:
 * the selected period's price, the store-confirmed trial (if any), and
 * the cancellation timing from the Terms — cancel at least 24 hours
 * before renewal. Pure function, unit-tested.
 *
 * The trial sentence appears only when `trialPhrase` is present. A null
 * trial phrase (store confirms no trial, or no store data) omits the
 * trial claim entirely rather than softening to an unconfirmed
 * 'a free trial'. Prices are resolved by the caller (store priceString
 * with the known $4.99 / $39.99 fallbacks).
 */
export type SubscriptionBillingPeriod = 'monthly' | 'annual';

export type SubscriptionLegalLineInput = {
  billingPeriod: SubscriptionBillingPeriod;
  monthlyPrice: string;
  annualPrice: string;
  /** Lowercase trial phrase (e.g. 'a free trial', '7-days free trial'), or null when the store confirms no trial. */
  trialPhrase: string | null;
};

const CANCEL_TIMING = 'Renews automatically; cancel at least 24 hours before renewal in App Store settings.';

export function buildSubscriptionLegalLine({
  billingPeriod,
  monthlyPrice,
  annualPrice,
  trialPhrase,
}: SubscriptionLegalLineInput): string {
  if (billingPeriod === 'monthly') {
    return `Monthly is ${monthlyPrice}/month unless cancelled. ${CANCEL_TIMING}`;
  }
  if (trialPhrase) {
    return `Annual starts with ${trialPhrase} where available, then ${annualPrice}/year unless cancelled. ${CANCEL_TIMING}`;
  }
  return `Annual is ${annualPrice}/year unless cancelled. ${CANCEL_TIMING}`;
}
