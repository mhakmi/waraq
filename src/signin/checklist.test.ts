import { describe, expect, test } from 'vitest';

import { type Attempt, checklistRows, connectionReport } from './checklist';

const wrongPassword: Attempt = {
  address: 'http://10.0.2.2:8010',
  host: '10.0.2.2:8010',
  isHttp: true,
  headerNames: ['CF-Access-Client-Id'],
  method: 'password',
  failure: { step: 'signedIn', problem: { kind: 'bad_credentials' }, technical: null, requestSent: true },
};

describe('checklistRows', () => {
  test('steps before the failure passed and the failed step names the cause and the fix', () => {
    expect(checklistRows(wrongPassword).map((row) => [row.state, row.detail, row.fix])).toEqual([
      ['passed', '10.0.2.2:8010 answered.', null],
      ['passed', 'Plain HTTP, allowed because this address is on your own network.', null],
      ['passed', 'Paperless-ngx 3.0 or newer answered.', null],
      ['failed', 'The username or password is wrong.', 'Check both and try again. Capital letters count.'],
    ]);
  });

  test('a refusal before any request passes no step', () => {
    const attempt: Attempt = {
      ...wrongPassword,
      address: 'http://paperless.example.com',
      host: 'paperless.example.com',
      method: null,
      failure: { step: 'secure', problem: { kind: 'http_public_host' }, technical: null, requestSent: false },
    };
    expect(checklistRows(attempt).map((row) => row.state)).toEqual(['skipped', 'failed', 'skipped', 'skipped']);
  });

  test('an account without view_uisettings is told which permission to ask the admin for', () => {
    const attempt: Attempt = {
      ...wrongPassword,
      failure: { step: 'signedIn', problem: { kind: 'no_ui_settings' }, technical: null, requestSent: true },
    };
    const failed = checklistRows(attempt)[3];
    expect(failed.state).toBe('failed');
    expect(failed.fix).toContain('admin');
    expect(failed.fix).toContain('view_uisettings');
  });

  test('steps after the failure were not tried', () => {
    const attempt: Attempt = {
      ...wrongPassword,
      method: null,
      failure: { step: 'found', problem: { kind: 'login_page' }, technical: null, requestSent: true },
    };
    expect(checklistRows(attempt).map((row) => [row.state, row.detail])).toEqual([
      ['passed', '10.0.2.2:8010 answered.'],
      ['passed', 'Plain HTTP, allowed because this address is on your own network.'],
      ['failed', 'Your proxy answered with its own login page.'],
      ['skipped', 'Not tried yet.'],
    ]);
  });
});

describe('connectionReport', () => {
  test('lists the setup and every step in plain text, with header names but no values', () => {
    const report = connectionReport(
      { ...wrongPassword, failure: { ...wrongPassword.failure, technical: 'HTTP 400' } },
      { appVersion: '0.1.0', android: '15', now: new Date('2026-10-17T12:00:00Z') },
    );
    expect(report).toBe(
      [
        'Waraq connection report',
        'App: Waraq 0.1.0 on Android 15',
        'Time: 2026-10-17T12:00:00.000Z',
        'Address entered: http://10.0.2.2:8010',
        'Custom headers: CF-Access-Client-Id (values left out)',
        'Sign-in method: username and password',
        '',
        'Reached the server: passed. 10.0.2.2:8010 answered.',
        'Secure connection: passed. Plain HTTP, allowed because this address is on your own network.',
        'Found Paperless-ngx: passed. Paperless-ngx 3.0 or newer answered.',
        'Signed in: failed. The username or password is wrong. Check both and try again. Capital letters count.',
        '',
        'Technical detail: HTTP 400',
      ].join('\n'),
    );
  });
});
