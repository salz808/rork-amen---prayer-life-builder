import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single React Query client, owned by _layout.tsx's provider.
 * Extracted here (audit round 4, L1) so AppProvider's sign-out /
 * delete-account paths can clear it: without this, the ['appState'] query
 * kept the previous user's data in memory after sign-out, and a refetch
 * failure after a new sign-in could resurface it.
 */
export const queryClient = new QueryClient();

export function clearAppQueryCache(): void {
  queryClient.clear();
}
