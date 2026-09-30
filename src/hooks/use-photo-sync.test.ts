import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkNetwork, syncCameraPhotos } = vi.hoisted(() => ({
  checkNetwork: vi.fn(),
  syncCameraPhotos: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: () => undefined,
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [initial, () => undefined],
  };
});

vi.mock("@/hooks/use-network-status", () => ({
  useNetworkStatus: () => ({ check: checkNetwork, online: false, state: "checking" }),
}));

vi.mock("@/lib/offline/database", () => ({
  offlinePhotoStore: {
    getOutstandingPhotos: vi.fn().mockResolvedValue([]),
    recoverUploadingPhotos: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/offline/sync", () => ({ syncCameraPhotos }));
vi.mock("@/lib/offline/manual-retry", () => ({ preparePhotosForManualRetry: vi.fn() }));

import { selectAutoRetryPhoto, subscribeAutoRetryTriggers, usePhotoSync } from "@/hooks/use-photo-sync";
import type { OfflinePhoto } from "@/lib/offline/types";

describe("usePhotoSync online capture", () => {
  beforeEach(() => {
    checkNetwork.mockReset().mockResolvedValue(true);
    syncCameraPhotos.mockReset().mockResolvedValue({
      status: "complete",
      uploaded: 1,
      retryScheduled: 0,
      needsAttention: 0,
      remaining: 0,
    });
  });

  it("uploads captures when React network state is checking but health checks succeed", async () => {
    const sync = usePhotoSync("camera-pass", "camera-token", "real-camera-route");
    const photoIds = ["photo-1", "photo-2", "photo-3", "photo-4"];

    for (const photoId of photoIds) {
      await expect(sync.notifyPhotoCaptured(photoId)).resolves.toMatchObject({ uploaded: 1 });
    }

    expect(checkNetwork).toHaveBeenCalledTimes(4);
    expect(syncCameraPhotos).toHaveBeenCalledTimes(4);
    expect(syncCameraPhotos.mock.calls.map(([, , options]) => options.photoIds)).toEqual(
      photoIds.map((photoId) => [photoId]),
    );
  });

  it("does not reuse another photo's foreground promise and deduplicates the same photo", async () => {
    const sync = usePhotoSync("camera-pass", "camera-token", "real-camera-route", true);
    const photoA = sync.notifyPhotoCaptured("photo-a");
    const duplicateA = sync.notifyPhotoCaptured("photo-a");
    const photoB = sync.notifyPhotoCaptured("photo-b");
    expect(photoB).not.toBe(photoA);
    await Promise.all([photoA, duplicateA, photoB]);
    expect(syncCameraPhotos).toHaveBeenCalledTimes(2);
    expect(syncCameraPhotos.mock.calls.map(([, , options]) => options.photoIds)).toEqual([["photo-a"], ["photo-b"]]);
  });

  it("selects the same due clientUploadId for automatic retry without selecting a concurrent upload", () => {
    const due = { id: "same-client-upload-id", status: "failed", failureKind: "retryable", nextRetryAt: "2026-10-01T00:00:02.000Z" } as OfflinePhoto;
    const future = { id: "future", status: "failed", failureKind: "retryable", nextRetryAt: "2026-10-01T00:00:20.000Z" } as OfflinePhoto;
    const uploading = { id: "active", status: "uploading" } as OfflinePhoto;
    expect(selectAutoRetryPhoto([uploading, due, future], Date.parse("2026-10-01T00:00:05.000Z"))?.id).toBe("same-client-upload-id");
    expect(selectAutoRetryPhoto([future], Date.parse("2026-10-01T00:00:05.000Z"))).toBeUndefined();
    expect(selectAutoRetryPhoto([future], Date.parse("2026-10-01T00:00:05.000Z"), true)?.id).toBe("future");
  });

  it("requests online-only retry after reconnect, focus, and visible-page return", () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    documentTarget.visibilityState = "visible";
    const retry = vi.fn();
    const unsubscribe = subscribeAutoRetryTriggers(
      windowTarget as unknown as Window,
      documentTarget as unknown as Document,
      retry,
    );
    windowTarget.dispatchEvent(new Event("online"));
    windowTarget.dispatchEvent(new Event("focus"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(retry).toHaveBeenCalledTimes(3);
    unsubscribe();
    windowTarget.dispatchEvent(new Event("online"));
    expect(retry).toHaveBeenCalledTimes(3);
  });
});
