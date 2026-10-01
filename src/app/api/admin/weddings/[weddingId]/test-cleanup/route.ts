import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { requireMutationRole, cleanupEventTestData } from "@/lib/api/admin-mutations";
import { ApiError, errorResponse } from "@/lib/api/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["clear_photos", "clear_guests", "full_reset"]),
  deleteCloudinaryAssets: z.boolean().default(false),
  confirmation: z.string(),
});

const REQUIRED_CONFIRMATIONS = {
  clear_photos: "CLEAR TEST PHOTOS",
  clear_guests: "CLEAR TEST GUESTS",
  full_reset: "RESET EVENT DATA",
} as const;

export async function POST(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId);
    requireMutationRole(admin.role);
    const body = bodySchema.parse(await request.json());

    const expected = REQUIRED_CONFIRMATIONS[body.action];
    if (body.confirmation.trim().toUpperCase() !== expected) {
      throw new ApiError(400, "invalid_confirmation", `Type "${expected}" to confirm this action.`);
    }

    const result = await cleanupEventTestData({
      weddingId,
      mode: body.action,
      deleteCloudinaryAssets: body.deleteCloudinaryAssets,
    });

    return Response.json({
      data: result,
      message: `Successfully executed ${body.action.replace("_", " ")} for this event.`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
