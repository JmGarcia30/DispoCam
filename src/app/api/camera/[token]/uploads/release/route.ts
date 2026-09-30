import { z } from "zod";
import { ApiError, errorResponse, fromDatabaseError } from "@/lib/api/errors";
import { hashCameraToken } from "@/lib/security/token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  intentId: z.uuid(),
  clientUploadId: z.uuid(),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (token.length < 32 || token.length > 512) throw new ApiError(404, "camera_pass_not_found", "Camera pass not found.");
    const body = bodySchema.parse(await request.json());
    const { data, error } = await supabaseAdmin.rpc("release_upload_intent", {
      p_token_hash: hashCameraToken(token),
      p_intent_id: body.intentId,
      p_client_upload_id: body.clientUploadId,
    });
    if (error) throw fromDatabaseError(error);
    return Response.json({ data: { released: data === true } });
  } catch (error) {
    return errorResponse(error);
  }
}
