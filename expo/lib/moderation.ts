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
 * PLACEHOLDER HOOK predicate (self-harm support card). Returns true
 * for a tier-2 self-harm hold — the ONLY row shape that may ever
 * show the support card. The card itself (prayer text + hotline) is
 * NOT implemented here: copy + hotline are pending Kai approval and
 * a verified number, and must not ship until then. Call sites show
 * only the generic under-review notice for every hold today.
 */
export function isSelfHarmHold(post: WallHoldInfo | null | undefined): boolean {
  return isHeldWallPost(post) && holdCategory(post) === 'self_harm';
}
