export const OFFLINE_PHOTO_STATUSES = ["pending", "uploading", "uploaded", "failed"] as const;

export type OfflinePhotoStatus = (typeof OFFLINE_PHOTO_STATUSES)[number];
export type SyncFailureKind = "retryable" | "attention";
export type SyncFailureStage = "pass" | "sign" | "cloudinary" | "cloudinary-direct" | "proxy" | "cloudinary-server" | "register";
export type UploadMethod = "direct" | "server-fallback" | "binary-server-fallback";
export type UploadTransport = "binary-proxy";
export type CameraPageMode = "real-camera-route" | "restored-offline-shell";

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
  resetGeneration?: number;
  capacityReserved?: boolean;
  lastError?: string;
  failureCode?: string;
  failureStage?: SyncFailureStage;
  failureStatus?: number;
  failureKind?: SyncFailureKind;
  failureMethod?: UploadMethod;
  failureTransport?: UploadTransport;
  processedByteSize?: number;
  failurePageMode?: CameraPageMode;
  preferServerFallback?: boolean;
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
  resetGeneration?: number;
}

export interface OfflineCameraSession {
  /** SHA-256 fingerprint of the high-entropy bearer token; the raw token is never stored. */
  tokenFingerprint: string;
  cameraPassId: string;
  weddingId: string;
  weddingName: string;
  eventDate?: string | null;
  guestId: string;
  guestName: string | null;
  /** Explicitly identifies the built-in local-only preview; never inferred from API behavior. */
  isDemo?: boolean;
  requiresOnlineCapture?: boolean;
  serverRemainingShots: number;
  maxUploadBytes: number;
  expiresAt: string | null;
  resolvedAt: string;
  resetGeneration?: number;
}
