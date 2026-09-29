import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { errorResponse } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const querySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    await requireWeddingAdmin(request, weddingId);
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    let builder = supabaseAdmin
      .from("photos" as never)
      .select("id,guest_id,camera_pass_id,cloudinary_public_id,secure_url,width,height,captured_at,uploaded_at,moderation_status,guests(display_name)")
      .eq("wedding_id", weddingId)
      .order("uploaded_at", { ascending: false })
      .limit(query.limit + 1);
    if (query.cursor) builder = builder.lt("uploaded_at", query.cursor);
    if (query.status) builder = builder.eq("moderation_status", query.status);
    const { data, error } = await builder;
    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    return Response.json({
      data: items,
      meta: { hasMore, nextCursor: hasMore ? items.at(-1)?.uploaded_at : null },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
