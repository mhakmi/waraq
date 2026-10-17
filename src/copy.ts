import brand from './brand.json';

export const copy = {
  appName: brand.displayName,

  shell: {
    inbox: 'Inbox',
    documents: 'Documents',
    uploads: 'Uploads',
    scan: 'Scan',
    back: 'Back',
  },

  placeholder: {
    comingSoon: 'Coming in the next build.',
  },

  crash: {
    heading: 'Something went wrong',
    lead: `${brand.displayName} hit a problem it did not expect. Your documents on the server are not affected.`,
    tryAgain: 'Try again',
  },

  signIn: {
    heading: 'Connect to your server',
    lead: `${brand.displayName} works with your own Paperless-ngx server.`,
    addressLabel: 'Server address',
    addressPlaceholder: 'paperless.example.com',
    addressHelp: 'The address you use to open Paperless-ngx in a browser.',
    addressInvalid: 'Enter an address like paperless.example.com or http://192.168.1.20:8000.',
    continue: 'Continue',
    optionsTitle: 'Connection options',
    optionsSummary: 'Custom headers, client certificate',
    headersTitle: 'Custom headers',
    headersHelp:
      "For a proxy in front of your server, such as Cloudflare Access. Your proxy's documentation lists the headers it needs.",
    headerName: 'Name',
    headerValue: 'Value',
    removeHeader: (name: string) => (name === '' ? 'Remove this header' : `Remove the header ${name}`),
    addHeader: 'Add a header',
    headerProblems: {
      bad_name: (name: string) => `"${name}" cannot be a header name. Use letters, numbers, and dashes.`,
      bad_value: (name: string) => `The value of ${name} cannot hold a line break.`,
      reserved: (name: string) => `${brand.displayName} sets ${name} itself, so it cannot be a custom header.`,
      duplicate: (name: string) => `${name} is in the list twice.`,
      missing_name: () => 'A header has a value but no name.',
    },
    certificateTitle: 'Client certificate',
    certificateHelp: 'For servers that ask the app to prove who it is.',
    comingLater: 'Coming later',

    found: (host: string) => `Found Paperless-ngx 3.0 or newer at ${host}`,
    change: 'Change',
    plainHttpWarning: 'This connection is not encrypted. Use HTTPS if your server has it.',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    tokenLabel: 'API token',
    tokenHelp: 'In Paperless-ngx, open My profile and copy the API auth token.',
    signIn: 'Sign in',
    useToken: 'Use an API token instead',
    usePassword: 'Use a username and password instead',
    codeAsked: 'Your server asks for a sign-in code.',
    codeLabel: 'Code from your authenticator app',
    codePlaceholder: '6 digits',

    failedHeading: "Couldn't sign in",
    failedLead: 'Here is how far the connection got.',
    openOptions: 'Open Connection options',
    tryAgain: 'Try again',
    copyReport: 'Copy connection report',
    reportCopied: 'Report copied',

    steps: {
      reached: 'Reached the server',
      secure: 'Secure connection',
      found: 'Found Paperless-ngx',
      signedIn: 'Signed in',
    },
    passed: {
      reached: (host: string) => `${host} answered.`,
      secureHttps: 'The certificate is valid.',
      secureHttp: 'Plain HTTP, allowed because this address is on your own network.',
      found: 'Paperless-ngx 3.0 or newer answered.',
      signedIn: 'Signed in.',
    },
    notTried: 'Not tried yet.',

    report: {
      title: `${brand.displayName} connection report`,
      app: (version: string, android: string) => `App: ${brand.displayName} ${version} on Android ${android}`,
      time: (iso: string) => `Time: ${iso}`,
      address: (address: string) => `Address entered: ${address}`,
      headers: (names: string[]) =>
        names.length === 0 ? 'Custom headers: none' : `Custom headers: ${names.join(', ')} (values left out)`,
      method: {
        none: 'Sign-in method: not reached',
        password: 'Sign-in method: username and password',
        token: 'Sign-in method: API token',
      },
      states: { passed: 'passed', failed: 'failed', skipped: 'not tried' },
      technical: (detail: string) => `Technical detail: ${detail}`,
    },
  },

  problems: {
    dns: (host: string) => ({
      detail: `No server called ${host} was found.`,
      fix: 'Check the address. For a server at home, connect to your home network or VPN first.',
    }),
    unreachable: (host: string) => ({
      detail: `${host} did not accept the connection.`,
      fix: 'Check the address and the port, and that the server is running.',
    }),
    timeout: (host: string) => ({
      detail: `${host} did not answer in time.`,
      fix: 'Check that your phone can reach the server, then try again.',
    }),
    tls_untrusted: () => ({
      detail: "The server's certificate is not trusted by this phone.",
      fix: 'If your server uses its own certificate authority, install it in Android settings under Security, Encryption and credentials, Install a certificate. Then try again.',
    }),
    tls_hostname: (host: string) => ({
      detail: `The server's certificate is not made for ${host}.`,
      fix: 'Use the address that the certificate was made for.',
    }),
    tls_other: () => ({
      detail: 'A secure connection could not be set up.',
      fix: 'Check that the server answers HTTPS on this address and port.',
    }),
    http_public_host: (host: string) => ({
      detail: `${host} is on the internet, and plain HTTP can be read by anyone along the way.`,
      fix: 'Use https:// for this server. Plain HTTP works only for addresses on your own network.',
    }),
    login_page: () => ({
      detail: 'Your proxy answered with its own login page.',
      fix: "Add the proxy's headers in Connection options.",
    }),
    not_paperless: (host: string, status: number) => ({
      detail: `${host} answered, but not as Paperless-ngx does (HTTP ${status}).`,
      fix: 'Check the address. If Paperless-ngx runs under a path, add the path, for example example.com/paperless.',
    }),
    server_error: (host: string, status: number) => ({
      detail: `${host} had an error (HTTP ${status}).`,
      fix: "Check the server's logs, then try again.",
    }),
    too_old: (serverVersion: string | null) => ({
      detail:
        serverVersion === null
          ? 'This server runs a Paperless-ngx older than 3.0.'
          : `This server runs Paperless-ngx ${serverVersion}.`,
      fix: `${brand.displayName} needs Paperless-ngx 3.0 or newer. Update the server, then try again.`,
    }),
    bad_credentials: () => ({
      detail: 'The username or password is wrong.',
      fix: 'Check both and try again. Capital letters count.',
    }),
    bad_token: () => ({
      detail: 'The server did not accept this API token.',
      fix: 'Copy the token again from My profile in Paperless-ngx.',
    }),
    mfa_invalid: () => ({
      detail: 'The sign-in code was wrong or has expired.',
      fix: 'Enter the code your authenticator app shows now.',
    }),
    rate_limited: () => ({
      detail: 'The server is turning sign-ins away for now, because of too many tries.',
      fix: 'Wait a minute, then try again.',
    }),
    unexpected: () => ({
      detail: `The server sent an answer that ${brand.displayName} did not expect.`,
      fix: 'Copy the connection report and include it when you ask for help.',
    }),
  },
};
