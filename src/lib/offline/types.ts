export const OFFLINE_PHOTO_STATUSES = ["pending", "uploading", "uploaded", "failed"] as const;

export type OfflinePhotoStatus = (typeof OFFLINE_PHOTO_STATUSES)[number];
export type SyncFailureKind = "retryable" | "attention";

export interface OfflinePhoto {
  /** Stable client upload UUID. It must also be used by the future sync API calls. */
  id: string;
  /** The non-secret camera pass database ID, never the bearer token. */
  cameraPassId: string;
  image: Blob;
  capturedAt: string;
  status: OfflinePhotoStatus;
  attempts: number;
  createdAt: string;
  width: number;
  height: number;
  byteSize: number;
  lastError?: string;
  failureCode?: string;
  failureKind?: SyncFailureKind;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  claimId?: string;
  claimExpiresAt?: string;
  uploadIntentId?: string;
  uploadIntentExpiresAt?: string;
  cloudinaryPublicId?: string;
  cloudinarySecureUrl?: string;
  cloudinaryUploadedAt?: string;
}

export interface NewOfflinePhoto {
  id: string;
  cameraPassId: string;
  image: Blob;
  capturedAt: string;
  width: number;
  height: number;
}

export interface OfflineCameraSession {
  /** SHA-256 fingerprint of the high-entropy bearer token; the raw token is never stored. */
  tokenFingerprint: string;
  cameraPassId: string;
  weddingId: string;
  weddingName: string;
  guestId: string;
  guestName: string | null;
  serverRemainingShots: number;
  maxUploadBytes: number;
  expiresAt: string | null;
  resolvedAt: string;
}
