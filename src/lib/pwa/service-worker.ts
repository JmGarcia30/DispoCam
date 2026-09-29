export const SERVICE_WORKER_PATH = "/sw.js";
export const PHOTO_SYNC_TAG = "dispocam-photo-sync";

interface SyncRegistration extends ServiceWorkerRegistration {
  sync?: { register: (tag: string) => Promise<void> };
}

export interface ServiceWorkerRegistrationOptions {
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;
  onBackgroundSyncRequested?: () => void;
}

export async function registerDispoCamServiceWorker(
  options: ServiceWorkerRegistrationOptions = {},
  container: ServiceWorkerContainer | undefined = typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
): Promise<ServiceWorkerRegistration | null> {
  if (!container) return null;
  const registration = await container.register(SERVICE_WORKER_PATH, { scope: "/" });
  if (registration.waiting) options.onUpdateAvailable?.(registration);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed" && container.controller) {
        options.onUpdateAvailable?.(registration);
      }
    });
  });
  container.addEventListener("message", (event: MessageEvent) => {
    if (event.data?.type === "BACKGROUND_SYNC_REQUESTED") options.onBackgroundSyncRequested?.();
  });
  return registration;
}

export function activateServiceWorkerUpdate(
  registration: ServiceWorkerRegistration,
  safeToReload: boolean,
): boolean {
  if (!safeToReload || !registration.waiting) return false;
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export async function requestPhotoBackgroundSync(
  registration?: ServiceWorkerRegistration | null,
): Promise<"registered" | "unsupported"> {
  const activeRegistration = (registration ?? await navigator.serviceWorker?.ready) as SyncRegistration | undefined;
  if (!activeRegistration?.sync) return "unsupported";
  await activeRegistration.sync.register(PHOTO_SYNC_TAG);
  return "registered";
}

export function sendLoadedAssetsToServiceWorker(container = navigator.serviceWorker): void {
  const controller = container?.controller;
  if (!controller || typeof performance === "undefined") return;
  const urls = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => {
      const parsed = new URL(url, location.origin);
      return parsed.origin === location.origin && parsed.pathname.startsWith("/_next/static/");
    });
  controller.postMessage({ type: "CACHE_APP_ASSETS", urls });
}
