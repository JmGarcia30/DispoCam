import { z } from "zod";
import { requireWeddingAdmin } from "@/lib/api/admin-auth";
import { errorResponse } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const querySchema = z.object({
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  guestId: z.uuid().optional(),
});

export async function GET(request: Request, context: { params: Promise<{ weddingId: string }> }) {
  try {
    const weddingId = z.uuid().parse((await context.params).weddingId);
    await requireWeddingAdmin(request, weddingId);
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    let builder = supabaseAdmin
      .from("photos" as never)
      .select("id,guest_id,camera_pass_id,cloudinary_public_id,secure_url,width,height,captured_at,uploaded_at,moderation_status")
      .eq("wedding_id", weddingId)
      .order("uploaded_at", { ascending: false })
      .limit(query.limit + 1);
    if (query.cursor) builder = builder.lt("uploaded_at", query.cursor);
    if (query.status) builder = builder.eq("moderation_status", query.status);
    if (query.guestId) builder = builder.eq("guest_id", query.guestId);
    const { data, error } = await builder;
    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const guestIds = [...new Set(pageRows.map((row) => row.guest_id as string))];
    const names = new Map<string, string | null>();
    if (guestIds.length) {
      const { data: guests, error: guestsError } = await supabaseAdmin
        .from("guests")
        .select("id,display_name")
        .eq("wedding_id", weddingId)
        .in("id", guestIds);
      if (guestsError) throw guestsError;
      for (const guest of guests ?? []) names.set(guest.id, guest.display_name);
    }
    const items = pageRows.map((row) => ({ ...row, guest_name: names.get(row.guest_id as string) ?? null }));
    return Response.json({
      data: items,
      meta: { hasMore, nextCursor: hasMore ? pageRows.at(-1)?.uploaded_at : null },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
