import * as Linking from 'expo-linking';
import { Share } from 'react-native';
import { getSafeSession, supabase } from './supabase';
import { Circle, CirclePreview, UserTier } from '@/types';

export interface CircleLimits {
  circles: number;
  members: number;
}

const FREE_LIMITS: CircleLimits = { circles: 1, members: 3 };
const PAID_LIMITS: CircleLimits = { circles: 10, members: 20 };

export function getCircleLimits(tier: UserTier): CircleLimits {
  return tier >= UserTier.SUPPORT ? PAID_LIMITS : FREE_LIMITS;
}

export function normalizeJoinCode(code: string): string {
  // Audit round 4, lane 5 (CIRC-1): codes are 6..10 chars since migration
  // 20261025000012 (new codes are 10 chars from a 31-symbol alphabet;
  // legacy 6-hex codes keep working). Never truncate a valid code.
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

export function buildCircleInviteLink(joinCode: string): string {
  return Linking.createURL(`circle/join/${normalizeJoinCode(joinCode)}`);
}

export function buildCircleInviteMessage(name: string, joinCode: string): string {
  const code = normalizeJoinCode(joinCode);
  return (
    `You're invited to pray with me in "${name}" on TRIAD Prayer.\n\n` +
    `Open this link on your phone to join:\n${buildCircleInviteLink(code)}\n\n` +
    `Or open TRIAD Prayer → Circles → Join a circle, and enter the code ${code}.`
  );
}

export async function shareCircleInvite(name: string, joinCode: string): Promise<void> {
  await Share.share({ message: buildCircleInviteMessage(name, joinCode) });
}

interface CircleRpcRow {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
  created_at: string;
  member_count: number | string;
}

interface CircleEmbed {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
}

function unwrapRpcRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as T | null;
}

function mapRpcCircle(row: CircleRpcRow, role: Circle['role']): Circle {
  return {
    id: row.id,
    name: row.name,
    joinCode: normalizeJoinCode(row.join_code),
    role,
    memberCount: Number(row.member_count ?? 1),
    createdAt: row.created_at,
  };
}

function mapRpcError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('Circles are not available')) {
    return 'Circles aren’t available yet.';
  }
  if (message.includes('Please sign in to use circles')) {
    return 'Please sign in to use circles.';
  }
  if (message.includes('Too many')) {
    return 'Too many attempts. Try again later.';
  }
  if (message.includes('Circle limit reached')) {
    return 'You’ve reached your circle limit.';
  }
  if (message.includes('Circle not found')) {
    return 'That invite code doesn’t match a circle. Check the code and try again.';
  }
  if (message.includes('circle is full')) {
    return 'This circle is full.';
  }
  if (message.includes('Authentication required')) {
    return 'Please sign in again, then try once more.';
  }
  return 'Something went wrong. Check your connection and try again.';
}

export function describeCircleError(error: unknown): string {
  return mapRpcError(error);
}

export async function getMyCircles(): Promise<Circle[]> {
  if (!supabase) return [];
  const session = await getSafeSession();
  const userId = session?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('circle_members')
    .select('role, circle_id, circles!inner(id, name, join_code, created_at)')
    .eq('user_id', userId);

  if (error) throw error;

  // Postgrest types embedded rows as arrays even for to-one joins — normalize.
  const rows = (data ?? []) as {
    role: string;
    circle_id: string;
    circles: CircleEmbed | CircleEmbed[];
  }[];

  const memberships = rows
    .map((row) => ({
      role: row.role,
      circleId: row.circle_id,
      circle: Array.isArray(row.circles) ? row.circles[0] : row.circles,
    }))
    .filter(
      (m): m is { role: string; circleId: string; circle: CircleEmbed } =>
        m.circle != null
    );

  if (memberships.length === 0) return [];

  const circleIds: string[] = memberships.map((m) => m.circleId);
  const { data: memberRows, error: memberError } = await supabase
    .from('circle_members')
    .select('circle_id')
    .in('circle_id', circleIds);

  if (memberError) throw memberError;

  const counts = new Map<string, number>();
  for (const row of (memberRows ?? []) as { circle_id: string }[]) {
    counts.set(row.circle_id, (counts.get(row.circle_id) ?? 0) + 1);
  }

  return memberships.map((m) => ({
    id: m.circle.id,
    name: m.circle.name,
    joinCode: normalizeJoinCode(m.circle.join_code),
    role: m.role === 'owner' ? ('owner' as const) : ('member' as const),
    memberCount: counts.get(m.circleId) ?? 1,
    createdAt: m.circle.created_at,
  }));
}

export async function createCircle(name: string): Promise<Circle> {
  if (!supabase) throw new Error('Supabase is not configured');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Please give your circle a name.');

  const { data, error } = await supabase.rpc('create_prayer_circle', { p_name: trimmed });
  if (error) throw error;

  const row = unwrapRpcRow<CircleRpcRow>(data);
  if (!row) throw new Error('Your circle could not be created.');
  return mapRpcCircle(row, 'owner');
}

export async function joinCircleByCode(code: string): Promise<Circle> {
  if (!supabase) throw new Error('Supabase is not configured');
  const normalized = normalizeJoinCode(code);
  if (normalized.length < 6 || normalized.length > 10) {
    throw new Error('Invite codes are 6–10 characters.');
  }

  const { data, error } = await supabase.rpc('join_prayer_circle', { p_code: normalized });
  if (error) throw error;

  const row = unwrapRpcRow<CircleRpcRow>(data);
  if (!row) throw new Error('That invite code doesn’t match a circle.');
  return mapRpcCircle(row, 'member');
}

export async function previewCircle(code: string): Promise<CirclePreview> {
  if (!supabase) throw new Error('Supabase is not configured');
  const normalized = normalizeJoinCode(code);
  if (normalized.length < 6 || normalized.length > 10) {
    throw new Error('That invite code doesn’t match a circle.');
  }

  const { data, error } = await supabase.rpc('preview_prayer_circle', { p_code: normalized });
  if (error) throw error;

  const row = unwrapRpcRow<{
    id: string;
    name: string;
    member_count: number | string;
    is_member: boolean;
  }>(data);
  if (!row) throw new Error('That invite code doesn’t match a circle.');

  return {
    id: row.id,
    name: row.name,
    memberCount: Number(row.member_count ?? 1),
    isMember: row.is_member === true,
  };
}

export async function leaveCircle(circleId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('leave_prayer_circle', { p_circle_id: circleId });
  if (error) throw error;
}

export async function deleteCircle(circleId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('delete_prayer_circle', { p_circle_id: circleId });
  if (error) throw error;
}
