import { beforeEach, describe, expect, it, vi } from "vitest";

const createPass = vi.fn();
const getInvite = vi.fn();
vi.mock("@/lib/api/wedding-join", () => ({ createWeddingGuestPass: createPass, getWeddingInvite: getInvite }));

const token = "i".repeat(43);
const context = { params: Promise.resolve({ inviteToken: token }) };

describe("wedding join API", () => {
  beforeEach(() => { createPass.mockReset(); getInvite.mockReset(); });

  it("creates a camera pass through the server onboarding service", async () => {
    createPass.mockResolvedValue({ cameraToken: "camera-token", cameraPassId: "pass", guestId: "guest", shotLimit: 10 });
    const { POST } = await import("@/app/api/join/[inviteToken]/route");
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ displayName: "  Miguel Garcia  ", browserKey: "b".repeat(64) }) });
    const response = await POST(request, context);
    expect(response.status).toBe(201);
    expect(createPass).toHaveBeenCalledWith(expect.objectContaining({ inviteToken: token, displayName: "Miguel Garcia", browserKey: "b".repeat(64), request }));
  });

  it("rejects malformed guest names before creating anything", async () => {
    const { POST } = await import("@/app/api/join/[inviteToken]/route");
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ displayName: " ", browserKey: "b".repeat(64) }) }), context);
    expect(response.status).toBe(400);
    expect(createPass).not.toHaveBeenCalled();
  });
});
