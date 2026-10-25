import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json, readCappedJson, safeCompare } from '../_shared/http.ts';
import { createAdminClient } from '../_shared/supabase.ts';

type RevenueCatEvent = {
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    entitlement_ids?: string[];
    product_id?: string;
    transferred_from?: string[];
    transferred_to?: string[];
    original_app_user_id?: string;
    event_timestamp_ms?: number;
  };
};

type UserTier = 0 | 1 | 2 | 3;

const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'NON_RENEWING_PURCHASE',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
  'PRODUCT_CHANGE',
  'TRANSFER',
]);

// CANCELLATION only disables renewal; paid access remains valid until the
// later EXPIRATION event. Revoking immediately would remove purchased
// access. BILLING_ISSUE is likewise unmapped (entitlement stays active
// through grace; a later EXPIRATION revokes).
// SUBSCRIPTION_PAUSED IS mapped to revoke: the client SDK drops the
// entitlement during a pause, so the mirror must not keep showing
// Partner while paused. A later RENEWAL re-grants on resume.
const REVOKE_EVENTS = new Set([
  'EXPIRATION',
  'REFUND',
  'SUBSCRIPTION_PAUSED',
]);

// Audit round 4, fix lane 3 (D-L-6): 'missions' maps to tier 3 here, the
// same tier the client assigns it (expo/services/entitlements.ts maps
// missions -> UserTier.PARTNER = 3). The old webhook value of 2 diverged
// from the client mapping; buyer-facing name stays 'Partner' either way.
// 'premium' is RevenueCat's live entitlement (the app aliases it to
// Partner client-side); without it every real purchase mapped to tier 0.
const TIER_HIERARCHY: Record<string, UserTier> = {
  support: 1,
  missions: 3,
  partner: 3,
  premium: 3,
};

// Audit round 4, fix lane 3 (D-M-4): only products TRIAD actually sells
// may write the mirror. The check applies ONLY when the event carries a
// non-empty product_id; events without one (some TRANSFER shapes) still
// proceed, because dropping a genuine event for a missing optional field
// is worse than the residual risk of an unlisted product on a
// secret-authenticated event. Skips are logged loudly for alerting.
// Environment filtering is deliberately NOT implemented here: no real
// RevenueCat payload sample exists in the repo to confirm the environment
// field name, and guessing it in code would silently misroute events.
// See the lane report (post-deploy check: confirm the field from a real
// payload, then filter sandbox events before they reach this function).
const PRODUCT_ALLOWLIST = new Set([
  'triad_missions_monthly',
  'triad_missions_annual',
]);

const MAX_BODY_BYTES = 256 * 1024;
// Audit round 4, fix lane 3 (D-M-1): timestamps more than ~5 minutes in
// the future, or implausibly old, are rejected, never written — one
// far-future timestamp must not permanently poison a watermark (a poisoned
// row survives secret rotation).
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MIN_EVENT_MS = Date.parse('2020-01-01T00:00:00Z');
// A claim stuck in 'processing' longer than this is treated as abandoned
// (crashed attempt, or a mark-done failure) and becomes reprocessable.
const STALE_PROCESSING_MS = 10 * 60 * 1000;

function getWebhookSecret(): string {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) {
    throw new Error('Missing REVENUECAT_WEBHOOK_SECRET secret');
  }

  return secret;
}

function getEntitlements(payload: RevenueCatEvent): string[] {
  // Audit round 4, fix lane 3 (D-L-6): trim as well as lowercase, matching
  // the client's normalizeEntitlements.
  return payload.event?.entitlement_ids?.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase()) ?? [];
}

function getHighestTier(entitlements: string[]): UserTier {
  return entitlements.reduce<UserTier>((highest, entitlement) => {
    const tier = TIER_HIERARCHY[entitlement] ?? 0;
    return tier > highest ? tier : highest;
  }, 0);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Audit must-fixes #2 + #12: resolve a RevenueCat app user id to the real
 * Supabase user id. Since the alias migration, the app logs in to
 * RevenueCat with the opaque profiles.rc_alias_id — never the Supabase
 * user id — so the alias lookup comes FIRST. The direct-UUID fallback
 * covers events still in flight from before the alias change.
 *
 * Audit round 4, fix lane 3 (D-M-7): for TRANSFER events the destination
 * is resolved from app_user_id / transferred_to[0] ONLY. The old fallback
 * to original_app_user_id could grant the SOURCE (the account the
 * transfer was meant to revoke) when the destination did not resolve,
 * and the source-revocation loop then skipped it as a self-transfer.
 * For non-TRANSFER events the original_app_user_id fallback is kept: it
 * names the original purchaser there, not a transfer source.
 */
async function resolveTargetUserId(
  supabase: ReturnType<typeof createAdminClient>,
  payload: RevenueCatEvent,
  isTransfer = false,
): Promise<string | null> {
  const candidates = isTransfer
    ? [payload.event?.app_user_id, payload.event?.transferred_to?.[0]]
    : [
        payload.event?.app_user_id,
        payload.event?.original_app_user_id,
        payload.event?.transferred_to?.[0],
      ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !isUuid(candidate)) continue;

    // One profiles query per candidate instead of two lookups — the row
    // matches whether the candidate is an alias or a legacy real user id.
    // Only when profiles has no row at all do we ask Auth (profile-less
    // legacy users). Lookup failures still THROW (500 -> RevenueCat
    // retries); only successful-but-empty lookups fall through.
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .or(`rc_alias_id.eq.${candidate},id.eq.${candidate}`)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profileRow?.id) return profileRow.id as string;

    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(candidate);
    if (authError) {
      // A 404 / "user not found" is a successful-but-empty lookup for this
      // candidate — try the next one. Anything else is a real failure.
      const status = (authError as { status?: number }).status;
      const message = String((authError as { message?: string }).message ?? '').toLowerCase();
      if (status !== 404 && !message.includes('not found')) throw authError;
    } else if (authUser?.user) {
      return candidate;
    }
  }

  return null;
}

/**
 * Audit round 4, fix lane 3 (WEB-1, WEB-2, D-M-3): the ordering guard and
 * the mirror write are ONE database transaction, in the SECURITY DEFINER
 * RPC apply_webhook_mirror() (migration 20261025000014). The RPC
 * serializes per user on the watermark row, returns 'stale' when the
 * event timestamp is strictly older than the watermark, and otherwise
 * advances the watermark and writes the mirror row atomically — so a
 * concurrent RENEWAL/EXPIRATION pair can no longer land in the wrong
 * final state, and a TRANSFER source revoke is gated on the SOURCE's own
 * watermark (pass the source's user id here with the TRANSFER timestamp).
 * RPC errors throw (500 -> RevenueCat retries); the claim is marked
 * 'failed' by the caller so the retry reprocesses instead of hitting a
 * 'duplicate' skip.
 */
async function applyMirror(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  isSubscriber: boolean,
  tierLevel: UserTier,
  eventMs: number,
  touchMirror = true,
): Promise<'applied' | 'stale'> {
  const { data, error } = await supabase.rpc('apply_webhook_mirror', {
    p_user_id: userId,
    p_is_subscriber: isSubscriber,
    p_tier_level: tierLevel,
    p_event_ms: eventMs,
    p_touch_mirror: touchMirror,
  });
  if (error) throw error;
  return data === 'stale' ? 'stale' : 'applied';
}

async function isAuthorizedWebhookRequest(request: Request): Promise<boolean> {
  const authorization = request.headers.get('Authorization') ?? '';
  const expectedSecret = getWebhookSecret();

  if (!authorization) {
    return false;
  }

  return (await safeCompare(authorization, expectedSecret)) || (await safeCompare(authorization, `Bearer ${expectedSecret}`));
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405);
  }

  try {
    // Size cap on the declared length before any auth work or body read.
    const declaredLength = request.headers.get('content-length');
    if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES) {
      return errorResponse(request, 'Request body too large', 413);
    }

    if (!(await isAuthorizedWebhookRequest(request))) {
      return errorResponse(request, 'Unauthorized webhook request', 401);
    }

    // Audit round 4, fix lane 3 (E-L9, E-L8): malformed JSON and
    // non-object bodies are 400, never 500 — a body that can never parse
    // must not invite futile RevenueCat retries. The full-body byte cap
    // is enforced inside readCappedJson (covers a missing/lying header).
    let payload: RevenueCatEvent;
    try {
      const parsed = await readCappedJson(request, MAX_BODY_BYTES);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return errorResponse(request, 'Webhook body must be a JSON object', 400);
      }
      payload = parsed as RevenueCatEvent;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Request body too large') {
        return errorResponse(request, 'Request body too large', 413);
      }
      return errorResponse(request, 'Malformed webhook JSON', 400);
    }

    const eventType = payload.event?.type ?? 'UNKNOWN';
    const eventId = payload.event?.id;
    const eventTimestampMs = payload.event?.event_timestamp_ms;
    const entitlements = getEntitlements(payload);
    const productId = typeof payload.event?.product_id === 'string' ? payload.event.product_id.trim() : '';

    if (eventType === 'TEST') {
      return json(request, { ok: true, eventType, skipped: true, reason: 'test event' });
    }

    // Unmapped events (CANCELLATION, BILLING_ISSUE, unknown types) write
    // nothing, so they need no user resolution, no claim, and no
    // watermark movement — repeated deliveries re-skip harmlessly.
    // Unknown types are logged loudly: a future RevenueCat revoke-type
    // event must not be silently ignored.
    if (!GRANT_EVENTS.has(eventType) && !REVOKE_EVENTS.has(eventType)) {
      console.error(`[revenuecat-webhook] unmapped event type skipped: ${eventType}`);
      return json(request, { ok: true, eventType, skipped: true, reason: 'event not mapped yet' });
    }

    // Audit round 4, fix lane 3 (WEB-1, D-L-2): grant/revoke events
    // REQUIRE an id and a timestamp. Id-less events used to process with
    // no dedupe at all; timestamp-less events used to bypass ordering
    // AND never advance the watermark. Rejecting them (400, dead-letter)
    // is the documented choice over stamping now(): real RevenueCat
    // events always carry both fields, so a missing one is anomalous,
    // and silently processing it could leave the mirror permanently
    // inconsistent. D-M-1 bounds are enforced here too.
    if (typeof eventId !== 'string' || eventId.length === 0) {
      console.error(`[revenuecat-webhook] rejected ${eventType} event with no event id`);
      return errorResponse(request, 'Webhook event id is required', 400);
    }
    if (typeof eventTimestampMs !== 'number' || !Number.isFinite(eventTimestampMs)) {
      console.error(`[revenuecat-webhook] rejected ${eventType} event with no event_timestamp_ms`);
      return errorResponse(request, 'Webhook event_timestamp_ms is required', 400);
    }
    if (eventTimestampMs > Date.now() + MAX_FUTURE_SKEW_MS || eventTimestampMs < MIN_EVENT_MS) {
      console.error(`[revenuecat-webhook] rejected ${eventType} event with out-of-range timestamp: ${eventTimestampMs}`);
      return errorResponse(request, 'Webhook event timestamp out of range', 400);
    }

    // Audit round 4, fix lane 3 (D-M-4): product allowlist, enforced
    // only when a product_id is present (see PRODUCT_ALLOWLIST comment).
    if (productId.length > 0 && !PRODUCT_ALLOWLIST.has(productId)) {
      console.error(`[revenuecat-webhook] product not allowlisted, skipping ${eventType} event: ${productId}`);
      return json(request, { ok: true, eventType, skipped: true, reason: 'product not allowlisted' });
    }

    const supabase = createAdminClient();
    const isTransfer = eventType === 'TRANSFER';
    const userId = await resolveTargetUserId(supabase, payload, isTransfer);

    if (!userId) {
      // No claim is taken: if the user appears later (profile created),
      // a redelivery can still process this event.
      return json(request, { ok: true, eventType, skipped: true, reason: 'no resolvable app_user_id found' });
    }

    // Audit round 4, fix lane 3 (D-L-2, D-L-4): claim lifecycle with a
    // status column (migration 20261025000014). 'processing' -> 'done'
    // on success, 'failed' on error so a retry reprocesses instead of
    // hitting a 'duplicate' skip. A 'processing' claim older than
    // STALE_PROCESSING_MS is treated as abandoned (crashed attempt or a
    // mark-done failure) and is reprocessable — mirror writes via the
    // ordering RPC are idempotent, so reprocessing is safe.
    const payloadHash = await sha256Hex(JSON.stringify({
      user_id: userId,
      event_type: eventType,
      event_timestamp_ms: eventTimestampMs,
      entitlement_ids: [...entitlements].sort(),
      product_id: productId,
    }));
    let claimedEventId: string | null = null;
    try {
      const { data: claimed, error: claimError } = await supabase
        .from('webhook_events')
        .insert({ event_id: eventId, user_id: userId, event_type: eventType, status: 'processing', event_payload_hash: payloadHash })
        .select('event_id');
      if (claimError && claimError.code !== '23505') throw claimError;
      if (!claimed || claimed.length === 0) {
        const { data: existing, error: fetchError } = await supabase
          .from('webhook_events')
          .select('user_id, event_type, status, event_payload_hash, received_at')
          .eq('event_id', eventId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!existing) throw new Error('webhook claim conflict without a stored row');
        if (existing.event_payload_hash && existing.event_payload_hash !== payloadHash) {
          console.error(`[revenuecat-webhook] duplicate event id with DIFFERENT payload: ${eventId} (stored user/type differ from incoming)`);
        }
        const receivedAtMs = existing.received_at ? Date.parse(existing.received_at as string) : Number.NaN;
        const isFailed = existing.status === 'failed';
        const isStaleProcessing = existing.status === 'processing'
          && Number.isFinite(receivedAtMs) && Date.now() - receivedAtMs > STALE_PROCESSING_MS;
        if (!isFailed && !isStaleProcessing) {
          return json(request, { ok: true, eventType, skipped: true, reason: 'duplicate event' });
        }
        const { error: resetError } = await supabase
          .from('webhook_events')
          .update({ status: 'processing', received_at: new Date().toISOString() })
          .eq('event_id', eventId);
        if (resetError) throw resetError;
      }
      claimedEventId = eventId;

      let response: Record<string, unknown>;
      if (GRANT_EVENTS.has(eventType)) {
        // Audit round 4, fix lane 3 (D-M-2): an empty-entitlement grant
        // writes NOTHING to the mirror for every grant type (including
        // TRANSFER). The old preserve logic flipped existing rows to
        // is_subscriber=true at their old tier and resurrected lapsed
        // rows' subscriber flag — a transfer/downgrade of nothing became
        // a grant. The watermark still advances (touch_mirror=false) so
        // ordering moves forward without inventing tier state.
        if (entitlements.length === 0) {
          console.error(`[revenuecat-webhook] empty-entitlement ${eventType} grant skipped (mirror untouched) for user ${userId}`);
          await applyMirror(supabase, userId, false, 0, eventTimestampMs, false);
          response = { ok: true, eventType, skipped: true, reason: 'empty entitlements' };
        } else {
          const destinationResult = await applyMirror(supabase, userId, true, getHighestTier(entitlements), eventTimestampMs);

          // Audit round 4, fix lane 3 (WEB-2): TRANSFER source revokes
          // are gated INDEPENDENTLY on each source's own watermark via
          // the same RPC — a re-emitted TRANSFER with a fresh event id
          // and a timestamp equal to the destination watermark can no
          // longer revoke a source who has since re-purchased, because
          // the source's watermark (advanced by the re-purchase) makes
          // the RPC return 'stale' for that source. Sources are revoked
          // even when the destination grant itself was stale: the two
          // sides are ordered independently, and each RPC call is the
          // authority for its own side. Only ids explicitly listed in
          // transferred_from are revoked — original_app_user_id is NEVER
          // used as a source (see resolveTargetUserId); an empty
          // transferred_from means no source is revoked.
          if (isTransfer) {
            const sources = payload.event?.transferred_from ?? [];
            for (const source of sources) {
              if (typeof source !== 'string' || !isUuid(source)) continue;
              const sourceUserId = await resolveTargetUserId(supabase, { event: { app_user_id: source } });
              if (sourceUserId && sourceUserId !== userId) {
                await applyMirror(supabase, sourceUserId, false, 0, eventTimestampMs);
              }
            }
          }

          response = destinationResult === 'stale'
            ? { ok: true, eventType, skipped: true, reason: 'stale event' }
            : { ok: true, eventType, isSubscriber: true, entitlements };
        }
      } else {
        // REVOKE_EVENTS.
        // Audit round 4, fix lane 3 (D-L-1, cheap scoping): a revoke that
        // names entitlements mapping to a tier BELOW the stored tier
        // cannot be the grant behind that tier, so it advances only the
        // watermark (touch_mirror=false) instead of wiping the whole
        // tier. With the single live entitlement ('premium' -> 3) this
        // never triggers today; it becomes correct the moment a second
        // entitlement exists. The full version (CustomerInfo lookup for
        // remaining entitlements) is deferred — see the lane report.
        // Audit round 4, fix lane 3 (D-M-3): select errors THROW here
        // (a transient failure must not silently lose a revoke with a
        // 200 and no retry — the claim is marked 'failed' below and
        // RevenueCat retries).
        const { data: existingStats, error: statsError } = await supabase
          .from('journey_stats')
          .select('is_subscriber, tier_level')
          .eq('user_id', userId)
          .limit(1);
        if (statsError) throw statsError;
        const storedTier = (existingStats && existingStats.length > 0 ? (existingStats[0].tier_level as number) : 0) ?? 0;
        const storedSubscriber = (existingStats && existingStats.length > 0 ? (existingStats[0].is_subscriber as boolean) : false) ?? false;
        const revokeTier = getHighestTier(entitlements);
        if (entitlements.length > 0 && revokeTier < storedTier) {
          await applyMirror(supabase, userId, storedSubscriber, storedTier as UserTier, eventTimestampMs, false);
          response = { ok: true, eventType, skipped: true, reason: 'revoke scoped to a lower tier than stored' };
        } else {
          const result = await applyMirror(supabase, userId, false, 0, eventTimestampMs);
          response = result === 'stale'
            ? { ok: true, eventType, skipped: true, reason: 'stale event' }
            : { ok: true, eventType, isSubscriber: false, entitlements: [] };
        }
      }

      const { error: doneError } = await supabase
        .from('webhook_events')
        .update({ status: 'done' })
        .eq('event_id', eventId);
      if (doneError) throw doneError;
      return json(request, response);
    } catch (error) {
      // Release the claim into 'failed' (best-effort, never throwing) so
      // a RevenueCat retry reprocesses instead of hitting 'duplicate'.
      // If even this update fails, the claim stays 'processing' and
      // becomes reprocessable after STALE_PROCESSING_MS.
      if (claimedEventId) {
        try {
          await supabase.from('webhook_events').update({ status: 'failed' }).eq('event_id', claimedEventId);
        } catch {
          console.error('[revenuecat-webhook] failed to mark claim as failed');
        }
      }
      throw error;
    }
  } catch {
    console.error('[revenuecat-webhook] request failed');
    return errorResponse(request, 'Webhook processing failed', 500);
  }
});
