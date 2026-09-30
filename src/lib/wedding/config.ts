import type { OfflineCameraSession } from "@/lib/offline/types";

export interface WeddingConfig {
  coupleNames: string;
  weddingDate: string;
  welcomeMessage: string;
  subMessage: string;
  accentColor: string;
  accentLightColor: string;
  backgroundColor: string;
  cameraBodyColor: string;
  monogram: string;
  editionLabel: string;
  guestName?: string;
  requiresOnlineCapture: boolean;
}

export const DEFAULT_WEDDING_CONFIG: WeddingConfig = {
  coupleNames: "Paul and Angelica",
  weddingDate: "November 19, 2026",
  welcomeMessage: "Capture the night from your point of view.",
  subMessage: "No app needed. Your photos will upload automatically.",
  accentColor: "#C59B6A", // Warm antique brass / champagne gold
  accentLightColor: "#F4EDE2",
  backgroundColor: "#161514",
  cameraBodyColor: "#22211F",
  monogram: "P & A",
  editionLabel: "WEDDING CAMERA PASS",
  requiresOnlineCapture: false,
};

/**
 * Resolves wedding configuration, blending defaults with session details.
 */
export function resolveWeddingConfig(
  session?: Partial<OfflineCameraSession> | null,
  override?: Partial<WeddingConfig>,
): WeddingConfig {
  let coupleNames = override?.coupleNames ?? DEFAULT_WEDDING_CONFIG.coupleNames;
  let monogram = override?.monogram ?? DEFAULT_WEDDING_CONFIG.monogram;
  const eventDate = session?.eventDate
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${session.eventDate}T00:00:00Z`))
    : undefined;

  if (
    session?.weddingName &&
    session.weddingName !== "Sophia & Julian" &&
    session.weddingName !== "Sophia and Julian" &&
    !override?.coupleNames
  ) {
    const clean = session.weddingName.replace(/\s+wedding$/i, "").trim();
    if (clean) {
      coupleNames = clean;
      const match = clean.match(/^([A-Za-z])[^&]+?(?:&|\band\b)\s*([A-Za-z])/i);
      if (match) {
        monogram = `${match[1].toUpperCase()} & ${match[2].toUpperCase()}`;
      } else {
        monogram = clean.slice(0, 2).toUpperCase();
      }
    }
  }

  return {
    ...DEFAULT_WEDDING_CONFIG,
    ...override,
    coupleNames,
    monogram,
    weddingDate: override?.weddingDate ?? eventDate ?? DEFAULT_WEDDING_CONFIG.weddingDate,
    guestName: session?.guestName ?? override?.guestName,
    requiresOnlineCapture: session?.requiresOnlineCapture ?? override?.requiresOnlineCapture ?? DEFAULT_WEDDING_CONFIG.requiresOnlineCapture,
  };
}
