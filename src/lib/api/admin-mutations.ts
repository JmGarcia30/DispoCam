import "server-only";
import { ApiError, fromDatabaseError } from "@/lib/api/errors";
import { cloudinary } from "@/lib/cloudinary";
import { supabaseAdmin } from "@/lib/supabase/admin";

export function requireMutationRole(role: string) {
  if (role === "viewer") throw new ApiError(403, "forbidden", "Editor or owner access is required.");
}

export async function resetTestCameraPass(input: {
  weddingId: string;
  cameraPassId: string;
  mode: "shot_count" | "full";
  deleteCloudinaryAssets: boolean;
}) {
  if (input.deleteCloudinaryAssets && input.mode !== "full") {
    throw new ApiError(400, "invalid_reset", "Cloudinary assets can only be removed during a full reset.");
  }
  const { data, error } = await supabaseAdmin.rpc("reset_camera_pass_for_testing", {
    p_wedding_id: input.weddingId,
    p_camera_pass_id: input.cameraPassId,
    p_full_reset: input.mode === "full",
  });
  if (error) throw fromDatabaseError(error);

  const publicIds = (data ?? []) as string[];
  const assetDeletionFailures: string[] = [];
  if (input.deleteCloudinaryAssets) {
    for (const publicId of publicIds) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
      } catch {
        assetDeletionFailures.push(publicId);
      }
    }
  }
  return { mode: input.mode, removedPhotoCount: publicIds.length, assetDeletionFailures };
}

export async function updateGuestDisplayName(weddingId: string, guestId: string, displayName: string) {
  const { data, error } = await supabaseAdmin
    .from("guests")
    .update({ display_name: displayName })
    .eq("id", guestId)
    .eq("wedding_id", weddingId)
    .select("id,display_name")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "guest_not_found", "Guest not found.");
  return data;
}
