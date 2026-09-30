import { offlinePhotoStore, type OfflinePhotoStore } from "@/lib/offline/database";
import { photoSyncChannel } from "@/lib/offline/channel";

/** Makes failed photos immediately claimable while preserving their stable ID and local Blob. */
export async function preparePhotosForManualRetry(
  cameraPassId: string,
  photoId?: string,
  store: OfflinePhotoStore = offlinePhotoStore,
): Promise<number> {
  const outstanding = await store.getOutstandingPhotos(cameraPassId);
  const candidates = photoId
    ? outstanding.filter((photo) => photo.id === photoId)
    : outstanding.filter((photo) => photo.failureKind === "attention" || photo.failureKind === "retryable");

  for (const photo of candidates) {
    await store.retryPhoto(photo.id);
    photoSyncChannel.publish({ type: "photo-queued", cameraPassId, photoId: photo.id });
  }
  return candidates.length;
}
