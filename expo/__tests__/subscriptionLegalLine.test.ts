/**
 * GPT-6 item 13 — Give / Paywall subscription disclosure.
 *
 * The legal line is built by the pure helper in lib/subscriptionLegalLine
 * from the store-derived trial phrase (lib/purchasesTrial). These tests
 * pin the four StoreKit states:
 * - monthly selected: the monthly line, never the annual/trial wording;
 * - annual with an eligible 7-day trial: the trial sentence appears;
 * - annual with no trial: no trial sentence at all;
 * - store products unavailable: no trial is claimed, fallback prices
 *   are shown (same as the Paywall's conditional approach).
 * Plus the regression that matters most: a null trial label must stay
 * null and never default to 'a free trial'.
 */
import { getAnnualTrialLabel, trialLabelToPhrase } from '../lib/purchasesTrial';
import { buildSubscriptionLegalLine } from '../lib/subscriptionLegalLine';

const CANCEL_TIMING = 'cancel at least 24 hours before renewal in App Store settings.';

function annualPackage(introPrice: unknown) {
  return { product: { introPrice } };
}

const SEVEN_DAY_TRIAL = { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7 };

describe('trialLabelToPhrase', () => {
  it('returns null for a null label — never defaults to a free trial', () => {
    expect(trialLabelToPhrase(null)).toBeNull();
  });

  it('maps FREE TRIAL to "a free trial"', () => {
    expect(trialLabelToPhrase('FREE TRIAL')).toBe('a free trial');
  });

  it('lowercases a counted label', () => {
    expect(trialLabelToPhrase('7-DAYS FREE TRIAL')).toBe('7-days free trial');
  });
});

describe('buildSubscriptionLegalLine', () => {
  it('monthly selected: monthly line, no annual or trial wording', () => {
    const line = buildSubscriptionLegalLine({
      billingPeriod: 'monthly',
      monthlyPrice: '$4.99',
      annualPrice: '$39.99',
      trialPhrase: null,
    });
    expect(line).toBe(`Monthly is $4.99/month unless cancelled. Renews automatically; ${CANCEL_TIMING}`);
    expect(line).not.toMatch(/annual/i);
    expect(line).not.toMatch(/trial/i);
  });

  it('annual with eligible 7-day trial: trial sentence appears', () => {
    const label = getAnnualTrialLabel(annualPackage(SEVEN_DAY_TRIAL), true);
    expect(label).toBe('7-DAYS FREE TRIAL');
    const line = buildSubscriptionLegalLine({
      billingPeriod: 'annual',
      monthlyPrice: '$4.99',
      annualPrice: '$39.99',
      trialPhrase: trialLabelToPhrase(label),
    });
    expect(line).toBe(
      `Annual starts with 7-days free trial where available, then $39.99/year unless cancelled. Renews automatically; ${CANCEL_TIMING}`,
    );
  });

  it('annual with an uncounted free trial: "a free trial"', () => {
    const label = getAnnualTrialLabel(annualPackage({ price: 0 }), true);
    expect(label).toBe('FREE TRIAL');
    const line = buildSubscriptionLegalLine({
      billingPeriod: 'annual',
      monthlyPrice: '$4.99',
      annualPrice: '$39.99',
      trialPhrase: trialLabelToPhrase(label),
    });
    expect(line).toContain('Annual starts with a free trial where available');
  });

  it('annual with no trial: no trial sentence, just the annual price', () => {
    const label = getAnnualTrialLabel(annualPackage(null), true);
    expect(label).toBeNull();
    const line = buildSubscriptionLegalLine({
      billingPeriod: 'annual',
      monthlyPrice: '$4.99',
      annualPrice: '$39.99',
      trialPhrase: trialLabelToPhrase(label),
    });
    expect(line).toBe(`Annual is $39.99/year unless cancelled. Renews automatically; ${CANCEL_TIMING}`);
    expect(line).not.toMatch(/trial/i);
  });

  it('store products unavailable: no trial claimed, fallback prices shown', () => {
    // hasStoreData false — getAnnualTrialLabel returns null even though
    // the package shape carries a trial, and the line must not promise it.
    const label = getAnnualTrialLabel(annualPackage(SEVEN_DAY_TRIAL), false);
    expect(label).toBeNull();
    const line = buildSubscriptionLegalLine({
      billingPeriod: 'annual',
      monthlyPrice: '$4.99',
      annualPrice: '$39.99',
      trialPhrase: trialLabelToPhrase(label),
    });
    expect(line).toBe(`Annual is $39.99/year unless cancelled. Renews automatically; ${CANCEL_TIMING}`);
    expect(line).not.toMatch(/trial/i);
  });

  it('every state carries the 24-hour cancellation timing', () => {
    const states = [
      buildSubscriptionLegalLine({ billingPeriod: 'monthly', monthlyPrice: '$4.99', annualPrice: '$39.99', trialPhrase: null }),
      buildSubscriptionLegalLine({ billingPeriod: 'annual', monthlyPrice: '$4.99', annualPrice: '$39.99', trialPhrase: 'a free trial' }),
      buildSubscriptionLegalLine({ billingPeriod: 'annual', monthlyPrice: '$4.99', annualPrice: '$39.99', trialPhrase: null }),
    ];
    for (const line of states) {
      expect(line).toContain(CANCEL_TIMING);
      expect(line).not.toContain('cancel anytime');
    }
  });
});
