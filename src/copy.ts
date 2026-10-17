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
  },
};
