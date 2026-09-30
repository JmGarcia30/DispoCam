"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { preprocessAndStoreCapture } from "@/lib/offline/capture";
import { offlinePhotoStore } from "@/lib/offline/database";
import { calculateEffectiveRemainingShots, countLocalPendingShots } from "@/lib/offline/shots";
import type { OfflinePhoto } from "@/lib/offline/types";
import { photoSyncChannel } from "@/lib/offline/channel";

export function useOfflinePhotos(cameraPassId: string, serverRemainingShots: number, resetGeneration = 0) {
  const [photos, setPhotos] = useState<OfflinePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPhotos(await offlinePhotoStore.getPhotosForPass(cameraPassId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Local photos could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [cameraPassId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  useEffect(() => photoSyncChannel.subscribe((message) => {
    if (message.cameraPassId === cameraPassId) void refresh();
  }), [cameraPassId, refresh]);

  const localPendingShots = useMemo(() => countLocalPendingShots(photos), [photos]);
  const effectiveRemainingShots = calculateEffectiveRemainingShots(serverRemainingShots, localPendingShots);

  const saveCapture = useCallback(
    async (image: Blob, maxUploadBytes: number, processing?: { maxDimension?: number; quality?: number }) => {
      const saved = await preprocessAndStoreCapture(cameraPassId, image, {
        maxBytes: maxUploadBytes,
        ...processing,
        resetGeneration,
        serverRemainingShots,
      });
      await refresh();
      return saved;
    },
    [cameraPassId, refresh, resetGeneration, serverRemainingShots],
  );

  return {
    photos,
    loading,
    error,
    localPendingShots,
    effectiveRemainingShots,
    canCapture: !loading && !error && effectiveRemainingShots > 0,
    saveCapture,
    refresh,
  };
}
