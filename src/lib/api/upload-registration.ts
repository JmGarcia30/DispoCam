import "server-only";
import { ApiError, fromDatabaseError } from "@/lib/api/errors";
import { verifyCloudinaryImage } from "@/lib/cloudinary";
import { env } from "@/lib/env";
import { hashCameraToken } from "@/lib/security/token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface VerifiedCloudinaryImage {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  bytes: number;
  resource_type: string;
}

export async function readVerifiedCloudinaryImage(publicId: string): Promise<VerifiedCloudinaryImage> {
  let resource: VerifiedCloudinaryImage;
  try {
    resource = await verifyCloudinaryImage(publicId) as VerifiedCloudinaryImage;
  } catch {
    throw new ApiError(422, "cloudinary_asset_not_found", "The uploaded image could not be verified.");
  }
  if (resource.bytes > env.MAX_UPLOAD_BYTES) throw new ApiError(413, "upload_too_large", "The uploaded image exceeds the size limit.");
  if (!resource.secure_url || !resource.width || !resource.height || resource.resource_type !== "image") {
    throw new ApiError(422, "invalid_cloudinary_asset", "The Cloudinary asset is not a valid image.");
  }
  return resource;
}

export async function registerVerifiedPhoto(input: {
  token: string;
  intentId: string;
  clientUploadId: string;
  publicId: string;
  capturedAt: string;
  resource: VerifiedCloudinaryImage;
}) {
  const { data, error } = await supabaseAdmin.rpc("register_photo_upload", {
    p_token_hash: hashCameraToken(input.token),
    p_intent_id: input.intentId,
    p_client_upload_id: input.clientUploadId,
    p_cloudinary_public_id: input.publicId,
    p_secure_url: input.resource.secure_url,
    p_width: input.resource.width,
    p_height: input.resource.height,
    p_captured_at: input.capturedAt,
  });
  if (error) throw fromDatabaseError(error);
  return data?.[0];
}
