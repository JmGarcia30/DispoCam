export function canStartCountedCapture(input: {
  requiresOnlineCapture: boolean;
  backendOnline: boolean;
  cameraReady: boolean;
  saving: boolean;
  hasShots: boolean;
}): boolean {
  return input.cameraReady && !input.saving && input.hasShots && (!input.requiresOnlineCapture || input.backendOnline);
}

/** Online-only events never reserve/decrement a visible shot for a local temporary Blob. */
export function visibleShotsRemaining(
  requiresOnlineCapture: boolean,
  serverRemainingShots: number,
  offlineFirstRemainingShots: number,
): number {
  return requiresOnlineCapture ? Math.max(0, serverRemainingShots) : offlineFirstRemainingShots;
}

export function shotsAfterRegistration(serverRemainingShots: number, registered: boolean): number {
  return registered ? Math.max(0, serverRemainingShots - 1) : Math.max(0, serverRemainingShots);
}

export async function finalizeOnlineCaptureOutcome(input: {
  uploaded: number;
  confirmedNotRegistered?: boolean;
  previousShots: number;
  refreshShots: () => Promise<number | null>;
  deleteLocal: () => Promise<void>;
}): Promise<"success" | "failed" | "checking"> {
  const authoritativeShots = await input.refreshShots();
  if (input.uploaded === 1) return "success";
  if (input.confirmedNotRegistered && authoritativeShots === input.previousShots) {
    await input.deleteLocal();
    return "failed";
  }
  return "checking";
}
