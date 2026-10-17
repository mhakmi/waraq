import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { copy } from './copy';
import type { PaperlessError, Result } from './paperless/errors';

function worthRetrying(failureCount: number, error: Error): boolean {
  const refused = error instanceof RequestFailed && (error.failure.kind === 'unauthorized' || error.failure.kind === 'forbidden');
  return !refused && failureCount < 2;
}

export const savedForMs = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: savedForMs, retry: worthRetrying },
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

export function isForbidden(error: Error | null): boolean {
  return error instanceof RequestFailed && error.failure.kind === 'forbidden';
}

export function errorText(error: Error | null, forbidden: string = copy.errors.forbidden): string {
  if (!(error instanceof RequestFailed)) {
    return copy.errors.other;
  }
  switch (error.failure.kind) {
    case 'network':
    case 'timeout':
    case 'server':
      return copy.errors.network;
    case 'unauthorized':
      return copy.errors.signedOut;
    case 'forbidden':
      return forbidden;
    case 'not_found':
      return copy.errors.notFound;
    default:
      return copy.errors.other;
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
}
