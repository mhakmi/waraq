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
- `src/copy.ts` holds every word the app shows. Screens take their text from it.
- `plugins/network-security.ts` writes Android's network security config. It trusts certificate authorities that the user installed, and allows plain HTTP, which `normalizeServerUrl` then allows only for addresses on a home network or VPN.
- `src/brand.json` holds the app name, slug, and Android package. Change them there.

Four libraries came in with the document screens. `@tanstack/react-query-persist-client` saves the query cache. `@react-native-community/datetimepicker` opens Android's date dialog. `expo-file-system` writes downloaded files and hands them to the phone's PDF app. `expo-sharing` opens the share sheet. None of them adds an Android permission.

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
dev/android.sh logs
dev/android.sh adb devices # any adb command, against port 5038
dev/android.sh stop        # this emulator and its adb server only
```

`dev/android.sh flow` signs in to the dev server on port 8010. It searches for "hydro", opens the September bill, adds " 2026" to its title, and saves. Then it marks the interest slip done in the inbox and taps Undo. It takes a screenshot at each step, then shows the key screens again in dark mode and at font scale 1.3. Before and after the light run, it puts the title and the inbox tag back through the API. It also adds the saved views Bills, School, and Tax if they are missing.

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
