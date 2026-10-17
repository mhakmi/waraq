export type PaperlessError =
  | { kind: 'network'; message: string }
  | { kind: 'timeout' }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not_found' }
  | { kind: 'rate_limited' }
  | { kind: 'rejected'; status: number; body: string }
  | { kind: 'server'; status: number }
  | { kind: 'invalid_response'; message: string };

export type Result<Value, Failure = PaperlessError> =
  | { ok: true; value: Value }
  | { ok: false; error: Failure };

export function success<Value>(value: Value): { ok: true; value: Value } {
  return { ok: true, value };
}

export function failure<Failure>(error: Failure): { ok: false; error: Failure } {
  return { ok: false, error };
}

export function errorForStatus(status: number, body: string): PaperlessError {
  if (status === 401) {
    return { kind: 'unauthorized' };
  }
  if (status === 403) {
    return { kind: 'forbidden' };
  }
  if (status === 404) {
    return { kind: 'not_found' };
  }
  if (status === 429) {
    return { kind: 'rate_limited' };
  }
  if (status >= 500) {
    return { kind: 'server', status };
  }
  return { kind: 'rejected', status, body };
}

// Node's fetch puts the reason in the cause, for example ECONNREFUSED. OkHttp's message already holds it.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  if (!(cause instanceof Error)) {
    return error.message;
  }
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : '';
  return [error.message, cause.message, code].join(' ').trim();
}
