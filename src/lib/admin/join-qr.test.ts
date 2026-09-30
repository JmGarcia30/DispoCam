import { describe, expect, it, vi } from "vitest";
import { createJoinQrDataUrl, eventQrFilename } from "@/lib/admin/join-qr";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async (value: string) => `data:image/png;base64,${btoa(value)}`) } }));

describe("event join QR", () => {
  it("encodes exactly the current join URL into a PNG QR", async () => {
    const url = "https://dispocam.example/join/secret-invite-token";
    const image = await createJoinQrDataUrl(url);
    expect(image).toBe(`data:image/png;base64,${btoa(url)}`);
  });

  it("uses a stable event-name filename", () => {
    expect(eventQrFilename("Jaseph's Birthday")).toBe("jasephs-birthday-qr.png");
    expect(eventQrFilename("Test Wedding")).toBe("test-wedding-qr.png");
  });
});
