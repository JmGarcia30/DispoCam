"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { offlinePhotoStore } from "@/lib/offline/database";
import { syncCameraPhotos, type SyncBatchResult } from "@/lib/offline/sync";
import { preparePhotosForManualRetry } from "@/lib/offline/manual-retry";
import type { CameraPageMode, OfflinePhoto } from "@/lib/offline/types";
import { uploadOnlinePhotoSimple } from "@/lib/online/simple-upload";

export type PhotoSyncUiState = "idle" | "checking-connection" | "uploading" | "retrying" | "waiting-for-connection" | "retry-scheduled" | "needs-attention";

export function selectAutoRetryPhoto(photos: OfflinePhoto[], now = Date.now(), force = false): OfflinePhoto | undefined {
  return photos.find((photo) =>
    photo.failureKind !== "attention" &&
    photo.status !== "uploading" &&
    (force || !photo.nextRetryAt || Date.parse(photo.nextRetryAt) <= now));
}

export function subscribeAutoRetryTriggers(
  windowTarget: Pick<Window, "addEventListener" | "removeEventListener">,
  documentTarget: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">,
  retry: () => void,
): () => void {
  const onVisibility = () => { if (documentTarget.visibilityState === "visible") retry(); };
  windowTarget.addEventListener("online", retry);
  windowTarget.addEventListener("focus", retry);
  documentTarget.addEventListener("visibilitychange", onVisibility);
  return () => {
    windowTarget.removeEventListener("online", retry);
    windowTarget.removeEventListener("focus", retry);
    documentTarget.removeEventListener("visibilitychange", onVisibility);
  };
}

export function usePhotoSync(cameraPassId: string, cameraToken: string | null, pageMode: CameraPageMode, onlineOnly = false) {
  const { check: checkNetwork, online: networkOnline } = useNetworkStatus();
  const [state, setState] = useState<PhotoSyncUiState>("idle");
  const [lastResult, setLastResult] = useState<SyncBatchResult | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [queueFailure, setQueueFailure] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [savingUpload, setSavingUpload] = useState(false);
  const [checkingPhoto, setCheckingPhoto] = useState(false);
  const activeRuns = useRef(new Map<string, Promise<SyncBatchResult>>());
  const manualRun = useRef<Promise<SyncBatchResult> | null>(null);
  const foregroundPhoto = useRef<string | null>(null);

  const applyResult = useCallback((result: SyncBatchResult) => {
    if (process.env.NODE_ENV !== "production" && result.diagnostic) console.warn("DispoCam sync diagnostic", result.diagnostic);
    setLastResult(result);
    if (result.status === "waiting-for-connection" || result.status === "token-unavailable") setState("waiting-for-connection");
    else if (result.status === "needs-attention") setState("needs-attention");
    else if (result.remaining > 0) setState("retry-scheduled");
    else setState("idle");
    return result;
  }, []);

  const uploadOne = useCallback(async (photoId: string, manual: boolean, updateUi: boolean) => {
    const canUpdateUi = () => updateUi || foregroundPhoto.current === null;
    if (canUpdateUi()) setState("checking-connection");
    if (!(await checkNetwork())) {
      const outstanding = await offlinePhotoStore.getOutstandingPhotos(cameraPassId);
      const result: SyncBatchResult = { status: "waiting-for-connection", uploaded: 0, retryScheduled: 0, needsAttention: 0, remaining: outstanding.length };
      return canUpdateUi() ? applyResult(result) : result;
    }
    if (manual) await preparePhotosForManualRetry(cameraPassId, photoId);
    if (canUpdateUi()) setState(manual ? "retrying" : "uploading");
    const result = onlineOnly
      ? await uploadOnlinePhotoSimple(cameraPassId, cameraToken, photoId)
      : await syncCameraPhotos(cameraPassId, cameraToken, {
      canReach: async () => true,
      pageMode,
      photoIds: [photoId],
      onUploadProgress: (percentage) => {
        if (canUpdateUi()) {
          setUploadPercent(percentage);
          setSavingUpload(percentage === null);
        }
      },
      onReconciliationState: (checking) => { if (canUpdateUi()) setCheckingPhoto(checking); },
      });
    return canUpdateUi() ? applyResult(result) : result;
  }, [applyResult, cameraPassId, cameraToken, checkNetwork, onlineOnly, pageMode]);

  const run = useCallback((photoId: string, foreground = false, manual = false) => {
    const active = activeRuns.current.get(photoId);
    if (active) {
      if (!foreground) return active;
      foregroundPhoto.current = photoId;
      setState(manual ? "retrying" : "uploading");
      return active.then(applyResult).finally(() => {
        if (foregroundPhoto.current === photoId) foregroundPhoto.current = null;
      });
    }
    if (foreground) foregroundPhoto.current = photoId;
    setQueueFailure(false);
    const batch = uploadOne(photoId, manual, foreground).finally(() => {
      activeRuns.current.delete(photoId);
      if (foregroundPhoto.current === photoId) {
        foregroundPhoto.current = null;
        setProgress(null);
        setUploadPercent(null);
        setSavingUpload(false);
        setCheckingPhoto(false);
      }
    });
    activeRuns.current.set(photoId, batch);
    return batch;
  }, [applyResult, uploadOne]);

  const manualRetry = useCallback((photoId?: string) => {
    if (manualRun.current) return manualRun.current;
    const batch = (async () => {
      await offlinePhotoStore.recoverUploadingPhotos(cameraPassId);
      const all = await offlinePhotoStore.getOutstandingPhotos(cameraPassId);
      const queue = photoId ? all.filter((photo) => photo.id === photoId) : all;
      if (!queue.length) return applyResult({ status: "complete", uploaded: 0, retryScheduled: 0, needsAttention: 0, remaining: 0 });
      let uploaded = 0;
      for (let index = 0; index < queue.length; index += 1) {
        setProgress({ current: index + 1, total: queue.length });
        const result = await run(queue[index].id, true, true);
        uploaded += result.uploaded;
        if (result.uploaded !== 1) {
          setQueueFailure(true);
          return { ...result, uploaded };
        }
      }
      const remaining = (await offlinePhotoStore.getOutstandingPhotos(cameraPassId)).length;
      return applyResult({ status: remaining ? "retry-scheduled" : "complete", uploaded, retryScheduled: remaining, needsAttention: 0, remaining });
    })().finally(() => { manualRun.current = null; setProgress(null); setUploadPercent(null); setSavingUpload(false); setCheckingPhoto(false); });
    manualRun.current = batch;
    return batch;
  }, [applyResult, cameraPassId, run]);

  const notifyPhotoCaptured = useCallback((photoId: string) => run(photoId, true), [run]);

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
    if (!networkOnline) return;
    if (onlineOnly) return;
    let active = true;
    void offlinePhotoStore.getOutstandingPhotos(cameraPassId).then((outstanding) => {
      if (active && outstanding.length) setState("retry-scheduled");
    });
    return () => { active = false; };
  }, [cameraPassId, networkOnline, onlineOnly]);

  const syncing = state === "uploading" || state === "checking-connection" || state === "retrying";
  return { state, syncing, reachable: networkOnline, lastResult, progress, uploadPercent, savingUpload, checkingPhoto, queueFailure, run, manualRetry, notifyPhotoCaptured };
}
