import type { OfflineCameraSession } from "@/lib/offline/types";
import { DEFAULT_WEDDING_CONFIG } from "@/lib/wedding/config";

export function createDemoCameraSession(): OfflineCameraSession {
  return {
    tokenFingerprint: "demo-wedding-fingerprint",
    cameraPassId: "demo-pass-id-01",
    weddingId: "demo-wedding-01",
    weddingName: DEFAULT_WEDDING_CONFIG.coupleNames,
    guestId: "demo-guest-01",
    guestName: null,
    isDemo: true,
    serverRemainingShots: 10,
    maxUploadBytes: 10 * 1024 * 1024,
    expiresAt: null,
    resolvedAt: new Date().toISOString(),
  };
}
