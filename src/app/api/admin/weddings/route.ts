import { requireAuthenticatedAdmin } from "@/lib/api/admin-auth";
import { errorResponse } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedAdmin(request);
    const { data, error } = await supabaseAdmin
      .from("admins")
      .select("role,weddings(id,name,event_date,timezone)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return Response.json({ data: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
