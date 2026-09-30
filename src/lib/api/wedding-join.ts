import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { hashCameraToken } from "@/lib/security/token";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TOKEN_MIN = 32;

function hashValue(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashInviteToken(token: string) {
  return hashValue(token);
}

export function rateIdentifier(request: Request, inviteToken: string) {
  const address = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]
    ?? "unknown";
  return hashValue(`${env.SUPABASE_SERVICE_ROLE_KEY}|${address.trim()}|${hashInviteToken(inviteToken)}|wedding-join`);
}

function validateToken(token: string) {
  if (token.length < TOKEN_MIN || token.length > 512) throw new ApiError(404, "invite_not_found", "Wedding invite not found.");
}

export async function getWeddingInvite(token: string) {
  validateToken(token);
  const { data, error } = await supabaseAdmin
    .from("weddings")
    .select("name,join_enabled,invite_expires_at")
    .eq("invite_token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "invite_not_found", "Wedding invite not found.");
  if (!data.join_enabled) throw new ApiError(403, "invite_disabled", "This wedding invite is not currently accepting guests.");
  if (data.invite_expires_at && Date.parse(data.invite_expires_at) <= Date.now()) {
    throw new ApiError(403, "invite_expired", "This wedding invite has expired.");
  }
  return { weddingName: data.name };
}

const resultErrors: Record<string, ApiError> = {
  invalid_invite: new ApiError(404, "invite_not_found", "Wedding invite not found."),
  disabled_invite: new ApiError(403, "invite_disabled", "This wedding invite is not currently accepting guests."),
  expired_invite: new ApiError(403, "invite_expired", "This wedding invite has expired."),
  invalid_name: new ApiError(400, "invalid_guest_name", "Display name must be between 2 and 120 characters."),
  invalid_request: new ApiError(400, "invalid_request", "The join request is invalid."),
  rate_limited: new ApiError(429, "rate_limited", "Too many join attempts. Please try again later."),
  already_joined: new ApiError(409, "already_joined", "This browser has already joined. Reopen its saved camera pass."),
};

export async function createWeddingGuestPass(input: { inviteToken: string; displayName: string; browserKey: string; request: Request }) {
  validateToken(input.inviteToken);
  if (input.browserKey.length < 32 || input.browserKey.length > 512) throw new ApiError(400, "invalid_request", "The join request is invalid.");
  const cameraToken = randomBytes(32).toString("base64url");
  const { data, error } = await supabaseAdmin.rpc("join_wedding_from_invite" as never, {
    p_invite_token_hash: hashInviteToken(input.inviteToken),
    p_display_name: input.displayName,
    p_camera_token_hash: hashCameraToken(cameraToken),
    p_browser_key_hash: hashValue(input.browserKey),
    p_rate_identifier_hash: rateIdentifier(input.request, input.inviteToken),
  } as never);
  if (error) throw error;
  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) throw new ApiError(500, "join_failed", "The wedding camera could not be created.");
  const status = String(row.result_status);
  if (status !== "created") throw resultErrors[status] ?? new ApiError(500, "join_failed", "The wedding camera could not be created.");
  return {
    cameraToken,
    cameraPassId: String(row.camera_pass_id),
    guestId: String(row.guest_id),
    shotLimit: Number(row.shot_limit),
  };
}
