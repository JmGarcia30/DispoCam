import { z } from "zod";
import { errorResponse, safeApiErrorDetails } from "@/lib/api/errors";
import { readVerifiedCloudinaryImage, registerVerifiedPhoto } from "@/lib/api/upload-registration";

export const runtime = "nodejs";

const bodySchema = z.object({
  intentId: z.uuid(),
  clientUploadId: z.uuid(),
  publicId: z.string().min(10).max(255),
  capturedAt: z.iso.datetime(),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  let clientUploadId: string | undefined;
  let intentId: string | undefined;
  try {
    const { token } = await context.params;
    const body = bodySchema.parse(await request.json());
    clientUploadId = body.clientUploadId;
    intentId = body.intentId;
    const resource = await readVerifiedCloudinaryImage(body.publicId);
    const photo = await registerVerifiedPhoto({ token, intentId: body.intentId, clientUploadId: body.clientUploadId, publicId: body.publicId, capturedAt: body.capturedAt, resource });
    return Response.json({ data: photo }, { status: 201 });
  } catch (error) {
    const details = safeApiErrorDetails(error);
    if (details.status >= 500) console.error({ event: "camera_upload_error", route: "register", stage: "register", ...details, clientUploadId, intentId });
    return errorResponse(error);
  }
}
