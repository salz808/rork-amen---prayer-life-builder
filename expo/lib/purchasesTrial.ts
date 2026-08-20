type IntroPriceLike = {
  price?: number;
  periodUnit?: string;
  periodNumberOfUnits?: number;
};

/**
 * Trial badge label for an annual package. Uses the store's live introductory
 * free trial when store data is available; falls back to the planned 3-day
 * trial while products are not yet configured (dev/preview). Returns null for
 * paid intro offers (not a free trial) or when no intro offer exists.
 */
export function getAnnualTrialLabel(annualPkg: unknown, hasStoreData: boolean): string | null {
  if (!hasStoreData) {
    return '3-DAY FREE TRIAL';
  }

  const product = (annualPkg as { product?: { introPrice?: IntroPriceLike | null } } | undefined)?.product;
  const intro = product?.introPrice;
  if (!intro || (typeof intro.price === 'number' && intro.price > 0)) {
    return null;
  }

  const count = typeof intro.periodNumberOfUnits === 'number' ? intro.periodNumberOfUnits : 0;
  const unit = (intro.periodUnit ?? 'DAY').toUpperCase();
  const noun = count === 1 ? unit : `${unit}S`;
  return count > 0 ? `${count}-${noun} FREE TRIAL` : 'FREE TRIAL';
}
