import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { env } from "@/lib/env";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

export function signUpload(publicId: string, intentId: string, clientUploadId: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: publicId,
    overwrite: false,
    timestamp,
    context: `intent_id=${intentId}|client_upload_id=${clientUploadId}`,
  };
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    publicId,
    overwrite: false,
    resourceType: "image" as const,
    context: params.context,
    signature: cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET),
  };
}

export async function verifyCloudinaryImage(publicId: string) {
  return cloudinary.api.resource(publicId, { resource_type: "image", type: "upload" });
}
