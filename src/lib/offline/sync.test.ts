import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflinePhotoStore } from "@/lib/offline/database";
import { binaryProxyRequestInit, buildProxyEndpoint, createProxyUploadBlob, fetchWithTimeout, isDirectTransportFailure, isIosSafari, isRetryableStatus, requestJson, SyncRequestError, syncCameraPhotos, timeoutForStage } from "@/lib/offline/sync";
import { PROXY_IMAGE_MAX_BYTES, VERCEL_FUNCTION_BODY_LIMIT_BYTES } from "@/lib/network/proxy-upload";
import { sameOriginMultipartPost } from "@/lib/network/upload-diagnostics";
import { NETWORK_TIMEOUTS } from "@/lib/network/timeouts";
import { preparePhotosForManualRetry } from "@/lib/offline/manual-retry";

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
    vi.useRealTimers();
    await store.close();
    indexedDB.deleteDatabase(databaseName);
    vi.restoreAllMocks();
  });

  const options = (fetcher: typeof fetch) => ({
    store,
    fetch: fetcher,
    canReach: async () => true,
    fallbackCanReach: async () => true,
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
    const uploadBody = fetcher.mock.calls[2][1]?.body as FormData;
    expect(uploadBody.get("api_key")).toBe("public-key");
    expect(uploadBody.get("timestamp")).toBe("1893456000");
    expect(uploadBody.get("public_id")).toBe("weddings/pending/photo-one");
    expect(uploadBody.get("overwrite")).toBe("false");
    expect(uploadBody.get("context")).toBe(`intent_id=${INTENT_ID}|client_upload_id=${PHOTO_ID}`);
    expect(uploadBody.get("signature")).toBe("temporary-signature");
    expect(uploadBody.get("file")).toBeInstanceOf(Blob);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/uploads/proxy"))).toBe(false);
  });

  it("falls back through the reachable backend after a direct Cloudinary transport failure", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(json({ data: { id: "server-photo" } }, 201));

    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result).toMatchObject({ status: "complete", uploaded: 1, remaining: 0 });
    const proxyCall = fetcher.mock.calls.find(([url]) => String(url).endsWith("/uploads/proxy"));
    expect(proxyCall).toBeDefined();
    const body = proxyCall![1]?.body as Blob;
    const headers = new Headers(proxyCall![1]?.headers);
    expect(headers.get("Content-Type")).toBe("image/jpeg");
    expect(proxyCall![1]?.redirect).toBeUndefined();
    expect(proxyCall![1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(headers.get("X-Client-Upload-Id")).toBe(PHOTO_ID);
    expect(headers.get("X-Upload-Intent-Id")).toBe(INTENT_ID);
    expect(headers.get("X-Captured-At")).toBe("2029-12-31T22:00:00.000Z");
    expect(body).toBeInstanceOf(Blob);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/uploads/register"))).toBe(false);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("builds raw binary proxy options without FormData", () => {
    const image = new Blob(["jpeg"], { type: "image/jpeg" });
    const init = binaryProxyRequestInit(image, { id: PHOTO_ID, capturedAt: "2029-12-31T22:00:00.000Z" }, INTENT_ID);
    expect(init.body).toBe(image);
    expect(init.body).not.toBeInstanceOf(FormData);
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(new Headers(init.headers).get("X-Upload-Intent-Id")).toBe(INTENT_ID);
  });

  it("selects binary proxy first for iOS Safari only", () => {
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(true);
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", "MacIntel", 0)).toBe(false);
  });

  it("omits redirect and Content-Type from proxy and diagnostic-probe multipart options", () => {
    const proxy = sameOriginMultipartPost(new FormData());
    const probe = sameOriginMultipartPost(new FormData());
    for (const init of [proxy, probe]) {
      expect(init.redirect).toBeUndefined();
      expect(init.headers).toBeUndefined();
      expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    }
  });

  it("uploads a 700 KB photo through an absolute same-origin proxy URL with a fresh signal", async () => {
    await store.clearPhotosForPass(PASS_ID);
    const imageBytes = new Uint8Array(700_000);
    imageBytes.set([0xff, 0xd8, 0xff]);
    await store.storePhoto({
      id: PHOTO_ID,
      cameraPassId: PASS_ID,
      image: new Blob([imageBytes], { type: "image/jpeg" }),
      capturedAt: "2029-12-31T22:00:00.000Z",
      width: 1600,
      height: 1200,
    });
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith(`/camera/${TOKEN}`)) return pass();
      if (String(url).endsWith("/uploads/sign")) return signed();
      signals.push(init!.signal!);
      if (String(url).includes("cloudinary.test")) throw new TypeError("Load failed");
      return json({ data: { id: "server-photo" } }, 201);
    });
    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result).toMatchObject({ status: "complete", uploaded: 1 });
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1].aborted).toBe(false);
    const proxyCall = fetcher.mock.calls.find(([url]) => String(url).endsWith("/uploads/proxy"))!;
    expect(proxyCall[1]?.body).toBeInstanceOf(Blob);
    expect((proxyCall[1]?.body as Blob).size).toBe(700_000);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("uses the 700 KB raw binary proxy first for an iOS Safari session", async () => {
    await store.clearPhotosForPass(PASS_ID);
    const bytes = new Uint8Array(700_000);
    bytes.set([0xff, 0xd8, 0xff]);
    await store.storePhoto({
      id: PHOTO_ID, cameraPassId: PASS_ID, image: new Blob([bytes], { type: "image/jpeg" }),
      capturedAt: "2029-12-31T22:00:00.000Z", width: 1600, height: 1200,
    });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(json({ data: { id: "server-photo", client_upload_id: PHOTO_ID } }, 201));
    const result = await syncCameraPhotos(PASS_ID, TOKEN, { ...options(fetcher), preferServerFallback: () => true });
    expect(result).toMatchObject({ status: "complete", uploaded: 1, remaining: 0 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[2][0])).toContain("/uploads/proxy");
    expect(fetcher.mock.calls[2][1]?.body).toBeInstanceOf(Blob);
    expect((fetcher.mock.calls[2][1]?.body as Blob).size).toBe(700_000);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("cloudinary.test"))).toBe(false);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("allows a same-origin proxy redirect to resolve to its final response", async () => {
    const finalResponse = json({ data: { id: "server-photo" } }, 201);
    Object.defineProperty(finalResponse, "redirected", { value: true });
    Object.defineProperty(finalResponse, "url", { value: "https://camera.example/api/camera/token/uploads/proxy" });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockRejectedValueOnce(new TypeError("Direct upload failed"))
      .mockImplementationOnce(async (_url, init) => {
        expect(init?.redirect).toBeUndefined();
        return finalResponse;
      });
    await expect(syncCameraPhotos(PASS_ID, TOKEN, options(fetcher))).resolves.toMatchObject({ status: "complete", uploaded: 1 });
    expect(finalResponse.redirected).toBe(true);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("builds an absolute same-origin proxy URL without exposing another host", () => {
    expect(buildProxyEndpoint("a/b", "https://camera.example")).toBe("https://camera.example/api/camera/a%2Fb/uploads/proxy");
  });

  it("creates a fallback-only derivative under the verified proxy threshold", async () => {
    expect(PROXY_IMAGE_MAX_BYTES).toBeLessThan(VERCEL_FUNCTION_BODY_LIMIT_BYTES);
    const original = new Blob([new Uint8Array(PROXY_IMAGE_MAX_BYTES + 1)], { type: "image/jpeg" });
    const derivative = new Blob([new Uint8Array(250_000)], { type: "image/jpeg" });
    const processor = vi.fn().mockResolvedValue({ blob: derivative, width: 1600, height: 1200, originalBytes: original.size });
    const result = await createProxyUploadBlob(original, processor);
    expect(result).toBe(derivative);
    expect(processor).toHaveBeenCalledWith(original, { maxDimension: 2048, quality: 0.76, maxBytes: PROXY_IMAGE_MAX_BYTES });
    expect(original.size).toBe(PROXY_IMAGE_MAX_BYTES + 1);
  });

  it("classifies a direct Cloudinary timeout for server fallback", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const pending = requestJson(fetcher, "https://api.cloudinary.test/upload", { method: "POST" }, "cloudinary", 1_000);
    let failure: unknown;
    void pending.catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).rejects.toMatchObject({ stage: "cloudinary", status: 408, code: "request_timeout" });
    expect(failure).toBeInstanceOf(SyncRequestError);
    expect(isDirectTransportFailure(new SyncRequestError("cloudinary-direct", 408, "request_timeout", "Timed out", "direct"))).toBe(true);
  });

  it("keeps the local Blob and fallback preference when direct and proxy transports fail", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(json({ error: { code: "proxy_upload_failed", message: "The server upload failed temporarily.", stage: "cloudinary-server" } }, 502));

    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result).toMatchObject({
      status: "retry-scheduled",
      diagnostic: { stage: "cloudinary-server", method: "binary-server-fallback", transport: "binary-proxy", status: 502, code: "proxy_upload_failed" },
    });
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({
      id: PHOTO_ID,
      image: expect.any(Blob),
      failureKind: "retryable",
      failureStage: "cloudinary-server",
      failureMethod: "binary-server-fallback",
      preferServerFallback: true,
    });
  });

  it("reports browser-to-proxy transport failure as proxy network_error", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockRejectedValueOnce(new TypeError("Cloudinary load failed"))
      .mockRejectedValueOnce(new TypeError("Proxy load failed"));
    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result).toMatchObject({
      status: "retry-scheduled",
      diagnostic: { stage: "proxy", method: "binary-server-fallback", code: "network_error" },
    });
    expect((await store.getPhoto(PHOTO_ID))?.image).toBeInstanceOf(Blob);
  });

  it("preserves a proxy 413 response instead of converting it to network_error", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockRejectedValueOnce(new TypeError("Cloudinary load failed"))
      .mockResolvedValueOnce(json({ error: { code: "proxy_payload_too_large", message: "The fallback upload exceeds the proxy size limit." } }, 413));
    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(result).toMatchObject({
      status: "needs-attention",
      diagnostic: { stage: "proxy", method: "binary-server-fallback", status: 413, code: "proxy_payload_too_large" },
    });
    expect((await store.getPhoto(PHOTO_ID))?.image).toBeInstanceOf(Blob);
  });

  it("does not call the proxy when backend reachability fails after a direct transport error", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockRejectedValueOnce(new TypeError("Load failed"));
    const result = await syncCameraPhotos(PASS_ID, TOKEN, {
      ...options(fetcher),
      fallbackCanReach: async () => false,
    });
    expect(result).toMatchObject({
      status: "retry-scheduled",
      diagnostic: { stage: "cloudinary-direct", method: "direct", code: "network_error" },
    });
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/uploads/proxy"))).toBe(false);
    const stored = await store.getPhoto(PHOTO_ID);
    expect(stored?.image).toBeInstanceOf(Blob);
    expect(stored?.preferServerFallback).toBeUndefined();
    await preparePhotosForManualRetry(PASS_ID, undefined, store);
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({ status: "pending", preferServerFallback: true });
  });

  it("uses the server fallback directly on manual retry after a prior direct transport failure", async () => {
    const first = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(json({ error: { code: "proxy_upload_failed" } }, 502));
    await syncCameraPhotos(PASS_ID, TOKEN, options(first));
    await preparePhotosForManualRetry(PASS_ID, undefined, store);

    const retry = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(json({ data: { id: "server-photo" } }, 201));
    await expect(syncCameraPhotos(PASS_ID, TOKEN, options(retry))).resolves.toMatchObject({ status: "complete", uploaded: 1 });
    expect(retry.mock.calls[2][0]).toContain("/uploads/proxy");
    expect(retry.mock.calls.some(([url]) => String(url).includes("cloudinary.test"))).toBe(false);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("refreshes an expired fallback intent with the same clientUploadId", async () => {
    const first = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(json({ error: { code: "upload_intent_expired", message: "Expired" } }, 409));
    await syncCameraPhotos(PASS_ID, TOKEN, options(first));
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({
      id: PHOTO_ID,
      failureCode: "upload_intent_expired",
      uploadIntentId: undefined,
      preferServerFallback: true,
    });

    nowMs += 3_000;
    const newIntent = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const retry = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed(newIntent, "weddings/pending/refreshed"))
      .mockResolvedValueOnce(json({ data: { id: "server-photo" } }, 201));
    await expect(syncCameraPhotos(PASS_ID, TOKEN, options(retry))).resolves.toMatchObject({ status: "complete", uploaded: 1 });
    expect(JSON.parse(String(retry.mock.calls[1][1]?.body)).clientUploadId).toBe(PHOTO_ID);
    const proxyHeaders = new Headers(retry.mock.calls[2][1]?.headers);
    expect(proxyHeaders.get("X-Upload-Intent-Id")).toBe(newIntent);
    expect(proxyHeaders.get("X-Client-Upload-Id")).toBe(PHOTO_ID);
  });

  it("automatically completes an offline capture when backend reachability returns", async () => {
    const offlineFetcher = vi.fn<typeof fetch>();
    const waiting = await syncCameraPhotos(PASS_ID, TOKEN, { ...options(offlineFetcher), canReach: async () => false });
    expect(waiting).toMatchObject({ status: "waiting-for-connection", remaining: 1 });
    expect(offlineFetcher).not.toHaveBeenCalled();
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({ id: PHOTO_ID, status: "pending" });

    const backendPhotos: string[] = [];
    const onlineFetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockImplementationOnce(async (_url, init) => {
        backendPhotos.push(JSON.parse(String(init?.body)).clientUploadId);
        return registered();
      });
    const complete = await syncCameraPhotos(PASS_ID, TOKEN, options(onlineFetcher));

    expect(complete).toMatchObject({ status: "complete", uploaded: 1, remaining: 0 });
    expect(backendPhotos).toEqual([PHOTO_ID]);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("allows Cloudinary to take longer than the API timeout without scheduling a retry", async () => {
    vi.useFakeTimers();
    expect(NETWORK_TIMEOUTS.cloudinaryUploadMs).toBeGreaterThan(NETWORK_TIMEOUTS.uploadSignMs);
    expect(NETWORK_TIMEOUTS.cloudinaryUploadMs).toBeGreaterThan(NETWORK_TIMEOUTS.uploadRegisterMs);
    expect(timeoutForStage("cloudinary")).toBe(90_000);
    expect(timeoutForStage("sign")).toBe(25_000);
    const fetcher = vi.fn<typeof fetch>(() => new Promise((resolve) => setTimeout(() => resolve(cloudinary()), 31_000)));

    let settled = false;
    const pending = requestJson(fetcher, "https://api.cloudinary.test/upload", { method: "POST" }, "cloudinary")
      .finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toMatchObject({ public_id: "weddings/pending/photo-one" });
  });

  it("completes the full upload when AbortSignal.timeout is unavailable", async () => {
    const original = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
    try {
      const fetcher = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(pass())
        .mockResolvedValueOnce(signed())
        .mockResolvedValueOnce(cloudinary())
        .mockResolvedValueOnce(registered());
      const result = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
      expect(result).toMatchObject({ status: "complete", uploaded: 1, remaining: 0 });
      expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
    } finally {
      if (original) Object.defineProperty(AbortSignal, "timeout", original);
    }
  });

  it("aborts requests with AbortController after the configured timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const pending = fetchWithTimeout(fetcher, "/slow", {}, 1_000);
    const rejection = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    vi.useRealTimers();
  });

  it("classifies a sign timeout as retryable", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const pending = requestJson(fetcher, "/sign", { method: "POST" }, "sign", 1_000);
    const rejection = expect(pending).rejects.toMatchObject({ stage: "sign", status: 408, code: "request_timeout" });
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(isRetryableStatus(408)).toBe(true);
    vi.useRealTimers();
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
    const failedResult = await syncCameraPhotos(PASS_ID, TOKEN, options(fetcher));
    expect(failedResult).toMatchObject({
      status: "retry-scheduled",
      diagnostic: { stage: "cloudinary-direct", status: 408, code: "cloudinary_signature_expired" },
    });
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({
      id: PHOTO_ID,
      failureKind: "retryable",
      failureStage: "cloudinary-direct",
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
    expect(result.diagnostic).toMatchObject({ stage: "sign", status: 500, code: "temporary" });
    expect(saved).toMatchObject({ status: "failed", attempts: 1, failureKind: "retryable" });
    expect(Date.parse(saved!.nextRetryAt!) - nowMs).toBe(2_000);
  });

  it("manually retries a retryable photo immediately despite a future nextRetryAt", async () => {
    const firstAttempt = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(json({ error: { message: "temporary" } }, 503));
    await syncCameraPhotos(PASS_ID, TOKEN, options(firstAttempt));
    const failed = await store.getPhoto(PHOTO_ID);
    expect(failed).toMatchObject({ failureKind: "retryable", failureStage: "cloudinary-direct" });
    expect(Date.parse(failed!.nextRetryAt!)).toBeGreaterThan(nowMs);

    await preparePhotosForManualRetry(PASS_ID, undefined, store);
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({
      id: PHOTO_ID,
      status: "pending",
      image: expect.any(Blob),
      nextRetryAt: undefined,
      failureKind: undefined,
      failureCode: undefined,
      failureStage: undefined,
      failureStatus: undefined,
      lastError: undefined,
      claimId: undefined,
      claimExpiresAt: undefined,
    });

    const retry = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(registered());
    const result = await syncCameraPhotos(PASS_ID, TOKEN, options(retry));
    expect(result).toMatchObject({ status: "complete", uploaded: 1 });
    expect(JSON.parse(String(retry.mock.calls[1][1]?.body)).clientUploadId).toBe(PHOTO_ID);
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
  });

  it("manually resets an attention photo so it retries immediately", async () => {
    const terminal = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(json({ error: { code: "camera_pass_expired", message: "Expired" } }, 403));
    await syncCameraPhotos(PASS_ID, TOKEN, options(terminal));
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({ failureKind: "attention" });

    expect(await preparePhotosForManualRetry(PASS_ID, undefined, store)).toBe(1);
    expect(await store.getPhoto(PHOTO_ID)).toMatchObject({ status: "pending", failureKind: undefined });

    const retry = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pass())
      .mockResolvedValueOnce(signed())
      .mockResolvedValueOnce(cloudinary())
      .mockResolvedValueOnce(registered());
    await expect(syncCameraPhotos(PASS_ID, TOKEN, options(retry))).resolves.toMatchObject({ status: "complete", uploaded: 1 });
    expect(await store.getPhoto(PHOTO_ID)).toBeUndefined();
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
