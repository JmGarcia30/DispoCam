import { randomBytes } from "node:crypto";
import { z } from "zod";
import { signUpload } from "@/lib/cloudinary";
import { errorResponse, fromDatabaseError, safeApiErrorDetails } from "@/lib/api/errors";
import { hashCameraToken } from "@/lib/security/token";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const bodySchema = z.object({ clientUploadId: z.uuid() });

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  let clientUploadId: string | undefined;
  try {
    const { token } = await context.params;
    ({ clientUploadId } = bodySchema.parse(await request.json()));
    const publicId = `weddings/pending/${randomBytes(24).toString("hex")}`;
    const { data, error } = await supabaseAdmin.rpc("create_upload_intent", {
      p_token_hash: hashCameraToken(token),
      p_client_upload_id: clientUploadId,
      p_public_id: publicId,
      p_ttl_seconds: env.UPLOAD_INTENT_TTL_SECONDS,
    });
    if (error) throw fromDatabaseError(error);
    const intent = data?.[0];
    if (!intent) throw new Error("Upload intent was not returned.");

    // An idempotent retry after completion does not issue a new storage upload.
    if (intent.existing_photo_id) {
      return Response.json({ data: { alreadyRegistered: true, photoId: intent.existing_photo_id } });
    }

    const signed = signUpload(intent.public_id, intent.intent_id, clientUploadId);
    return Response.json({
      data: {
        intentId: intent.intent_id,
        expiresAt: intent.expires_at,
        uploadUrl: `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
        upload: signed,
      },
    });
  } catch (error) {
    const details = safeApiErrorDetails(error);
    if (details.status >= 500) console.error({ event: "camera_upload_error", route: "sign", stage: "sign", ...details, clientUploadId });
    return errorResponse(error);
  }
}
