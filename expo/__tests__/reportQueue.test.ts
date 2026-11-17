// GPT-6 item 12 (2026-11-16): the moderator report queue — reason
// vocabulary + labels (pure), getReportQueue mapping, and the
// 'dismiss' moderation action. DatabaseService parts use the same
// I/O-boundary mock strategy as databaseAmen.test.ts.
import { DatabaseService } from '@/lib/database';
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  isReportReason,
  reportReasonLabel,
} from '@/lib/moderation';

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: {} },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => (mockRpc as unknown as (...a: unknown[]) => unknown)(...args),
  },
  getSafeSession: async () => ({ user: { id: 'user-1' } }),
  hasAnonymousSession: async () => false,
  signInAnonymously: async () => null,
}));

describe('report reasons — vocabulary', () => {
  it('covers the brief: harassment, personal information, self-harm/threat, and the rest', () => {
    expect(REPORT_REASONS).toEqual([
      'harassment',
      'personal_info',
      'self_harm',
      'threat',
      'spam',
      'inappropriate',
      'other',
    ]);
    for (const reason of REPORT_REASONS) {
      expect(typeof REPORT_REASON_LABELS[reason]).toBe('string');
      expect(REPORT_REASON_LABELS[reason].length).toBeGreaterThan(0);
    }
  });

  it('labels known codes and passes legacy free text through verbatim', () => {
    expect(reportReasonLabel('harassment')).toBe('Harassment or bullying');
    expect(reportReasonLabel('personal_info')).toBe('Personal information');
    expect(reportReasonLabel('self_harm')).toBe('Self-harm');
    expect(reportReasonLabel('threat')).toBe('Threat of harm');
    expect(reportReasonLabel('offensive language')).toBe('offensive language');
    expect(isReportReason('spam')).toBe(true);
    expect(isReportReason('offensive language')).toBe(false);
    expect(isReportReason(null)).toBe(false);
  });
});

describe('DatabaseService.getReportQueue', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('maps a visible reported post (null hiddenAt) and a hidden pure hold', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          kind: 'echo',
          id: 'echo-1',
          preview: 'Please pray',
          author_id: 'author-1',
          first_name: null,
          created_at: '2026-11-16T10:00:00.000Z',
          hidden_at: null,
          hidden_reason: null,
          report_count: 2,
          first_reported_at: '2026-11-16T11:00:00.000Z',
          recent_reasons: ['harassment', 'spam'],
        },
        {
          kind: 'testimony',
          id: 'test-1',
          preview: 'God answered',
          author_id: 'author-2',
          first_name: 'A friend',
          created_at: '2026-11-15T10:00:00.000Z',
          hidden_at: '2026-11-15T12:00:00.000Z',
          hidden_reason: 'hold:self_harm',
          report_count: 0,
          first_reported_at: null,
          recent_reasons: null,
        },
      ],
      error: null,
    });

    const rows = await DatabaseService.getReportQueue({ limit: 50, offset: 0 });
    expect(mockRpc).toHaveBeenCalledWith('get_report_queue', { p_limit: 50, p_offset: 0 });
    expect(rows).toEqual([
      {
        kind: 'echo',
        id: 'echo-1',
        preview: 'Please pray',
        authorId: 'author-1',
        firstName: null,
        createdAt: '2026-11-16T10:00:00.000Z',
        hiddenAt: null,
        hiddenReason: null,
        reportCount: 2,
        firstReportedAt: '2026-11-16T11:00:00.000Z',
        recentReasons: ['harassment', 'spam'],
      },
      {
        kind: 'testimony',
        id: 'test-1',
        preview: 'God answered',
        authorId: 'author-2',
        firstName: 'A friend',
        createdAt: '2026-11-15T10:00:00.000Z',
        hiddenAt: '2026-11-15T12:00:00.000Z',
        hiddenReason: 'hold:self_harm',
        reportCount: 0,
        firstReportedAt: null,
        recentReasons: null,
      },
    ]);
  });

  it('throws the RPC error instead of failing to an empty queue', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Not a moderator' } });
    await expect(DatabaseService.getReportQueue()).rejects.toMatchObject({ message: 'Not a moderator' });
  });
});

describe('DatabaseService.moderateWallPost — dismiss', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("passes 'dismiss' through to moderate_wall_post", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await DatabaseService.moderateWallPost('echo', 'echo-1', 'dismiss');
    expect(mockRpc).toHaveBeenCalledWith('moderate_wall_post', {
      p_kind: 'echo',
      p_id: 'echo-1',
      p_action: 'dismiss',
    });
  });
});
