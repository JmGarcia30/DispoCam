import { describe, expect, it, vi } from "vitest";
import {
  activateServiceWorkerUpdate,
  registerDispoCamServiceWorker,
  SERVICE_WORKER_PATH,
} from "@/lib/pwa/service-worker";

describe("service worker lifecycle", () => {
  it("registers the worker at the application scope", async () => {
    const registration = Object.assign(new EventTarget(), { waiting: null, installing: null, update: vi.fn().mockResolvedValue(undefined) });
    const container = Object.assign(new EventTarget(), {
      controller: null,
      register: vi.fn().mockResolvedValue(registration),
    }) as unknown as ServiceWorkerContainer;

    expect(await registerDispoCamServiceWorker({}, container)).toBe(registration);
    expect(container.register).toHaveBeenCalledWith(SERVICE_WORKER_PATH, { scope: "/" });
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it("does not activate an update until the caller says reload is safe", () => {
    const waiting = { postMessage: vi.fn() };
    const registration = { waiting } as unknown as ServiceWorkerRegistration;
    expect(activateServiceWorkerUpdate(registration, false)).toBe(false);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(activateServiceWorkerUpdate(registration, true)).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
});
