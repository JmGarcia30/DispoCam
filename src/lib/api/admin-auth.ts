import { ApiError } from "@/lib/api/errors";
import { readBearerToken } from "@/lib/security/token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function requireWeddingAdmin(request: Request, weddingId: string) {
  const token = readBearerToken(request);
  if (!token) throw new ApiError(401, "unauthorized", "A Supabase access token is required.");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthorized", "The access token is invalid.");
  const { data: admin } = await supabaseAdmin
    .from("admins")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("wedding_id", weddingId)
    .maybeSingle();
  if (!admin) throw new ApiError(403, "forbidden", "You do not have access to this wedding.");
  return { user: data.user, role: admin.role };
}
