import { z } from "zod";
import { getCameraPass, setCameraPassGuestName } from "@/lib/api/camera";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    return Response.json({
      data: await getCameraPass(token),
      capabilities: { maxUploadBytes: env.MAX_UPLOAD_BYTES },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const nameSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
});

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (token.length < 32 || token.length > 512) throw new ApiError(404, "camera_pass_not_found", "Camera pass not found.");
    const { displayName } = nameSchema.parse(await request.json());
    const savedName = await setCameraPassGuestName(token, displayName);
    return Response.json({ data: { guest_name: savedName } });
  } catch (error) {
    return errorResponse(error);
  }
}
