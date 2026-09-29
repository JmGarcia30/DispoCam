export type NetworkState = "checking" | "online" | "offline";

export async function canReachApplication(signal?: AbortSignal): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const response = await fetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
