import { getCameraPass } from "@/lib/api/camera";
import { errorResponse } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const pass = await getCameraPass(token);
    const { data, error } = await supabaseAdmin
      .from("photos")
      .select("id,secure_url,width,height,captured_at,uploaded_at,moderation_status,client_upload_id")
      .eq("camera_pass_id", pass.pass_id)
      .order("captured_at", { ascending: false });
    if (error) throw error;
    return Response.json({ data, meta: { shotsRemaining: pass.shots_remaining } });
  } catch (error) {
    return errorResponse(error);
  }
}
