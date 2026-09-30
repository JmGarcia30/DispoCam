import { afterEach, describe, expect, it, vi } from "vitest";
import { canReachApplication } from "@/lib/network/connectivity";

describe("Safari-compatible connectivity probe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("works when AbortSignal.timeout is unavailable", async () => {
    const original = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
    vi.stubGlobal("navigator", { onLine: true });
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      await expect(canReachApplication()).resolves.toBe(true);
      expect(fetcher).toHaveBeenCalledWith("/api/health", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    } finally {
      if (original) Object.defineProperty(AbortSignal, "timeout", original);
    }
  });
});
