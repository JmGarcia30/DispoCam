"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { offlinePhotoStore } from "@/lib/offline/database";
import { syncCameraPhotos, type SyncBatchResult } from "@/lib/offline/sync";
import { NETWORK_TIMEOUTS } from "@/lib/network/timeouts";
import { preparePhotosForManualRetry } from "@/lib/offline/manual-retry";

export type PhotoSyncUiState = "idle" | "checking-connection" | "uploading" | "retrying" | "waiting-for-connection" | "retry-scheduled" | "needs-attention";
type RunKind = "automatic" | "retry";

export function usePhotoSync(cameraPassId: string, cameraToken: string | null) {
  const { check: checkNetwork, online: networkOnline } = useNetworkStatus();
  const [state, setState] = useState<PhotoSyncUiState>("idle");
  const [lastResult, setLastResult] = useState<SyncBatchResult | null>(null);
  const retryTimer = useRef<number | undefined>(undefined);
  const activeRun = useRef<Promise<SyncBatchResult> | null>(null);
  const runRef = useRef<((kind?: RunKind) => Promise<SyncBatchResult>) | undefined>(undefined);

  const applyResult = useCallback((result: SyncBatchResult) => {
    if (process.env.NODE_ENV !== "production" && result.diagnostic) console.warn("DispoCam sync diagnostic", result.diagnostic);
    setLastResult(result);
    if (result.status === "waiting-for-connection" || result.status === "token-unavailable") setState("waiting-for-connection");
    else if (result.status === "retry-scheduled") setState("retry-scheduled");
    else if (result.status === "needs-attention") setState("needs-attention");
    else setState("idle");
    if (retryTimer.current !== undefined) window.clearTimeout(retryTimer.current);
    if (result.nextRetryAt) {
      const delay = Math.max(0, Date.parse(result.nextRetryAt) - Date.now());
      retryTimer.current = window.setTimeout(() => void runRef.current?.("retry"), delay);
    } else if (result.status === "waiting-for-connection" && result.remaining > 0) {
      retryTimer.current = window.setTimeout(() => void runRef.current?.("retry"), NETWORK_TIMEOUTS.reconnectRetryMs);
    }
    return result;
  }, []);

  const run = useCallback((kind: RunKind = "automatic") => {
    if (activeRun.current) return activeRun.current;
    const batch = (async () => {
      setState("checking-connection");
      if (!(await checkNetwork())) {
        const outstanding = await offlinePhotoStore.getOutstandingPhotos(cameraPassId);
        return applyResult({ status: "waiting-for-connection", uploaded: 0, retryScheduled: 0, needsAttention: 0, remaining: outstanding.length });
      }
      setState(kind === "retry" ? "retrying" : "uploading");
      return applyResult(await syncCameraPhotos(cameraPassId, cameraToken, { canReach: async () => true }));
    })().finally(() => { activeRun.current = null; });
    activeRun.current = batch;
    return batch;
  }, [applyResult, cameraPassId, cameraToken, checkNetwork]);

  useEffect(() => { runRef.current = run; }, [run]);

  const manualRetry = useCallback((photoId?: string) => {
    if (activeRun.current) return activeRun.current;
    const batch = (async () => {
      setState("checking-connection");
      if (!(await checkNetwork())) {
        const outstanding = await offlinePhotoStore.getOutstandingPhotos(cameraPassId);
        return applyResult({ status: "waiting-for-connection", uploaded: 0, retryScheduled: 0, needsAttention: 0, remaining: outstanding.length });
      }
      await preparePhotosForManualRetry(cameraPassId, photoId);
      setState("retrying");
      return applyResult(await syncCameraPhotos(cameraPassId, cameraToken, { canReach: async () => true }));
    })().finally(() => { activeRun.current = null; });
    activeRun.current = batch;
    return batch;
  }, [applyResult, cameraPassId, cameraToken, checkNetwork]);

  const notifyPhotoCaptured = useCallback(() => { if (networkOnline) void run(); }, [networkOnline, run]);

  useEffect(() => {
    const trigger = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(trigger);
  }, [run]);

  useEffect(() => {
    if (!networkOnline) return;
    const trigger = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(trigger);
  }, [networkOnline, run]);

  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void run(); };
    const onBackgroundSync = () => void run();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("dispocam:background-sync", onBackgroundSync);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("dispocam:background-sync", onBackgroundSync);
    };
  }, [run]);

  useEffect(() => () => { if (retryTimer.current !== undefined) window.clearTimeout(retryTimer.current); }, []);

  const syncing = state === "uploading" || state === "checking-connection" || state === "retrying";
  return { state, syncing, reachable: networkOnline, lastResult, run, manualRetry, notifyPhotoCaptured };
}
