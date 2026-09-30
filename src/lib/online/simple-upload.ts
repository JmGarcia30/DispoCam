import { offlinePhotoStore, type OfflinePhotoStore } from "@/lib/offline/database";
import { requestJson, SyncRequestError, type SyncBatchResult } from "@/lib/offline/sync";
import { NETWORK_TIMEOUTS } from "@/lib/network/timeouts";
import { createBrowserUuid } from "@/lib/browser/uuid";

interface SimpleUploadResponse {
  data: {
    photo: { id: string; client_upload_id: string };
    shots_used: number;
    shot_limit: number;
    registered_remaining: number;
  };
}

export async function uploadOnlinePhotoSimple(
  cameraPassId: string,
  token: string | null,
  photoId: string,
  options: { store?: OfflinePhotoStore; fetch?: typeof fetch; now?: () => Date; claimId?: () => string } = {},
): Promise<SyncBatchResult> {
  const store = options.store ?? offlinePhotoStore;
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const outstanding = await store.getOutstandingPhotos(cameraPassId);
  if (!token) return { status: "token-unavailable", uploaded: 0, retryScheduled: 1, needsAttention: 0, remaining: outstanding.length };
  const claimId = (options.claimId ?? createBrowserUuid)();
  const photo = await store.claimNextPhoto(cameraPassId, claimId, now(), 60_000, new Set([photoId]));
  if (!photo) return { status: "retry-scheduled", uploaded: 0, retryScheduled: outstanding.length, needsAttention: 0, remaining: outstanding.length };

  try {
    const response = await requestJson<SimpleUploadResponse>(
      fetcher,
      `/api/camera/${encodeURIComponent(token)}/uploads/simple`,
      {
        method: "POST",
        body: photo.image,
        headers: {
          "Content-Type": "image/jpeg",
          "X-Client-Upload-Id": photo.id,
          "X-Captured-At": photo.capturedAt,
        },
        credentials: "same-origin",
        cache: "no-store",
      },
      "proxy",
      NETWORK_TIMEOUTS.binaryProxyMs,
    );
    await store.completeClaimedPhoto(photo.id, claimId);
    const remaining = (await store.getOutstandingPhotos(cameraPassId)).length;
    return {
      status: "complete",
      uploaded: 1,
      retryScheduled: remaining,
      needsAttention: 0,
      remaining,
      authoritativeShots: {
        shotsUsed: response.data.shots_used,
        shotLimit: response.data.shot_limit,
        registeredRemaining: response.data.registered_remaining,
      },
    };
  } catch (error) {
    const requestError = error instanceof SyncRequestError ? error : undefined;
    await store.updateClaimedPhoto(photo.id, claimId, {
      status: "failed",
      failureKind: "retryable",
      failureStage: requestError?.stage ?? "proxy",
      failureStatus: requestError?.status,
      failureCode: requestError?.code ?? "simple_upload_failed",
      failureMethod: "server-fallback",
      lastError: requestError?.message ?? "The photo upload failed.",
      nextRetryAt: undefined,
      claimId: undefined,
      claimExpiresAt: undefined,
    });
    return {
      status: "retry-scheduled",
      uploaded: 0,
      retryScheduled: 1,
      needsAttention: 0,
      remaining: (await store.getOutstandingPhotos(cameraPassId)).length,
      diagnostic: requestError
        ? { stage: requestError.stage, status: requestError.status, code: requestError.code, message: requestError.message, method: "server-fallback" }
        : { stage: "proxy", code: "simple_upload_failed", message: "The photo upload failed." },
    };
  }
}
