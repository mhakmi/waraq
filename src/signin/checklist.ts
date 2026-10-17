import { copy } from '../copy';
import { type CheckStep, checkSteps, type Problem, type SignInFailure } from './connect';

export type Attempt = {
  address: string;
  host: string;
  isHttp: boolean;
  headerNames: string[];
  method: 'password' | 'token' | null;
  failure: SignInFailure;
};

export type ChecklistRow = {
  step: CheckStep;
  name: string;
  state: 'passed' | 'failed' | 'skipped';
  detail: string;
  fix: string | null;
};

function problemText(problem: Problem, host: string): { detail: string; fix: string } {
  const problems = copy.problems;
  switch (problem.kind) {
    case 'dns':
    case 'unreachable':
    case 'timeout':
    case 'tls_hostname':
    case 'http_public_host':
      return problems[problem.kind](host);
    case 'not_paperless':
    case 'server_error':
      return problems[problem.kind](host, problem.status);
    case 'too_old':
      return problems.too_old(problem.serverVersion);
    case 'tls_untrusted':
    case 'tls_other':
    case 'login_page':
    case 'bad_credentials':
    case 'bad_token':
    case 'mfa_invalid':
    case 'rate_limited':
    case 'unexpected':
      return problems[problem.kind]();
  }
}

function passedDetail(step: CheckStep, attempt: Attempt): string {
  const passed = copy.signIn.passed;
  switch (step) {
    case 'reached':
      return passed.reached(attempt.host);
    case 'secure':
      return attempt.isHttp ? passed.secureHttp : passed.secureHttps;
    case 'found':
      return passed.found;
    case 'signedIn':
      return passed.signedIn;
  }
}

export function checklistRows(attempt: Attempt): ChecklistRow[] {
  const failedIndex = checkSteps.indexOf(attempt.failure.step);
  return checkSteps.map((step, index) => {
    const name = copy.signIn.steps[step];
    if (index === failedIndex) {
      const text = problemText(attempt.failure.problem, attempt.host);
      return { step, name, state: 'failed', detail: text.detail, fix: text.fix };
    }
    if (index < failedIndex && attempt.failure.requestSent) {
      return { step, name, state: 'passed', detail: passedDetail(step, attempt), fix: null };
    }
    return { step, name, state: 'skipped', detail: copy.signIn.notTried, fix: null };
  });
}

export function connectionReport(attempt: Attempt, environment: { appVersion: string; android: string; now: Date }): string {
  const report = copy.signIn.report;
  const lines = [
    report.title,
    report.app(environment.appVersion, environment.android),
    report.time(environment.now.toISOString()),
    report.address(attempt.address),
    report.headers(attempt.headerNames),
    report.method[attempt.method ?? 'none'],
    '',
  ];
  for (const row of checklistRows(attempt)) {
    const text = row.fix === null ? row.detail : `${row.detail} ${row.fix}`;
    lines.push(`${row.name}: ${report.states[row.state]}. ${text}`);
  }
  if (attempt.failure.technical !== null) {
    lines.push('', report.technical(attempt.failure.technical));
  }
  return lines.join('\n');
}
