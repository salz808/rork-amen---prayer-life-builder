import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json, safeCompare } from '../_shared/http.ts';
import { createAdminClient } from '../_shared/supabase.ts';

type RevenueCatEvent = {
  event?: {
    type?: string;
    app_user_id?: string;
    entitlement_ids?: string[];
    product_id?: string;
    transferred_from?: string[];
    transferred_to?: string[];
    original_app_user_id?: string;
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

const REVOKE_EVENTS = new Set([
  'EXPIRATION',
  'CANCELLATION',
  'REFUND',
]);

const TIER_HIERARCHY: Record<string, UserTier> = {
  support: 1,
  missions: 2,
  partner: 3,
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

function extractTargetUserId(payload: RevenueCatEvent): string | null {
  const candidates = [
    payload.event?.app_user_id,
    payload.event?.original_app_user_id,
    payload.event?.transferred_to?.[0],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && isUuid(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function syncJourneyStats(userId: string, entitlements: string[], isSubscriber: boolean) {
  const supabase = createAdminClient();
  const tierLevel = getHighestTier(entitlements);

  const { error } = await supabase
    .from('journey_stats')
    .update({
      is_subscriber: isSubscriber,
      tier_level: tierLevel,
    })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
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
    const entitlements = getEntitlements(payload);
    const userId = extractTargetUserId(payload);

    if (eventType === 'TEST') {
      return json(request, { ok: true, eventType, skipped: true, reason: 'test event' });
    }

    if (!userId) {
      return json(request, { ok: true, eventType, skipped: true, reason: 'no UUID app_user_id found' });
    }

    if (GRANT_EVENTS.has(eventType)) {
      await syncJourneyStats(userId, entitlements, true);
      return json(request, { ok: true, eventType, userId, isSubscriber: true, entitlements });
    }

    if (REVOKE_EVENTS.has(eventType)) {
      await syncJourneyStats(userId, [], false);
      return json(request, { ok: true, eventType, userId, isSubscriber: false, entitlements: [] });
    }

    return json(request, { ok: true, eventType, skipped: true, reason: 'event not mapped yet' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[revenuecat-webhook] request failed');
    return errorResponse(request, message, 500);
  }
});
