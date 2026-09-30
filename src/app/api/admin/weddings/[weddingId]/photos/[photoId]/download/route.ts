import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeFilename(name: string | null, capturedAt: string) {
  const guest = (name || "unnamed-guest").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "guest";
  const date = new Date(capturedAt).toISOString().replace(/[:.]/g, "-");
  return `${guest}_${date}.jpg`;
}

export async function GET(request: Request, context: { params: Promise<{ weddingId: string; photoId: string }> }) {
  try {
    const params = await context.params;
    const weddingId = z.uuid().parse(params.weddingId);
    const photoId = z.uuid().parse(params.photoId);
    await requireWeddingAdmin(request, weddingId);
    const { data: photo, error } = await supabaseAdmin
      .from("photos" as never)
      .select("id,guest_id,secure_url,captured_at")
      .eq("id", photoId)
      .eq("wedding_id", weddingId)
      .maybeSingle();
    if (error) throw error;
    if (!photo) throw new ApiError(404, "photo_not_found", "Photo not found.");
    const row = photo as unknown as { guest_id: string; secure_url: string; captured_at: string };
    const { data: guest } = await supabaseAdmin.from("guests").select("display_name").eq("id", row.guest_id).eq("wedding_id", weddingId).maybeSingle();
    const upstream = await fetch(row.secure_url);
    if (!upstream.ok || !upstream.body) throw new ApiError(502, "download_failed", "Photo download is temporarily unavailable.");
    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
        "content-disposition": `attachment; filename="${safeFilename(guest?.display_name ?? null, row.captured_at)}"`,
        "cache-control": "private, max-age=60",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
