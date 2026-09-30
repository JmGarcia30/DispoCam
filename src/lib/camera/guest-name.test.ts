import { describe, expect, it, vi } from "vitest";
import { createDemoCameraSession } from "@/lib/camera/demo-session";
import { needsGuestName, saveGuestDisplayName } from "@/lib/camera/guest-name";
import type { OfflineCameraSession } from "@/lib/offline/types";

function realSession(): OfflineCameraSession {
  return {
    ...createDemoCameraSession(),
    tokenFingerprint: "real-fingerprint",
    cameraPassId: "real-pass",
    weddingId: "real-wedding",
    guestId: "real-guest",
    isDemo: false,
  };
}

describe("guest-name persistence mode", () => {
  it("creates a demo preview that asks for a name", () => {
    const session = createDemoCameraSession();
    expect(session.isDemo).toBe(true);
    expect(session.guestName).toBeNull();
    expect(needsGuestName(session.guestName)).toBe(true);
  });

  it("saves a trimmed demo name locally without calling the camera API", async () => {
    const fetcher = vi.fn();
    const saveSession = vi.fn().mockResolvedValue(undefined);
    const updated = await saveGuestDisplayName(
      { session: createDemoCameraSession(), token: null, offline: true, displayName: "  Demo Guest  " },
      { saveSession, fetcher: fetcher as unknown as typeof fetch },
    );

    expect(updated.guestName).toBe("Demo Guest");
    expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ guestName: "Demo Guest", isDemo: true }));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("PATCHes a real pass before caching the name locally", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { guest_name: "Real Guest" } }), { status: 200 }));
    const saveSession = vi.fn().mockResolvedValue(undefined);
    const updated = await saveGuestDisplayName(
      { session: realSession(), token: "real/token", offline: false, displayName: "Real Guest" },
      { saveSession, fetcher: fetcher as unknown as typeof fetch },
    );

    expect(fetcher).toHaveBeenCalledWith("/api/camera/real%2Ftoken", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ displayName: "Real Guest" }),
    }));
    expect(updated.guestName).toBe("Real Guest");
    expect(saveSession).toHaveBeenCalledOnce();
  });

  it("retains the 2 to 120 character validation in both modes", async () => {
    const saveSession = vi.fn();
    await expect(saveGuestDisplayName(
      { session: createDemoCameraSession(), token: null, offline: true, displayName: " " },
      { saveSession },
    )).rejects.toThrow("between 2 and 120");
    await expect(saveGuestDisplayName(
      { session: createDemoCameraSession(), token: null, offline: true, displayName: "x".repeat(121) },
      { saveSession },
    )).rejects.toThrow("between 2 and 120");
    expect(saveSession).not.toHaveBeenCalled();
  });
});
