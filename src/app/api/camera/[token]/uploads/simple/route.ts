import { z } from "zod";
import { ApiError, errorResponse, fromDatabaseError, safeApiErrorDetails } from "@/lib/api/errors";
import { getCameraPass } from "@/lib/api/camera";
import { readVerifiedCloudinaryImage } from "@/lib/api/upload-registration";
import { uploadImageBuffer } from "@/lib/cloudinary";
import { hashCameraToken } from "@/lib/security/token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const SIMPLE_UPLOAD_MAX_BYTES = 4_000_000;

const headersSchema = z.object({
  clientUploadId: z.uuid(),
  capturedAt: z.iso.datetime(),
});

function responseData(row: Record<string, unknown>) {
  return {
    photo: {
      id: row.photo_id ?? row.id,
      client_upload_id: row.client_upload_id,
      cloudinary_public_id: row.cloudinary_public_id,
      secure_url: row.secure_url,
      width: row.width,
      height: row.height,
      captured_at: row.captured_at,
    },
    shots_used: Number(row.shots_used),
    shot_limit: Number(row.shot_limit),
    registered_remaining: Number(row.registered_remaining),
  };
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  let clientUploadId: string | undefined;
  try {
    const { token } = await context.params;
    const pass = await getCameraPass(token);
    if (!pass.requires_online_capture) throw new ApiError(409, "simple_upload_not_enabled", "This upload mode is not enabled for this event.");
    const fields = headersSchema.parse({
      clientUploadId: request.headers.get("x-client-upload-id"),
      capturedAt: request.headers.get("x-captured-at"),
    });
    clientUploadId = fields.clientUploadId;

    const existing = await supabaseAdmin.from("photos")
      .select("id,client_upload_id,cloudinary_public_id,secure_url,width,height,captured_at")
      .eq("camera_pass_id", pass.pass_id)
      .eq("client_upload_id", fields.clientUploadId)
      .maybeSingle();
    if (existing.error) throw fromDatabaseError(existing.error);
    if (existing.data) {
      return Response.json({ data: responseData({
        ...existing.data,
        shots_used: pass.shots_used,
        shot_limit: pass.shot_limit,
        registered_remaining: Math.max(0, pass.shot_limit - pass.shots_used),
      }) });
    }
    if (pass.shots_used >= pass.shot_limit) throw new ApiError(409, "shot_limit_reached", "No shots remain on this camera pass.");

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/jpeg")) throw new ApiError(415, "invalid_image", "A JPEG image is required.");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > SIMPLE_UPLOAD_MAX_BYTES) throw new ApiError(413, "upload_too_large", "The photo exceeds the server upload limit.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) throw new ApiError(400, "image_required", "An image is required.");
    if (bytes.length > SIMPLE_UPLOAD_MAX_BYTES) throw new ApiError(413, "upload_too_large", "The photo exceeds the server upload limit.");
    if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new ApiError(415, "invalid_image", "A valid JPEG image is required.");
    }

    const publicId = `weddings/simple/${pass.pass_id}/${fields.clientUploadId}`;
    let resource: Record<string, unknown>;
    try {
      resource = await uploadImageBuffer(Buffer.from(bytes), publicId, `client_upload_id=${fields.clientUploadId}`);
    } catch {
      // A prior request may have uploaded successfully before its database response was lost.
      try {
        resource = await readVerifiedCloudinaryImage(publicId) as unknown as Record<string, unknown>;
      } catch {
        throw new ApiError(502, "simple_upload_failed", "The photo upload failed.");
      }
    }
    const secureUrl = String(resource.secure_url ?? "");
    const width = Number(resource.width ?? 0);
    const height = Number(resource.height ?? 0);
    if (!secureUrl || !width || !height || String(resource.resource_type ?? "image") !== "image") {
      throw new ApiError(502, "simple_upload_failed", "The photo upload failed.");
    }

    const registration = await supabaseAdmin.rpc("register_simple_photo_upload", {
      p_token_hash: hashCameraToken(token),
      p_client_upload_id: fields.clientUploadId,
      p_cloudinary_public_id: publicId,
      p_secure_url: secureUrl,
      p_width: width,
      p_height: height,
      p_captured_at: fields.capturedAt,
    });
    if (registration.error) throw fromDatabaseError(registration.error);
    const row = registration.data?.[0];
    if (!row) throw new ApiError(500, "registration_failed", "The photo could not be registered.");
    return Response.json({ data: responseData(row as unknown as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const details = safeApiErrorDetails(error);
    if (details.status >= 500) console.error({ route: "camera-upload-simple", event: "upload_failed", clientUploadId, ...details });
    return errorResponse(error);
  }
}
