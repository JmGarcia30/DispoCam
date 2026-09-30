"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { offlinePhotoStore } from "@/lib/offline/database";
import { syncCameraPhotos, type SyncBatchResult } from "@/lib/offline/sync";

export type PhotoSyncUiState = "idle" | "uploading" | "waiting-for-connection" | "retry-scheduled" | "needs-attention";

export function usePhotoSync(cameraPassId: string, cameraToken: string | null) {
  const network = useNetworkStatus();
  const [state, setState] = useState<PhotoSyncUiState>("idle");
  const [lastResult, setLastResult] = useState<SyncBatchResult | null>(null);
  const retryTimer = useRef<number | undefined>(undefined);
  const runRef = useRef<(() => Promise<SyncBatchResult>) | undefined>(undefined);

  const scheduleRetry = useCallback((result: SyncBatchResult) => {
    if (retryTimer.current !== undefined) window.clearTimeout(retryTimer.current);
    if (!result.nextRetryAt) return;
    const delay = Math.max(0, Date.parse(result.nextRetryAt) - Date.now());
    retryTimer.current = window.setTimeout(() => void runRef.current?.(), delay);
  }, []);

  const run = useCallback(async () => {
    setState(network.offline ? "waiting-for-connection" : "uploading");
    const result = await syncCameraPhotos(cameraPassId, cameraToken);
    if (process.env.NODE_ENV !== "production" && result.diagnostic) {
      console.warn("DispoCam sync diagnostic", result.diagnostic);
    }
    setLastResult(result);
    if (result.status === "waiting-for-connection" || result.status === "token-unavailable") {
      setState("waiting-for-connection");
    } else if (result.status === "retry-scheduled") {
      setState("retry-scheduled");
    } else if (result.status === "needs-attention") {
      setState("needs-attention");
    } else {
      setState("idle");
    }
    scheduleRetry(result);
    return result;
  }, [cameraPassId, cameraToken, network.offline, scheduleRetry]);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const manualRetry = useCallback(async (photoId?: string) => {
    if (photoId) await offlinePhotoStore.retryPhoto(photoId);
    return run();
  }, [run]);

  const notifyPhotoCaptured = useCallback(() => {
    if (network.online) void run();
  }, [network.online, run]);

  useEffect(() => {
    const mountTrigger = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(mountTrigger);
  }, [run]);

  useEffect(() => {
    if (!network.online) return;
    const onlineTrigger = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(onlineTrigger);
  }, [network.online, run]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [run]);

  useEffect(() => {
    const onBackgroundSync = () => void run();
    window.addEventListener("dispocam:background-sync", onBackgroundSync);
    return () => window.removeEventListener("dispocam:background-sync", onBackgroundSync);
  }, [run]);

  useEffect(() => () => {
    if (retryTimer.current !== undefined) window.clearTimeout(retryTimer.current);
  }, []);

  return {
    state,
    syncing: state === "uploading",
    lastResult,
    run,
    manualRetry,
    notifyPhotoCaptured,
  };
}
