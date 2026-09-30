# DisPoCAM backend foundation

Backend-only Next.js App Router scaffold for disposable wedding camera passes. Supabase stores application data; Cloudinary stores image assets.

## Security and consistency model

- QR codes contain 256-bit random bearer tokens. PostgreSQL stores only SHA-256 token hashes.
- Supabase's service-role key and the Cloudinary API secret are imported only by `server-only` modules.
- Requesting a signature creates a short-lived reservation while holding a row lock on the pass. Active reservations count against remaining shots, so concurrent signature requests cannot oversubscribe a pass.
- The server generates an unguessable Cloudinary `public_id`, signs `overwrite=false`, and binds the upload to the intent and client upload ID.
- Registration verifies the asset through Cloudinary's authenticated Admin API. One SQL transaction then locks the pass, validates the intent, inserts the photo, increments `shots_used`, and completes the intent.
- `(camera_pass_id, client_upload_id)` and Cloudinary public IDs are unique. A completed client upload ID can be retried without consuming another shot.
- All public tables have RLS enabled and no browser policies. This API is the only data-access layer in the initial foundation.

Camera tokens are bearer credentials. Use HTTPS, redact camera paths from logs/analytics, and add rate limiting before launch.

## Setup

1. Install Node.js 20+ and run `npm install`.
2. Create Supabase and Cloudinary projects.
3. Copy `.env.example` to `.env.local` and fill in its values.
4. Apply `supabase/migrations/202609290001_initial_backend.sql` with `supabase db push`, or through the Supabase SQL editor.
5. Create an Auth user, wedding, and `admins` row linking that user to the wedding.
6. Run `node scripts/create-camera-token.mjs`. Store `tokenHash` in `camera_passes.token_hash`, and put the raw `token` in the guest QR URL. The raw token cannot be recovered later.
7. Run `npm run dev`.

Example provisioning SQL (replace placeholders):

```sql
insert into public.weddings (name, event_date, timezone)
values ('Alex & Sam', '2027-06-12', 'Asia/Singapore') returning id;

insert into public.guests (wedding_id, display_name)
values ('WEDDING_UUID', 'Taylor') returning id;

insert into public.camera_passes
  (token_hash, wedding_id, guest_id, shot_limit, expires_at)
values
  ('64_CHAR_SHA256_HASH', 'WEDDING_UUID', 'GUEST_UUID', 10,
   '2027-06-13T00:00:00+08:00');
```

## Required environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon/publishable key used only for admin Auth sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Privileged RPC and Auth verification |
| `CLOUDINARY_CLOUD_NAME` | Included in upload response | Cloudinary account |
| `CLOUDINARY_API_KEY` | Included in upload response | Signed-upload identity |
| `CLOUDINARY_API_SECRET` | Server only | Signing and asset verification |
| `UPLOAD_INTENT_TTL_SECONDS` | Server only, optional | Reservation validity; default 600 |
| `MAX_UPLOAD_BYTES` | Server only, optional | Registration limit; default 15 MiB |

## API endpoints

Success responses use `{ "data": ... }`. Errors use `{ "error": { "code", "message", "details?" } }` and an appropriate HTTP status.

### Guest camera

- `GET /api/camera/:token` returns wedding/guest display data, limit, used, reserved, remaining, and expiry.
- `PATCH /api/camera/:token` accepts `{ "displayName": "Taylor" }` once for an unnamed guest. The pass bearer can name only the guest attached to that pass.
- `POST /api/camera/:token/uploads/sign` accepts `{ "clientUploadId": "UUID" }` and returns an intent plus signed Cloudinary fields. Post `api_key`, `timestamp`, `public_id`, `overwrite`, `context`, `signature`, and the image `file` as multipart form data to `uploadUrl`.
- `POST /api/camera/:token/uploads/register` accepts `{ "intentId": "UUID", "clientUploadId": "UUID", "publicId": "...", "capturedAt": "ISO-8601" }`. It verifies and atomically registers the image. It is idempotent by client upload ID.
- `GET /api/camera/:token/photos` returns photo history for the pass and remaining shots.

Generate and persist one UUID for each captured image before its first network attempt. Reuse it for every retry.

### Admin

- `GET /api/admin/weddings/:weddingId/photos?limit=50&cursor=ISO_DATE&status=pending` returns a cursor-paginated gallery. It requires `Authorization: Bearer <Supabase access token>` and an `admins` membership for the wedding.
- `/admin/login` signs existing Supabase Auth users in with email/password. `/admin` lists only assigned weddings and redirects single-wedding admins to their dashboard.
- `GET /api/admin/weddings` lists the authenticated user's memberships. Dashboard, guest, photo download, and pass-management routes verify membership again on every request.
- `PATCH /api/admin/weddings/:weddingId/camera-passes/:cameraPassId` grants shots, sets a valid shot limit, or activates/deactivates a pass. Only owners and editors may mutate passes.
- `PATCH /api/admin/weddings/:weddingId/guests/:guestId` edits a guest display name (owner/editor only).
- `POST /api/admin/weddings/:weddingId/camera-passes/:cameraPassId/test-reset` is an owner/editor-only test operation. Send `mode: "shot_count"` or `mode: "full"`, the exact `confirmation: "RESET TEST CAMERA PASS"`, and optionally `deleteCloudinaryAssets: true` for a full reset. A server reset never clears device queues; in development, the camera footer exposes a pass-scoped local cleanup button. For real guests, grant extra shots instead of using test reset.

## SQL migration

The migration is [supabase/migrations/202609290001_initial_backend.sql](supabase/migrations/202609290001_initial_backend.sql). It creates the five requested tables plus `upload_intents`, constraints, indexes, locked-down RLS, and service-role-only atomic functions.

## Remaining production work

- Add final camera UX, explicit install/update prompts, and branded raster icons.
- Add browser-level camera, installation, offline-navigation, and storage-pressure tests.
- Add rate limiting, observability, orphaned Cloudinary asset cleanup, moderation mutation routes, and end-to-end integration tests.
- Decide retention/export behavior for photos that need attention and recovery behavior when a guest loses the original QR link.

## Offline capture phase one

Phase one persists captures in IndexedDB; it deliberately does not upload or synchronize them yet. The browser stores the non-secret `cameraPassId`, image Blob, original capture timestamp, stable client upload UUID, status, attempt count, dimensions, and byte size. It never persists the camera bearer token or any server credential.

The database is `dispocam-offline`, version 3. It has a `photos` object store keyed by `id`, with indexes on `status`, `cameraPassId`, and `createdAt`, plus a `cameraSessions` store keyed by a SHA-256 token fingerprint. Version 2 added optional synchronization fields without rewriting Blobs; version 3 adds the session store. Existing records migrate in place. Photo records use `pending`, `uploading`, `uploaded`, or `failed`. Uploaded records are only removed through explicit confirmed-upload cleanup.

### Image processing

Captured images are decoded with browser orientation handling, drawn onto a canvas (which removes EXIF and other source metadata), converted to JPEG, and limited to a longest edge of 2560 pixels at an initial quality of 0.84. If the image exceeds the server-provided byte limit, quality is reduced to 0.62 and dimensions are then reduced in 15% steps. Processing fails visibly rather than storing an image that cannot meet the limit. The camera-pass response exposes `capabilities.maxUploadBytes`, sourced from the same server `MAX_UPLOAD_BYTES` setting used during registration.

### Local shot accounting

`effectiveRemainingShots = max(0, serverRemainingShots - localPendingShots)`. Pending, uploading, and failed local records count as outstanding; uploaded records do not. The UI hook exposes this result and `canCapture`. The IndexedDB write transaction repeats the check atomically before adding a record, preventing rapid concurrent local captures from exceeding the browser-side allowance. Supabase remains authoritative and `shots_used` is never changed by this phase.

`useNetworkStatus` reports online only after both the browser network signal and a successful `/api/health` request. A positive `navigator.onLine` value alone is not considered proof of API reachability.

### Browser constraints

- Camera access requires HTTPS or localhost and explicit permission.
- Private browsing and embedded browsers may provide small or ephemeral IndexedDB quotas.
- iOS can evict site data under storage pressure and does not offer consistent Background Sync; a foreground retry path is still required.
- `facingMode: environment` is a preference, not a guarantee; some browsers may choose another camera.
- Rear-camera LED torch is a progressive enhancement based on `MediaStreamTrack.getCapabilities().torch`. Chromium browsers on some Android devices support it; iOS/Safari and many desktop/embedded browsers commonly do not. Unsupported devices silently use the existing screen-flash effect. “Auto” currently means flash-assisted capture when available because browsers do not expose a portable ambient-light reading.
- Image decoding and canvas compression temporarily require memory proportional to the decoded image. Very low-memory devices can still fail cleanly.
- API reachability is advisory and can change immediately after a probe.

## Foreground photo synchronization

`syncCameraPhotos(cameraPassId, cameraToken)` implements the existing sign → Cloudinary upload → register flow. The bearer token is supplied by the active camera session and is never written to IndexedDB. Queued records are associated with their non-secret Supabase `cameraPassId`; synchronization verifies that the token's pass response has the same ID before touching the queue.

The IndexedDB record can persist non-secret recovery state: a claim lease, attempt/retry timestamps, failure classification, upload intent ID/expiry, Cloudinary public ID/secure URL, and Cloudinary upload timestamp. Existing records need none of these fields.

The state flow is:

```text
pending / retryable failed / stale uploading
  -> uploading (atomic claim lease)
  -> signed intent
  -> Cloudinary metadata persisted
  -> backend registration confirmed
  -> local record deleted

transient error -> failed + retryable + nextRetryAt
terminal/capacity error -> failed + attention
```

Registration failure after a Cloudinary success retains both the Blob and non-secret remote metadata. The next run skips signing and Cloudinary and retries registration directly. An expired/missing intent clears stale remote progress but retains the Blob and original client UUID, allowing a fresh intent and upload. A lost Cloudinary response followed by an `overwrite=false` conflict proceeds to server registration, whose authenticated Cloudinary lookup is the final check.

Retries use exponential backoff starting at 2 seconds, capped at 5 minutes, with 0.75–1.25 jitter. Network failures, timeouts, HTTP 408/429/5xx, and stale Cloudinary signatures retry. Invalid/inactive/expired passes, unsupported assets, and confirmed capacity exhaustion require attention. Manual retry can reset an attention record after the underlying issue is resolved.

Each batch first probes `/api/health`, then fetches current pass state. Existing unexpired intents are treated as already reserved; current server remaining shots admit additional queued records. Overflow is retained locally and marked `shot_capacity_unavailable` for product/UI review—never deleted.

`usePhotoSync` provides foreground triggers on mount, an offline-to-online transition, visible-tab return, successful capture notification, scheduled retry, and manual retry. An in-memory per-pass lock coalesces triggers in one page; transactional IndexedDB leases prevent separate tabs or recovered sessions from claiming the same record until a five-minute claim becomes stale.

## Installability and offline reopening

The neutral web manifest uses standalone, portrait-first metadata and a replaceable SVG icon. `/sw.js` precaches only `/offline`, the generic `/camera/offline-shell`, and the icon. Same-origin `/_next/static/` resources observed by the loaded application are cached for the shell. API responses, RSC responses, admin pages, tokenized camera navigation responses, authentication data, and Cloudinary signatures are never cached.

Camera navigation is network-first. If `/camera/:token` cannot reach the network, the worker serves the generic token-free camera shell while the browser keeps the original QR URL. The shell hashes that high-entropy token in memory and looks up previously resolved non-secret pass state by fingerprint. The raw token is not written to IndexedDB or Cache Storage. If no matching session was resolved online—or its known expiry has passed—the shell shows offline-unavailable instead of guessing. A home-screen launch at `/` can reopen the most recently resolved, unexpired non-secret session for offline capture, but cannot synchronize until the guest reopens the QR link and supplies the token again.

IndexedDB session state contains the pass/wedding/guest IDs and display names, last confirmed server remaining shots, upload byte limit, expiry, and resolution timestamp. Confirmed foreground uploads refresh that server state when connectivity remains available.

Background Sync registration is requested after a local capture where the browser supports it. The service worker cannot run authenticated uploads itself because it intentionally has no raw camera token. A sync event only asks an open client to invoke the existing foreground engine. If no client is open, synchronization resumes on the next mount, health-probe recovery, online event, or visibility return. Safari/iOS therefore uses the same foreground triggers and does not depend on Background Sync.

`requestPersistentStorage()` returns `persistent`, `best-effort`, or `unsupported`; denial never blocks capture. Persistence reduces eviction risk but does not override operating-system storage pressure.

`PhotoSyncChannel` broadcasts photo queued, upload started/completed, attention, and shot-count-change hints through `BroadcastChannel`, with a same-page listener fallback. These messages only prompt authoritative IndexedDB refreshes.

Service-worker updates remain waiting. `usePwaUpdate()` exposes `updateAvailable` and requires the caller to explicitly confirm it is safe before activation; no capture or upload is force-refreshed.

Push notifications, final camera design, admin UI redesign, public galleries, and social features remain out of scope.
