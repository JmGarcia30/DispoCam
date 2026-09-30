import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const requireRole = vi.fn();
const updatePass = vi.fn();
vi.mock("@/lib/api/admin-auth", () => ({ requireWeddingAdmin: requireAdmin }));
vi.mock("@/lib/api/admin-mutations", () => ({ requireMutationRole: requireRole, updateCameraPass: updatePass }));
vi.mock("@/lib/api/errors", () => ({ errorResponse: () => Response.json({ error: { code: "forbidden" } }, { status: 403 }) }));

const weddingId = "11111111-1111-4111-8111-111111111111";
const cameraPassId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ weddingId, cameraPassId }) };
const request = (body: object) => new Request("http://test", { method: "PATCH", body: JSON.stringify(body) });

describe("admin camera pass mutations", () => {
  beforeEach(() => { requireAdmin.mockReset(); requireRole.mockReset(); updatePass.mockReset().mockResolvedValue({ id: cameraPassId }); });

  for (const role of ["owner", "editor"]) {
    it(`allows ${role} to grant extra shots`, async () => {
      requireAdmin.mockResolvedValue({ role });
      const { PATCH } = await import("@/app/api/admin/weddings/[weddingId]/camera-passes/[cameraPassId]/route");
      const response = await PATCH(request({ grantShots: 5 }), context);
      expect(response.status).toBe(200);
      expect(updatePass).toHaveBeenCalledWith({ weddingId, cameraPassId, grantShots: 5 });
    });
  }

  it("rejects viewer mutations at the server", async () => {
    requireAdmin.mockResolvedValue({ role: "viewer" }); requireRole.mockImplementation(() => { throw new Error("forbidden"); });
    const { PATCH } = await import("@/app/api/admin/weddings/[weddingId]/camera-passes/[cameraPassId]/route");
    expect((await PATCH(request({ grantShots: 1 }), context)).status).toBe(403);
    expect(updatePass).not.toHaveBeenCalled();
  });

  it("requires authorized wedding membership", async () => {
    requireAdmin.mockRejectedValue(new Error("not a member"));
    const { PATCH } = await import("@/app/api/admin/weddings/[weddingId]/camera-passes/[cameraPassId]/route");
    expect((await PATCH(request({ isActive: false }), context)).status).toBe(403);
    expect(updatePass).not.toHaveBeenCalled();
  });

  it("allows authorized activation changes", async () => {
    requireAdmin.mockResolvedValue({ role: "editor" });
    const { PATCH } = await import("@/app/api/admin/weddings/[weddingId]/camera-passes/[cameraPassId]/route");
    expect((await PATCH(request({ isActive: false }), context)).status).toBe(200);
    expect(updatePass).toHaveBeenCalledWith({ weddingId, cameraPassId, isActive: false });
  });
});
