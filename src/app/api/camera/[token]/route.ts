import { getCameraPass } from "@/lib/api/camera";
import { errorResponse } from "@/lib/api/errors";
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
