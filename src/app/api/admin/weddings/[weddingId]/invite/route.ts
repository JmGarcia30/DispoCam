import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { requireMutationRole } from "@/lib/api/admin-mutations";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { hashInviteToken } from "@/lib/api/wedding-join";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const settingsSchema = z.object({
  joinEnabled: z.boolean().optional(),
  defaultShotLimit: z.number().int().min(1).max(1000).optional(),
  inviteExpiresAt: z.string().datetime().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

async function readSettings(weddingId: string) {
  const { data, error } = await supabaseAdmin.from("weddings")
    .select("id,name,default_shot_limit,join_enabled,invite_token_hash,invite_expires_at")
    .eq("id", weddingId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "wedding_not_found", "Wedding not found.");
  return {
    id: data.id, name: data.name, defaultShotLimit: data.default_shot_limit,
    joinEnabled: data.join_enabled, hasInvite: Boolean(data.invite_token_hash),
    inviteExpiresAt: data.invite_expires_at,
  };
}

export async function GET(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId);
    return Response.json({ data: await readSettings(weddingId), meta: { role: admin.role } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId); requireMutationRole(admin.role);
    const token = randomBytes(32).toString("base64url");
    const { error } = await supabaseAdmin.from("weddings").update({ invite_token_hash: hashInviteToken(token), join_enabled: true }).eq("id", weddingId);
    if (error) throw error;
    return Response.json({ data: { ...(await readSettings(weddingId)), inviteToken: token, joinPath: `/join/${token}` } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId); requireMutationRole(admin.role);
    const settings = settingsSchema.parse(await request.json());
    const patch: Record<string, unknown> = {};
    if (settings.joinEnabled !== undefined) patch.join_enabled = settings.joinEnabled;
    if (settings.defaultShotLimit !== undefined) patch.default_shot_limit = settings.defaultShotLimit;
    if (settings.inviteExpiresAt !== undefined) patch.invite_expires_at = settings.inviteExpiresAt;
    const { error } = await supabaseAdmin.from("weddings").update(patch).eq("id", weddingId);
    if (error) throw error;
    return Response.json({ data: await readSettings(weddingId) });
  } catch (error) { return errorResponse(error); }
}
