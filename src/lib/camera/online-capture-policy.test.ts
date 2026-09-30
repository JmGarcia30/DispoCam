import { describe, expect, it } from "vitest";
import { canStartCountedCapture, shotsAfterRegistration, visibleShotsRemaining } from "@/lib/camera/online-capture-policy";
import { resolveWeddingConfig } from "@/lib/wedding/config";

describe("online-only event capture policy", () => {
  it("prevents an offline guest from starting a capture", () => {
    expect(canStartCountedCapture({ requiresOnlineCapture: true, backendOnline: false, cameraReady: true, saving: false, hasShots: true })).toBe(false);
  });

  it("does not create a local capture or reduce shots for an offline attempt", () => {
    let localRecords = 0;
    if (canStartCountedCapture({ requiresOnlineCapture: true, backendOnline: false, cameraReady: true, saving: false, hasShots: true })) localRecords += 1;
    expect(localRecords).toBe(0);
    expect(visibleShotsRemaining(true, 10, 9)).toBe(10);
  });

  it("changes the shot count only after successful registration", () => {
    expect(shotsAfterRegistration(10, false)).toBe(10);
    expect(shotsAfterRegistration(10, true)).toBe(9);
  });

  it("re-enables the shutter after the backend health state becomes online", () => {
    const base = { requiresOnlineCapture: true, cameraReady: true, saving: false, hasShots: true };
    expect(canStartCountedCapture({ ...base, backendOnline: false })).toBe(false);
    expect(canStartCountedCapture({ ...base, backendOnline: true })).toBe(true);
  });

  it("enables online-only mode for Jaseph while preserving Test Wedding defaults", () => {
    expect(resolveWeddingConfig({ weddingName: "Jaseph's Birthday", requiresOnlineCapture: true }).requiresOnlineCapture).toBe(true);
    expect(resolveWeddingConfig({ weddingName: "Test Wedding" }).requiresOnlineCapture).toBe(false);
  });
});
