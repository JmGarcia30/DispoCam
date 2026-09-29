import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflinePhotoStore } from "@/lib/offline/database";
import { syncCameraPhotos } from "@/lib/offline/sync";

const PASS_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "camera-token-with-more-than-thirty-two-characters";
const PHOTO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INTENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function pass(shotsRemaining = 10) {
  return json({ data: { pass_id: PASS_ID, shots_remaining: shotsRemaining } });
}

function signed(intentId = INTENT_ID, publicId = "weddings/pending/photo-one") {
  return json({
    data: {
      intentId,
      expiresAt: "2030-01-01T00:10:00.000Z",
      uploadUrl: "https://api.cloudinary.test/upload",
      upload: {
        apiKey: "public-key",
        timestamp: 1_893_456_000,
        publicId,
        overwrite: false,
        context: `intent_id=${intentId}|client_upload_id=${PHOTO_ID}`,
        signature: "temporary-signature",
      },
    },
  });
}

function cloudinary(publicId = "weddings/pending/photo-one") {
  return json({ public_id: publicId, secure_url: `https://res.cloudinary.test/${publicId}.jpg` });
}

function registered() {
  return json({ data: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }, 201);
}

describe("photo synchronization", () => {
  let databaseName: string;
  let store: OfflinePhotoStore;
  let nowMs: number;

  beforeEach(async () => {
    databaseName = `dispocam-sync-test-${crypto.randomUUID()}`;
    store = new OfflinePhotoStore(databaseName, indexedDB);
    nowMs = Date.parse("2029-12-31T23:00:00.000Z");
    await store.storePhoto({
      id: PHOTO_ID,
      cameraPassId: PASS_ID,
      image: new Blob(["photo"], { type: "image/jpeg" }),
      capturedAt: "2029-12-31T22:00:00.000Z",
      width: 1200,
      height: 900,
    });
  });

  afterEach(async () => {
    await store.close();
    indexedDB.deleteDatabase(databaseName);
    vi.restoreAllMocks();
  });

  const options = (fetcher: typeof fetch) => ({
    store,
    fetch: fetcher,
    canReach: async () => true,
    now: () => new Date(nowMs),
    random: () => 0.5,
    claimId: () => "test-claim",
  });

  it("runs sign, Cloudinary upload, and registration before deleting locally", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(registered());

    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));

    expect(result).toMatchObject({ status: "complete", uploaded: 1, remaining: 0 });
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
    const signBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    const registerBody = JSON.parse(String(fetcher.mock.calls[3][1]?.body));
    expect(signBody.clientUploadId).toBe(PHOTO_ID);
    expect(registerBody.clientUploadId).toBe(PHOTO_ID);
  });

  it("keeps the stable clientUploadId across transient retries", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(json({ error: { message: "temporary" } }, 503));
    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect((await store.getPhoto(PHOTO_ID))?.id).toBe(PHOTO_ID);

    nowMs += 3_000;
    fetcher
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(registered());
    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));

    const signBodies = fetcher.mock.calls
      .filter(([url]) => String(url).endsWith("/uploads/sign"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(signBodies).toHaveLength(2);
    expect(signBodies.every((body) => body.clientUploadId === PHOTO_ID)).toBe(true);
  });

  it("persists Cloudinary success when registration fails", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(json({ error: { code: "database_error" } }, 503));

    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    const saved = await store.getPhoto(PHOTO_ID);
    expect(saved).toMatchObject({
      status: "failed",
      failureKind: "retryable",
      uploadIntentId: INTENT_ID,
      cloudinaryPublicId: "weddings/pending/photo-one",
    });
    expect(saved?.cloudinaryUploadedAt).toBeDefined();
    expect(saved?.image).toBeInstanceOf(Blob);
  });

  it("retries registration without re-uploading to Cloudinary", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(json({ error: { code: "database_error" } }, 503));
    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));

    nowMs += 3_000;
    fetcher.mockResolvedValueOnce(pass()).mockResolvedValueOnce(registered());
    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));

    expect(result.uploaded).toBe(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("cloudinary.test"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/uploads/sign"))).toHaveLength(1);
  });

  it("recovers a stale uploading record after an interrupted session", async () => {
    await store.updateStatus(PHOTO_ID, "uploading");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(registered());

    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result.uploaded).toBe(1);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("clears an expired intent and obtains a fresh signature on retry", async () => {
    const expired = json({ error: { code: "upload_intent_expired", message: "Expired" } }, 409);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(expired);
    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect((await store.getPhoto(PHOTO_ID))?.uploadIntentId).toBeUndefined();

    nowMs += 3_000;
    const newIntent = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    fetcher
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed(newIntent, "weddings/pending/photo-two"))
      .mockResolvedValueOnce(cloudinary("weddings/pending/photo-two"))
      .mockResolvedValueOnce(registered());
    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));

    const signCalls = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/uploads/sign"));
    expect(signCalls).toHaveLength(2);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("refreshes an expired Cloudinary signature without changing the client UUID", async () => {
    const staleSignature = json({ error: { message: "Stale request - timestamp is too old" } }, 401);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(staleSignature);
    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({
      id: PHOTO_ID,
      failureKind: "retryable",
      failureCode: "cloudinary_signature_expired",
    });

    nowMs += 3_000;
    fetcher
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(registered());
    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));

    const signBodies = fetcher.mock.calls
      .filter(([url]) => String(url).endsWith("/uploads/sign"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(signBodies).toHaveLength(2);
    expect(signBodies.every((body) => body.clientUploadId === PHOTO_ID)).toBe(true);
  });

  it("schedules exponential backoff for transient failures", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(json({ error: { code: "temporary" } }, 500));

    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    const saved = await store.getPhoto(PHOTO_ID);
    expect(result.status).toBe("retry-scheduled");
    expect(saved).toMatchObject({ status: "failed", attempts: 1, failureKind: "retryable" });
    expect(Date.parse(saved!.nextRetryAt!) - nowMs).toBe(2_000);
  });

  it("marks terminal failures as needing attention and does not retry them", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(json({ error: { code: "camera_pass_expired", message: "Expired" } }, 403));

    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result.status).toBe("needs-attention");
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({
      status: "failed",
      failureKind: "attention",
      failureCode: "camera_pass_expired",
    });
  });

  it("treats a duplicate registration response as confirmed synchronization", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(json({ error: { code: "duplicate_upload" } }, 409));

    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result.uploaded).toBe(1);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("deduplicates concurrent foreground sync runs", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (String(url).endsWith(`/camera/${TOKEN}`)) return pass();
      if (String(url).endsWith("/uploads/sign")) return signed();
      if (String(url).includes("cloudinary.test")) return cloudinary();
      return registered();
    });

    const first = syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    const second = syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("never deletes the local record before registration is confirmed", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(json({ error: { code: "invalid_cloudinary_asset" } }, 422));

    await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    const saved = await store.getPhoto(PHOTO_ID);
    expect(saved?.image).toBeInstanceOf(Blob);
    expect(saved?.failureKind).toBe("attention");
  });

  it("marks queued overflow for attention when the server has fewer shots", async () => {
    await store.storePhoto({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      cameraPassId: PASS_ID,
      image: new Blob(["second"]),
      capturedAt: "2029-12-31T22:01:00.000Z",
      width: 10,
      height: 10,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(pass(0));

    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result.needsAttention).toBe(2);
    expect((await store.getOutstandingPhotos(PASS_ID)).every((photo) => photo.failureCode === "shot_capacity_unavailable")).toBe(true);
  });
});
