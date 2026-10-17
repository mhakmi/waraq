import type { ServerUrl } from '../paperless/url';

export type AccountId = string & { readonly __brand: 'AccountId' };

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
