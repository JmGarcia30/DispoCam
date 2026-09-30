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
  return requiresOnlineCapture
    ? Math.max(0, Math.min(serverRemainingShots, offlineFirstRemainingShots))
    : offlineFirstRemainingShots;
}

export function registeredRemaining(input: { shot_limit: number; shots_used: number }): number {
  return Math.max(0, input.shot_limit - input.shots_used);
}

export function availableCapacity(input: { shot_limit: number; shots_used: number; shots_reserved: number }): number {
  return Math.max(0, input.shot_limit - input.shots_used - input.shots_reserved);
}

export function sessionRemainingShots(input: {
  requires_online_capture: boolean;
  shot_limit: number;
  shots_used: number;
  shots_remaining: number;
}): number {
  return input.requires_online_capture ? registeredRemaining(input) : Math.max(0, input.shots_remaining);
}

export function onlineCaptureUiState(registeredRemainingShots: number, pendingLocal: number) {
  const displayed = Math.max(0, registeredRemainingShots);
  const pending = Math.max(0, pendingLocal);
  return {
    displayed,
    usableCapacity: pending > 0 ? 0 : displayed,
    rollFinished: displayed === 0 && pending === 0,
  };
}

export function shotsAfterRegistration(serverRemainingShots: number, registered: boolean): number {
  return registered ? Math.max(0, serverRemainingShots - 1) : Math.max(0, serverRemainingShots);
}

export async function finalizeOnlineCaptureOutcome(input: {
  uploaded: number;
  confirmedNotRegistered?: boolean;
  previousShots: number;
  refreshShots: () => Promise<number | null>;
}): Promise<"success" | "failed" | "checking"> {
  const authoritativeShots = await input.refreshShots();
  if (input.uploaded === 1) return "success";
  if (input.confirmedNotRegistered && authoritativeShots === input.previousShots) {
    return "failed";
  }
  return "checking";
}
