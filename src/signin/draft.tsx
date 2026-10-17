import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

import type { Attempt } from './checklist';
import type { Server } from './connect';
import type { HeaderRow } from './headers';

export type SignInDraft = {
  address: string;
  headerRows: HeaderRow[];
  optionsOpen: boolean;
  server: Server | null;
  attempt: Attempt | null;
};

type DraftContextValue = SignInDraft & { update: (change: Partial<SignInDraft>) => void };

const DraftContext = createContext<DraftContextValue | null>(null);

const emptyDraft: SignInDraft = { address: '', headerRows: [], optionsOpen: false, server: null, attempt: null };

export function SignInDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(emptyDraft);
  const value = useMemo(
    () => ({ ...draft, update: (change: Partial<SignInDraft>) => setDraft((current) => ({ ...current, ...change })) }),
    [draft],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useSignInDraft(): DraftContextValue {
  const value = useContext(DraftContext);
  if (value === null) {
    throw new Error('useSignInDraft must be used inside SignInDraftProvider');
  }
  return value;
}
