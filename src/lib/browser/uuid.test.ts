import { describe, expect, it, vi } from "vitest";
import { createBrowserUuid } from "@/lib/browser/uuid";

describe("browser UUID compatibility", () => {
  it("falls back to getRandomValues when randomUUID is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    try {
      expect(createBrowserUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      if (original) Object.defineProperty(crypto, "randomUUID", original);
      vi.restoreAllMocks();
    }
  });
});
