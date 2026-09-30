import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCameraPass, uploadImageBuffer, readVerifiedCloudinaryImage, from, rpc } = vi.hoisted(() => ({
  getCameraPass: vi.fn(),
  uploadImageBuffer: vi.fn(),
  readVerifiedCloudinaryImage: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/api/camera", () => ({ getCameraPass }));
vi.mock("@/lib/cloudinary", () => ({ uploadImageBuffer }));
vi.mock("@/lib/api/upload-registration", () => ({ readVerifiedCloudinaryImage }));
vi.mock("@/lib/security/token", () => ({ hashCameraToken: () => "hashed-token" }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from, rpc } }));

const TOKEN = "camera-token-with-more-than-thirty-two-characters";
const PASS_ID = "11111111-1111-4111-8111-111111111111";
const PHOTO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context = { params: Promise.resolve({ token: TOKEN }) };
const resource = { public_id: `weddings/simple/${PASS_ID}/${PHOTO_ID}`, secure_url: "https://res.test/photo.jpg", width: 1200, height: 900, bytes: 4, resource_type: "image" };

function query(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

function registration(shotsUsed = 1) {
  return {
    photo_id: "photo-row",
    client_upload_id: PHOTO_ID,
    cloudinary_public_id: resource.public_id,
    secure_url: resource.secure_url,
    width: 1200,
    height: 900,
    captured_at: "2026-10-01T00:00:00.000Z",
    shots_used: shotsUsed,
    shot_limit: 10,
    registered_remaining: 10 - shotsUsed,
  };
}

function request(blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" })) {
  return new Request(`http://test/api/camera/${TOKEN}/uploads/simple`, {
    method: "POST",
    body: blob,
    headers: { "Content-Type": "image/jpeg", "X-Client-Upload-Id": PHOTO_ID, "X-Captured-At": "2026-10-01T00:00:00.000Z" },
  });
}

describe("simple online-only upload route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getCameraPass.mockResolvedValue({ pass_id: PASS_ID, requires_online_capture: true, shots_used: 0, shot_limit: 10 });
    from.mockReturnValue(query({ data: null, error: null }));
    uploadImageBuffer.mockResolvedValue(resource);
    readVerifiedCloudinaryImage.mockRejectedValue(new Error("not found"));
    rpc.mockResolvedValue({ data: [registration()], error: null });
  });

  it("uploads once to Cloudinary and registers transactionally", async () => {
    const { POST } = await import("@/app/api/camera/[token]/uploads/simple/route");
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ data: { shots_used: 1, registered_remaining: 9, photo: { client_upload_id: PHOTO_ID } } });
    expect(uploadImageBuffer).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("register_simple_photo_upload", expect.objectContaining({ p_client_upload_id: PHOTO_ID }));
  });

  it("returns an existing photo for the same clientUploadId without another upload or shot", async () => {
    getCameraPass.mockResolvedValue({ pass_id: PASS_ID, requires_online_capture: true, shots_used: 1, shot_limit: 10 });
    from.mockReturnValue(query({ data: { id: "photo-row", client_upload_id: PHOTO_ID, cloudinary_public_id: resource.public_id, secure_url: resource.secure_url, width: 1200, height: 900, captured_at: "2026-10-01T00:00:00.000Z" }, error: null }));
    const { POST } = await import("@/app/api/camera/[token]/uploads/simple/route");
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { shots_used: 1, registered_remaining: 9 } });
    expect(uploadImageBuffer).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not register or consume a shot when Cloudinary fails", async () => {
    uploadImageBuffer.mockRejectedValue(new Error("cloudinary unavailable"));
    const { POST } = await import("@/app/api/camera/[token]/uploads/simple/route");
    expect((await POST(request(), context)).status).toBe(502);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("safely retries the same clientUploadId after registration failure", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "temporary" } }).mockResolvedValueOnce({ data: [registration()], error: null });
    uploadImageBuffer.mockResolvedValueOnce(resource).mockRejectedValueOnce(new Error("already exists"));
    readVerifiedCloudinaryImage.mockResolvedValue(resource);
    const { POST } = await import("@/app/api/camera/[token]/uploads/simple/route");
    expect((await POST(request(), context)).status).toBe(500);
    expect((await POST(request(), context)).status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_client_upload_id).toBe(PHOTO_ID);
    expect(rpc.mock.calls[1][1].p_client_upload_id).toBe(PHOTO_ID);
  });

  it("rejects an oversized JPEG before Cloudinary", async () => {
    const bytes = new Uint8Array(4_000_001);
    bytes.set([0xff, 0xd8, 0xff]);
    const { POST } = await import("@/app/api/camera/[token]/uploads/simple/route");
    expect((await POST(request(new Blob([bytes], { type: "image/jpeg" })), context)).status).toBe(413);
    expect(uploadImageBuffer).not.toHaveBeenCalled();
  });
});
