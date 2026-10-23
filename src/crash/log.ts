export type CrashKind = 'screen' | 'error' | 'fatal' | 'promise';

export type CrashEntry = {
  kind: CrashKind;
  time: Date;
  appVersion: string;
  android: string;
  message: string;
  stack: string;
};

export const crashLogLimitBytes = 64 * 1024;

const entryStart = '=== ';
const messageLimit = 2000;
const stackLimit = 8000;
const removed = '[removed]';

export function describeThrown(thrown: unknown): { message: string; stack: string } {
  if (thrown instanceof Error) {
    return { message: `${thrown.name}: ${thrown.message}`, stack: thrown.stack ?? '' };
  }
  try {
    return { message: typeof thrown === 'string' ? thrown : JSON.stringify(thrown), stack: '' };
  } catch {
    return { message: String(thrown), stack: '' };
  }
}

export function formatEntry(entry: CrashEntry): string {
  return [
    `${entryStart}${entry.time.toISOString()} ${entry.kind}`,
    `App ${entry.appVersion}, Android ${entry.android}`,
    entry.message.slice(0, messageLimit),
    entry.stack.slice(0, stackLimit),
    '',
  ].join('\n');
}

export type Secrets = { values: string[]; headerNames: string[] };

const secretNames = ['authorization', 'password', 'passwd', 'pwd', 'secret', 'token', 'api[_-]?key', 'cookie'];

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// An unquoted value runs to the end of the line, because a password may hold spaces and a cookie holds several pairs.
function patternsFor(headerNames: string[]): [RegExp, string][] {
  const name = `((?:${[...secretNames, ...headerNames.map(escapeForPattern)].join('|')})[\\w-]*)`;
  const separator = `(\\\\?["']?\\s*[:=,]\\s*)`;
  return [
    [/([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi, `$1${removed}@`],
    [/\b(Token|Bearer|Basic)\s+[\w.~+/=-]{6,}/gi, `$1 ${removed}`],
    [new RegExp(`${name}${separator}(\\\\["']).*?\\3`, 'gi'), `$1$2$3${removed}$3`],
    [new RegExp(`${name}${separator}(["'])(?:\\\\.|(?!\\3)[^\\\\])*\\3`, 'gi'), `$1$2$3${removed}$3`],
    [new RegExp(`${name}(\\s*[:=]\\s*)[^\\n"'&}\\]]+`, 'gi'), `$1$2${removed}`],
  ];
}

// The token and the custom header values are known, so they are taken out by value, as typed, URL-encoded, and escaped in JSON.
export function redact(text: string, secrets: Secrets): string {
  let clean = text;
  for (const value of secrets.values.filter((secret) => secret.length >= 4)) {
    for (const form of [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)]) {
      clean = clean.split(form).join(removed);
    }
  }
  for (const [pattern, replacement] of patternsFor(secrets.headerNames)) {
    clean = clean.replace(pattern, replacement);
  }
  return clean;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function appendRolling(log: string, entry: string, limitBytes: number = crashLogLimitBytes): string {
  const entries = [...log.split(/^(?==== )/m).filter((part) => part !== ''), entry];
  while (entries.length > 1 && byteLength(entries.join('')) > limitBytes) {
    entries.shift();
  }
  return entries.join('');
}
