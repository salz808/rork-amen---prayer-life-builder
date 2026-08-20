type IntroPriceLike = {
  price?: number;
  periodUnit?: string;
  periodNumberOfUnits?: number;
};

/**
 * Trial badge label for an annual package. Uses the store's live introductory
 * free trial only when the store confirms the introductory offer. Returns null
 * for paid intro offers, unavailable store data, or when no intro offer exists.
 */
export function getAnnualTrialLabel(annualPkg: unknown, hasStoreData: boolean): string | null {
  if (!hasStoreData) {
    return null;
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
