import { preprocessImage, type ImageProcessingOptions } from "@/lib/camera/preprocess";
import { offlinePhotoStore, type OfflinePhotoStore } from "@/lib/offline/database";
import type { OfflinePhoto } from "@/lib/offline/types";
import { photoSyncChannel } from "@/lib/offline/channel";

export interface StoreCaptureOptions extends ImageProcessingOptions {
  id?: string;
  capturedAt?: string;
  store?: OfflinePhotoStore;
  serverRemainingShots?: number;
}

/** The UUID is assigned once here and persisted with the Blob for all future retries. */
export async function preprocessAndStoreCapture(
  cameraPassId: string,
  source: Blob,
  options: StoreCaptureOptions = {},
): Promise<OfflinePhoto> {
  const id = options.id ?? crypto.randomUUID();
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const processed = await preprocessImage(source, options);
  const input = {
    id,
    cameraPassId,
    image: processed.blob,
    capturedAt,
    width: processed.width,
    height: processed.height,
  };
  const store = options.store ?? offlinePhotoStore;
  const saved = await (options.serverRemainingShots === undefined
    ? store.storePhoto(input)
    : store.storePhotoWithinShotLimit(input, options.serverRemainingShots));
  photoSyncChannel.publish({ type: "photo-queued", cameraPassId, photoId: saved.id });
  photoSyncChannel.publish({ type: "shot-count-changed", cameraPassId });
  return saved;
}
