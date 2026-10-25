import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json, safeCompare } from '../_shared/http.ts';
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
// later EXPIRATION event. Revoking immediately would remove purchased access.
const REVOKE_EVENTS = new Set([
  'EXPIRATION',
  'REFUND',
]);

const TIER_HIERARCHY: Record<string, UserTier> = {
  support: 1,
  missions: 2,
  partner: 3,
  // RevenueCat's live entitlement is 'premium' (the app aliases it to
  // Partner client-side). Without this entry every real purchase mapped
  // to tier 0 here, and the webhook recorded subscribers as free.
  premium: 3,
};

function getWebhookSecret(): string {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) {
    throw new Error('Missing REVENUECAT_WEBHOOK_SECRET secret');
  }

  return secret;
}

function getEntitlements(payload: RevenueCatEvent): string[] {
  return payload.event?.entitlement_ids?.filter((item): item is string => typeof item === 'string' && item.length > 0) ?? [];
}

function getHighestTier(entitlements: string[]): UserTier {
  return entitlements.reduce<UserTier>((highest, entitlement) => {
    const tier = TIER_HIERARCHY[entitlement.toLowerCase()] ?? 0;
    return tier > highest ? tier : highest;
  }, 0);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Audit must-fixes #2 + #12: resolve a RevenueCat app user id to the real
 * Supabase user id. Since the alias migration, the app logs in to
 * RevenueCat with the opaque profiles.rc_alias_id — never the Supabase
 * user id — so the alias lookup comes FIRST. The direct-UUID fallback
 * covers events still in flight from before the alias change (and old
 * installs that have not updated yet); it is safe because a purchase
 * event is store-verified — an attacker cannot mint one for a victim's
 * id, they could only have claimed the victim's id in their own client,
 * which grants them nothing without a purchase.
 */
async function resolveTargetUserId(
  supabase: ReturnType<typeof createAdminClient>,
  payload: RevenueCatEvent,
): Promise<string | null> {
  const candidates = [
    payload.event?.app_user_id,
    payload.event?.original_app_user_id,
    payload.event?.transferred_to?.[0],
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !isUuid(candidate)) continue;

    // Audit round 2, hole #3 + lane 2, S6: one profiles query per candidate
    // instead of two lookups — the row matches whether the candidate is
    // an alias or a legacy real user id (a uuid cannot realistically be
    // both at once). Only when profiles has no row at all do we ask Auth
    // (profile-less legacy users). Lookup failures still THROW (500 →
    // RevenueCat retries); only successful-but-empty lookups fall through.
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

async function syncJourneyStats(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  entitlements: string[],
  isSubscriber: boolean,
  opts?: { preserveTierOnEmptyEntitlements?: boolean },
): Promise<{ skipped?: string } | undefined> {
  // Audit must-fix #12: an empty-entitlement TRANSFER used to write
  // is_subscriber=true with tier_level=0 — a contradictory row. When the
  // event carries no entitlements, keep the tier the user already has;
  // when there is no row at all, there is nothing to preserve, so skip
  // rather than inventing a subscriber-at-tier-0 row.
  const { data: existing } = await supabase
    .from('journey_stats')
    .select('id, tier_level')
    .eq('user_id', userId)
    .limit(1);

  if (entitlements.length === 0 && isSubscriber && opts?.preserveTierOnEmptyEntitlements) {
    if (!existing || existing.length === 0) {
      return { skipped: 'empty entitlements and no journey_stats row to preserve tier for' };
    }
    const { error } = await supabase
      .from('journey_stats')
      .update({ is_subscriber: true })
      .eq('user_id', userId);
    if (error) throw error;
    return undefined;
  }

  const tierLevel = isSubscriber ? getHighestTier(entitlements) : 0;

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from('journey_stats')
      .update({ is_subscriber: isSubscriber, tier_level: tierLevel })
      .eq('user_id', userId);
    if (error) throw error;
    return undefined;
  }

  // Audit must-fix #12: the old update touched 0 rows for users with no
  // journey_stats row yet, silently dropping the grant. Insert a pass-1
  // row for grants; revokes with no row need no row.
  if (!isSubscriber) return undefined;
  // Audit round 2, lane 2, S5: journey_stats.user_id references
  // profiles(id), so a profile-less legacy user (auth row exists, no
  // profile row) would hit an FK violation here and spin a 500 retry
  // loop. Create the bare profile row first (first_name DEFAULT '' covers
  // the NOT NULL column, same shape as the client's bare upserts).
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id' });
  if (profileError) throw profileError;
  const { error } = await supabase
    .from('journey_stats')
    .insert({ user_id: userId, journey_pass: 1, is_subscriber: true, tier_level: tierLevel });
  if (error) throw error;
  return undefined;
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
    if (!(await isAuthorizedWebhookRequest(request))) {
      return errorResponse(request, 'Unauthorized webhook request', 401);
    }

    const payload = (await request.json()) as RevenueCatEvent;
    const eventType = payload.event?.type ?? 'UNKNOWN';
    const eventId = payload.event?.id;
    const eventTimestampMs = payload.event?.event_timestamp_ms;
    const entitlements = getEntitlements(payload);
    const supabase = createAdminClient();
    const userId = await resolveTargetUserId(supabase, payload);

    if (eventType === 'TEST') {
      return json(request, { ok: true, eventType, skipped: true, reason: 'test event' });
    }

    if (!userId) {
      return json(request, { ok: true, eventType, skipped: true, reason: 'no resolvable app_user_id found' });
    }

    // Audit must-fix #12: event ordering. A stale redelivery (older than
    // the newest event already processed for this user) must not revive a
    // lapsed subscription or undo a newer grant. Absent a timestamp, the
    // event is processed normally (defensive: never drop an event for a
    // missing optional field).
    if (typeof eventTimestampMs === 'number') {
      const { data: stateRow } = await supabase
        .from('webhook_user_state')
        .select('last_event_ms')
        .eq('user_id', userId)
        .maybeSingle();
      const lastMs = (stateRow?.last_event_ms as number | null) ?? null;
      // Audit round 2, hole #5: strict <, not <=. Dedupe by event id
      // already covers true redeliveries; <= would drop a distinct second
      // event created in the same millisecond (possible in bulk ops).
      if (lastMs !== null && eventTimestampMs < lastMs) {
        return json(request, { ok: true, eventType, skipped: true, reason: 'stale event' });
      }
    }

    // Audit must-fix #12: idempotency. Claim the event id before
    // processing; a duplicate delivery finds the claim and is skipped.
    // The claim is deleted if processing throws, so a genuine retry can
    // still land (RevenueCat retries failed endpoints).
    let claimedEventId: string | null = null;
    if (typeof eventId === 'string' && eventId.length > 0) {
      // Audit round 2, hole #3: distinguish a duplicate claim (23505 →
      // skip with 200) from any other insert failure (throw → 500 →
      // RevenueCat retries). The old code read any data-less insert as
      // "duplicate", so a missing table or transient DB error silently
      // lost a real subscription event.
      const { data: claimed, error: claimError } = await supabase
        .from('webhook_events')
        .insert({ event_id: eventId, user_id: userId, event_type: eventType })
        .select('event_id');
      if (claimError && claimError.code !== '23505') throw claimError;
      if (!claimed || claimed.length === 0) {
        return json(request, { ok: true, eventType, skipped: true, reason: 'duplicate event' });
      }
      claimedEventId = eventId;
    }

    try {
      if (GRANT_EVENTS.has(eventType)) {
        // Audit round 2, hole #5: preserve-on-empty applies to ALL grant
        // types, not just TRANSFER — any grant arriving with no
        // entitlements must never invent a subscriber-at-tier-0 row.
        const result = await syncJourneyStats(supabase, userId, entitlements, true, {
          preserveTierOnEmptyEntitlements: true,
        });
        if (result?.skipped) {
          return json(request, { ok: true, eventType, skipped: true, reason: result.skipped });
        }

        // Audit must-fix #12: TRANSFER used to grant the destination and
        // never revoke the source, so a transferred subscription stayed
        // live on both accounts forever (and no EXPIRATION ever fires for
        // the source). Revoke every source id the event names.
        if (eventType === 'TRANSFER') {
          const sources = payload.event?.transferred_from ?? [];
          for (const source of sources) {
            if (typeof source !== 'string' || !isUuid(source)) continue;
            const sourceUserId = await resolveTargetUserId(supabase, { event: { app_user_id: source } });
            if (sourceUserId && sourceUserId !== userId) {
              await syncJourneyStats(supabase, sourceUserId, [], false);
            }
          }
        }

        if (typeof eventTimestampMs === 'number') {
          await supabase
            .from('webhook_user_state')
            .upsert({ user_id: userId, last_event_ms: eventTimestampMs }, { onConflict: 'user_id' });
        }
        return json(request, { ok: true, eventType, isSubscriber: true, entitlements });
      }

      if (REVOKE_EVENTS.has(eventType)) {
        await syncJourneyStats(supabase, userId, [], false);
        if (typeof eventTimestampMs === 'number') {
          await supabase
            .from('webhook_user_state')
            .upsert({ user_id: userId, last_event_ms: eventTimestampMs }, { onConflict: 'user_id' });
        }
        return json(request, { ok: true, eventType, isSubscriber: false, entitlements: [] });
      }

      return json(request, { ok: true, eventType, skipped: true, reason: 'event not mapped yet' });
    } catch (error) {
      // Release the claim so a retry can reprocess this event.
      if (claimedEventId) {
        await supabase.from('webhook_events').delete().eq('event_id', claimedEventId);
      }
      throw error;
    }
  } catch {
    console.error('[revenuecat-webhook] request failed');
    return errorResponse(request, 'Webhook processing failed', 500);
  }
});
