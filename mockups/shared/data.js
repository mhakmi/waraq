// All sample data and all visible copy for the mockups.
// The documents, senders, types, and tags match dev/fixtures, which the local server is seeded with.
// The seed has no saved views, storage paths, custom fields, notes, or archive numbers yet,
// so the values for those below are made up for the mockups only.

const APP_NAME = 'Waraq';
const SERVER = 'docs.home.example';
const SERVER_VERSION = 'Paperless-ngx 3.3.2';

window.WARAQ = {
	appName: APP_NAME,
	today: '2026-10-16',
	user: { name: 'Sam', username: 'sam', initial: 'S' },
	server: { address: SERVER, version: SERVER_VERSION },

	system: {
		time: '2:14',
		keyboardSymbols: '?123',
		keyboardRows: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
	},

	tags: ['Inbox', 'Bills', 'Home', 'Health', 'Insurance', 'School', 'Tax', 'Warranty'],
	inboxTags: ['Inbox'],
	correspondents: [
		'Northfield Hydro', 'Maple Court Rentals', 'Brightside Dental Clinic', 'Harbourline Insurance',
		'Orbit Electronics', 'Cedar Park Elementary', 'Lakeshore Savings',
	],
	documentTypes: ['Bill', 'Letter', 'Receipt', 'Policy', 'Certificate', 'Tax slip'],
	savedViews: ['Bills', 'School', 'Tax'],

	// "added" is when the server received the document. The inbox groups by it.
	documents: [
		{
			id: 2, title: 'Electricity bill, September', correspondent: 'Northfield Hydro', type: 'Bill',
			tags: ['Bills', 'Home', 'Inbox'], created: '2026-09-27', added: '2026-10-16',
			body: 'Account 4410-2291. Usage 540 kWh. Amount due 83.62 dollars by October 19.',
			storagePath: 'Household', archiveNumber: '12',
			customFields: [['Amount due', '83.62'], ['Due date', 'Oct 19, 2026']],
			notes: [{ author: 'Sam', date: 'Oct 16, 2026', text: 'Pay before October 19.' }],
		},
		{
			id: 7, title: 'School trip permission letter', correspondent: 'Cedar Park Elementary', type: 'Letter',
			tags: ['School', 'Inbox'], created: '2026-09-08', added: '2026-10-13',
			body: 'Grade 3 visits the science centre on October 2. Please sign and return by September 25.',
		},
		{
			id: 8, title: 'Interest income slip', correspondent: 'Lakeshore Savings', type: 'Tax slip',
			tags: ['Tax', 'Inbox'], created: '2026-02-20', added: '2026-10-02',
			body: 'Interest paid in 2025 on account ending 7781. Total 48.30 dollars.',
		},
		{
			id: 1, title: 'Electricity bill, August', correspondent: 'Northfield Hydro', type: 'Bill',
			tags: ['Bills', 'Home'], created: '2026-08-28', added: '2026-09-01',
			body: 'Account 4410-2291. Usage 612 kWh. Amount due 94.18 dollars by September 20.',
		},
		{
			id: 3, title: 'Lease renewal notice', correspondent: 'Maple Court Rentals', type: 'Letter',
			tags: ['Home'], created: '2026-07-02', added: '2026-07-03',
			body: 'The lease for unit 12 renews on September 1 for twelve months. Monthly rent stays at 1850 dollars.',
		},
		{
			id: 4, title: 'Dental cleaning receipt', correspondent: 'Brightside Dental Clinic', type: 'Receipt',
			tags: ['Health'], created: '2026-06-14', added: '2026-06-15',
			body: 'Cleaning and exam for one patient. Paid 210.00 dollars by card.',
		},
		{
			id: 5, title: 'Auto insurance policy summary', correspondent: 'Harbourline Insurance', type: 'Policy',
			tags: ['Insurance'], created: '2026-05-01', added: '2026-05-02',
			body: 'Policy HL-88213 covers one vehicle from May 1 2026 to April 30 2027. Annual premium 1324 dollars.',
		},
		{
			id: 6, title: 'Laptop warranty certificate', correspondent: 'Orbit Electronics', type: 'Certificate',
			tags: ['Warranty'], created: '2026-03-19', added: '2026-03-20',
			body: 'Two-year warranty for serial OE-55-1902. Keep this certificate with the receipt.',
		},
	],
	detailDocumentId: 2,
	doneDocumentId: 2,

	search: {
		typed: 'hyd',
		suggestions: ['hydro'],
		labelMatches: [['Correspondent', 'Northfield Hydro']],
		recent: ['lease', 'warranty'],
	},

	filters: {
		tags: ['Bills', 'Home'],
		tagMode: 'all',
		correspondent: 'Northfield Hydro',
		documentType: null,
		createdFrom: 'Jan 1, 2026',
		createdTo: null,
		storagePath: null,
	},

	// One scanned batch, in the order it was scanned. Titles are what Sam types in the details step.
	batch: {
		shared: { tags: ['Inbox'], correspondent: null, documentType: null, storagePath: 'Household' },
		documents: [
			{ pages: 3, title: 'Lease renewal notice', correspondent: 'Maple Court Rentals', documentType: 'Letter' },
			{ pages: 1, title: 'Dental cleaning receipt', correspondent: null, documentType: null },
			{ pages: 2, title: 'Laptop warranty certificate', correspondent: null, documentType: 'Certificate' },
		],
		pagerIndex: 1,
	},

	// States: waiting, sending, processing, done, failed, signin.
	uploads: [
		{
			heading: 'Scanned today at 2:14 PM',
			items: [
				{ title: 'Lease renewal notice', pages: 3, state: 'sending', progress: 62 },
				{ title: 'Dental cleaning receipt', pages: 1, state: 'sending', progress: 8 },
				{ title: 'Laptop warranty certificate', pages: 2, state: 'processing' },
			],
		},
		{
			heading: 'Scanned yesterday at 6:40 PM',
			items: [
				{ title: 'Auto insurance policy summary', pages: 2, state: 'done' },
				{ title: 'School trip permission letter', pages: 1, state: 'failed', reason: 'tooLarge' },
				{ title: 'Interest income slip', pages: 1, state: 'signin' },
			],
		},
	],

	copy: {
		board: {
			title: APP_NAME + ' screens',
			subtitle: 'Mockups for review. Sample documents only. Server ' + SERVER + ', user Sam.',
			directionNames: { a: 'Direction A', b: 'Direction B' },
			directionSummaries: {
				a: 'Three tabs at the bottom. Batch details: shared fields first.',
				b: 'One home screen. Batch details: one document at a time.',
			},
			rows: [
				{
					heading: 'Signing in',
					frames: [
						{ id: 'signIn', label: '1. Sign in, step 1' },
						{ id: 'signInOptions', label: '1. Sign in, step 1', note: 'Connection options open' },
						{ id: 'signInStepTwo', label: '2. Sign in, step 2' },
						{ id: 'signInCode', label: '2. Sign in, step 2', note: 'The server asks for a code' },
						{ id: 'signInFailed', label: '3. Sign in, failure' },
					],
				},
				{
					heading: 'Finding documents',
					frames: [
						{ id: 'inbox', label: '4. Inbox', note: { a: 'Start screen', b: 'Home with Inbox selected. Start screen.' } },
						{ id: 'inboxUndo', label: '4. Inbox', note: 'Just after Done' },
						{ id: 'documents', label: '5. Documents', note: { a: '', b: 'Home with All selected' } },
						{ id: 'searchTyping', label: '6. Search', note: 'Typing' },
						{ id: 'filters', label: '6. Filters' },
					],
				},
				{
					heading: 'One document',
					frames: [
						{ id: 'detail', label: '7. Document detail' },
						{ id: 'detailScrolled', label: '7. Document detail', note: 'Scrolled down' },
						{ id: 'detailMenu', label: '7. Document detail', note: 'More menu open' },
						{ id: 'detailEdit', label: '7. Document detail', note: 'Editing' },
					],
				},
				{
					heading: 'Scanning a batch',
					frames: [
						{ id: 'scanner', label: '8a. Scanner' },
						{ id: 'batchOne', label: '8b. Batch', note: 'After the first document' },
						{ id: 'batchThree', label: '8c. Batch', note: 'Three documents' },
						{ id: 'pageEditor', label: '8d. Page editor', note: 'A page menu open' },
						{ id: 'batchDetails', label: '8e. Batch details', note: { a: 'Shared first', b: 'One at a time, document 2 of 3' } },
						{ id: 'batchDone', label: '8f. Confirmation', note: 'Back where Sam started' },
					],
				},
				{
					heading: 'Uploads and settings',
					frames: [
						{ id: 'uploads', label: '9. Uploads', note: { a: 'Uploads tab', b: 'Opened from the status strip' } },
						{ id: 'uploadsOffline', label: '9. Uploads', note: 'Offline' },
						{ id: 'settings', label: '10. Settings', note: 'From the account avatar' },
						{ id: 'settingsScrolled', label: '10. Settings', note: 'Scrolled down' },
					],
				},
			],
			forksHeading: 'Choosing a direction',
			forks: [
				{
					heading: 'Fork 1. The app shell',
					options: [
						{
							name: 'A. Three tabs',
							good: 'Every place is one tap away, and the Uploads tab always shows a count, so a stuck upload is hard to miss. A bottom bar is the usual Android layout for three to five main places.',
							cost: 'The bar takes space at the bottom of every screen, and the Scan button floats over the end of the list. Inbox and Documents are two lists that look almost the same.',
						},
						{
							name: 'B. One home',
							good: 'There is one place to learn. Inbox and all documents are the same list with one switch, and search sits above both. Uploads take space only while something is moving.',
							cost: 'When nothing is sending, Uploads has no button of its own, so Sam opens finished uploads from Settings. The wide Scan button takes a full row at the bottom.',
						},
					],
				},
				{
					heading: 'Fork 2. Batch details (8e)',
					options: [
						{
							name: 'A. Shared first',
							good: 'Fast for a stack of similar papers. Sam sets tags and storage path once and sees every document on one screen.',
							cost: 'The screen gets long with a big batch. Sam has to learn that a muted "From the batch" value is shared and that tapping it sets a value for one document.',
						},
						{
							name: 'B. One at a time',
							good: 'Each document gets the whole screen, with its pages in view while Sam types. Good when the papers in a batch differ.',
							cost: 'More taps for a big batch. A "Use for all documents" switch turned on at document 3 also changes documents 1 and 2, which are out of sight.',
						},
					],
				},
			],
			goodAt: 'Good at',
			costs: 'Costs',
		},

		switcher: {
			direction: 'Direction',
			theme: 'Theme',
			text: 'Text',
			light: 'Light',
			dark: 'Dark',
			normalText: 'Normal',
			largeText: 'Large',
		},

		signIn: {
			heading: 'Connect to your server',
			lead: APP_NAME + ' works with your own Paperless-ngx server.',
			addressLabel: 'Server address',
			addressPlaceholder: 'paperless.example.com',
			addressHelp: 'The address you use to open Paperless-ngx in a browser.',
			continue: 'Continue',
			optionsTitle: 'Connection options',
			optionsSummary: 'Custom headers, client certificate',
			headersTitle: 'Custom headers',
			headersHelp: 'For a proxy in front of your server, such as Cloudflare Access. Your proxy\'s documentation lists the headers it needs.',
			headerName: 'Name',
			headerValue: 'Value',
			headerExample: ['CF-Access-Client-Id', '•••••••••••••••'],
			addHeader: 'Add a header',
			certificateTitle: 'Client certificate',
			certificateHelp: 'For servers that ask the app to prove who it is.',
			comingLater: 'Coming later',
			foundPrefix: 'Found',
			foundAt: 'at',
			change: 'Change',
			usernameLabel: 'Username',
			passwordLabel: 'Password',
			showPassword: 'Show password',
			signIn: 'Sign in',
			useToken: 'Use an API token instead',
			codeAsked: 'Your server asks for a sign-in code.',
			codeLabel: 'Code from your authenticator app',
			codePlaceholder: '6 digits',
			failedHeading: 'Couldn\'t sign in',
			failedLead: 'Here is how far the connection got.',
			steps: [
				{ name: 'Reached the server', state: 'passed', detail: SERVER + ' answered.' },
				{ name: 'Secure connection', state: 'passed', detail: 'The certificate is valid.' },
				{
					name: 'Found Paperless-ngx', state: 'failed',
					detail: 'Your proxy answered with its own login page.',
					fix: 'Add the proxy\'s headers in Connection options.',
				},
				{ name: 'Signed in', state: 'skipped', detail: 'Not tried yet.' },
			],
			openOptions: 'Open Connection options',
			tryAgain: 'Try again',
			copyReport: 'Copy connection report',
		},

		shell: {
			inbox: 'Inbox',
			documents: 'Documents',
			uploads: 'Uploads',
			scan: 'Scan',
			all: 'All',
			searchPlaceholder: 'Search documents',
			account: 'Account and settings',
			stripTemplate: (counts) => [
				counts.sending && counts.sending + ' sending',
				counts.processing && counts.processing + ' processing',
				counts.waiting && counts.waiting + ' waiting',
			].filter(Boolean).join(', '),
		},

		inbox: {
			groups: { today: 'Today', week: 'This week', earlier: 'Earlier' },
			done: 'Done',
			doneHint: 'Done removes the inbox tag.',
			undoMessage: 'Marked done. Inbox tag removed.',
			undo: 'Undo',
			newCount: (count) => count + ' new',
		},

		documents: {
			filters: 'Filters',
			sortNewest: 'Newest first',
			count: (count) => count + ' documents',
		},

		search: {
			suggestions: 'Suggestions',
			labels: 'Labels',
			recent: 'Recent searches',
			clear: 'Clear',
		},

		filterSheet: {
			title: 'Filters',
			clearAll: 'Clear all',
			tags: 'Tags',
			hasAll: 'Has all',
			hasAny: 'Has any',
			addTag: 'Add tag',
			correspondent: 'Correspondent',
			documentType: 'Document type',
			created: 'Created',
			from: 'From',
			to: 'To',
			any: 'Any',
			storagePath: 'Storage path',
			saveAsView: 'Save as view',
			show: (count) => 'Show ' + count + ' documents',
		},

		detail: {
			back: 'Back',
			share: 'Share',
			openWith: 'Open with',
			more: 'More',
			download: 'Download',
			delete: 'Delete',
			previewHint: 'Tap to open',
			details: 'Details',
			correspondent: 'Correspondent',
			type: 'Document type',
			created: 'Created',
			tags: 'Tags',
			storagePath: 'Storage path',
			archiveNumber: 'Archive number',
			notes: 'Notes',
			addNote: 'Add a note',
			textFound: 'Text found in the document',
			edit: 'Edit',
			editTitle: 'Edit details',
			title: 'Title',
			cancel: 'Cancel',
			save: (count) => count === 1 ? 'Save 1 change' : 'Save ' + count + ' changes',
			changed: 'Changed',
			changedTitle: 'Electricity bill, September 2026',
			onlyChanges: 'Only the fields you change are sent to your server.',
			sampleFooter: 'Sample document made for testing. Not a real record.',
		},

		scan: {
			scannerFrame: 'Google\'s document scanner opens here',
			scannerNote: 'It is Google\'s own screen, so ' + APP_NAME + ' cannot change how it looks. It finds the edges, crops, and takes many pages.',
			batchTitle: 'New batch',
			close: 'Close',
			documentName: (number) => 'Document ' + number,
			pages: (count) => count === 1 ? '1 page' : count + ' pages',
			editPages: 'Edit pages',
			addPages: 'Add pages to this document',
			addPagesTo: (number) => 'Add pages to document ' + number,
			scanNext: 'Scan the next document',
			batchHint: 'One document can have many pages. Scan the next document when the paper changes.',
			review: 'Review and upload',
			reviewCount: (count) => 'Review and upload ' + count + ' documents',
			editorTitle: (number) => 'Document ' + number,
			page: (number) => 'Page ' + number,
			pageMenu: 'Page menu',
			dragToReorder: 'Drag to reorder',
			retake: 'Retake',
			rotate: 'Rotate',
			delete: 'Delete',
			moveTo: 'Move to another document',
			split: 'Split into two documents here',
			done: 'Done',
			detailsTitle: 'Details',
			forEvery: 'For every document',
			fromBatch: 'From the batch',
			onlyThis: 'Only this document',
			letServer: 'Leave empty to let your server choose',
			serverChooses: 'Your server chooses',
			title: 'Title',
			tags: 'Tags',
			correspondent: 'Correspondent',
			documentType: 'Document type',
			storagePath: 'Storage path',
			useForAll: 'Use for all documents',
			ofCount: (index, count) => index + ' of ' + count,
			previous: 'Previous',
			next: 'Next document',
			upload: (count) => 'Upload ' + count + ' documents',
			added: (count) => count + ' documents added to Uploads',
			view: 'View',
		},

		uploads: {
			title: 'Uploads',
			clearFinished: 'Clear finished',
			states: {
				waiting: 'Waiting for a connection',
				sending: 'Sending',
				processing: 'Processing on your server',
				done: 'Done',
				failed: 'Failed',
				signin: 'Sign in again to send this',
			},
			reasons: {
				tooLarge: 'The file is larger than your server accepts. Your server\'s admin can raise the upload limit.',
			},
			open: 'Open',
			retry: 'Retry',
			signIn: 'Sign in',
			offline: 'You are offline. Uploads wait here and send when you are back online.',
			documents: (count) => count + ' documents',
		},

		settings: {
			title: 'Settings',
			signOut: 'Sign out',
			appearance: 'Appearance',
			theme: 'Theme',
			themes: ['System', 'Light', 'Dark'],
			labels: 'Labels',
			labelRows: ['Tags', 'Correspondents', 'Document types'],
			uploads: 'Uploads',
			other: 'Other',
			privacy: 'Privacy policy',
			crashReport: 'Send a crash report',
			about: 'About',
			aboutText: APP_NAME + ' is an independent client for Paperless-ngx. It is not made by or affiliated with the Paperless-ngx project.',
		},
	},
};
