import type { OfflineCameraSession } from "@/lib/offline/types";

export interface WeddingConfig {
  coupleNames: string;
  weddingDate: string;
  days?: string;
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
  time?: string;
  location?: string;
  villa?: string;
  whatToBring?: string;
}

export const DEFAULT_WEDDING_CONFIG: WeddingConfig = {
  coupleNames: "Jaseph",
  weddingDate: "November 19, 2026",
  days: "Thursday–Friday",
  welcomeMessage: "Capture the night from your point of view.",
  subMessage: "No app needed. Your photos will upload automatically.",
  accentColor: "#9E1B22", // Gothic blood red
  accentLightColor: "#E2DCDA",
  backgroundColor: "#070608",
  cameraBodyColor: "#141318",
  monogram: "J",
  editionLabel: "HALLOWEEN PARTY PASS",
  requiresOnlineCapture: false,
  time: "6:00 PM",
  location: "Block 12, Lot 19 Mercury Street, Santo Niño, San Fernando, Pampanga, 2000",
  villa: "Casa de Elvira",
  whatToBring: "Alak",
};

/**
 * Resolves event/invitation configuration, blending defaults with session details.
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
        monogram = clean.slice(0, 1).toUpperCase();
      }
    }
  }

  const isJaseph = coupleNames.toLowerCase().includes("jaseph");
  const resolvedDate = override?.weddingDate ?? (isJaseph ? "October 1–2, 2026" : (eventDate ?? DEFAULT_WEDDING_CONFIG.weddingDate));

  return {
    ...DEFAULT_WEDDING_CONFIG,
    ...override,
    coupleNames,
    monogram,
    weddingDate: resolvedDate,
    days: override?.days ?? DEFAULT_WEDDING_CONFIG.days,
    guestName: session?.guestName ?? override?.guestName,
    requiresOnlineCapture: session?.requiresOnlineCapture ?? override?.requiresOnlineCapture ?? DEFAULT_WEDDING_CONFIG.requiresOnlineCapture,
    time: override?.time ?? DEFAULT_WEDDING_CONFIG.time,
    location: override?.location ?? DEFAULT_WEDDING_CONFIG.location,
    villa: override?.villa ?? DEFAULT_WEDDING_CONFIG.villa,
    whatToBring: override?.whatToBring ?? DEFAULT_WEDDING_CONFIG.whatToBring,
  };
}
