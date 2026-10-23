import brand from './brand.json';
import type { RowCorrespondent } from './inbox/rows';

export const copy = {
  appName: brand.displayName,
  locale: 'en-CA',

  shell: {
    inbox: 'Inbox',
    documents: 'Documents',
    uploads: 'Uploads',
    scan: 'Scan',
    back: 'Back',
    account: 'Account',
  },

  account: {
    signOutTitle: 'Sign out?',
    signOutMessage: (username: string, host: string) => `You are signed in as ${username} on ${host}.`,
    signOutWithUploads: (count: number) =>
      count === 1
        ? 'One upload is not finished. It waits until this account signs in again.'
        : `${count} uploads are not finished. They wait until this account signs in again.`,
    signOut: 'Sign out',
    cancel: 'Cancel',
  },

  errors: {
    network: 'Your server could not be reached. Check your connection, then try again.',
    signedOut: 'The server no longer accepts this sign-in. Sign out and sign in again.',
    forbidden: 'Your account may not do this. Ask the server admin.',
    notFound: 'This document is no longer on your server.',
    other: 'Your server sent an answer that could not be read. Try again in a moment.',
  },

  offline: {
    savedCopy: 'Offline, showing saved copy',
  },

  inbox: {
    newCount: (count: number) => `${count} new`,
    groups: { today: 'Today', week: 'This week', earlier: 'Earlier' },
    meta: (correspondent: RowCorrespondent, created: string) => {
      switch (correspondent.kind) {
        case 'named':
          return `${correspondent.name} · ${created}`;
        case 'none':
          return `No correspondent · ${created}`;
        case 'unknown':
          return created;
      }
    },
    emptyTitle: 'Your inbox is empty',
    emptyLead: 'New documents show here when your server adds them.',
    noInboxTagTitle: 'Your server has no inbox tag',
    noInboxTagLead: 'In Paperless-ngx, edit a tag and turn on Inbox tag. New documents get it, and they show here.',
    offlineTitle: 'You are offline',
    offlineLead: 'The inbox loads when your phone is back online.',
    errorTitle: 'The inbox could not load',
    forbidden: 'Your account may not view documents. Ask the server admin.',
    tryAgain: 'Try again',
    done: 'Done',
    doneLabel: (title: string) => `Done with ${title}`,
    doneHint: 'Done removes the inbox tag.',
    marked: 'Marked done. Inbox tag removed.',
    undo: 'Undo',
    doneFailed: (title: string) => `${title} is still in the inbox. Check your connection, then try again.`,
    undoFailed: (title: string) => `${title} could not go back to the inbox. Check your connection, then try again.`,
  },

  documents: {
    searchPlaceholder: 'Search documents',
    clearSearch: 'Clear search',
    filters: 'Filters',
    filtersSet: (count: number) => `Filters, ${count} set`,
    count: (count: number) => (count === 1 ? '1 document' : `${count} documents`),
    sortTitle: 'Sort',
    sorts: {
      newest: 'Newest first',
      oldest: 'Oldest first',
      added: 'Recently added',
      title: 'Title, A to Z',
    },
    bestMatch: 'Best match',
    viewOrder: 'Order of the view',
    viewUnusable: (name: string) => `The view ${name} uses a rule this app does not know yet.`,
    emptyTitle: 'No documents match',
    emptyLead: 'Change the search or the filters.',
    noDocumentsTitle: 'No documents yet',
    noDocumentsLead: 'Documents show here when your server has them.',
    offlineTitle: 'You are offline',
    offlineLead: 'Documents load when your phone is back online.',
    errorTitle: 'The documents could not load',
    tryAgain: 'Try again',
  },

  search: {
    suggestions: 'Suggestions',
    labels: 'Labels',
    recent: 'Recent searches',
    clear: 'Clear',
    kinds: {
      tag: 'Tag',
      correspondent: 'Correspondent',
      documentType: 'Document type',
      storagePath: 'Storage path',
    },
  },

  filters: {
    title: 'Filters',
    clearAll: 'Clear all',
    tags: 'Tags',
    hasAll: 'Has all',
    hasAny: 'Has any',
    addTag: 'Add tag',
    removeTag: (name: string) => `Remove ${name}`,
    correspondent: 'Correspondent',
    documentType: 'Document type',
    created: 'Created',
    from: 'From',
    to: 'To',
    any: 'Any',
    clearDate: (label: string) => `Clear ${label}`,
    storagePath: 'Storage path',
    show: (count: number | undefined) =>
      count === undefined ? 'Show documents' : count === 1 ? 'Show 1 document' : `Show ${count} documents`,
  },

  picker: {
    search: 'Search',
    none: 'None',
    any: 'Any',
    done: 'Done',
    close: 'Close',
    nothingMatches: 'Nothing matches.',
    createTag: (name: string) => `Create the tag "${name}"`,
    createCorrespondent: (name: string) => `Create the correspondent "${name}"`,
    createFailed: 'The label could not be made. Check your connection, then try again.',
  },

  detail: {
    share: 'Share',
    openWith: 'Open with',
    more: 'More',
    download: 'Download',
    delete: 'Delete',
    previewHint: 'Tap to open',
    openDocument: (title: string) => `Open ${title}`,
    opening: 'Getting the file',
    details: 'Details',
    correspondent: 'Correspondent',
    documentType: 'Document type',
    created: 'Created',
    tags: 'Tags',
    storagePath: 'Storage path',
    archiveNumber: 'Archive number',
    notSet: 'None',
    fieldWords: {
      yes: 'Yes',
      no: 'No',
      linkedDocuments: (count: number) => (count === 1 ? '1 linked document' : `${count} linked documents`),
    },
    notes: 'Notes',
    addNote: 'Add a note',
    noteBy: (username: string, date: string) => `${username} · ${date}`,
    noteFailed: 'The note could not be saved. Check your connection, then try again.',
    textFound: 'Text found in the document',
    noText: 'Your server found no text in this document.',
    edit: 'Edit',
    deleteTitle: 'Delete this document?',
    deleteMessage: (title: string) => `${title} goes to the trash on your server.`,
    deleteFailed: 'The document could not be deleted. Check your connection, then try again.',
    cancel: 'Cancel',
    noApp: 'No app on this phone opens this kind of file. Install a PDF reader, then try again.',
    fileFailed: 'The file could not be fetched. Check your connection, then try again.',
    saved: 'Saved to the folder you picked.',
    saveFailed: 'The file could not be saved in that folder. Pick another folder, then try again.',
    errorTitle: 'This document could not load',
    tryAgain: 'Try again',
    offlineTitle: 'You are offline',
    offlineLead: 'This document loads when your phone is back online.',
  },

  edit: {
    title: 'Edit details',
    cancel: 'Cancel',
    save: (count: number) => (count === 0 ? 'Save' : count === 1 ? 'Save 1 change' : `Save ${count} changes`),
    changed: 'Changed',
    onlyChanges: 'Only the fields you change are sent to your server.',
    titleLabel: 'Title',
    titleEmpty: 'Enter a title.',
    archiveInvalid: 'Enter a whole number, or leave it empty.',
    addTag: 'Add a tag',
    removeTag: (name: string) => `Remove ${name}`,
    pickDate: (label: string, date: string) => `${label}, ${date}. Change`,
    saveFailed: 'Your changes were not saved. Check your connection, then try again.',
    rejected: (detail: string) => `Your server did not take the changes: ${detail}`,
    discardTitle: 'Discard your changes?',
    discardMessage: 'Your server keeps the details it has now.',
    discard: 'Discard',
    keepEditing: 'Keep editing',
  },

  uploads: {
    title: 'Uploads',
    defaultTitle: 'Scanned document',
    states: {
      preparing: 'Getting ready',
      waitingOffline: 'Waiting for a connection',
      waitingToSend: 'Waiting to send',
      waitingLookup: 'Checking whether your server got it',
      sending: 'Sending',
      processing: 'Processing on your server',
      done: 'Done',
      signInRequired: 'Sign in again to send',
      notPermitted: "Your account may not add documents. Ask the server's admin.",
      rejected: 'The server refused it',
      consumptionFailed: 'Paperless could not read this file',
      fileMissing: 'The file for this upload is gone from your phone. Scan the document again.',
      pdfFailed: 'The PDF could not be made',
      unreadable: 'The saved details of this upload could not be read. Delete it, then scan the document again.',
    },
    retryIn: (waitMs: number, attempt: number) => {
      const minutes = Math.round(waitMs / 60_000);
      if (minutes < 1) {
        return `Trying again in less than a minute (attempt ${attempt})`;
      }
      if (minutes === 1) {
        return `Trying again in 1 minute (attempt ${attempt})`;
      }
      return `Trying again in ${minutes} minutes (attempt ${attempt})`;
    },
    tooLarge: (bytes: number | null) => {
      if (bytes === null) {
        return "Your server's upload limit is smaller than this file.";
      }
      const megabytes = (bytes / 1_000_000).toLocaleString(copy.locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return `Your server's upload limit is smaller than this file (${megabytes} MB).`;
    },
    open: 'Open',
    retry: 'Retry',
    delete: 'Delete',
    deleteTitle: 'Delete this upload?',
    deleteMessage: (title: string) => `${title} is removed from this phone. Your server keeps anything it already has.`,
    cancel: 'Cancel',
    openLabel: (title: string) => `Open ${title}`,
    retryLabel: (title: string) => `Retry ${title}`,
    deleteLabel: (title: string) => `Delete ${title}`,
    sectionHeading: (heading: string, count: number) => `${heading} · ${copy.documents.count(count)}`,
    percent: (sent: number, total: number) => `${Math.round((sent / total) * 100)}%`,
    tabLabel: (unfinished: number) => `${copy.shell.uploads}, ${unfinished} not finished`,
    emptyTitle: 'Nothing to upload',
    emptyLead: 'Documents you scan show here until your server has them.',
    offline: 'You are offline. Uploads wait here and send when you are back online.',
    closedApp: 'While the app is closed, Android runs uploads about every 15 minutes, at a time it chooses.',
    batchHeading: (createdAt: number, now: number): string => {
      const scanned = new Date(createdAt);
      const today = new Date(now);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const time = scanned.toLocaleTimeString(copy.locale, { hour: 'numeric', minute: '2-digit' });
      if (scanned.toDateString() === today.toDateString()) {
        return `Scanned today at ${time}`;
      }
      if (scanned.toDateString() === yesterday.toDateString()) {
        return `Scanned yesterday at ${time}`;
      }
      const sameYear = scanned.getFullYear() === today.getFullYear();
      const day = scanned.toLocaleDateString(copy.locale, {
        month: 'short',
        day: 'numeric',
        year: sameYear ? undefined : 'numeric',
      });
      return `Scanned ${day} at ${time}`;
    },
  },

  placeholder: {
    comingSoon: 'Coming in the next build.',
  },

  scan: {
    batchTitle: 'New batch',
    close: 'Close',
    discardBatch: 'Discard batch',
    discardBatchTitle: 'Discard this batch?',
    discardBatchMessage: (count: number) =>
      count === 1 ? 'The scanned pages are deleted from this phone.' : `All ${count} documents are deleted from this phone.`,
    discard: 'Discard',
    cancel: 'Cancel',
    continueTitle: 'Continue your batch?',
    continueMessage: (count: number) =>
      count === 1 ? 'You have a batch with 1 document that is not uploaded yet.' : `You have a batch with ${count} documents that are not uploaded yet.`,
    continueBatch: 'Continue',
    startOver: 'Start over',
    emptyTitle: 'Nothing scanned yet',
    emptyLead: 'Scan a document, or pick PDFs and photos from your phone.',
    scan: 'Scan',
    documentName: (number: number) => `Document ${number}`,
    pages: (count: number) => (count === 1 ? '1 page' : `${count} pages`),
    pdf: 'PDF',
    editPages: 'Edit pages',
    editPagesOf: (number: number) => `Edit pages of document ${number}`,
    discardDocument: (number: number) => `Discard document ${number}`,
    discardDocumentTitle: (number: number) => `Discard document ${number}?`,
    discardDocumentMessage: 'Its pages are deleted from this phone.',
    addPages: 'Add pages to this document',
    addPagesTo: (number: number) => `Add pages to document ${number}`,
    scanNext: 'Scan the next document',
    pickFiles: 'Pick files',
    batchHint: 'One document can have many pages. Scan the next document when the paper changes.',
    review: 'Review and upload',
    reviewCount: (count: number) => `Review and upload ${count} documents`,
    unavailable: "Google's document scanner is not available on this phone. You can still pick PDFs and photos.",
    scanFailed: 'The scan could not be saved. Try again.',
    pickFailed: 'The files could not be read. Try again.',
    skipped: (count: number) =>
      count === 1 ? '1 file was left out because it is not a PDF or a picture that can be read.' : `${count} files were left out because they are not PDFs or pictures that can be read.`,
    nothingImported: 'None of these files could be read. Share PDFs or pictures.',

    editorTitle: (number: number) => `Document ${number}`,
    page: (number: number) => `Page ${number}`,
    pageMenu: (number: number) => `Menu for page ${number}`,
    retake: 'Retake',
    rotate: 'Rotate',
    moveEarlier: 'Move earlier',
    moveLater: 'Move later',
    moveTo: 'Move to another document',
    moveToTitle: (number: number) => `Move page ${number} to`,
    delete: 'Delete',
    deletePageTitle: (number: number) => `Delete page ${number}?`,
    deletePageMessage: 'The page is deleted from this phone.',
    split: 'Split into two documents here',
    splitAfter: (number: number) => `Split into two documents after page ${number}`,
    done: 'Done',

    detailsTitle: 'Details',
    documentCount: (count: number) => (count === 1 ? '1 document' : `${count} documents`),
    forEvery: 'For every document',
    fromBatch: 'From the batch',
    onlyThis: 'Only this document',
    useBatchValue: (field: string) => `Use the batch value for ${field}`,
    letServer: 'Leave empty to let your server choose',
    serverChooses: 'Your server chooses',
    none: 'None',
    title: 'Title',
    titlePlaceholder: 'Optional',
    tags: 'Tags',
    correspondent: 'Correspondent',
    documentType: 'Document type',
    storagePath: 'Storage path',
    upload: (count: number) => (count === 1 ? 'Upload 1 document' : `Upload ${count} documents`),
    uploadFailed: 'The documents could not be added to Uploads. They are still here. Try again.',
    added: (count: number) => (count === 1 ? '1 document added to Uploads' : `${count} documents added to Uploads`),
    view: 'View',
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
