import { z } from "zod";
import { createWeddingGuestPass, getWeddingInvite } from "@/lib/api/wedding-join";
import { errorResponse } from "@/lib/api/errors";

export const runtime = "nodejs";
const joinSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  browserKey: z.string().min(32).max(512),
});

export async function GET(_request: Request, context: { params: Promise<{ inviteToken: string }> }) {
  try {
    const { inviteToken } = await context.params;
    return Response.json({ data: await getWeddingInvite(inviteToken) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ inviteToken: string }> }) {
  try {
    const { inviteToken } = await context.params;
    const body = joinSchema.parse(await request.json());
    const result = await createWeddingGuestPass({ inviteToken, ...body, request });
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
