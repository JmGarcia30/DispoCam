import { ApiError, fromDatabaseError } from "@/lib/api/errors";
import { hashCameraToken } from "@/lib/security/token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getCameraPass(token: string) {
  if (token.length < 32 || token.length > 512) throw new ApiError(404, "camera_pass_not_found", "Camera pass not found.");
  const { data, error } = await supabaseAdmin.rpc("get_camera_pass", { p_token_hash: hashCameraToken(token) });
  if (error) throw fromDatabaseError(error);
  const pass = data?.[0];
  if (!pass) throw new ApiError(404, "camera_pass_not_found", "Camera pass not found.");
  return pass;
}

export async function setCameraPassGuestName(token: string, displayName: string) {
  if (token.length < 32 || token.length > 512) throw new ApiError(404, "camera_pass_not_found", "Camera pass not found.");
  const { data, error } = await supabaseAdmin.rpc("set_camera_pass_guest_name", {
    p_token_hash: hashCameraToken(token),
    p_display_name: displayName,
  });
  if (error) throw fromDatabaseError(error);
  return data;
}
