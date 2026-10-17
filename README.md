# Waraq

An Android app for scanning paper documents into your own Paperless-ngx server. Waraq is a working name.

Waraq needs Paperless-ngx 3.0 or newer. It talks to the REST API at version 10.

## Code layout

- `app/` holds the screens, one file per route, for expo-router. `(tabs)/` is Inbox, Documents, and Uploads. `sign-in/` is shown only while no account is stored.
- `src/paperless/` is the API client. It uses the `fetch` it is given, and parses every response with Zod before the rest of the app sees it. Zod is the one dependency added for that.
- `src/signin/` holds the sign-in steps and the checklist that a failed sign-in shows. It is plain TypeScript, so the tests run it in Node.
- `src/account/` stores the one account. The address, user, and server version go in SQLite. The token and the custom header values go in the Android Keystore through expo-secure-store.
- `src/documents/` turns the filter sheet and the server's saved views into list parameters, and works out which fields an edit changed. `src/inbox/` groups the inbox and removes a row when it is marked done. Both are plain TypeScript.
- `src/cache/` names every TanStack Query key and saves the cache to SQLite. `src/files/` keeps opened documents in the cache folder.
- `src/upload/` holds the upload job. Each scanned document becomes one job, and a table in `machine.ts` lists every state change the job allows. `runStep` in `runner.ts` is the only code in that folder that talks to the server or the disk.
- `modules/scanner/` is a local Expo module in Kotlin. It opens Google's document scanner, writes PDFs, and brings in files picked on the phone or shared from other apps. It imports nothing from Waraq, so it can move into a package of its own.
- `src/scan/` holds the batch being scanned. `batch.ts` has the data shapes and every edit as a plain function. `store.ts` keeps the batch in SQLite and its files in the app's files folder.
- `src/copy.ts` holds every word the app shows. Screens take their text from it.
- `plugins/network-security.ts` writes Android's network security config. It trusts certificate authorities that the user installed, and allows plain HTTP, which `normalizeServerUrl` then allows only for addresses on a home network or VPN.
- `src/brand.json` holds the app name, slug, and Android package. Change them there.

Four libraries came in with the document screens. `@tanstack/react-query-persist-client` saves the query cache. `@react-native-community/datetimepicker` opens Android's date dialog. `expo-file-system` writes downloaded files and hands them to the phone's PDF app. `expo-sharing` opens the share sheet. None of them adds an Android permission.

The scanner module adds one library, Google's `play-services-mlkit-document-scanner`. The scanner itself runs inside Play services, so the app gets no camera permission. Its checks on the emulator use `androidx.test`, which goes only into the test APK.

## How sign-in works

```mermaid
flowchart TD
    Address["Server address<br/>and custom headers"] --> Parse{"normalizeServerUrl"}
    Parse -- "http to a public host" --> Failed
    Parse -- "cannot be read" --> Address
    Parse --> Probe["OPTIONS /api/token/<br/>Accept: version=10<br/>no sign-in needed"]
    Probe -- "names the Paperless token view" --> Credentials["Username and password,<br/>or an API token"]
    Probe -- "no answer, TLS error, web page, 406" --> Failed["Checklist<br/>with the cause and the fix"]
    Credentials --> Token["POST /api/token/"]
    Token -- "MFA code is required" --> Credentials
    Token --> Version["GET /api/ui_settings/<br/>read X-Version and X-Api-Version"]
    Version -- "API version below 10" --> Failed
    Version --> Inbox["Inbox"]
    Token -- "wrong password, throttled" --> Failed
```

Paperless-ngx sends its version headers only to a signed-in user, so the first check needs another signal. `OPTIONS /api/token/` needs no sign-in, and Paperless-ngx 3.x answers it with JSON that names its token view, "Paperless Obtain Auth Token". A server that cannot speak API version 10 answers 406. The version is read after sign-in. The probe counts against the same limit as the token request, five a minute.

## Build for Android

`dev/android.sh` builds a release APK signed with the debug key and runs it on a headless emulator of its own, `waraq_pixel`. It reads `JAVA_HOME` and `ANDROID_HOME` from the environment or from `.dev-data/toolchain.env`, which git does not track:

```sh
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
```

Expo SDK 58 compiles against Android API 37, so the SDK needs `platforms;android-37.0` and `build-tools;37.0.0`. The app targets API 36.

The emulator talks only to an adb server of its own on port 5038. Its console and adb ports, 5600 and 5601, sit above 5585, the last port that adb servers scan for emulators. Another project's adb server on the default port 5037 never sees it, even when that server runs with a different key.

```mermaid
flowchart LR
  script["dev/android.sh"] -->|"adb -P 5038"| own["adb server on 5038<br>key in .dev-data"]
  own -->|"port 5601"| emulator["waraq_pixel<br>console 5600"]
  other["adb server on 5037<br>scans 5555 to 5585 only"]
```

```sh
dev/android.sh build       # the APK, then its package, SDK levels, and permissions
dev/android.sh boot
dev/android.sh install
dev/android.sh shot inbox  # .dev-data/shots/inbox.png
dev/android.sh flow        # the documents flow against http://10.0.2.2:8010, described below
dev/android.sh scan        # the scan flow, described below
dev/android.sh pdf-check   # the PDF writer's checks on the emulator, then its 10-page PDF opened on the Mac
dev/android.sh logs
dev/android.sh adb devices # any adb command, against port 5038
dev/android.sh stop        # this emulator and its adb server only
```

`dev/android.sh flow` signs in to the dev server on port 8010. It searches for "hydro", opens the September bill, adds " 2026" to its title, and saves. Then it marks the interest slip done in the inbox and taps Undo. It takes a screenshot at each step, then shows the key screens again in dark mode and at font scale 1.3. Before and after the light run, it puts the title and the inbox tag back through the API. It also adds the saved views Bills, School, and Tax if they are missing.

`dev/android.sh scan` drives Google's scanner through the emulator's virtual camera. The emulator boots with `-camera-back virtualscene` and hangs the lease renewal fixture, `dev/fixtures/pdf/lease-renewal.png`, on the wall of the virtual room. The script turns the camera toward the poster or a blank wall through the emulator's gRPC `setPhysicalModel` call, so it needs `grpcurl`. Set `GRPCURL` to its path, here or in `.dev-data/toolchain.env`. The flow scans two pages as document one and one page as document two. It rotates a page, splits document one, sets the tag Bills for every document, and stops at the Upload button. Then it opens the saved batch again in dark mode and at font scale 1.3. Last, it shares a PDF into Waraq with `adb shell am start -a android.intent.action.SEND`.

## How the document screens get their data

Every list and detail goes through TanStack Query. The app saves its cache to SQLite through `expo-sqlite/kv-store` a second after each change. On the next start, the Inbox, Documents, and any document opened before show at once. While the phone has no network, they say "Offline, showing saved copy". Suggestions, search results, and the counts in the filter sheet are not saved. The cache is dropped on sign-out.

```mermaid
flowchart LR
  screens["Inbox, Documents,<br>document page"] --> query["TanStack Query"]
  query --> client["Paperless client"]
  client --> fetch["expo/fetch<br>shared OkHttp"]
  query <--> saved[("SQLite<br>saved cache")]
  page["document page"] --> files["src/files<br>download.ts"]
  files --> fetch
  files --> folder[("cache folder<br>opened/, 200 MB")]
  folder --> viewer["another app<br>open, share"]
```

- **Filters and saved views.** `documentQuery` turns the search text, the filter sheet, and the sort into query parameters. A saved view's rules become parameters through the same rule table that the Paperless-ngx web app uses. The filter sheet and the sort win where both set one.
- **Edits.** The edit page sends `PATCH /api/documents/<id>/` with only the fields that differ from the document as it was opened. Dates are `YYYY-MM-DD` strings. The date picker runs in UTC, so a picked day is stored as that day in every time zone.
- **Done in the inbox.** Done sends one `PATCH` with the document's tags minus the inbox tags. The row leaves the list at once and comes back where it was if the request fails or the user taps Undo.
- **Opening a file.** The app downloads the file through the same `expo/fetch` as every other request and writes the body to the cache folder chunk by chunk, so a 20 MB PDF never sits whole in memory. Android then hands the file to the user's PDF app, or to the share sheet. Opened files stay in `opened/` up to 200 MB. Past that, the oldest go first.
- **Missing permissions.** A label list, the notes, or the saved views that answer 403 hide their part of the screen. The rest keeps working.

## How a scan becomes a batch

```mermaid
flowchart LR
  scan["Scan button"] --> mlkit["Google's scanner<br>in Play services"]
  mlkit -->|"JPEG per page"| module["modules/scanner<br>moves pages to files/batch/"]
  share["Share from another app<br>Pick files"] --> module
  module --> batch["src/scan/store.ts<br>the batch"]
  batch <--> sqlite[("SQLite<br>scan-batch")]
  batch --> screens["Batch, page editor,<br>batch details"]
  screens -->|"Upload"| queue["enqueueBatch<br>one job per document"]
  queue -->|"pages"| pdf["writePdf"]
```

- **No camera permission.** Google's scanner runs in Play services and hands back one JPEG per page. The module moves each page out of the scanner's cache folder into `files/batch/` at once, so Android cannot clear it.
- **Nothing is lost.** The batch is saved to SQLite after every change. A killed app keeps it, and the Scan button offers to continue it. A file leaves `files/batch/` only when the user deletes its page, discards its document or batch, or signs out. After Upload, the upload job owns the files and deletes them.
- **Edits are plain functions.** Adding pages, rotating, moving, deleting, retaking, and splitting each take a batch and return a new one. `filesLeftBehind` compares the batch before and after an edit and names the files to delete.
- **Files from other apps.** Waraq takes `ACTION_SEND` and `ACTION_SEND_MULTIPLE` for `application/pdf` and `image/*`, and Pick files opens Android's own file picker. Neither needs a permission. A shared or picked PDF becomes one document as it is. Pictures become the pages of one new document.
- **How a document reaches its upload job.** A document of `kind: 'pages'` carries its page list, and the job builds `<id>.pdf` with `writePdf(pages, outputUri)`. A document of `kind: 'pdf'` carries a ready PDF at `pdf.uri`, and the job sends that file as it is.

`writePdf` places each page's JPEG bytes in the PDF as the scanner made them, without decoding them, and turns a page with the PDF's own `/Rotate`. Only a page above 400 dots per inch, a picture that is not a JPEG, or a CMYK JPEG is decoded once and saved again as a JPEG at quality 85. A page is A4 or Letter when the scan has that shape, within 4 percent. Any other scan, such as a receipt, gets the width of A4 and the height that its shape needs. The writer streams to disk and holds at most one page in memory.

| 10 pages of 300 dpi A4 with paper grain | PDF size | Native memory while writing |
|---|---|---|
| Android's `PdfDocument`, tried first | 99.9 MB | grew by 348 MB, and by 1089 MB for 30 pages |
| `writePdf`, the JPEGs as they are | 25.3 MB, the JPEGs plus about 500 bytes a page | no growth |

`PdfDocument` keeps every page's bitmap until it writes the file and stores them without loss, which is why it was dropped. A scanned document weighs what its JPEGs weigh, and the scanner sets that. It has not been measured on a phone yet.

## How an upload moves

```mermaid
stateDiagram-v2
    [*] --> preparing
    preparing --> waiting: prepared
    preparing --> failed: prepareFailed
    waiting --> sending: sendStarted
    waiting --> failed: fileMissing
    sending --> processing: sendAccepted
    sending --> waiting: sendFailed, retry later
    sending --> failed: sendFailed, 4xx
    sending --> waiting: interrupted, maybe sent
    waiting --> done: foundDocument
    waiting --> processing: foundTask
    waiting --> waiting: notFound, look again or send again
    waiting --> waiting: reconcileFailed, retry later
    waiting --> failed: reconcileFailed, 401 or 403
    processing --> processing: taskPending, taskUnknown, or checkFailed
    processing --> waiting: ten checks in a row without an answer
    processing --> failed: checkFailed, 401 or 403
    processing --> done: taskSucceeded
    processing --> failed: taskFailed
    failed --> waiting: signedIn or retryRequested
    failed --> processing: signedIn or retryRequested, back to its check
    done --> [*]
```

The file goes up as `<job id>.pdf`. Paperless-ngx accepts the same file twice, so the app never sends a file again just because it is unsure. If a send may have reached the server, for example after a timeout or an app crash, the job looks for a consume task with that file name first, whatever the task's status, and then for a document. When it finds neither inside two minutes of the moment it became unsure, which is when the send failed or when the app found the job left in `sending` after a restart, it looks again thirty seconds later, because the server may still be working on the request. It sends again only when nothing has turned up after that, and then after the usual retry delay for its attempt, so a loop of kills cannot resend without a pause.

A 401 stops the job at `sign_in_required` and a 403 at `not_permitted`. Both remember the step they stopped at (the send, the lookup, or the check of a task) and continue from there once the user signs in or asks for a retry, so a file the server may already have is never sent again blindly.

Three rules keep two copies of a job from sending the same file:

- `JobStore.saveIfUnchanged` writes only when the stored row still has the `updatedAt` the caller loaded, and returns whether it wrote. A row that is gone counts as changed, so a job the user deleted never comes back. A new job goes in through `insert`. `runStep` claims a job as `sending` with that check before it sends anything. A `runStep` that returns the job it was given either had nothing due or lost that claim. Reload the job before trying again. `deleteIfUnchanged` makes the same check, so a stale copy cannot delete a job that a runner has since claimed.
- One drain runs at a time per JavaScript runtime.
- `recoverAfterRestart` runs once when the process starts, before any drain. It never runs from a background entry point while the process is alive, because a job found in `sending` then is being sent, not left behind.

One known gap remains. If the user retries a job that Paperless could not consume, and that retry's request never reaches the server, the lookup finds the earlier failed task with the same file name and shows that failure again. Nothing is uploaded twice. The user sees the old error and can retry once more.

## Run the tests

You need Bun and Docker.

1. Install the dependencies.

   ```sh
   bun install
   ```

2. Run the type check and the unit tests. They need no network.

   ```sh
   bun run typecheck
   bun run test
   ```

3. Start the throwaway Paperless-ngx on port 8011. It runs apart from the dev server on port 8010, so the tests never touch the dev data.

   ```sh
   dev/test-server.sh up
   ```

4. Run the integration tests against it.

   ```sh
   bun run test:integration
   ```

5. When you are done, remove the server and its data.

   ```sh
   dev/test-server.sh down
   ```

To test another Paperless-ngx release, set `PAPERLESS_VERSION` when you start the server, for example `PAPERLESS_VERSION=3.0.0 dev/test-server.sh up`. Run `down` first, because the stored data belongs to the release that made it. To point the tests at a different server, set `PAPERLESS_TEST_URL`. The tests sign in as `admin` with the password from `dev/compose.yaml`.
