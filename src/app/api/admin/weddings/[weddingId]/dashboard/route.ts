import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId);
    const [weddingResult, guestsResult, passesResult, photosResult] = await Promise.all([
      supabaseAdmin.from("weddings").select("id,name,event_date,timezone").eq("id", weddingId).maybeSingle(),
      supabaseAdmin.from("guests").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId),
      supabaseAdmin.from("camera_passes").select("id,shot_limit,shots_used,is_active").eq("wedding_id", weddingId),
      supabaseAdmin.from("photos" as never).select("id,guest_id,secure_url,captured_at,uploaded_at", { count: "exact" }).eq("wedding_id", weddingId).order("uploaded_at", { ascending: false }).limit(6),
    ]);
    const firstError = weddingResult.error ?? guestsResult.error ?? passesResult.error ?? photosResult.error;
    if (firstError) throw firstError;
    if (!weddingResult.data) throw new ApiError(404, "wedding_not_found", "Wedding not found.");
    const passes = passesResult.data ?? [];
    const recentRows = (photosResult.data ?? []) as Array<Record<string, unknown>>;
    const guestIds = [...new Set(recentRows.map((row) => row.guest_id as string))];
    const names = new Map<string, string | null>();
    if (guestIds.length) {
      const { data, error } = await supabaseAdmin.from("guests").select("id,display_name").in("id", guestIds).eq("wedding_id", weddingId);
      if (error) throw error;
      for (const guest of data ?? []) names.set(guest.id, guest.display_name);
    }
    return Response.json({
      data: {
        wedding: weddingResult.data,
        role: admin.role,
        stats: {
          totalGuests: guestsResult.count ?? 0,
          totalPhotos: photosResult.count ?? 0,
          totalShotsUsed: passes.reduce((sum, pass) => sum + pass.shots_used, 0),
          totalShotCapacity: passes.reduce((sum, pass) => sum + pass.shot_limit, 0),
          remainingShotCapacity: passes.reduce((sum, pass) => sum + Math.max(0, pass.shot_limit - pass.shots_used), 0),
          activeCameraPasses: passes.filter((pass) => pass.is_active).length,
        },
        recentUploads: recentRows.map((row) => ({ ...row, guest_name: names.get(row.guest_id as string) ?? null })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
