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
 * category is self_harm | threat | possession | hate | contact
 * | link | money;
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
/** The tier-2 hold categories the server can write (00019 + 00020 draft). */
export const HOLD_CATEGORIES = ['self_harm', 'threat', 'possession', 'hate', 'contact', 'link', 'money'] as const;

export function holdCategory(post: WallHoldInfo | null | undefined): string | null {
  const raw = post?.hiddenReason;
  if (!raw) return null;
  // Fix-everything (support lane G1): normalize before matching —
  // a trailing space or case drift on a legacy/manual row
  // ('hold:self_harm ', 'HOLD:self_harm') must not silently
  // downgrade a self-harm/threat hold to a generic notice. The
  // server always writes lowercase 'hold:<category>'; this only
  // forgives malformed rows. Whitelist still applies (G6).
  const reason = raw.trim().toLowerCase();
  if (!reason.startsWith('hold:')) return null;
  const category = reason.slice('hold:'.length);
  return (HOLD_CATEGORIES as readonly string[]).includes(category) ? category : null;
}

/**
 * Support-card variant, decided by the SERVER hold category only
 * (migration 00019 + 00020 draft). The client never re-scans post
 * text to decide the variant: the trigger returns 'hold:self_harm',
 * 'hold:threat', or 'hold:possession' and the card follows that
 * category. This keeps the card trigger
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
export type SupportCardVariant = 'self_harm' | 'threat' | 'possession';

/** True for a tier-2 self-harm hold. */
export function isSelfHarmHold(post: WallHoldInfo | null | undefined): boolean {
  return isHeldWallPost(post) && holdCategory(post) === 'self_harm';
}

/** True for a tier-2 threat hold (person-directed harm to others). */
export function isThreatHold(post: WallHoldInfo | null | undefined): boolean {
  return isHeldWallPost(post) && holdCategory(post) === 'threat';
}

/**
 * True for a tier-2 possession hold (00020 draft matcher only:
 * "demon possession" / "demon possessed" / "possessed by a
 * demon"). Distinct from the wider theological guard: ordinary
 * deliverance language ("demon", "deliverance", "spirit") does
 * NOT hold — only an explicit possession claim does. Priority:
 * self_harm and threat still win over possession, so a post
 * matching both shows the more urgent card.
 */
export function isPossessionHold(post: WallHoldInfo | null | undefined): boolean {
  return isHeldWallPost(post) && holdCategory(post) === 'possession';
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
  if (isPossessionHold(post)) return 'possession';
  return null;
}

/**
 * Block-wins prayer — SERVER-READY HOOK, not a client scan.
 *
 * Problem: Tier 1 block always wins over a Tier 2 hold (00019
 * trigger order: hold sets hidden_reason, then the block trigger
 * raises MODERATION_BLOCKED and the whole transaction aborts, so
 * no held row ever returns). A blocked post that ALSO matched
 * self-harm/threat hold language therefore has no row for
 * supportCardVariantForHold to read — and the client must NOT
 * fill that gap by re-scanning the user's text. A client scan
 * would be a hold oracle: anyone could probe arbitrary phrases
 * locally and learn exactly which phrases hold, which is why
 * 00010 revoked the block-check grant and 00019 grants no
 * hold-classifier RPC.
 *
 * This hook therefore accepts ONLY a server-provided category
 * carried on the block error itself, in the exact canonical
 * shape the (draft, NOT applied) 00020 §BLOCK-CARD-SIGNAL
 * section would raise:
 *   'MODERATION_BLOCKED:SELF_HARM: ...' -> 'self_harm'
 *   'MODERATION_BLOCKED:THREAT: ...'   -> 'threat'
 * Anything else — today's generic 'MODERATION_BLOCKED: wall
 * text rejected ...', a profanity-only block, a hate/contact/
 * link/money overlap, a malformed suffix, a non-Error value —
 * returns null, and the caller keeps its existing generic
 * "Not shared" alert. The post is NEVER published in any path
 * here: a block error means no row was inserted, and requesting
 * the card does not insert one. Tier 1 blocking is unchanged.
 *
 * ORACLE TRADE-OFF, stated honestly (see also the 00020 draft
 * section): this client function creates no oracle by itself —
 * it only reads a code the server chose to return. The oracle
 * is created SERVER-SIDE if that draft is ever applied: an
 * attacker could append a known Tier 1 term to any candidate
 * phrase, force a block, and read the suffix to learn whether
 * the phrase is a self_harm/threat hold phrase, without ever
 * publishing. The exposure is NARROWED, not eliminated: only
 * the two card categories (never hate/contact/link/money, never
 * the blocklist terms themselves), and only on attempts that
 * were already blocked. Until Kai explicitly accepts that
 * narrowed oracle AND the draft is applied and staging-tested,
 * this function returns null for every real block error today,
 * so the block-wins card CANNOT fire in production yet — the
 * generic alert is the live behaviour, and the card path is
 * dormant but wired and tested. Do not "fix" that dormancy by
 * scanning text on the client.
 */
export function supportCardVariantForBlock(error: unknown): SupportCardVariant | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null;
  if (!message) return null;
  // Exact, case-sensitive, server-written codes only. A bare
  // MODERATION_BLOCKED (today's live shape) matches neither, and
  // no other suffix is whitelisted — a future server category
  // must be added here deliberately, never by prefix matching.
  if (message.includes('MODERATION_BLOCKED:SELF_HARM')) return 'self_harm';
  if (message.includes('MODERATION_BLOCKED:THREAT')) return 'threat';
  // Possession block signal, same mechanism as above (added by
  // analogy when the possession card was approved 2026-10-26;
  // dormant until the 00020 draft's block-card signal is applied
  // and staging-tested, same as the other two categories).
  if (message.includes('MODERATION_BLOCKED:POSSESSION')) return 'possession';
  return null;
}
