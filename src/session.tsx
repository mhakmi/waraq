import { fetch } from 'expo/fetch';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearAccount, loadAccount, saveAccount } from './account/store';
import { queryPersister } from './cache/persister';
import type { StoredAccount } from './account/types';
import { createPaperlessClient, type PaperlessClient } from './paperless/client';
import { queryClient } from './query';
import { clearRecentSearches } from './search/store';

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; stored: StoredAccount };

type SessionContextValue = {
  state: SessionState;
  signIn: (stored: StoredAccount) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ kind: 'loading' });

  useEffect(() => {
    loadAccount()
      .then((stored) => {
        setState(stored === null ? { kind: 'signedOut' } : { kind: 'signedIn', stored });
      })
      .catch(() => {
        setState({ kind: 'signedOut' });
      });
  }, []);

  const signIn = useCallback(async (stored: StoredAccount) => {
    await saveAccount(stored);
    setState({ kind: 'signedIn', stored });
  }, []);

  const signOut = useCallback(async () => {
    if (state.kind === 'signedIn') {
      await clearAccount(state.stored.account.id);
      await clearRecentSearches(state.stored.account.id);
    }
    queryClient.clear();
    await queryPersister.removeClient();
    setState({ kind: 'signedOut' });
  }, [state]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}

export function useSignedIn(): StoredAccount {
  const { state } = useSession();
  if (state.kind !== 'signedIn') {
    throw new Error('useSignedIn must be used on a screen behind the sign-in guard');
  }
  return state.stored;
}

// Uploads come in a later build, so this client takes no files.
export type AppClient = PaperlessClient<never>;

export function useClient(): AppClient {
  const { account, secrets } = useSignedIn();
  return useMemo(
    () =>
      createPaperlessClient<never>({
        baseUrl: account.serverUrl,
        auth: { kind: 'token', token: secrets.token },
        extraHeaders: secrets.headerValues,
        fetch,
        appendFile: () => {},
      }),
    [account, secrets],
  );
}
