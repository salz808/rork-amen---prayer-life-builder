// GPT-6 item 16 (2026-11-16): clearGuestWallActivity calls the
// clear_guest_wall_activity RPC for anonymous sessions only, sets the
// keep-local marker, then clears ONLY the local session — never the
// provider sign-out that would wipe local prayer progress.
import {
  clearGuestWallActivity,
  consumeGuestClearKeepLocalMarker,
  GUEST_CLEAR_KEEP_LOCAL_KEY,
} from '@/lib/clearGuestActivity';

const mockRpc = jest.fn();
const mockSignOut = jest.fn();
const mockHasAnonymousSession = jest.fn();
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRemoveItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => (mockGetItem as unknown as (...a: unknown[]) => unknown)(...args),
    setItem: (...args: unknown[]) => (mockSetItem as unknown as (...a: unknown[]) => unknown)(...args),
    removeItem: (...args: unknown[]) => (mockRemoveItem as unknown as (...a: unknown[]) => unknown)(...args),
    multiRemove: async () => undefined,
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => (mockRpc as unknown as (...a: unknown[]) => unknown)(...args),
    auth: {
      signOut: (...args: unknown[]) => (mockSignOut as unknown as (...a: unknown[]) => unknown)(...args),
    },
  },
  getSafeSession: async () => null,
  hasAnonymousSession: (...args: unknown[]) =>
    (mockHasAnonymousSession as unknown as (...a: unknown[]) => unknown)(...args),
  signInAnonymously: async () => null,
}));

describe('clearGuestWallActivity', () => {
  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
    mockSignOut.mockReset().mockResolvedValue({ data: null, error: null });
    mockHasAnonymousSession.mockReset().mockResolvedValue(true);
    mockGetItem.mockReset().mockResolvedValue(null);
    mockSetItem.mockReset().mockResolvedValue(undefined);
    mockRemoveItem.mockReset().mockResolvedValue(undefined);
  });

  it('(a) anonymous session: RPC, then keep-local marker, then local-only sign-out', async () => {
    await clearGuestWallActivity();

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('clear_guest_wall_activity');
    expect(mockSetItem).toHaveBeenCalledWith(GUEST_CLEAR_KEEP_LOCAL_KEY, '1');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    // Order: the marker must be set before the sign-out fires the
    // provider's passive path, or the local progress wipe runs.
    expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(mockSetItem.mock.invocationCallOrder[0]);
    expect(mockSetItem.mock.invocationCallOrder[0]).toBeLessThan(mockSignOut.mock.invocationCallOrder[0]);
  });

  it('(b) signed-in session: throws and touches nothing', async () => {
    mockHasAnonymousSession.mockResolvedValue(false);

    await expect(clearGuestWallActivity()).rejects.toThrow('No guest session to clear');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('(c) RPC failure: throws, no marker, no sign-out', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(clearGuestWallActivity()).rejects.toMatchObject({ message: 'boom' });
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('consumeGuestClearKeepLocalMarker', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockRemoveItem.mockReset().mockResolvedValue(undefined);
  });

  it('returns true and removes the marker when set', async () => {
    mockGetItem.mockResolvedValue('1');

    await expect(consumeGuestClearKeepLocalMarker()).resolves.toBe(true);
    expect(mockRemoveItem).toHaveBeenCalledWith(GUEST_CLEAR_KEEP_LOCAL_KEY);
  });

  it('returns false and removes nothing when unset', async () => {
    mockGetItem.mockResolvedValue(null);

    await expect(consumeGuestClearKeepLocalMarker()).resolves.toBe(false);
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it('returns false for any other stored value', async () => {
    mockGetItem.mockResolvedValue('0');

    await expect(consumeGuestClearKeepLocalMarker()).resolves.toBe(false);
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });
});
