import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OfflinePhotoStore } from "@/lib/offline/database";
import { openDB } from "idb";

const PASS_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PASS_ID = "22222222-2222-4222-8222-222222222222";

function input(id: string, cameraPassId = PASS_ID) {
  return {
    id,
    cameraPassId,
    image: new Blob(["image-data"], { type: "image/jpeg" }),
    capturedAt: "2026-09-29T10:00:00.000Z",
    width: 1200,
    height: 900,
  };
}

describe("OfflinePhotoStore", () => {
  let databaseName: string;
  let store: OfflinePhotoStore;

  beforeEach(() => {
    databaseName = `dispocam-test-${crypto.randomUUID()}`;
    store = new OfflinePhotoStore(databaseName, indexedDB);
  });

  afterEach(async () => {
    await store.close();
    indexedDB.deleteDatabase(databaseName);
  });

  it("stores and retrieves a photo with its Blob", async () => {
    const id = crypto.randomUUID();
    await store.storePhoto(input(id));

    const photo = await store.getPhoto(id);
    expect(photo).toMatchObject({ id, cameraPassId: PASS_ID, status: "pending", attempts: 0 });
    expect(photo?.image).toBeInstanceOf(Blob);
    expect(photo?.byteSize).toBe(10);
  });

  it("retrieves only pending photos for the requested pass", async () => {
    const pending = await store.storePhoto(input(crypto.randomUUID()));
    const uploaded = await store.storePhoto(input(crypto.randomUUID()));
    await store.storePhoto(input(crypto.randomUUID(), OTHER_PASS_ID));
    await store.updateStatus(uploaded.id, "uploaded");

    const photos = await store.getPendingPhotos(PASS_ID);
    expect(photos.map((photo) => photo.id)).toEqual([pending.id]);
  });

  it("updates status and attempt count", async () => {
    const photo = await store.storePhoto(input(crypto.randomUUID()));
    const updated = await store.updateStatus(photo.id, "failed", {
      incrementAttempts: true,
      lastError: "Temporary network error",
    });

    expect(updated).toMatchObject({
      id: photo.id,
      status: "failed",
      attempts: 1,
      lastError: "Temporary network error",
    });
  });

  it("deletes uploaded photos but preserves unsynchronized photos", async () => {
    const uploaded = await store.storePhoto(input(crypto.randomUUID()));
    const pending = await store.storePhoto(input(crypto.randomUUID()));
    await store.updateStatus(uploaded.id, "uploaded");

    expect(await store.deleteUploadedPhoto(uploaded.id)).toBe(true);
    expect(await store.deleteUploadedPhoto(pending.id)).toBe(false);
    expect(await store.getPhoto(uploaded.id)).toBeUndefined();
    expect(await store.getPhoto(pending.id)).toBeDefined();
  });

  it("keeps the original UUID through retry status changes", async () => {
    const originalId = crypto.randomUUID();
    await store.storePhoto(input(originalId));
    await store.updateStatus(originalId, "uploading", { incrementAttempts: true });
    await store.updateStatus(originalId, "failed", { lastError: "offline" });
    const retried = await store.updateStatus(originalId, "uploading", { incrementAttempts: true });

    expect(retried.id).toBe(originalId);
    expect(retried.attempts).toBe(2);
    expect((await store.getPhotosForPass(PASS_ID))).toHaveLength(1);
  });

  it("atomically refuses captures beyond the effective local limit", async () => {
    await store.storePhotoWithinShotLimit(input(crypto.randomUUID()), 1);
    await expect(store.storePhotoWithinShotLimit(input(crypto.randomUUID()), 1)).rejects.toMatchObject({
      code: "shot-limit-reached",
    });
  });

  it("upgrades an existing version 2 database without rewriting photo records", async () => {
    await store.close();
    const legacy = await openDB(databaseName, 2, {
      upgrade(database) {
        const photos = database.createObjectStore("photos", { keyPath: "id" });
        photos.createIndex("by-status", "status");
        photos.createIndex("by-pass", "cameraPassId");
        photos.createIndex("by-created-at", "createdAt");
      },
    });
    const legacyPhoto = {
      ...input(PHOTO_ID_FOR_MIGRATION),
      status: "pending" as const,
      attempts: 0,
      createdAt: "2026-09-29T10:00:00.000Z",
      byteSize: 10,
    };
    await legacy.put("photos", legacyPhoto);
    legacy.close();

    store = new OfflinePhotoStore(databaseName, indexedDB);
    await store.saveCameraSession({
      tokenFingerprint: "fingerprint",
      cameraPassId: PASS_ID,
      weddingId: "wedding",
      weddingName: "Wedding",
      guestId: "guest",
      guestName: "Guest",
      serverRemainingShots: 9,
      maxUploadBytes: 100,
      expiresAt: null,
      resolvedAt: "2026-09-29T10:00:00.000Z",
    });

    expect((await store.getPhoto(PHOTO_ID_FOR_MIGRATION))?.image).toBeInstanceOf(Blob);
    expect((await store.getCameraSession("fingerprint"))?.cameraPassId).toBe(PASS_ID);
  });
});

const PHOTO_ID_FOR_MIGRATION = "33333333-3333-4333-8333-333333333333";
