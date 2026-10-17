import { z } from 'zod';

import type { ServerUrl } from '../paperless/url';

export const AccountId = z.string().min(1).brand<'AccountId'>();
export type AccountId = z.infer<typeof AccountId>;

// The id names secure-store keys, which allow only letters, digits, '.', '-', and '_'.
export function accountIdFor(serverUrl: ServerUrl, username: string): AccountId {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(`${serverUrl}\n${username}`)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return AccountId.parse(hash.toString(16).padStart(16, '0'));
}
