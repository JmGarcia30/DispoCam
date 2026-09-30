import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { errorResponse } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    const admin = await requireWeddingAdmin(request, weddingId);
    const [guestsResult, passesResult, photosResult] = await Promise.all([
      supabaseAdmin.from("guests").select("id,display_name,created_at").eq("wedding_id", weddingId).order("created_at"),
      supabaseAdmin.from("camera_passes").select("id,guest_id,shot_limit,shots_used,is_active,expires_at,created_at").eq("wedding_id", weddingId),
      supabaseAdmin.from("photos" as never).select("guest_id,captured_at").eq("wedding_id", weddingId).order("captured_at", { ascending: false }),
    ]);
    const firstError = guestsResult.error ?? passesResult.error ?? photosResult.error;
    if (firstError) throw firstError;
    const latest = new Map<string, string>();
    for (const photo of (photosResult.data ?? []) as Array<{ guest_id: string; captured_at: string }>) {
      if (!latest.has(photo.guest_id)) latest.set(photo.guest_id, photo.captured_at);
    }
    const guests = (guestsResult.data ?? []).map((guest) => ({
      ...guest,
      last_activity: latest.get(guest.id) ?? null,
      passes: (passesResult.data ?? []).filter((pass) => pass.guest_id === guest.id).map((pass) => ({
        ...pass,
        shots_remaining: Math.max(0, pass.shot_limit - pass.shots_used),
      })),
    }));
    return Response.json({ data: guests, meta: { role: admin.role } });
  } catch (error) {
    return errorResponse(error);
  }
}
