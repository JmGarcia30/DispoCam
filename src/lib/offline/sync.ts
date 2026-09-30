import { canReachApplication } from "@/lib/network/connectivity";
import { offlinePhotoStore, type OfflinePhotoStore } from "@/lib/offline/database";
import { calculateRetryDelay } from "@/lib/offline/retry";
import type { OfflinePhoto, SyncFailureStage } from "@/lib/offline/types";
import { photoSyncChannel } from "@/lib/offline/channel";
import { createBrowserUuid } from "@/lib/browser/uuid";
import { FetchTimeoutError, fetchWithTimeout } from "@/lib/network/fetch-timeout";

export { fetchWithTimeout } from "@/lib/network/fetch-timeout";

const DEFAULT_CLAIM_LEASE_MS = 5 * 60_000;
const runningBatches = new Map<string, Promise<SyncBatchResult>>();

export type SyncBatchStatus =
  | "complete"
  | "token-unavailable"
  | "waiting-for-connection"
  | "retry-scheduled"
  | "needs-attention";

export interface SyncBatchResult {
  status: SyncBatchStatus;
  uploaded: number;
  retryScheduled: number;
  needsAttention: number;
  remaining: number;
  nextRetryAt?: string;
  diagnostic?: SyncDiagnostic;
}

export interface SyncDiagnostic {
  stage: SyncFailureStage;
  status?: number;
  code: string;
  message: string;
}

export interface SyncDependencies {
  store?: OfflinePhotoStore;
  fetch?: typeof fetch;
  canReach?: () => Promise<boolean>;
  now?: () => Date;
  random?: () => number;
  claimLeaseMs?: number;
  claimId?: () => string;
}

interface ApiFailureBody {
  error?: { code?: string; message?: string };
}

interface PassResponse {
  data: { pass_id: string; shots_remaining: number };
}

interface SignResponse {
  data:
    | { alreadyRegistered: true; photoId: string }
    | {
        intentId: string;
        expiresAt: string;
        uploadUrl: string;
        upload: {
          apiKey: string;
          timestamp: number;
          publicId: string;
          overwrite: false;
          context: string;
          signature: string;
        };
      };
}

interface CloudinaryResponse {
  public_id: string;
  secure_url: string;
}

export class SyncRequestError extends Error {
  constructor(
    public readonly stage: "pass" | "sign" | "cloudinary" | "register",
    public readonly status: number | undefined,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SyncRequestError";
  }
}

export function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isIntentExpiry(error: SyncRequestError): boolean {
  return error.code === "upload_intent_expired" || error.code === "upload_intent_not_found";
}

export function createClaimId(): string {
  return createBrowserUuid();
}

export async function requestJson<T>(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
  stage: SyncRequestError["stage"],
  timeoutMs = 30_000,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(fetcher, input, init, timeoutMs);
  } catch (error) {
    const timeout = error instanceof FetchTimeoutError;
    const aborted = !timeout && init.signal?.aborted;
    throw new SyncRequestError(
      stage,
      timeout ? 408 : undefined,
      timeout ? "request_timeout" : aborted ? "request_aborted" : "network_error",
      timeout ? "The upload request timed out and will be retried." : aborted ? "The upload request was cancelled." : "The network request failed.",
    );
  }
  const body = (await response.json().catch(() => ({}))) as T & ApiFailureBody;
  if (!response.ok) {
    const message = body.error?.message ?? `${stage} request failed.`;
    const staleCloudinarySignature =
      stage === "cloudinary" &&
      (response.status === 400 || response.status === 401) &&
      /signature|timestamp|stale/i.test(message);
    const safeMessage = stage === "cloudinary"
      ? staleCloudinarySignature ? "Cloudinary upload authorization expired." : "Cloudinary upload failed."
      : message;
    throw new SyncRequestError(
      stage,
      staleCloudinarySignature ? 408 : response.status,
      staleCloudinarySignature ? "cloudinary_signature_expired" : (body.error?.code ?? `${stage}_http_${response.status}`),
      safeMessage,
    );
  }
  return body;
}

async function fetchPass(fetcher: typeof fetch, token: string): Promise<PassResponse> {
  return requestJson(fetcher, `/api/camera/${encodeURIComponent(token)}`, { method: "GET", cache: "no-store" }, "pass");
}

async function requestSignature(fetcher: typeof fetch, token: string, clientUploadId: string): Promise<SignResponse> {
  return requestJson(
    fetcher,
    `/api/camera/${encodeURIComponent(token)}/uploads/sign`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientUploadId }) },
    "sign",
  );
}

async function uploadToCloudinary(fetcher: typeof fetch, signed: Exclude<SignResponse["data"], { alreadyRegistered: true }>, image: Blob) {
  const form = new FormData();
  form.set("api_key", signed.upload.apiKey);
  form.set("timestamp", String(signed.upload.timestamp));
  form.set("public_id", signed.upload.publicId);
  form.set("overwrite", String(signed.upload.overwrite));
  form.set("context", signed.upload.context);
  form.set("signature", signed.upload.signature);
  const publicIdParts = signed.upload.publicId.split("/");
  form.set("file", image, `${publicIdParts[publicIdParts.length - 1] || "photo"}.jpg`);
  return requestJson<CloudinaryResponse>(fetcher, signed.uploadUrl, { method: "POST", body: form }, "cloudinary");
}

async function registerUpload(
  fetcher: typeof fetch,
  token: string,
  photo: OfflinePhoto,
  intentId: string,
  publicId: string,
): Promise<void> {
  try {
    await requestJson(
      fetcher,
      `/api/camera/${encodeURIComponent(token)}/uploads/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId,
          clientUploadId: photo.id,
          publicId,
          capturedAt: photo.capturedAt,
        }),
      },
      "register",
    );
  } catch (error) {
    // A uniqueness response confirms that the stable clientUploadId is already registered.
    if (error instanceof SyncRequestError && error.code === "duplicate_upload") return;
    throw error;
  }
}

async function processClaimedPhoto(
  initialPhoto: OfflinePhoto,
  token: string,
  claimId: string,
  dependencies: Required<Pick<SyncDependencies, "store" | "fetch" | "now" | "random" | "claimLeaseMs">>,
): Promise<"uploaded" | "retry" | "attention"> {
  const { store, fetch: fetcher, now, random, claimLeaseMs } = dependencies;
  let photo = initialPhoto;
  const renew = (patch: Partial<OfflinePhoto> = {}) =>
    store.updateClaimedPhoto(photo.id, claimId, {
      ...patch,
      claimExpiresAt: new Date(now().getTime() + claimLeaseMs).toISOString(),
    });

  try {
    if (!photo.cloudinaryUploadedAt || !photo.cloudinaryPublicId || !photo.uploadIntentId) {
      const signed = await requestSignature(fetcher, token, photo.id);
      if ("alreadyRegistered" in signed.data) {
        await store.completeClaimedPhoto(photo.id, claimId);
        photoSyncChannel.publish({ type: "upload-completed", cameraPassId: photo.cameraPassId, photoId: photo.id });
        photoSyncChannel.publish({ type: "shot-count-changed", cameraPassId: photo.cameraPassId });
        return "uploaded";
      }

      photo = await renew({
        uploadIntentId: signed.data.intentId,
        uploadIntentExpiresAt: signed.data.expiresAt,
        cloudinaryPublicId: signed.data.upload.publicId,
        cloudinarySecureUrl: undefined,
        cloudinaryUploadedAt: undefined,
      });

      let cloudinary: CloudinaryResponse | undefined;
      try {
        cloudinary = await uploadToCloudinary(fetcher, signed.data, photo.image);
      } catch (error) {
        // With overwrite=false, a conflict after a lost response can mean the first upload succeeded.
        // Registration verifies the asset server-to-server, so it is the safe arbiter.
        if (!(error instanceof SyncRequestError) || error.status !== 409) throw error;
      }
      photo = await renew({
        cloudinaryPublicId: cloudinary?.public_id ?? signed.data.upload.publicId,
        cloudinarySecureUrl: cloudinary?.secure_url,
        cloudinaryUploadedAt: now().toISOString(),
      });
    }

    await registerUpload(fetcher, token, photo, photo.uploadIntentId!, photo.cloudinaryPublicId!);
    await store.completeClaimedPhoto(photo.id, claimId);
    photoSyncChannel.publish({ type: "upload-completed", cameraPassId: photo.cameraPassId, photoId: photo.id });
    photoSyncChannel.publish({ type: "shot-count-changed", cameraPassId: photo.cameraPassId });
    return "uploaded";
  } catch (error) {
    const requestError = error instanceof SyncRequestError ? error : undefined;
    if (requestError && isIntentExpiry(requestError)) {
      const delay = calculateRetryDelay(photo.attempts, random);
      await store.updateClaimedPhoto(photo.id, claimId, {
        status: "failed",
        failureKind: "retryable",
        failureCode: requestError.code,
        failureStage: requestError.stage,
        failureStatus: requestError.status,
        lastError: "The upload reservation expired and will be refreshed.",
        nextRetryAt: new Date(now().getTime() + delay).toISOString(),
        claimId: undefined,
        claimExpiresAt: undefined,
        uploadIntentId: undefined,
        uploadIntentExpiresAt: undefined,
        cloudinaryPublicId: undefined,
        cloudinarySecureUrl: undefined,
        cloudinaryUploadedAt: undefined,
      });
      return "retry";
    }
    if (!requestError || isRetryableStatus(requestError.status)) {
      const delay = calculateRetryDelay(photo.attempts, random);
      await store.updateClaimedPhoto(photo.id, claimId, {
        status: "failed",
        failureKind: "retryable",
        failureCode: requestError?.code ?? "sync_error",
        failureStage: requestError?.stage,
        failureStatus: requestError?.status,
        lastError: requestError?.message ?? "Upload temporarily failed. We'll keep trying.",
        nextRetryAt: new Date(now().getTime() + delay).toISOString(),
        claimId: undefined,
        claimExpiresAt: undefined,
      });
      return "retry";
    }
    await store.updateClaimedPhoto(photo.id, claimId, {
      status: "failed",
      failureKind: "attention",
      failureCode: requestError.code,
      failureStage: requestError.stage,
      failureStatus: requestError.status,
      lastError: requestError.message,
      nextRetryAt: undefined,
      claimId: undefined,
      claimExpiresAt: undefined,
    });
    photoSyncChannel.publish({ type: "needs-attention", cameraPassId: photo.cameraPassId, photoId: photo.id });
    return "attention";
  }
}

async function runBatch(
  cameraPassId: string,
  token: string | null,
  options: SyncDependencies,
): Promise<SyncBatchResult> {
  const store = options.store ?? offlinePhotoStore;
  const fetcher = options.fetch ?? fetch;
  const reachable = options.canReach ?? (() => canReachApplication());
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const claimLeaseMs = options.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
  const claimId = (options.claimId ?? createClaimId)();
  const base = { uploaded: 0, retryScheduled: 0, needsAttention: 0 };
  let outstanding = await store.getOutstandingPhotos(cameraPassId);
  if (!token) return { ...base, status: "token-unavailable", remaining: outstanding.length };
  if (!(await reachable())) return { ...base, status: "waiting-for-connection", remaining: outstanding.length };

  let pass: PassResponse;
  try {
    pass = await fetchPass(fetcher, token);
  } catch (error) {
    const terminal = error instanceof SyncRequestError && !isRetryableStatus(error.status);
    if (terminal) {
      for (const photo of outstanding.filter((item) => item.failureKind !== "attention")) {
        await store.markNeedsAttention(photo.id, error.code, error.message);
        photoSyncChannel.publish({ type: "needs-attention", cameraPassId, photoId: photo.id });
        base.needsAttention += 1;
      }
    }
    return {
      ...base,
      status: terminal ? "needs-attention" : "waiting-for-connection",
      remaining: outstanding.length,
      diagnostic: error instanceof SyncRequestError
        ? { stage: error.stage, status: error.status, code: error.code, message: error.message }
        : { stage: "pass", code: "sync_error", message: "The pass check failed temporarily." },
    };
  }

  if (pass.data.pass_id !== cameraPassId) {
    for (const photo of outstanding.filter((item) => item.failureKind !== "attention")) {
      await store.markNeedsAttention(photo.id, "camera_pass_mismatch", "These photos belong to a different camera pass.");
      photoSyncChannel.publish({ type: "needs-attention", cameraPassId, photoId: photo.id });
      base.needsAttention += 1;
    }
    return { ...base, status: "needs-attention", remaining: outstanding.length };
  }

  // Existing live intents already hold server capacity; new records consume current remaining shots.
  const nowMs = now().getTime();
  const candidates = outstanding.filter((photo) => photo.failureKind !== "attention");
  const reserved = candidates.filter(
    (photo) => photo.uploadIntentId && photo.uploadIntentExpiresAt && Date.parse(photo.uploadIntentExpiresAt) > nowMs,
  );
  const unreserved = candidates.filter((photo) => !reserved.includes(photo));
  const allowedUnreserved = unreserved.slice(0, Math.max(0, pass.data.shots_remaining));
  const allowedIds = new Set([...reserved, ...allowedUnreserved].map((photo) => photo.id));
  for (const photo of candidates.filter((item) => !allowedIds.has(item.id))) {
    await store.markNeedsAttention(
      photo.id,
      "shot_capacity_unavailable",
      "The server currently has fewer available shots than are stored on this device.",
    );
    photoSyncChannel.publish({ type: "needs-attention", cameraPassId, photoId: photo.id });
    base.needsAttention += 1;
  }

  while (true) {
    const photo = await store.claimNextPhoto(cameraPassId, claimId, now(), claimLeaseMs);
    if (!photo) break;
    photoSyncChannel.publish({ type: "upload-started", cameraPassId, photoId: photo.id });
    const outcome = await processClaimedPhoto(photo, token, claimId, {
      store,
      fetch: fetcher,
      now,
      random,
      claimLeaseMs,
    });
    if (outcome === "uploaded") base.uploaded += 1;
    else if (outcome === "retry") base.retryScheduled += 1;
    else base.needsAttention += 1;
  }

  outstanding = await store.getOutstandingPhotos(cameraPassId);
  const retryablePhotos = outstanding.filter((photo) => photo.failureKind === "retryable");
  const attentionPhotos = outstanding.filter((photo) => photo.failureKind === "attention");
  base.retryScheduled = retryablePhotos.length;
  base.needsAttention = attentionPhotos.length;
  const retryDates = retryablePhotos
    .filter((photo) => photo.nextRetryAt)
    .map((photo) => photo.nextRetryAt!)
    .sort();
  const status: SyncBatchStatus = attentionPhotos.length > 0
    ? "needs-attention"
    : retryablePhotos.length > 0
      ? "retry-scheduled"
      : "complete";
  const failed = attentionPhotos[0] ?? retryablePhotos[0];
  return {
    ...base,
    status,
    remaining: outstanding.length,
    nextRetryAt: retryDates[0],
    diagnostic: failed?.failureStage && failed.failureCode
      ? { stage: failed.failureStage, status: failed.failureStatus, code: failed.failureCode, message: failed.lastError ?? "Upload failed." }
      : undefined,
  };
}

/** In-memory lock deduplicates foreground triggers; IndexedDB claim leases coordinate tabs/reloads. */
export function syncCameraPhotos(
  cameraPassId: string,
  token: string | null,
  options: SyncDependencies = {},
): Promise<SyncBatchResult> {
  const active = runningBatches.get(cameraPassId);
  if (active) return active;
  const batch = runBatch(cameraPassId, token, options).finally(() => runningBatches.delete(cameraPassId));
  runningBatches.set(cameraPassId, batch);
  return batch;
}
