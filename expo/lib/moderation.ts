/**
 * Wall moderation tiers — client-side held-post contract (migration
 * 00019). Pure functions only: the server triggers decide block vs
 * hold, and the client only reads the returned row.
 *
 * A held post is a SUCCESSFUL insert with hidden_at set — never an
 * error, never a retry. Blocked posts raise MODERATION_BLOCKED and
 * never reach this code. That distinction is the whole contract:
 * blocked = reword and try again; held = submitted, under review.
 *
 * hidden_reason values: 'hold:<category>' for tier-2 holds, where
 * category is self_harm | threat | hate | contact | link | money;
 * 'reports' for the 00010 report auto-hide. Anything else is not a
 * hold and must not be treated as one.
 */

/** The wall-row fields the held-post contract reads. */
export interface WallHoldInfo {
  hiddenAt?: string | null;
  hiddenReason?: string | null;
}

/** True when the returned wall row was held at insert (or hidden). */
export function isHeldWallPost(post: WallHoldInfo | null | undefined): boolean {
  return post?.hiddenAt != null;
}

/**
 * The tier-2 hold category, or null when the row is not a tier-2
 * hold (published, or hidden for reports). Parses only the exact
 * 'hold:<category>' shape the trigger writes.
 */
export function holdCategory(post: WallHoldInfo | null | undefined): string | null {
  const reason = post?.hiddenReason;
  if (!reason || !reason.startsWith('hold:')) return null;
  const category = reason.slice('hold:'.length);
  return category === '' ? null : category;
}

/**
 * Support-card variant, decided by the SERVER hold category only
 * (migration 00019). The client never re-scans post text to decide
 * the variant: the trigger returns 'hold:self_harm' or 'hold:threat'
 * and the card follows that category. This keeps the card trigger
 * identical across the community composer, the session Ask share,
 * and the journal testimony share/retry — one contract, no
 * per-screen text probing (which would also be a hold oracle).
 *
 * Threat trigger, documented: EVERY 'hold:threat' row shows the
 * threat variant. The 00019 threat seeds are person-directed only
 * ("kill you", "kill someone", "i want to kill", "murder you",
 * "shoot you", ...); "kill" alone never holds, and a post matching
 * both a self-harm and a threat phrase is classified self_harm by
 * the server's priority order, so it shows the self-harm variant.
 */
export type SupportCardVariant = 'self_harm' | 'threat';

/** True for a tier-2 self-harm hold. */
export function isSelfHarmHold(post: WallHoldInfo | null | undefined): boolean {
  return isHeldWallPost(post) && holdCategory(post) === 'self_harm';
}

/** True for a tier-2 threat hold (person-directed harm to others). */
export function isThreatHold(post: WallHoldInfo | null | undefined): boolean {
  return isHeldWallPost(post) && holdCategory(post) === 'threat';
}

/**
 * The support-card variant for a held row, or null when no card
 * may show (published, report-hidden, or any other hold category —
 * those keep the generic under-review notice).
 */
export function supportCardVariantForHold(
  post: WallHoldInfo | null | undefined,
): SupportCardVariant | null {
  if (isSelfHarmHold(post)) return 'self_harm';
  if (isThreatHold(post)) return 'threat';
  return null;
}
