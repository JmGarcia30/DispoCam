import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { requireMutationRole, updateGuestDisplayName } from "@/lib/api/admin-mutations";
import { errorResponse } from "@/lib/api/errors";

export const runtime = "nodejs";
const bodySchema = z.object({ displayName: z.string().trim().min(2).max(120) });

export async function PATCH(request: Request, context: { params: Promise<{ weddingId: string; guestId: string }> }) {
  try {
    const params = await context.params;
    const weddingId = z.uuid().parse(params.weddingId);
    const guestId = z.uuid().parse(params.guestId);
    const admin = await requireWeddingAdmin(request, weddingId);
    requireMutationRole(admin.role);
    const { displayName } = bodySchema.parse(await request.json());
    return Response.json({ data: await updateGuestDisplayName(weddingId, guestId, displayName) });
  } catch (error) {
    return errorResponse(error);
  }
}
