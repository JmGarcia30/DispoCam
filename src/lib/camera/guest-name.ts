import type { OfflineCameraSession } from "@/lib/offline/types";

export function normalizeDisplayName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 120 ? trimmed : null;
}

export function needsGuestName(displayName: string | null | undefined): boolean {
  return !displayName;
}

interface SaveGuestNameInput {
  session: OfflineCameraSession;
  token: string | null;
  offline: boolean;
  displayName: string;
}

interface SaveGuestNameDependencies {
  saveSession: (session: OfflineCameraSession) => Promise<void>;
  fetcher?: typeof fetch;
}

export async function saveGuestDisplayName(
  input: SaveGuestNameInput,
  dependencies: SaveGuestNameDependencies,
): Promise<OfflineCameraSession> {
  const displayName = normalizeDisplayName(input.displayName);
  if (!displayName) throw new Error("Please enter a name between 2 and 120 characters.");

  const updated: OfflineCameraSession = {
    ...input.session,
    guestName: displayName,
    resolvedAt: new Date().toISOString(),
  };

  if (input.session.isDemo) {
    await dependencies.saveSession(updated);
    return updated;
  }

  if (!input.token || input.offline) {
    throw new Error("Connect to the internet to save your name before opening the camera.");
  }

  const fetcher = dependencies.fetcher ?? fetch;
  const response = await fetcher(`/api/camera/${encodeURIComponent(input.token)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? "Your name could not be saved.");
  }

  await dependencies.saveSession(updated);
  return updated;
}
