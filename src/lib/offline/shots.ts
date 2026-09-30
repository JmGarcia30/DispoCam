import type { OfflinePhoto } from "@/lib/offline/types";

export function isLocallyOutstanding(photo: Pick<OfflinePhoto, "status">): boolean {
  return photo.status !== "uploaded";
}

export function countLocalPendingShots(photos: ReadonlyArray<Pick<OfflinePhoto, "status" | "capacityReserved">>): number {
  return photos.filter((photo) => isLocallyOutstanding(photo) && photo.capacityReserved !== false).length;
}

export function calculateEffectiveRemainingShots(serverRemainingShots: number, localPendingShots: number): number {
  const serverRemaining = Math.max(0, Math.trunc(serverRemainingShots));
  const localPending = Math.max(0, Math.trunc(localPendingShots));
  return Math.max(0, serverRemaining - localPending);
}
