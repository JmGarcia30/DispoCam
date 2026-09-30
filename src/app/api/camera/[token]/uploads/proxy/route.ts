import { z } from "zod";
import { ApiError, errorResponse, fromDatabaseError, safeApiErrorDetails } from "@/lib/api/errors";
import { getCameraPass } from "@/lib/api/camera";
import { readVerifiedCloudinaryImage, registerVerifiedPhoto } from "@/lib/api/upload-registration";
import { uploadImageBuffer } from "@/lib/cloudinary";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PROXY_IMAGE_MAX_BYTES, VERCEL_FUNCTION_BODY_LIMIT_BYTES } from "@/lib/network/proxy-upload";

export const runtime = "nodejs";

const fieldsSchema = z.object({
  clientUploadId: z.uuid(),
  intentId: z.uuid(),
  capturedAt: z.iso.datetime(),
});

function isSupportedImage(bytes: Uint8Array): boolean {
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const heic = bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1"].includes(String.fromCharCode(...bytes.slice(8, 12)));
  return jpeg || png || webp || heic;
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  let clientUploadId: string | undefined;
  let intentId: string | undefined;
  try {
    console.info({ route: "camera-upload-proxy", event: "request_received" });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > VERCEL_FUNCTION_BODY_LIMIT_BYTES) throw new ApiError(413, "proxy_payload_too_large", "The fallback upload exceeds the proxy size limit.");

    const { token } = await context.params;
    const pass = await getCameraPass(token);
    const form = await request.formData();
    const fields = fieldsSchema.parse({
      clientUploadId: form.get("clientUploadId"),
      intentId: form.get("intentId"),
      capturedAt: form.get("capturedAt"),
    });
    clientUploadId = fields.clientUploadId;
    intentId = fields.intentId;

    const existing = await supabaseAdmin.from("photos")
      .select("id,client_upload_id")
      .eq("camera_pass_id", pass.pass_id)
      .eq("client_upload_id", fields.clientUploadId)
      .maybeSingle();
    if (existing.error) throw fromDatabaseError(existing.error);
    if (existing.data) return Response.json({ data: existing.data, reconciled: true });

    const intentResult = await supabaseAdmin.from("upload_intents")
      .select("id,camera_pass_id,client_upload_id,cloudinary_public_id,status,expires_at")
      .eq("id", fields.intentId)
      .eq("camera_pass_id", pass.pass_id)
      .maybeSingle();
    if (intentResult.error) throw fromDatabaseError(intentResult.error);
    const intent = intentResult.data;
    if (!intent) throw new ApiError(404, "upload_intent_not_found", "Upload intent was not found.");
    if (intent.client_upload_id !== fields.clientUploadId) throw new ApiError(409, "upload_intent_mismatch", "Upload details do not match the intent.");
    if (intent.status !== "pending" || Date.parse(intent.expires_at) <= Date.now()) throw new ApiError(409, "upload_intent_expired", "Upload intent has expired.");

    const image = form.get("image");
    if (!(image instanceof Blob)) throw new ApiError(400, "image_required", "An image file is required.");
    console.info({ route: "camera-upload-proxy", event: "multipart_parsed", byteSize: image.size });
    if (image.size <= 0 || image.size > Math.min(env.MAX_UPLOAD_BYTES, PROXY_IMAGE_MAX_BYTES)) {
      throw new ApiError(413, "proxy_payload_too_large", "The fallback upload exceeds the proxy size limit.");
    }
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (!image.type.startsWith("image/") || !isSupportedImage(bytes)) throw new ApiError(415, "invalid_image", "The uploaded file is not a supported image.");

    let resource;
    try {
      resource = await readVerifiedCloudinaryImage(intent.cloudinary_public_id);
    } catch {
      try {
        console.info({ route: "camera-upload-proxy", event: "cloudinary_upload_started" });
        await uploadImageBuffer(Buffer.from(bytes), intent.cloudinary_public_id, `intent_id=${intent.id}|client_upload_id=${fields.clientUploadId}`);
        console.info({ route: "camera-upload-proxy", event: "cloudinary_upload_completed" });
      } catch {
        // A lost direct response or racing proxy may have created the exact reserved asset.
      }
      try {
        resource = await readVerifiedCloudinaryImage(intent.cloudinary_public_id);
      } catch {
        throw new ApiError(502, "proxy_upload_failed", "The server upload failed temporarily.");
      }
    }

    const photo = await registerVerifiedPhoto({
      token,
      intentId: intent.id,
      clientUploadId: fields.clientUploadId,
      publicId: intent.cloudinary_public_id,
      capturedAt: fields.capturedAt,
      resource,
    });
    console.info({ route: "camera-upload-proxy", event: "registration_completed" });
    return Response.json({ data: photo }, { status: 201 });
  } catch (error) {
    const details = safeApiErrorDetails(error);
    if (details.status >= 500) console.error({ event: "camera_upload_error", route: "proxy", stage: "cloudinary", ...details, clientUploadId, intentId });
    if (error instanceof ApiError && error.code === "proxy_upload_failed") {
      return Response.json({ error: { code: error.code, message: error.message, stage: "cloudinary-server" } }, { status: error.status });
    }
    return errorResponse(error);
  }
}
