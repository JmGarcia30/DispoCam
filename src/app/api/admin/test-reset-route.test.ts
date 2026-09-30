import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const requireRole = vi.fn();
const resetPass = vi.fn();

vi.mock("@/lib/api/admin-auth", () => ({ requireWeddingAdmin: requireAdmin }));
vi.mock("@/lib/api/admin-mutations", () => ({
  requireMutationRole: requireRole,
  resetTestCameraPass: resetPass,
}));
vi.mock("@/lib/api/errors", () => ({
  errorResponse: () => Response.json({ error: { code: "unauthorized" } }, { status: 401 }),
}));

const weddingId = "11111111-1111-4111-8111-111111111111";
const cameraPassId = "22222222-2222-4222-8222-222222222222";
const unrelatedPassId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ weddingId, cameraPassId }) };

function request(mode: "shot_count" | "full", deleteCloudinaryAssets = false) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify({ mode, deleteCloudinaryAssets, confirmation: "RESET TEST CAMERA PASS" }),
  });
}

describe("test camera-pass reset route", () => {
  beforeEach(() => {
    requireAdmin.mockReset().mockResolvedValue({ role: "owner" });
    requireRole.mockReset();
    resetPass.mockReset().mockResolvedValue({ removedPhotoCount: 0, assetDeletionFailures: [] });
  });

  it("performs a shot-count-only reset for exactly the selected pass", async () => {
    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/camera-passes/[cameraPassId]/test-reset/route");
    const response = await POST(request("shot_count"), context);
    expect(response.status).toBe(200);
    expect(resetPass).toHaveBeenCalledWith({ weddingId, cameraPassId, mode: "shot_count", deleteCloudinaryAssets: false });
  });

  it("performs full reset without touching an unrelated pass id", async () => {
    resetPass.mockResolvedValue({ removedPhotoCount: 2, assetDeletionFailures: [] });
    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/camera-passes/[cameraPassId]/test-reset/route");
    const response = await POST(request("full", true), context);
    expect(response.status).toBe(200);
    expect(resetPass).toHaveBeenCalledWith({ weddingId, cameraPassId, mode: "full", deleteCloudinaryAssets: true });
    expect(resetPass).not.toHaveBeenCalledWith(expect.objectContaining({ cameraPassId: unrelatedPassId }));
    expect(await response.json()).toMatchObject({ warning: expect.stringContaining("does not remove photos still queued") });
  });

  it("rejects reset when admin authorization fails", async () => {
    requireAdmin.mockRejectedValue(new Error("unauthorized"));
    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/camera-passes/[cameraPassId]/test-reset/route");
    const response = await POST(request("full"), context);
    expect(response.ok).toBe(false);
    expect(resetPass).not.toHaveBeenCalled();
  });
});
