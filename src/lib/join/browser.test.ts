import { describe, expect, it, vi } from "vitest";
import { findReopenableCamera, getOrCreateJoinBrowserKey, saveJoinedCamera } from "@/lib/join/browser";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("join browser duplicate protection", () => {
  it("reuses one browser key and reopens a saved valid camera pass", async () => {
    const storage = new MemoryStorage();
    const firstKey = await getOrCreateJoinBrowserKey("invite-token", storage);
    expect(await getOrCreateJoinBrowserKey("invite-token", storage)).toBe(firstKey);
    await saveJoinedCamera("invite-token", "camera-token", storage);
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(findReopenableCamera("invite-token", storage, fetcher as typeof fetch)).resolves.toBe("camera-token");
    expect(fetcher).toHaveBeenCalledWith("/api/camera/camera-token", { cache: "no-store" });
  });

  it("does not reuse another wedding's saved pass", async () => {
    const storage = new MemoryStorage();
    await saveJoinedCamera("invite-one", "camera-one", storage);
    expect(await findReopenableCamera("invite-two", storage, vi.fn() as unknown as typeof fetch)).toBeNull();
  });
});
