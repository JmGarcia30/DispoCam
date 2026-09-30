"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { offlinePhotoStore } from "@/lib/offline/database";
import { syncCameraPhotos, type SyncBatchResult } from "@/lib/offline/sync";
import { preparePhotosForManualRetry } from "@/lib/offline/manual-retry";
import type { CameraPageMode } from "@/lib/offline/types";

export type PhotoSyncUiState = "idle" | "checking-connection" | "uploading" | "retrying" | "waiting-for-connection" | "retry-scheduled" | "needs-attention";

export function usePhotoSync(cameraPassId: string, cameraToken: string | null, pageMode: CameraPageMode) {
  const { check: checkNetwork, online: networkOnline } = useNetworkStatus();
  const [state, setState] = useState<PhotoSyncUiState>("idle");
  const [lastResult, setLastResult] = useState<SyncBatchResult | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [queueFailure, setQueueFailure] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [savingUpload, setSavingUpload] = useState(false);
  const activeRun = useRef<Promise<SyncBatchResult> | null>(null);

  const applyResult = useCallback((result: SyncBatchResult) => {
    if (process.env.NODE_ENV !== "production" && result.diagnostic) console.warn("DispoCam sync diagnostic", result.diagnostic);
    setLastResult(result);
    if (result.status === "waiting-for-connection" || result.status === "token-unavailable") setState("waiting-for-connection");
    else if (result.status === "needs-attention") setState("needs-attention");
    else if (result.remaining > 0) setState("retry-scheduled");
    else setState("idle");
    return result;
  }, []);

  const uploadOne = useCallback(async (photoId: string, manual: boolean) => {
    setState("checking-connection");
    if (!(await checkNetwork())) {
      const outstanding = await offlinePhotoStore.getOutstandingPhotos(cameraPassId);
      return applyResult({ status: "waiting-for-connection", uploaded: 0, retryScheduled: 0, needsAttention: 0, remaining: outstanding.length });
    }
    await preparePhotosForManualRetry(cameraPassId, photoId);
    setState(manual ? "retrying" : "uploading");
    return applyResult(await syncCameraPhotos(cameraPassId, cameraToken, {
      canReach: async () => true,
      pageMode,
      photoIds: [photoId],
      onUploadProgress: (percentage) => {
        setUploadPercent(percentage);
        setSavingUpload(percentage === null);
      },
    }));
  }, [applyResult, cameraPassId, cameraToken, checkNetwork, pageMode]);

  const run = useCallback((photoId?: string) => {
    if (activeRun.current) return activeRun.current;
    const batch = (async () => {
      setQueueFailure(false);
      if (!photoId) {
        const outstanding = await offlinePhotoStore.getOutstandingPhotos(cameraPassId);
        return applyResult({ status: outstanding.length ? "retry-scheduled" : "complete", uploaded: 0, retryScheduled: outstanding.length, needsAttention: 0, remaining: outstanding.length });
      }
      return uploadOne(photoId, false);
    })().finally(() => { activeRun.current = null; setProgress(null); setUploadPercent(null); setSavingUpload(false); });
    activeRun.current = batch;
    return batch;
  }, [applyResult, cameraPassId, uploadOne]);

  const manualRetry = useCallback((photoId?: string) => {
    if (activeRun.current) return activeRun.current;
    const batch = (async () => {
      await offlinePhotoStore.recoverUploadingPhotos(cameraPassId);
      const all = await offlinePhotoStore.getOutstandingPhotos(cameraPassId);
      const queue = photoId ? all.filter((photo) => photo.id === photoId) : all;
      if (!queue.length) return applyResult({ status: "complete", uploaded: 0, retryScheduled: 0, needsAttention: 0, remaining: 0 });
      let uploaded = 0;
      for (let index = 0; index < queue.length; index += 1) {
        setProgress({ current: index + 1, total: queue.length });
        const result = await uploadOne(queue[index].id, true);
        uploaded += result.uploaded;
        if (result.uploaded !== 1) {
          setQueueFailure(true);
          return { ...result, uploaded };
        }
      }
      const remaining = (await offlinePhotoStore.getOutstandingPhotos(cameraPassId)).length;
      return applyResult({ status: remaining ? "retry-scheduled" : "complete", uploaded, retryScheduled: remaining, needsAttention: 0, remaining });
    })().finally(() => { activeRun.current = null; setProgress(null); setUploadPercent(null); setSavingUpload(false); });
    activeRun.current = batch;
    return batch;
  }, [applyResult, cameraPassId, uploadOne]);

  const notifyPhotoCaptured = useCallback((photoId: string) => run(photoId), [run]);

  useEffect(() => {
    let active = true;
    void offlinePhotoStore.recoverUploadingPhotos(cameraPassId).then(async () => {
      if (!active) return;
      const outstanding = await offlinePhotoStore.getOutstandingPhotos(cameraPassId);
      if (active && outstanding.length) setState("retry-scheduled");
    });
    return () => { active = false; };
  }, [cameraPassId]);

  useEffect(() => {
    if (!networkOnline || activeRun.current) return;
    let active = true;
    void offlinePhotoStore.getOutstandingPhotos(cameraPassId).then((outstanding) => {
      if (active && outstanding.length) setState("retry-scheduled");
    });
    return () => { active = false; };
  }, [cameraPassId, networkOnline]);

  const syncing = state === "uploading" || state === "checking-connection" || state === "retrying";
  return { state, syncing, reachable: networkOnline, lastResult, progress, uploadPercent, savingUpload, queueFailure, run, manualRetry, notifyPhotoCaptured };
}
