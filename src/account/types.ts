import type { ServerUrl } from '../paperless/url';
import type { AccountId } from './id';

export type { AccountId };

export type ServerAccount = {
  id: AccountId;
  serverUrl: ServerUrl;
  username: string;
  serverVersion: string;
  apiVersion: number;
  extraHeaders: string[];
  addedAt: number;
};

export type AccountSecrets = {
  token: string;
  headerValues: Record<string, string>;
};

export type StoredAccount = { account: ServerAccount; secrets: AccountSecrets };
