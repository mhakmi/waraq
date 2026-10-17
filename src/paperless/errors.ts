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
