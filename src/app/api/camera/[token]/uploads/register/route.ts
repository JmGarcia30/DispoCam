import { z } from "zod";
import { ApiError, errorResponse, fromDatabaseError } from "@/lib/api/errors";
import { verifyCloudinaryImage } from "@/lib/cloudinary";
import { env } from "@/lib/env";
import { hashCameraToken } from "@/lib/security/token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  intentId: z.uuid(),
  clientUploadId: z.uuid(),
  publicId: z.string().min(10).max(255),
  capturedAt: z.iso.datetime(),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = bodySchema.parse(await request.json());
    let resource;
    try {
      resource = await verifyCloudinaryImage(body.publicId);
    } catch {
      throw new ApiError(422, "cloudinary_asset_not_found", "The uploaded image could not be verified.");
    }
    if (resource.bytes > env.MAX_UPLOAD_BYTES) {
      throw new ApiError(413, "upload_too_large", "The uploaded image exceeds the size limit.");
    }
    if (!resource.secure_url || !resource.width || !resource.height || resource.resource_type !== "image") {
      throw new ApiError(422, "invalid_cloudinary_asset", "The Cloudinary asset is not a valid image.");
    }

    const { data, error } = await supabaseAdmin.rpc("register_photo_upload", {
      p_token_hash: hashCameraToken(token),
      p_intent_id: body.intentId,
      p_client_upload_id: body.clientUploadId,
      p_cloudinary_public_id: body.publicId,
      p_secure_url: resource.secure_url,
      p_width: resource.width,
      p_height: resource.height,
      p_captured_at: body.capturedAt,
    });
    if (error) throw fromDatabaseError(error);
    return Response.json({ data: data?.[0] }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
