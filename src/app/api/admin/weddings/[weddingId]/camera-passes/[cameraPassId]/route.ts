import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { requireMutationRole, updateCameraPass } from "@/lib/api/admin-mutations";
import { errorResponse } from "@/lib/api/errors";

export const runtime = "nodejs";
const bodySchema = z.union([
  z.object({ grantShots: z.number().int().min(1).max(1000) }).strict(),
  z.object({ shotLimit: z.number().int().min(1).max(1000) }).strict(),
  z.object({ isActive: z.boolean() }).strict(),
]);

export async function PATCH(request: Request, context: { params: Promise<{ weddingId: string; cameraPassId: string }> }) {
  try {
    const params = await context.params;
    const weddingId = z.uuid().parse(params.weddingId);
    const cameraPassId = z.uuid().parse(params.cameraPassId);
    const admin = await requireWeddingAdmin(request, weddingId);
    requireMutationRole(admin.role);
    const change = bodySchema.parse(await request.json());
    return Response.json({ data: await updateCameraPass({ weddingId, cameraPassId, ...change }) });
  } catch (error) {
    return errorResponse(error);
  }
}
