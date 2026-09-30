import { beforeEach, describe, expect, it, vi } from "vitest";

const setName = vi.fn();
vi.mock("@/lib/api/camera", () => ({ getCameraPass: vi.fn(), setCameraPassGuestName: setName }));
vi.mock("@/lib/env", () => ({ env: { MAX_UPLOAD_BYTES: 1000 } }));

const context = { params: Promise.resolve({ token: "x".repeat(32) }) };

describe("guest display-name route", () => {
  beforeEach(() => setName.mockReset());

  it("trims and saves a valid name", async () => {
    setName.mockResolvedValue("Miguel Garcia");
    const { PATCH } = await import("@/app/api/camera/[token]/route");
    const response = await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ displayName: "  Miguel Garcia  " }) }), context);
    expect(response.status).toBe(200);
    expect(setName).toHaveBeenCalledWith("x".repeat(32), "Miguel Garcia");
  });

  it("rejects a blank name", async () => {
    const { PATCH } = await import("@/app/api/camera/[token]/route");
    const response = await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ displayName: "   " }) }), context);
    expect(response.status).toBe(400);
    expect(setName).not.toHaveBeenCalled();
  });

  it("does not allow an invalid pass to rename a guest", async () => {
    const { PATCH } = await import("@/app/api/camera/[token]/route");
    const response = await PATCH(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ displayName: "Someone Else" }) }),
      { params: Promise.resolve({ token: "not-a-valid-camera-pass" }) },
    );
    expect(response.status).toBe(404);
    expect(setName).not.toHaveBeenCalled();
  });
});
