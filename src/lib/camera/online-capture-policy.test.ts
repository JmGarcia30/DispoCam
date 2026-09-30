import { describe, expect, it, vi } from "vitest";
import { availableCapacity, canStartCountedCapture, finalizeOnlineCaptureOutcome, onlineCaptureUiState, registeredRemaining, sessionRemainingShots, shotsAfterRegistration, visibleShotsRemaining } from "@/lib/camera/online-capture-policy";
import { resolveWeddingConfig } from "@/lib/wedding/config";

describe("online-only event capture policy", () => {
  it("prevents an offline guest from starting a capture", () => {
    expect(canStartCountedCapture({ requiresOnlineCapture: true, backendOnline: false, cameraReady: true, saving: false, hasShots: true })).toBe(false);
  });

  it("does not create a local capture or reduce shots for an offline attempt", () => {
    let localRecords = 0;
    if (canStartCountedCapture({ requiresOnlineCapture: true, backendOnline: false, cameraReady: true, saving: false, hasShots: true })) localRecords += 1;
    expect(localRecords).toBe(0);
    expect(visibleShotsRemaining(true, 10, 9)).toBe(9);
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

  it("separates registered remaining shots from reserved capacity", () => {
    expect(registeredRemaining({ shot_limit: 10, shots_used: 8 })).toBe(2);
    expect(availableCapacity({ shot_limit: 10, shots_used: 8, shots_reserved: 1 })).toBe(1);
    expect(sessionRemainingShots({ requires_online_capture: true, shot_limit: 10, shots_used: 8, shots_remaining: 1 })).toBe(2);
    expect(sessionRemainingShots({ requires_online_capture: false, shot_limit: 10, shots_used: 8, shots_remaining: 1 })).toBe(1);
  });

  it("subtracts unresolved local captures from online-only shutter capacity", () => {
    expect(visibleShotsRemaining(true, 4, 3)).toBe(3);
    expect(visibleShotsRemaining(true, 1, 0)).toBe(0);
  });

  it("displays registered shots without declaring the roll finished while two photos are pending", () => {
    expect(onlineCaptureUiState(2, 2)).toEqual({ displayed: 2, usableCapacity: 0, rollFinished: false });
    expect(onlineCaptureUiState(4, 1)).toEqual({ displayed: 4, usableCapacity: 0, rollFinished: false });
    expect(onlineCaptureUiState(0, 2)).toEqual({ displayed: 0, usableCapacity: 0, rollFinished: false });
    expect(onlineCaptureUiState(0, 0)).toEqual({ displayed: 0, usableCapacity: 0, rollFinished: true });
  });

  it("restores the last reserved shot after definitive failure and consumes it only after registration", () => {
    const before = registeredRemaining({ shot_limit: 10, shots_used: 8 });
    expect(before).toBe(2);
    expect(visibleShotsRemaining(true, before, before - 1)).toBe(1);

    // Releasing the failed intent and removing its confirmed-unused local record restores both real shots.
    expect(visibleShotsRemaining(true, before, before)).toBe(2);
    expect(canStartCountedCapture({ requiresOnlineCapture: true, backendOnline: true, cameraReady: true, saving: false, hasShots: true })).toBe(true);

    const afterSuccessfulRegistration = registeredRemaining({ shot_limit: 10, shots_used: 9 });
    expect(afterSuccessfulRegistration).toBe(1);
  });

  it.each([
    { uploaded: 1, confirmedNotRegistered: false, refreshed: 9, expected: "success" },
    { uploaded: 0, confirmedNotRegistered: true, refreshed: 10, expected: "failed" },
    { uploaded: 0, confirmedNotRegistered: false, refreshed: 10, expected: "checking" },
    { uploaded: 0, confirmedNotRegistered: true, refreshed: 9, expected: "checking" },
  ])("refreshes authoritative shots after every $expected outcome", async ({ uploaded, confirmedNotRegistered, refreshed, expected }) => {
    const refreshShots = vi.fn().mockResolvedValue(refreshed);
    await expect(finalizeOnlineCaptureOutcome({ uploaded, confirmedNotRegistered, previousShots: 10, refreshShots })).resolves.toBe(expected);
    expect(refreshShots).toHaveBeenCalledTimes(1);
  });
});
