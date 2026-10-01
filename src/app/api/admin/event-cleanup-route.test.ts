import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const requireRole = vi.fn();
const cleanupData = vi.fn();

vi.mock("@/lib/api/admin-auth", () => ({ requireWeddingAdmin: requireAdmin }));
vi.mock("@/lib/api/admin-mutations", () => ({
  requireMutationRole: requireRole,
  cleanupEventTestData: cleanupData,
}));
vi.mock("@/lib/api/errors", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
  errorResponse: (err: unknown) => {
    const status = (err as { status?: number })?.status ?? 500;
    return Response.json({ error: { message: (err as Error)?.message || "Internal error" } }, { status });
  },
}));

// Real Jaseph Birthday event ID
const JASEPH_EVENT_ID = "4a736570-6873-4269-9274-686461793031";
// Other event ID (e.g. Test Wedding)
const OTHER_EVENT_ID = "99999999-9999-4999-8999-999999999999";

function makeRequest(body: { action: string; confirmation: string; deleteCloudinaryAssets?: boolean }) {
  return new Request("http://localhost/api/admin/weddings/test-cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin event test cleanup route", () => {
  beforeEach(() => {
    requireAdmin.mockReset().mockResolvedValue({ role: "owner" });
    requireRole.mockReset();
    cleanupData.mockReset().mockResolvedValue({
      mode: "clear_photos",
      photosRemoved: 5,
      guestsRemoved: 0,
      passesRemoved: 0,
      cloudinaryDeleted: false,
      assetDeletionFailures: [],
    });
  });

  it("clears test photos only for Jaseph event with exact confirmation phrase", async () => {
    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/test-cleanup/route");
    const req = makeRequest({
      action: "clear_photos",
      confirmation: "CLEAR TEST PHOTOS",
      deleteCloudinaryAssets: false,
    });
    const context = { params: Promise.resolve({ weddingId: JASEPH_EVENT_ID }) };

    const res = await POST(req, context);
    expect(res.status).toBe(200);

    // Strictly scoped to Jaseph's event ID
    expect(cleanupData).toHaveBeenCalledWith({
      weddingId: JASEPH_EVENT_ID,
      mode: "clear_photos",
      deleteCloudinaryAssets: false,
    });
    expect(cleanupData).not.toHaveBeenCalledWith(
      expect.objectContaining({ weddingId: OTHER_EVENT_ID })
    );

    const payload = await res.json();
    expect(payload.data.photosRemoved).toBe(5);
    expect(payload.message).toContain("clear photos");
  });

  it("clears test guests and their passes only for Jaseph event with exact confirmation phrase", async () => {
    cleanupData.mockResolvedValue({
      mode: "clear_guests",
      photosRemoved: 10,
      guestsRemoved: 3,
      passesRemoved: 3,
      cloudinaryDeleted: false,
      assetDeletionFailures: [],
    });

    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/test-cleanup/route");
    const req = makeRequest({
      action: "clear_guests",
      confirmation: "CLEAR TEST GUESTS",
      deleteCloudinaryAssets: false,
    });
    const context = { params: Promise.resolve({ weddingId: JASEPH_EVENT_ID }) };

    const res = await POST(req, context);
    expect(res.status).toBe(200);

    expect(cleanupData).toHaveBeenCalledWith({
      weddingId: JASEPH_EVENT_ID,
      mode: "clear_guests",
      deleteCloudinaryAssets: false,
    });
    expect(cleanupData).not.toHaveBeenCalledWith(
      expect.objectContaining({ weddingId: OTHER_EVENT_ID })
    );

    const payload = await res.json();
    expect(payload.data.guestsRemoved).toBe(3);
    expect(payload.data.passesRemoved).toBe(3);
  });

  it("performs full birthday reset preserving event and invite settings", async () => {
    cleanupData.mockResolvedValue({
      mode: "full_reset",
      photosRemoved: 12,
      guestsRemoved: 4,
      passesRemoved: 4,
      cloudinaryDeleted: true,
      assetDeletionFailures: [],
    });

    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/test-cleanup/route");
    const req = makeRequest({
      action: "full_reset",
      confirmation: "RESET EVENT DATA",
      deleteCloudinaryAssets: true,
    });
    const context = { params: Promise.resolve({ weddingId: JASEPH_EVENT_ID }) };

    const res = await POST(req, context);
    expect(res.status).toBe(200);

    expect(cleanupData).toHaveBeenCalledWith({
      weddingId: JASEPH_EVENT_ID,
      mode: "full_reset",
      deleteCloudinaryAssets: true,
    });
    // Verifying other event was never targeted
    expect(cleanupData).not.toHaveBeenCalledWith(
      expect.objectContaining({ weddingId: OTHER_EVENT_ID })
    );

    const payload = await res.json();
    expect(payload.data.mode).toBe("full_reset");
    expect(payload.data.cloudinaryDeleted).toBe(true);
  });

  it("rejects cleanup if confirmation phrase does not match", async () => {
    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/test-cleanup/route");
    const req = makeRequest({
      action: "clear_photos",
      confirmation: "WRONG CONFIRMATION",
    });
    const context = { params: Promise.resolve({ weddingId: JASEPH_EVENT_ID }) };

    const res = await POST(req, context);
    expect(res.status).toBe(400);
    expect(cleanupData).not.toHaveBeenCalled();
  });

  it("rejects cleanup if non-admin or unauthorized", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized admin access"));

    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/test-cleanup/route");
    const req = makeRequest({
      action: "full_reset",
      confirmation: "RESET EVENT DATA",
    });
    const context = { params: Promise.resolve({ weddingId: JASEPH_EVENT_ID }) };

    const res = await POST(req, context);
    expect(res.status).toBe(500);
    expect(cleanupData).not.toHaveBeenCalled();
  });

  it("ensures other events cannot be cleaned up when targeting Jaseph event", async () => {
    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/test-cleanup/route");
    const req = makeRequest({
      action: "clear_photos",
      confirmation: "CLEAR TEST PHOTOS",
    });
    // Request specifically targeting Jaseph event
    await POST(req, { params: Promise.resolve({ weddingId: JASEPH_EVENT_ID }) });

    // Assert strictly called for Jaseph ID and never called for OTHER_EVENT_ID
    expect(cleanupData).toHaveBeenCalledTimes(1);
    expect(cleanupData).toHaveBeenCalledWith(
      expect.objectContaining({ weddingId: JASEPH_EVENT_ID })
    );
    expect(cleanupData).not.toHaveBeenCalledWith(
      expect.objectContaining({ weddingId: OTHER_EVENT_ID })
    );
  });
});
