import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { requireMutationRole } from "@/lib/api/admin-mutations";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { productionOrigin as resolveProductionOrigin } from "@/lib/admin/production-origin";
import { hashInviteToken } from "@/lib/api/wedding-join";
import { decryptInviteToken, encryptInviteToken } from "@/lib/api/invite-encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const settingsSchema = z.object({
  joinEnabled: z.boolean().optional(),
  defaultShotLimit: z.number().int().min(1).max(1000).optional(),
  inviteExpiresAt: z.string().datetime().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

async function readSettings(weddingId: string, origin?: string) {
  const { data, error } = await supabaseAdmin.from("weddings")
    .select("id,name,default_shot_limit,join_enabled,invite_token_hash,invite_expires_at,invite_token_encrypted,invite_token")
    .eq("id", weddingId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "wedding_not_found", "Wedding not found.");

  let decryptedToken: string | null = null;

  // 1. Recover token from encrypted storage at rest
  if (data.invite_token_encrypted) {
    decryptedToken = decryptInviteToken(data.invite_token_encrypted);
  } else if (typeof data.invite_token === "string" && data.invite_token.length > 0) {
    // 2. Backward compatibility migration path:
    // If a legacy plaintext token exists, encrypt it immediately and clear plaintext
    const rawLegacy = data.invite_token;
    decryptedToken = rawLegacy;
    const encrypted = encryptInviteToken(rawLegacy);
    void supabaseAdmin.from("weddings").update({
      invite_token_encrypted: encrypted,
      invite_token: null,
    }).eq("id", weddingId);
  }

  let joinPath: string | null = null;
  let joinUrl: string | null = null;
  if (decryptedToken && origin) {
    joinPath = `/join/${decryptedToken}`;
    joinUrl = new URL(joinPath, origin).toString();
  }

  return {
    id: data.id,
    name: data.name,
    defaultShotLimit: data.default_shot_limit,
    joinEnabled: data.join_enabled,
    hasInvite: Boolean(data.invite_token_hash),
    inviteExpiresAt: data.invite_expires_at,
    joinPath,
    joinUrl,
  };
}

export async function GET(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId);
    const origin = resolveProductionOrigin(request.url, process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_ENV);
    return Response.json({ data: await readSettings(weddingId, origin), meta: { role: admin.role } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId);
    requireMutationRole(admin.role);
    const origin = resolveProductionOrigin(request.url, process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_ENV);

    // Generate high-entropy bearer token (256 bits of entropy)
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashInviteToken(token);
    const tokenEncrypted = encryptInviteToken(token);

    // Atomically persist verification hash and encrypted ciphertext; ensure plaintext is null
    const { error } = await supabaseAdmin.from("weddings").update({
      invite_token_hash: tokenHash,
      invite_token_encrypted: tokenEncrypted,
      invite_token: null,
      join_enabled: true,
    }).eq("id", weddingId);
    if (error) throw error;

    const joinPath = `/join/${token}`;
    const joinUrl = new URL(joinPath, origin).toString();
    const settings = await readSettings(weddingId, origin);

    return Response.json({
      data: {
        ...settings,
        joinPath,
        joinUrl,
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId);
    requireMutationRole(admin.role);
    const origin = resolveProductionOrigin(request.url, process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_ENV);
    const settings = settingsSchema.parse(await request.json());
    const patch: Record<string, unknown> = {};
    if (settings.joinEnabled !== undefined) patch.join_enabled = settings.joinEnabled;
    if (settings.defaultShotLimit !== undefined) patch.default_shot_limit = settings.defaultShotLimit;
    if (settings.inviteExpiresAt !== undefined) patch.invite_expires_at = settings.inviteExpiresAt;
    const { error } = await supabaseAdmin.from("weddings").update(patch).eq("id", weddingId);
    if (error) throw error;
    return Response.json({ data: await readSettings(weddingId, origin) });
  } catch (error) {
    return errorResponse(error);
  }
}
