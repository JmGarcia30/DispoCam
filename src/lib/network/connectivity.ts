import { fetchWithTimeout } from "@/lib/network/fetch-timeout";
import { NETWORK_TIMEOUTS } from "@/lib/network/timeouts";

export type NetworkState = "checking" | "online" | "offline";

export async function canReachApplication(signal?: AbortSignal): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const response = await fetchWithTimeout(fetch, "/api/health", {
      method: "HEAD",
      cache: "no-store",
      signal,
    }, NETWORK_TIMEOUTS.healthMs);
    return response.ok;
  } catch {
    return false;
  }
}
