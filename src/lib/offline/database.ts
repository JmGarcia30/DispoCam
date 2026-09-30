import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { OfflineStorageError, toOfflineStorageError } from "@/lib/offline/errors";
import type { NewOfflinePhoto, OfflineCameraSession, OfflinePhoto, OfflinePhotoStatus } from "@/lib/offline/types";

const DEFAULT_DATABASE_NAME = "dispocam-offline";
const DATABASE_VERSION = 3;

interface DispoCamOfflineSchema extends DBSchema {
  photos: {
    key: string;
    value: OfflinePhoto;
    indexes: {
      "by-status": OfflinePhotoStatus;
      "by-pass": string;
      "by-created-at": string;
    };
  };
  cameraSessions: {
    key: string;
    value: OfflineCameraSession;
    indexes: { "by-pass": string };
  };
}

export interface StorageEstimate {
  usage?: number;
  quota?: number;
  available?: number;
}

export class OfflinePhotoStore {
  private database?: Promise<IDBPDatabase<DispoCamOfflineSchema>>;

  constructor(
    private readonly databaseName = DEFAULT_DATABASE_NAME,
    private readonly indexedDbFactory?: IDBFactory,
  ) {}

  private getDatabase() {
    const indexedDbFactory = this.indexedDbFactory ?? globalThis.indexedDB;
    if (!indexedDbFactory) {
      throw new OfflineStorageError("unsupported", "This browser cannot save photos for offline use.");
    }
    this.database ??= openDB<DispoCamOfflineSchema>(this.databaseName, DATABASE_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("photos")) {
          const photos = database.createObjectStore("photos", { keyPath: "id" });
          photos.createIndex("by-status", "status");
          photos.createIndex("by-pass", "cameraPassId");
          photos.createIndex("by-created-at", "createdAt");
        }
        if (!database.objectStoreNames.contains("cameraSessions")) {
          const sessions = database.createObjectStore("cameraSessions", { keyPath: "tokenFingerprint" });
          sessions.createIndex("by-pass", "cameraPassId");
        }
      },
    });
    return this.database;
  }

  async storePhoto(input: NewOfflinePhoto): Promise<OfflinePhoto> {
    const now = new Date().toISOString();
    const photo: OfflinePhoto = {
      ...input,
      status: "pending",
      attempts: 0,
      createdAt: now,
      byteSize: input.image.size,
    };
    try {
      await (await this.getDatabase()).add("photos", photo);
      return photo;
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }

  async storePhotoWithinShotLimit(input: NewOfflinePhoto, serverRemainingShots: number): Promise<OfflinePhoto> {
    const photo: OfflinePhoto = {
      ...input,
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString(),
      byteSize: input.image.size,
    };
    try {
      const database = await this.getDatabase();
      const transaction = database.transaction("photos", "readwrite");
      const existing = await transaction.store.index("by-pass").getAll(input.cameraPassId);
      const outstanding = existing.filter((item) => item.status !== "uploaded").length;
      if (outstanding >= Math.max(0, Math.trunc(serverRemainingShots))) {
        throw new OfflineStorageError(
          "shot-limit-reached",
          "This camera pass has no shots remaining after locally saved photos are counted.",
        );
      }
      await transaction.store.add(photo);
      await transaction.done;
      return photo;
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }

  async getPhoto(id: string): Promise<OfflinePhoto | undefined> {
    return (await this.getDatabase()).get("photos", id);
  }

  async saveCameraSession(session: OfflineCameraSession): Promise<void> {
    try {
      await (await this.getDatabase()).put("cameraSessions", session);
    } catch (error) {
      throw toOfflineStorageError(error);
    }
  }

  async getCameraSession(tokenFingerprint: string): Promise<OfflineCameraSession | undefined> {
    return (await this.getDatabase()).get("cameraSessions", tokenFingerprint);
  }

  async getMostRecentCameraSession(): Promise<OfflineCameraSession | undefined> {
    const sessions = await (await this.getDatabase()).getAll("cameraSessions");
    return sessions.sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt))[0];
  }

  async getPhotosForPass(cameraPassId: string): Promise<OfflinePhoto[]> {
    return (await this.getDatabase()).getAllFromIndex("photos", "by-pass", cameraPassId);
  }

  async getOutstandingPhotos(cameraPassId: string): Promise<OfflinePhoto[]> {
    const photos = await this.getPhotosForPass(cameraPassId);
    return photos.filter((photo) => photo.status !== "uploaded").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Development/admin helper: never touches records belonging to another pass. */
  async clearPhotosForPass(cameraPassId: string): Promise<number> {
    const database = await this.getDatabase();
    const transaction = database.transaction("photos", "readwrite");
    const keys = await transaction.store.index("by-pass").getAllKeys(cameraPassId);
    for (const key of keys) await transaction.store.delete(key);
    await transaction.done;
    return keys.length;
  }

  async claimNextPhoto(
    cameraPassId: string,
    claimId: string,
    now: Date,
    leaseMs: number,
  ): Promise<OfflinePhoto | undefined> {
    const database = await this.getDatabase();
    const transaction = database.transaction("photos", "readwrite");
    const photos = await transaction.store.index("by-pass").getAll(cameraPassId);
    const nowMs = now.getTime();
    const eligible = photos
      .filter((photo) => {
        if (photo.status === "pending") return true;
        if (photo.status === "failed") {
          return photo.failureKind !== "attention" && (!photo.nextRetryAt || Date.parse(photo.nextRetryAt) <= nowMs);
        }
        if (photo.status === "uploading") {
          return !photo.claimExpiresAt || Date.parse(photo.claimExpiresAt) <= nowMs;
        }
        return false;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const photo = eligible[0];
    if (!photo) {
      await transaction.done;
      return undefined;
    }
    const claimed: OfflinePhoto = {
      ...photo,
      status: "uploading",
      attempts: photo.attempts + 1,
      lastAttemptAt: now.toISOString(),
      claimId,
      claimExpiresAt: new Date(nowMs + leaseMs).toISOString(),
      lastError: undefined,
      failureCode: undefined,
      failureStage: undefined,
      failureStatus: undefined,
      failureKind: undefined,
      nextRetryAt: undefined,
    };
    await transaction.store.put(claimed);
    await transaction.done;
    return claimed;
  }

  async updateClaimedPhoto(
    id: string,
    claimId: string,
    patch: Partial<OfflinePhoto>,
  ): Promise<OfflinePhoto> {
    const database = await this.getDatabase();
    const transaction = database.transaction("photos", "readwrite");
    const photo = await transaction.store.get(id);
    if (!photo) throw new OfflineStorageError("not-found", "The locally stored photo could not be found.");
    if (photo.claimId !== claimId || photo.status !== "uploading") {
      throw new OfflineStorageError("write-failed", "The photo synchronization claim is no longer active.");
    }
    const updated = { ...photo, ...patch, id: photo.id, image: photo.image };
    await transaction.store.put(updated);
    await transaction.done;
    return updated;
  }

  async completeClaimedPhoto(id: string, claimId: string): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction("photos", "readwrite");
    const photo = await transaction.store.get(id);
    if (!photo) {
      await transaction.done;
      return;
    }
    if (photo.claimId !== claimId || photo.status !== "uploading") {
      throw new OfflineStorageError("write-failed", "The photo synchronization claim is no longer active.");
    }
    await transaction.store.delete(id);
    await transaction.done;
  }

  async markNeedsAttention(id: string, code: string, message: string): Promise<OfflinePhoto> {
    const database = await this.getDatabase();
    const transaction = database.transaction("photos", "readwrite");
    const photo = await transaction.store.get(id);
    if (!photo) throw new OfflineStorageError("not-found", "The locally stored photo could not be found.");
    const updated: OfflinePhoto = {
      ...photo,
      status: "failed",
      failureKind: "attention",
      failureCode: code,
      lastError: message,
      nextRetryAt: undefined,
      claimId: undefined,
      claimExpiresAt: undefined,
    };
    await transaction.store.put(updated);
    await transaction.done;
    return updated;
  }

  async retryPhoto(id: string): Promise<OfflinePhoto> {
    const database = await this.getDatabase();
    const transaction = database.transaction("photos", "readwrite");
    const photo = await transaction.store.get(id);
    if (!photo) throw new OfflineStorageError("not-found", "The locally stored photo could not be found.");
    const updated: OfflinePhoto = {
      ...photo,
      status: "pending",
      preferServerFallback: photo.preferServerFallback || (
        photo.failureStage === "cloudinary" &&
        (photo.failureCode === "network_error" || photo.failureCode === "request_timeout")
      ),
      failureKind: undefined,
      failureCode: undefined,
      failureStage: undefined,
      failureStatus: undefined,
      failureMethod: undefined,
      lastError: undefined,
      nextRetryAt: undefined,
      claimId: undefined,
      claimExpiresAt: undefined,
    };
    await transaction.store.put(updated);
    await transaction.done;
    return updated;
  }

  async getPendingPhotos(cameraPassId?: string): Promise<OfflinePhoto[]> {
    const database = await this.getDatabase();
    const photos = await database.getAllFromIndex("photos", "by-status", "pending");
    return cameraPassId ? photos.filter((photo) => photo.cameraPassId === cameraPassId) : photos;
  }

  async updateStatus(
    id: string,
    status: OfflinePhotoStatus,
    options: { incrementAttempts?: boolean; lastError?: string } = {},
  ): Promise<OfflinePhoto> {
    const database = await this.getDatabase();
    const transaction = database.transaction("photos", "readwrite");
    const photo = await transaction.store.get(id);
    if (!photo) {
      throw new OfflineStorageError("not-found", "The locally stored photo could not be found.");
    }
    const updated: OfflinePhoto = {
      ...photo,
      status,
      attempts: photo.attempts + (options.incrementAttempts ? 1 : 0),
      ...(options.lastError === undefined ? {} : { lastError: options.lastError }),
    };
    await transaction.store.put(updated);
    await transaction.done;
    return updated;
  }

  async deleteUploadedPhoto(id: string): Promise<boolean> {
    const database = await this.getDatabase();
    const transaction = database.transaction("photos", "readwrite");
    const photo = await transaction.store.get(id);
    if (!photo || photo.status !== "uploaded") {
      await transaction.done;
      return false;
    }
    await transaction.store.delete(id);
    await transaction.done;
    return true;
  }

  async close(): Promise<void> {
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}

export const offlinePhotoStore = new OfflinePhotoStore();

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return {};
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota, available: quota === undefined ? undefined : Math.max(0, quota - (usage ?? 0)) };
}
