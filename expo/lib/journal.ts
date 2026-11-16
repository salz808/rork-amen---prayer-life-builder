// Journal helpers (arena nice-to-have (c)): the "Themes of your last
// month" cloud must use only reflections from the last month — not the
// whole history. The entry list below it is a history and still shows
// everything; only the cloud is filtered.
export interface DatedReflection {
  date: string;
}

const LAST_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function reflectionsFromLastMonth<T extends DatedReflection>(
  reflections: readonly T[],
  now: Date = new Date(),
): T[] {
  const cutoff = now.getTime() - LAST_MONTH_MS;
  return reflections.filter((r) => {
    const t = new Date(r.date).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
}
