"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CameraSession } from "@/lib/camera/capture";
import { attachCamera, captureVideoFrame, captureWithTorch, openCamera } from "@/lib/camera/capture";
import type { CameraPageMode, OfflineCameraSession } from "@/lib/offline/types";
import { offlinePhotoStore, type OfflinePhotoStore } from "@/lib/offline/database";
import { useOfflinePhotos } from "@/hooks/use-offline-photos";
import { usePhotoSync } from "@/hooks/use-photo-sync";
import { useNetworkStatus } from "@/hooks/use-network-status";
import type { WeddingConfig } from "@/lib/wedding/config";
import { SyncStatusBar } from "@/components/sync-status-bar";
import { RollFinished } from "@/components/roll-finished";
import { NeedsAttentionModal } from "@/components/needs-attention-modal";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { ServiceWorkerUpdateBanner } from "@/components/service-worker-update-banner";
import { CameraIcon, CheckIcon, FlashIcon, FlipCameraIcon } from "@/components/icons";
import { canStartCountedCapture, onlineCaptureUiState, visibleShotsRemaining } from "@/lib/camera/online-capture-policy";
import { CAMERA_FILTERS, DEFAULT_CAMERA_FILTER, getCameraFilterPreset, type CameraFilter } from "@/lib/camera/filters";
import { uploadOnlinePhotoSimple } from "@/lib/online/simple-upload";

export async function retryOnlineOnlyPhoto(
  cameraPassId: string,
  token: string | null,
  photoId: string,
  options: { store?: OfflinePhotoStore; fetch?: typeof fetch } = {},
) {
  const store = options.store ?? offlinePhotoStore;
  await store.retryPhoto(photoId);
  return uploadOnlinePhotoSimple(cameraPassId, token, photoId, { store, fetch: options.fetch });
}

interface DisposableCameraProps {
  token: string | null;
  session: OfflineCameraSession;
  wedding: WeddingConfig;
  offline: boolean;
  onSessionUpdated: (session: OfflineCameraSession) => void;
  onBackToPass?: () => void;
  pageMode: CameraPageMode;
}

export function DisposableCamera({
  token,
  session,
  wedding,
  offline,
  onSessionUpdated,
  onBackToPass,
  pageMode,
}: DisposableCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<CameraSession | null>(null);

  // States
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [flashMode, setFlashMode] = useState<"auto" | "on" | "off">("auto");
  const [zoomLevel, setZoomLevel] = useState<1 | 1.5 | 2>(1);
  const [selectedFilter, setSelectedFilter] = useState<CameraFilter>(DEFAULT_CAMERA_FILTER);
  const [hardwareTorchAvailable, setHardwareTorchAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isShutterBlinking, setIsShutterBlinking] = useState(false);
  const [isFlashBursting, setIsFlashBursting] = useState(false);
  const [capturedFeedback, setCapturedFeedback] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [showAttentionModal, setShowAttentionModal] = useState(false);
  const [retryPhotoId, setRetryPhotoId] = useState<string | null>(null);

  const network = useNetworkStatus();
  const onlineCaptureRequired = wedding.requiresOnlineCapture;
  const photos = useOfflinePhotos(session.cameraPassId, session.serverRemainingShots, session.resetGeneration ?? 0);
  const sync = usePhotoSync(session.cameraPassId, token, pageMode, onlineCaptureRequired);

  const failedPhotos = photos.photos.filter((photo) => photo.status !== "uploaded");
  const attentionPhotos = failedPhotos.filter((photo) => photo.failureKind === "attention");
  const retryablePhotos = failedPhotos.filter((photo) => photo.failureKind === "retryable");
  const effectiveRetryPhotoId = retryPhotoId ?? (onlineCaptureRequired ? failedPhotos[0]?.id ?? null : null);

  // Start or switch camera
  const initCamera = useCallback(
    async (mode: "environment" | "user") => {
      try {
        cameraRef.current?.stop();
        const newSession = await openCamera(mode);
        cameraRef.current = newSession;
        setHardwareTorchAvailable(Boolean(newSession.hasTorch));
        if (videoRef.current) {
          await attachCamera(videoRef.current, newSession.stream);
        }
        setCameraActive(true);
        setCameraError(null);
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Camera access failed.");
        setCameraActive(false);
      }
    },
    [],
  );

  // Auto-start camera on mount and when facing mode toggles
  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        cameraRef.current?.stop();
        const newSession = await openCamera(facingMode);
        if (!active) {
          newSession.stop();
          return;
        }
        cameraRef.current = newSession;
        setHardwareTorchAvailable(Boolean(newSession.hasTorch));
        if (videoRef.current) {
          await attachCamera(videoRef.current, newSession.stream);
        }
        if (active) {
          setCameraActive(true);
          setCameraError(null);
        }
      } catch (error) {
        if (!active) return;
        setCameraError(error instanceof Error ? error.message : "Camera access failed.");
        setCameraActive(false);
      }
    };
    void start();
    return () => {
      active = false;
      cameraRef.current?.stop();
    };
  }, [facingMode]);

  // Toggle front/rear camera
  const toggleFacingMode = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
  };

  // Toggle flash mode
  const cycleFlashMode = () => {
    const nextMode = flashMode === "auto" ? "on" : flashMode === "on" ? "off" : "auto";
    setFlashMode(nextMode);

  };

  // Take photo action
  const handleShutter = useCallback(async () => {
    if (!videoRef.current || !photos.canCapture || saving) return;
    if (onlineCaptureRequired) {
      const backendReachable = await network.check();
      if (!backendReachable) {
        setUploadNotice("Internet connection required. Connect to Wi-Fi or mobile data to take and upload photos.");
        return;
      }
    }

    // 1. Shutter animation & optical flash burst
    setIsShutterBlinking(true);
    if ((flashMode === "on" || flashMode === "auto") && !hardwareTorchAvailable) {
      setIsFlashBursting(true);
      setTimeout(() => setIsFlashBursting(false), 380);
    }
    setTimeout(() => setIsShutterBlinking(false), 160);

    // 2. Subtle mechanical haptic vibration if supported
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([18, 32, 18]);
      } catch {
        // Safe fallback
      }
    }

    setSaving(true);
    try {
      // 3. Capture video frame to Blob
      const image = await captureWithTorch(
        cameraRef.current,
        flashMode !== "off",
        () => captureVideoFrame(videoRef.current!, selectedFilter, zoomLevel),
        120,
        () => {
          setIsFlashBursting(true);
          setTimeout(() => setIsFlashBursting(false), 380);
        },
      );

      // 4. Save to offline store
      const saved = await photos.saveCapture(
        image,
        session.maxUploadBytes,
        onlineCaptureRequired ? { maxDimension: 1400, quality: 0.72 } : undefined,
      );

      // 5. Online-only events wait for authoritative registration before counting the shot.
      if (onlineCaptureRequired) {
        const result = await sync.notifyPhotoCaptured(saved.id);
        if (result.uploaded !== 1 || !result.authoritativeShots) {
          setRetryPhotoId(saved.id);
          setUploadNotice("Upload failed — Retry");
          return;
        }
        const updated = { ...session, serverRemainingShots: result.authoritativeShots.registeredRemaining, resolvedAt: new Date().toISOString() };
        await offlinePhotoStore.saveCameraSession(updated);
        onSessionUpdated(updated);
        await photos.refresh();
        setRetryPhotoId(null);
      } else {
        void sync.notifyPhotoCaptured(saved.id);
      }

      // 6. Confirmation stamp
      setCapturedFeedback(true);
      setTimeout(() => setCapturedFeedback(false), 1800);
      setCameraError(null);
      setUploadNotice(null);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "The photo could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [flashMode, hardwareTorchAvailable, network, onlineCaptureRequired, onSessionUpdated, photos, saving, selectedFilter, session, sync, zoomLevel]);

  const retryOnlineUpload = useCallback(async () => {
    if (!effectiveRetryPhotoId || saving) return;
    setSaving(true);
    setUploadNotice(null);
    try {
      const result = await retryOnlineOnlyPhoto(session.cameraPassId, token, effectiveRetryPhotoId);
      if (result.uploaded !== 1 || !result.authoritativeShots) {
        setUploadNotice("Upload failed — Retry");
        return;
      }
      const updated = { ...session, serverRemainingShots: result.authoritativeShots.registeredRemaining, resolvedAt: new Date().toISOString() };
      await offlinePhotoStore.saveCameraSession(updated);
      onSessionUpdated(updated);
      await photos.refresh();
      setRetryPhotoId(null);
      setUploadNotice(null);
      setCapturedFeedback(true);
      setTimeout(() => setCapturedFeedback(false), 1800);
    } catch {
      setUploadNotice("Upload failed — Retry");
    } finally {
      setSaving(false);
    }
  }, [effectiveRetryPhotoId, onSessionUpdated, photos, saving, session, token]);

  // Shot count styling
  const onlineUi = onlineCaptureUiState(session.serverRemainingShots, photos.localPendingShots);
  const usableCapacity = onlineCaptureRequired
    ? onlineUi.usableCapacity
    : visibleShotsRemaining(false, session.serverRemainingShots, photos.effectiveRemainingShots);
  const shotsLeft = onlineCaptureRequired ? onlineUi.displayed : usableCapacity;
  const showRollFinished = onlineCaptureRequired ? onlineUi.rollFinished : shotsLeft === 0;
  const finishingPending = onlineCaptureRequired && photos.localPendingShots > 0 && usableCapacity === 0;
  let counterText = `${shotsLeft} SHOTS LEFT`;
  let isWarning = false;

  if (finishingPending) {
    counterText = `Finishing ${photos.localPendingShots} photo${photos.localPendingShots === 1 ? "" : "s"}`;
    isWarning = true;
  } else if (shotsLeft === 1) {
    counterText = "LAST SHOT";
    isWarning = true;
  } else if (shotsLeft === 0) {
    counterText = "0 SHOTS LEFT";
    isWarning = true;
  } else if (shotsLeft <= 3) {
    counterText = `${shotsLeft} SHOTS LEFT`;
    isWarning = true;
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "#0A0A0C",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "calc(var(--sat) + 8px) 14px calc(var(--sab) + 12px)",
        position: "relative",
        userSelect: "none",
        maxWidth: "460px",
        margin: "0 auto",
        overflowX: "hidden",
      }}
    >
      {/* Full-screen optical flash burst when taking photo */}
      {isFlashBursting && <div className="screen-flash-burst" aria-hidden="true" />}

      {/* Top Event / Keepsake Header */}
      <header
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
          padding: "0 4px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "19px",
              fontWeight: 600,
              color: "#EDE8DF",
              letterSpacing: "0.01em",
              lineHeight: 1.2,
            }}
          >
            {wedding.coupleNames}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9.5px",
              color: "#8E8D96",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {wedding.monogram} • {wedding.weddingDate}
          </span>
        </div>

        {onBackToPass && (
          <button
            type="button"
            onClick={onBackToPass}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              backgroundColor: "rgba(22, 22, 28, 0.7)",
              border: "1px solid rgba(185, 185, 198, 0.24)",
              color: "#D4D3DC",
              fontSize: "11px",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            aria-label="View camera pass details"
          >
            Pass Details
          </button>
        )}
      </header>

      {/* PWA & Service Worker Notification banners */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
        <PwaInstallBanner />
        <ServiceWorkerUpdateBanner isCapturingOrSaving={saving} />
      </div>

      {/* Gothic Physical Disposable Camera Body */}
      <section
        className="camera-grip-texture camera-body-gothic"
        aria-label="Disposable Camera"
      >
        {/* Subtle gothic ornamental corner lines */}
        <div className="gothic-corner-mark gothic-corner-tl" aria-hidden="true" />
        <div className="gothic-corner-mark gothic-corner-tr" aria-hidden="true" />
        <div className="gothic-corner-mark gothic-corner-bl" aria-hidden="true" />
        <div className="gothic-corner-mark gothic-corner-br" aria-hidden="true" />

        {/* Camera Top Bar: Flash Toggle, Printed Brand, Lens Flip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 4px",
            position: "relative",
            zIndex: 3,
          }}
        >
          {/* Flash Mode Toggle */}
          <button
            type="button"
            onClick={cycleFlashMode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 8px",
              borderRadius: "6px",
              backgroundColor: "rgba(10, 10, 14, 0.7)",
              border: "1px solid rgba(185, 185, 198, 0.24)",
              color: flashMode === "off" ? "#72717A" : "var(--counter-amber)",
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
            }}
            aria-label={`Flash mode: ${flashMode}. Tap to change.`}
          >
            <FlashIcon size={12} />
            <span>{flashMode.toUpperCase()}</span>
            <span
              style={{ opacity: 0.75, fontSize: "9px" }}
              aria-label={hardwareTorchAvailable ? "Hardware torch available" : "Screen flash fallback"}
            >
              {hardwareTorchAvailable ? "LED" : "SCREEN"}
            </span>
          </button>

          {/* Stamped Disposable Camera label */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: "0.22em",
              color: "#A3A2AC",
              textTransform: "uppercase",
              fontWeight: 700,
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)",
            }}
          >
            {wedding.coupleNames.toLowerCase().includes("jaseph") ? "JASEPH'S ROLL" : "DISPOCAM"}
          </div>

          {/* Front / Rear Camera Flip */}
          <button
            type="button"
            onClick={toggleFacingMode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 8px",
              borderRadius: "6px",
              backgroundColor: "rgba(10, 10, 14, 0.7)",
              border: "1px solid rgba(185, 185, 198, 0.24)",
              color: "#D4D3DC",
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              cursor: "pointer",
            }}
            aria-label="Switch front or back camera"
          >
            <FlipCameraIcon size={12} />
            <span>{facingMode === "environment" ? "REAR" : "FRONT"}</span>
          </button>
        </div>

        {/* Viewfinder Window */}
        <div
          className="viewfinder-housing"
          style={{
            height: "clamp(240px, 44vh, 360px)",
            position: "relative",
          }}
        >
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            aria-label="Camera viewfinder"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: facingMode === "user" ? `scaleX(-1) scale(${zoomLevel})` : `scale(${zoomLevel})`,
              transformOrigin: "center center",
              transition: "transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)",
              filter: getCameraFilterPreset(selectedFilter).preview,
              display: cameraActive ? "block" : "none",
            }}
          />

          {/* Shutter Blade Blink blackout overlay */}
          {isShutterBlinking && <div className="shutter-blade-flash" aria-hidden="true" />}

          {/* Viewfinder Optical Framing Marks & Crosshair */}
          <div className="viewfinder-reticle" aria-hidden="true">
            <div className="reticle-corner reticle-corner-tl" />
            <div className="reticle-corner reticle-corner-tr" />
            <div className="reticle-corner reticle-corner-bl" />
            <div className="reticle-corner reticle-corner-br" />
            <div className="reticle-center" />
          </div>

          {/* Compact Digital Zoom Controls (1x, 1.5x, 2x) */}
          <div className="zoom-control-bar" role="group" aria-label="Digital camera zoom">
            {([1, 1.5, 2] as const).map((lvl) => {
              const isSelected = zoomLevel === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setZoomLevel(lvl)}
                  className={`zoom-btn ${isSelected ? "selected" : "unselected"}`}
                  aria-pressed={isSelected}
                  aria-label={`${lvl}x zoom`}
                >
                  {lvl}x
                </button>
              );
            })}
          </div>

          {/* Captured feedback notification badge */}
          {capturedFeedback && (
            <div className="captured-stamp" role="status" aria-live="polite">
              <span style={{ color: "#E02438", display: "flex", alignItems: "center" }}>
                <CheckIcon size={14} />
              </span>
              <span>PHOTO SAVED</span>
            </div>
          )}

          {/* Inactive or Error State within Viewfinder */}
          {(!cameraActive || cameraError) && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#0C0C0E",
                color: "#EDE8DF",
                padding: "20px",
                textAlign: "center",
                zIndex: 35,
              }}
            >
              <div style={{ color: "var(--counter-amber)", marginBottom: "10px" }}>
                <CameraIcon size={32} />
              </div>
              <p style={{ fontSize: "14px", color: "#8E8D96", marginBottom: "14px", maxWidth: "260px" }}>
                {cameraError ?? "Enable camera access to capture photos."}
              </p>
              <button
                type="button"
                onClick={() => void initCamera(facingMode)}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  backgroundColor: "var(--camera-shutter)",
                  border: "1px solid #A81424",
                  color: "#FAF5EE",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Enable Camera
              </button>
            </div>
          )}
        </div>

        {/* Middle Status & Physical Frame Counter Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 4px",
            position: "relative",
            zIndex: 3,
          }}
        >
          {/* Physical Film Counter Window */}
          <div
            className={`frame-counter-box ${isWarning ? "warning" : ""}`}
            aria-live="polite"
            aria-label={counterText}
          >
            {saving ? (
              <span className="counter-status-text">UPLOADING PHOTO...</span>
            ) : effectiveRetryPhotoId ? (
              <span className="counter-status-text pending">PHOTO PENDING</span>
            ) : (
              <>
                <span style={{ fontSize: "16px", fontWeight: 700, marginRight: "5px" }}>
                  {shotsLeft.toString().padStart(2, "0")}
                </span>
                <span style={{ fontSize: "9.5px", fontWeight: 600, opacity: 0.85, letterSpacing: "0.1em" }}>
                  {finishingPending ? "FINISHING" : shotsLeft === 1 ? "LAST SHOT" : shotsLeft === 0 ? "EXHAUSTED" : "SHOTS LEFT"}
                </span>
              </>
            )}
          </div>

          {/* Fine Gothic Stamped Roll Number */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "#72717A",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            ROLL NO. {session.cameraPassId.slice(0, 4).toUpperCase()}
          </div>
        </div>

        {/* Lower Control Deck: Filters & Shutter Button */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px 0 2px",
            gap: "10px",
            position: "relative",
            zIndex: 3,
          }}
        >
          <div
            role="group"
            aria-label="Photo filter"
            className="filters-scroll-row"
          >
            {CAMERA_FILTERS.map((filter) => {
              const selected = selectedFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedFilter(filter.id)}
                  className={`filter-pill ${selected ? "selected" : "unselected"}`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {!showRollFinished ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="shutter-button"
                disabled={
                  !canStartCountedCapture({
                    requiresOnlineCapture: onlineCaptureRequired,
                    backendOnline: !network.offline,
                    cameraReady: cameraActive,
                    saving,
                    hasShots: usableCapacity > 0 && photos.canCapture,
                  })
                }
                onClick={() => void handleShutter()}
                aria-label={saving ? "Uploading photo…" : `Take photo. ${counterText}.`}
              >
                <div className="shutter-inner-ring" />
              </button>

              {/* Shutter Status / Inline Retry Area */}
              <div style={{ minHeight: "22px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {saving ? (
                  <span className="shutter-substatus uploading">UPLOADING PHOTO...</span>
                ) : effectiveRetryPhotoId ? (
                  <div className="upload-inline-error">
                    <span>Upload failed</span>
                    <button
                      type="button"
                      onClick={() => void retryOnlineUpload()}
                      className="retry-inline-btn"
                      aria-label="Retry upload"
                    >
                      Retry
                    </button>
                  </div>
                ) : onlineCaptureRequired && network.offline ? (
                  <span className="shutter-substatus offline">WI-FI OR MOBILE DATA REQUIRED</span>
                ) : (
                  <span className="shutter-substatus idle">SHUTTER</span>
                )}
              </div>
            </div>
          ) : (
            <RollFinished
              weddingName={wedding.coupleNames}
              waitingCount={photos.localPendingShots}
              syncState={sync.state}
              attentionCount={attentionPhotos.length}
              onOpenAttention={() => setShowAttentionModal(true)}
            />
          )}
        </div>
      </section>

      {/* Bottom Sync and Network Status */}
      <footer
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          marginTop: "6px",
        }}
      >
        {!onlineCaptureRequired && (
          <SyncStatusBar
            state={sync.state}
            offline={offline || network.offline}
            waitingCount={photos.localPendingShots}
            attentionCount={attentionPhotos.length}
            retryableCount={retryablePhotos.length}
            authenticationRequired={!token}
            onOpenAttention={() => setShowAttentionModal(true)}
            progress={sync.progress}
            queueFailure={sync.queueFailure}
          />
        )}
        {process.env.NODE_ENV !== "production" && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Clear locally queued test photos for this camera pass only? Server data is not changed.")) return;
              await offlinePhotoStore.clearPhotosForPass(session.cameraPassId);
              await photos.refresh();
            }}
            style={{ background: "none", border: 0, color: "#6A6972", fontSize: "10.5px", textDecoration: "underline", cursor: "pointer", marginTop: "2px" }}
          >
            Clear local test photos for this pass
          </button>
        )}
      </footer>

      {/* Needs Attention Modal Dialog */}
      <NeedsAttentionModal
        isOpen={showAttentionModal}
        onClose={() => setShowAttentionModal(false)}
        failedPhotos={failedPhotos}
        onRetry={sync.manualRetry}
        syncState={sync.state}
        offline={offline || network.offline}
        backendReachable={sync.reachable}
        authenticationRequired={!token}
      />
    </main>
  );
}
