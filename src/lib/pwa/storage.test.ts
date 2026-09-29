import { describe, expect, it, vi } from "vitest";
import { requestPersistentStorage } from "@/lib/pwa/storage";

describe("persistent storage", () => {
  it("reports unsupported browsers", async () => {
    expect(await requestPersistentStorage(undefined)).toBe("unsupported");
  });

  it("returns persistent when already granted", async () => {
    const storage = {
      persisted: vi.fn().mockResolvedValue(true),
      persist: vi.fn(),
    } as unknown as StorageManager;
    expect(await requestPersistentStorage(storage)).toBe("persistent");
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("returns best-effort without blocking when permission is denied", async () => {
    const storage = {
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    } as unknown as StorageManager;
    expect(await requestPersistentStorage(storage)).toBe("best-effort");
  });
});
