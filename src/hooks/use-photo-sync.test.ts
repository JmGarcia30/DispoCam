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

import { usePhotoSync } from "@/hooks/use-photo-sync";

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
});
