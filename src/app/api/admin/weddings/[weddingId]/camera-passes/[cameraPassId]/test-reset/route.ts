import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { requireMutationRole, resetTestCameraPass } from "@/lib/api/admin-mutations";
import { errorResponse } from "@/lib/api/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  mode: z.enum(["shot_count", "full"]),
  deleteCloudinaryAssets: z.boolean().default(false),
  confirmation: z.literal("RESET TEST CAMERA PASS"),
});

export async function POST(request: Request, context: { params: Promise<{ weddingId: string; cameraPassId: string }> }) {
  try {
    const params = await context.params;
    const weddingId = z.uuid().parse(params.weddingId);
    const cameraPassId = z.uuid().parse(params.cameraPassId);
    const admin = await requireWeddingAdmin(request, weddingId);
    requireMutationRole(admin.role);
    const body = bodySchema.parse(await request.json());
    const result = await resetTestCameraPass({
      weddingId,
      cameraPassId,
      mode: body.mode,
      deleteCloudinaryAssets: body.deleteCloudinaryAssets,
    });
    return Response.json({
      data: result,
      warning: "Server reset does not remove photos still queued on a device. Clear local test data for this camera pass too.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
