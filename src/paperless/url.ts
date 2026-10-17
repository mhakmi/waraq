import { failure, type Result, success } from './errors';

export type ServerUrl = string & { readonly __brand: 'ServerUrl' };

export type ServerUrlError =
  | { kind: 'empty' }
  | { kind: 'malformed' }
  | { kind: 'unsupported_scheme'; scheme: string };

export function normalizeServerUrl(input: string): Result<ServerUrl, ServerUrlError> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return failure({ kind: 'empty' });
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed);
  const withScheme = schemeMatch ? trimmed : `https://${trimmed}`;
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return failure({ kind: 'unsupported_scheme', scheme });
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return failure({ kind: 'malformed' });
  }
  const hasExtraParts = parsed.username !== '' || parsed.search !== '' || parsed.hash !== '';
  if (parsed.hostname === '' || hasExtraParts) {
    return failure({ kind: 'malformed' });
  }

  let path = parsed.pathname.replace(/\/+$/, '');
  if (path.toLowerCase().endsWith('/api')) {
    path = path.slice(0, -'/api'.length).replace(/\/+$/, '');
  }
  return success(`${parsed.protocol}//${parsed.host}${path}` as ServerUrl);
}
