import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { PROXY_IMAGE_MAX_BYTES } from "@/lib/network/proxy-upload";

const getCameraPass = vi.fn();
const uploadImageBuffer = vi.fn();
const readVerifiedCloudinaryImage = vi.fn();
const registerVerifiedPhoto = vi.fn();
const from = vi.fn();

vi.mock("@/lib/api/camera", () => ({ getCameraPass }));
vi.mock("@/lib/cloudinary", () => ({ uploadImageBuffer }));
vi.mock("@/lib/api/upload-registration", () => ({ readVerifiedCloudinaryImage, registerVerifiedPhoto }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/env", () => ({ env: { MAX_UPLOAD_BYTES: 15 * 1024 * 1024 } }));

const TOKEN = "x".repeat(32);
const PASS_ID = "11111111-1111-4111-8111-111111111111";
const PHOTO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INTENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PUBLIC_ID = "weddings/pending/reserved-photo";
const context = { params: Promise.resolve({ token: TOKEN }) };
const resource = { public_id: PUBLIC_ID, secure_url: "https://res.test/photo.jpg", width: 10, height: 10, bytes: 4, resource_type: "image" };

function query(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

function validRequest(image = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" })) {
  return new Request("http://test/api/camera/token/uploads/proxy", {
    method: "POST",
    body: image,
    headers: {
      "Content-Type": image.type,
      "X-Client-Upload-Id": PHOTO_ID,
      "X-Upload-Intent-Id": INTENT_ID,
      "X-Captured-At": "2029-12-31T22:00:00.000Z",
    },
  });
}

function arrangeIntent(overrides: Record<string, unknown> = {}) {
  from
    .mockReturnValueOnce(query({ data: null, error: null }))
    .mockReturnValueOnce(query({
      data: {
        id: INTENT_ID,
        camera_pass_id: PASS_ID,
        client_upload_id: PHOTO_ID,
        cloudinary_public_id: PUBLIC_ID,
        status: "pending",
        expires_at: "2099-01-01T00:00:00.000Z",
        ...overrides,
      },
      error: null,
    }));
}

describe("camera upload proxy route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getCameraPass.mockResolvedValue({ pass_id: PASS_ID });
    readVerifiedCloudinaryImage.mockRejectedValueOnce(new Error("not found")).mockResolvedValue(resource);
    uploadImageBuffer.mockResolvedValue(resource);
    registerVerifiedPhoto.mockResolvedValue({ id: "photo-row", client_upload_id: PHOTO_ID });
  });

  it("validates the reserved intent, uploads its public ID, and registers authoritatively", async () => {
    arrangeIntent();
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    const response = await POST(validRequest(), context);
    expect(response.status).toBe(201);
    expect(getCameraPass).toHaveBeenCalledWith(TOKEN);
    expect(uploadImageBuffer).toHaveBeenCalledWith(expect.any(Buffer), PUBLIC_ID, `intent_id=${INTENT_ID}|client_upload_id=${PHOTO_ID}`);
    expect(registerVerifiedPhoto).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN, intentId: INTENT_ID, clientUploadId: PHOTO_ID, publicId: PUBLIC_ID }));
  });

  it("accepts a small 150 KB JPEG through the raw binary parser", async () => {
    arrangeIntent();
    const bytes = new Uint8Array(150_000);
    bytes.set([0xff, 0xd8, 0xff]);
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    const response = await POST(validRequest(new Blob([bytes], { type: "image/jpeg" })), context);
    expect(response.status).toBe(201);
  });

  it("rejects invalid binary metadata and content type", async () => {
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    const invalidUuid = validRequest();
    invalidUuid.headers.set("X-Client-Upload-Id", "not-a-uuid");
    expect((await POST(invalidUuid, context)).status).toBe(400);
    const invalidType = validRequest();
    invalidType.headers.set("Content-Type", "application/octet-stream");
    expect((await POST(invalidType, context)).status).toBe(415);
  });

  it("reconciles an existing photo without uploading or incrementing again", async () => {
    from.mockReturnValueOnce(query({ data: { id: "existing", client_upload_id: PHOTO_ID }, error: null }));
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    const response = await POST(validRequest(), context);
    expect(response.status).toBe(200);
    expect(uploadImageBuffer).not.toHaveBeenCalled();
    expect(registerVerifiedPhoto).not.toHaveBeenCalled();
  });

  it("reconciles a lost direct response using the reserved asset without re-uploading", async () => {
    arrangeIntent();
    readVerifiedCloudinaryImage.mockReset().mockResolvedValue(resource);
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    expect((await POST(validRequest(), context)).status).toBe(201);
    expect(uploadImageBuffer).not.toHaveBeenCalled();
    expect(registerVerifiedPhoto).toHaveBeenCalledTimes(1);
  });

  it("rejects an expired intent before uploading", async () => {
    arrangeIntent({ expires_at: "2020-01-01T00:00:00.000Z" });
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    const response = await POST(validRequest(), context);
    expect(response.status).toBe(409);
    expect(uploadImageBuffer).not.toHaveBeenCalled();
  });

  it("rejects a wrong camera token before reading an intent or uploading", async () => {
    getCameraPass.mockRejectedValue(new ApiError(404, "camera_pass_not_found", "Camera pass not found."));
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    expect((await POST(validRequest(), context)).status).toBe(404);
    expect(from).not.toHaveBeenCalled();
    expect(uploadImageBuffer).not.toHaveBeenCalled();
  });

  it("rejects oversized and invalid images", async () => {
    arrangeIntent();
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    const oversizedBytes = new Uint8Array(PROXY_IMAGE_MAX_BYTES + 1);
    oversizedBytes.set([0xff, 0xd8, 0xff]);
    const oversized = await POST(validRequest(new Blob([oversizedBytes], { type: "image/jpeg" })), context);
    expect(oversized.status).toBe(413);
    expect(uploadImageBuffer).not.toHaveBeenCalled();

    vi.resetAllMocks();
    getCameraPass.mockResolvedValue({ pass_id: PASS_ID });
    arrangeIntent();
    const invalid = await POST(validRequest(new Blob(["not-image"], { type: "image/jpeg" })), context);
    expect(invalid.status).toBe(415);
    expect(uploadImageBuffer).not.toHaveBeenCalled();
  });

  it("cannot bypass shot capacity enforced by authoritative registration", async () => {
    arrangeIntent();
    registerVerifiedPhoto.mockRejectedValue(new ApiError(409, "shot_limit_reached", "No shots remain on this camera pass."));
    const { POST } = await import("@/app/api/camera/[token]/uploads/proxy/route");
    const response = await POST(validRequest(), context);
    expect(response.status).toBe(409);
    expect(registerVerifiedPhoto).toHaveBeenCalledTimes(1);
  });
});
