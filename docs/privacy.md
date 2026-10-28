# Waraq privacy policy

Last updated: 28 October 2026

Waraq is an Android app for Paperless-ngx servers that you run yourself. Mohammed Hakmi makes Waraq. It is an independent app, and it is not made by or affiliated with the Paperless-ngx project.

Waraq has no server of its own. It talks only to the Paperless-ngx server whose address you type in. It has no analytics, no ads, and no crash reporting service.

## What Waraq keeps on your phone

- **Your account.** The server address, your username, and the names of any extra connection headers are kept in the app's database. Your API token and the values of the extra headers are kept in Android's encrypted storage, with a key held in the Android Keystore. Waraq sends your password to your server once, to get the token, and does not keep it.
- **Copies of your server's data.** Document lists, document details, labels, and thumbnails are kept so the app can show them at once and while you are offline. Documents that you open are kept in the app's cache folder, up to 200 MB. Your recent searches are kept too.
- **Scans and uploads.** Pages that you scan, and files that you pick or share into Waraq, are kept in the app's files folder until you upload or discard them. After an upload finishes, Waraq deletes its PDF and keeps a short record of the upload for a week, so the Uploads tab can show it.
- **Your theme choice.**
- **A crash log.** If the app hits an error, Waraq writes the time, the kind of error, the app and Android versions, the error message, and where in the code it happened. Before it writes an entry, Waraq removes your token, your header values, and anything that looks like a password or key. The log stays on your phone. It leaves the phone only if you open **Settings**, tap **Send a crash report**, and choose where to send it.

Android's backup is turned off for Waraq, so none of this goes into your Google backup.

## What Waraq sends, and where

Waraq sends data only to your own Paperless-ngx server:

- your username and password or API token, to sign in,
- requests to list, search, open, and edit your documents, notes, labels, and saved views,
- the documents that you scan, pick, or share into Waraq. Waraq turns them into PDFs on the phone first.

Waraq does not send your documents or your account details to the maker of Waraq or to anyone else.

If your server address starts with `https://`, the connection is encrypted. Waraq also allows plain `http://` for addresses on a home network or a VPN, and it warns you when you use one. That traffic is not encrypted.

## Google's document scanner

To scan paper, Waraq opens Google's document scanner, which is part of Google Play services on your phone. The scanner runs on the phone and gives Waraq only the pages that you keep. Google's ML Kit, which the scanner is built on, sends Google diagnostic and usage data, such as device and app information and performance numbers, with an identifier for each installation. Google says it does not pass this data to third parties. Read Google's [ML Kit data disclosure](https://developers.google.com/ml-kit/android-data-disclosure) for the details. Google Play services has its own terms with Google.

Waraq uses no other third-party service.

## Permissions

Waraq asks for network access, to reach your server, and for permission to keep the phone awake and to start again after a restart, so unfinished uploads can finish in the background. It does not ask for your camera, photos, files, contacts, or location. Files come in through Android's own file picker and share menu.

## How to delete your data

- To delete documents, delete them on your Paperless-ngx server. Waraq can delete them there for you.
- To remove your account from the phone, open **Settings** and tap **Sign out**. Waraq deletes your account details, your token, the saved document lists and details, your recent searches, and the scan you were working on.
- To remove everything Waraq keeps on the phone, including the crash log, thumbnails, and opened documents, uninstall Waraq or clear its storage in Android's app settings.

Waraq creates no account of its own, so there is no account with the maker to delete.

## Children

Waraq is a tool for managing your own documents. It is not made for children.

## Changes

If this policy changes, the new version is posted on this page with a new date.

## Contact

Write to Mohammed Hakmi at [mhakmi.dev@gmail.com](mailto:mhakmi.dev@gmail.com).
