import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflinePhotoStore } from "@/lib/offline/database";
import { uploadOnlinePhotoSimple } from "@/lib/online/simple-upload";

const PASS_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "camera-token-with-more-than-thirty-two-characters";

function response(id: string, shotsUsed: number) {
  return new Response(JSON.stringify({ data: { photo: { id: `server-${id}`, client_upload_id: id }, shots_used: shotsUsed, shot_limit: 10, registered_remaining: 10 - shotsUsed } }), { status: 201, headers: { "Content-Type": "application/json" } });
}

describe("simple online upload client", () => {
  let store: OfflinePhotoStore;
  let databaseName: string;

  beforeEach(() => {
    databaseName = `simple-upload-${crypto.randomUUID()}`;
    store = new OfflinePhotoStore(databaseName, indexedDB);
  });

  afterEach(async () => {
    await store.close();
    indexedDB.deleteDatabase(databaseName);
  });

  async function save(id: string) {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" });
    const photo = await store.storePhoto({ id, cameraPassId: PASS_ID, image: blob, capturedAt: "2026-10-01T00:00:00.000Z", width: 1200, height: 900 });
    return { photo, blob };
  }

  it("sends the stored JPEG unchanged and deletes it only after success", async () => {
    const id = crypto.randomUUID();
    const { blob } = await save(id);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(id, 1));
    const result = await uploadOnlinePhotoSimple(PASS_ID, TOKEN, id, { store, fetch: fetcher, claimId: () => "claim" });
    expect(result).toMatchObject({ uploaded: 1, authoritativeShots: { shotsUsed: 1, registeredRemaining: 9 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain("/uploads/simple");
    const sent = fetcher.mock.calls[0][1]?.body as Blob;
    expect(sent).toMatchObject({ size: blob.size, type: blob.type });
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(new Uint8Array(await blob.arrayBuffer()));
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("X-Client-Upload-Id")).toBe(id);
    expect(await store.getPhoto(id)).toBeUndefined();
  });

  it("keeps the same Blob, capturedAt, and clientUploadId after failure for manual retry", async () => {
    const id = crypto.randomUUID();
    const { blob } = await save(id);
    const failed = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: "simple_upload_failed", message: "Upload failed" } }), { status: 502, headers: { "Content-Type": "application/json" } }));
    expect((await uploadOnlinePhotoSimple(PASS_ID, TOKEN, id, { store, fetch: failed, claimId: () => "first" })).uploaded).toBe(0);
    const stored = await store.getPhoto(id);
    expect(stored?.image).toMatchObject({ size: blob.size, type: blob.type });
    expect(new Uint8Array(await stored!.image.arrayBuffer())).toEqual(new Uint8Array(await blob.arrayBuffer()));
    await store.retryPhoto(id);
    const retry = vi.fn<typeof fetch>().mockResolvedValue(response(id, 1));
    expect((await uploadOnlinePhotoSimple(PASS_ID, TOKEN, id, { store, fetch: retry, claimId: () => "second" })).uploaded).toBe(1);
    expect(new Headers(retry.mock.calls[0][1]?.headers).get("X-Client-Upload-Id")).toBe(id);
    expect(new Headers(retry.mock.calls[0][1]?.headers).get("X-Captured-At")).toBe("2026-10-01T00:00:00.000Z");
  });

  it("uploads five sequential captures through only the simple endpoint", async () => {
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    for (const id of ids) await save(id);
    let shotsUsed = 0;
    const received: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const id = new Headers(init?.headers).get("X-Client-Upload-Id")!;
      received.push(id);
      shotsUsed += 1;
      return response(id, shotsUsed);
    });
    for (const id of ids) {
      await store.retryPhoto(id);
      await expect(uploadOnlinePhotoSimple(PASS_ID, TOKEN, id, { store, fetch: fetcher })).resolves.toMatchObject({ uploaded: 1 });
    }
    expect(received).toEqual(ids);
    expect(shotsUsed).toBe(5);
    expect(await store.getOutstandingPhotos(PASS_ID)).toEqual([]);
    expect(fetcher.mock.calls.every(([url]) => String(url).endsWith("/uploads/simple"))).toBe(true);
  });
});
