import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import type { PaperlessError, Result } from './paperless/errors';

function worthRetrying(failureCount: number, error: Error): boolean {
  const refused = error instanceof RequestFailed && (error.failure.kind === 'unauthorized' || error.failure.kind === 'forbidden');
  return !refused && failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: worthRetrying },
  },
});

export function connectQueriesToDevice(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    }),
  );
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
  return () => subscription.remove();
}

export class RequestFailed extends Error {
  constructor(readonly failure: PaperlessError) {
    super(failure.kind);
  }
}

export async function unwrap<Value>(request: Promise<Result<Value>>): Promise<Value> {
  const result = await request;
  if (!result.ok) {
    throw new RequestFailed(result.error);
  }
  return result.value;
}
