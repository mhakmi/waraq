# Waraq

An Android app for scanning paper documents into your own Paperless-ngx server. Waraq is a working name.

Waraq needs Paperless-ngx 3.0 or newer. It talks to the REST API at version 10.

## Code layout

- `src/paperless/` is the API client. It uses the `fetch` it is given, and parses every response with Zod before the rest of the app sees it. Zod is the one dependency added for that.
- `src/upload/` holds the upload job. Each scanned document becomes one job, and a table in `machine.ts` lists every state change the job allows.
- `src/brand.json` holds the app name, slug, and Android package. Change them there.

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
    waiting --> waiting: notFound or reconcileFailed
    processing --> processing: taskPending or checkFailed
    processing --> done: taskSucceeded
    processing --> failed: taskFailed
    failed --> waiting: signedIn or retryRequested
    done --> [*]
```

The file goes up as `<job id>.pdf`. Paperless-ngx accepts the same file twice, so the app never sends a file again just because it is unsure. If a send may have reached the server, for example after a timeout or an app crash, the job looks for a task or a document with that file name first. It sends again only when neither exists.

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
