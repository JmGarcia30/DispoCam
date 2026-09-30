import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc } }));
vi.mock("@/lib/security/token", () => ({ hashCameraToken: () => "hashed-token" }));

const TOKEN = "camera-token-with-more-than-thirty-two-characters";
const INTENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHOTO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context = { params: Promise.resolve({ token: TOKEN }) };

function request() {
  return new Request(`http://test/api/camera/${TOKEN}/uploads/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intentId: INTENT_ID, clientUploadId: PHOTO_ID }),
  });
}

describe("camera upload intent release route", () => {
  beforeEach(() => rpc.mockReset());

  it("releases only the authenticated pass intent identified by the stable client upload ID", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { POST } = await import("@/app/api/camera/[token]/uploads/release/route");
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { released: true } });
    expect(rpc).toHaveBeenCalledWith("release_upload_intent", {
      p_token_hash: "hashed-token",
      p_intent_id: INTENT_ID,
      p_client_upload_id: PHOTO_ID,
    });
  });

  it("does not report release when a registered photo or non-pending intent prevents cancellation", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { POST } = await import("@/app/api/camera/[token]/uploads/release/route");
    await expect((await POST(request(), context)).json()).resolves.toEqual({ data: { released: false } });
  });
});
