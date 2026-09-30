import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/health/upload-probe/route";

describe("multipart upload probe", () => {
  it("accepts a tiny same-origin diagnostic FormData body", async () => {
    const form = new FormData();
    form.set("marker", "dispocam-probe");
    form.set("sample", new Blob([new Uint8Array(1_024)]), "probe.bin");
    const response = await POST(new Request("https://camera.test/api/health/upload-probe", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, byteSize: 1_024 });
  });

  it("rejects oversized probes", async () => {
    const form = new FormData();
    form.set("marker", "dispocam-probe");
    form.set("sample", new Blob([new Uint8Array(2_049)]), "probe.bin");
    const response = await POST(new Request("https://camera.test/api/health/upload-probe", { method: "POST", body: form }));
    expect(response.status).toBe(400);
  });
});
