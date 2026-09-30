"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CameraSession } from "@/lib/camera/capture";
import { attachCamera, captureVideoFrame, captureWithTorch, openCamera } from "@/lib/camera/capture";
import type { CameraPageMode, OfflineCameraSession } from "@/lib/offline/types";
import { offlinePhotoStore } from "@/lib/offline/database";
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
        () => captureVideoFrame(videoRef.current!, selectedFilter),
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
  }, [flashMode, hardwareTorchAvailable, network, onlineCaptureRequired, onSessionUpdated, photos, saving, selectedFilter, session, sync]);

  const retryOnlineUpload = useCallback(async () => {
    if (!effectiveRetryPhotoId || saving) return;
    setSaving(true);
    setUploadNotice(null);
    try {
      const result = await sync.manualRetry(effectiveRetryPhotoId);
      if (result.uploaded !== 1 || !result.authoritativeShots) {
        setUploadNotice("Upload failed — Retry");
        return;
      }
      const updated = { ...session, serverRemainingShots: result.authoritativeShots.registeredRemaining, resolvedAt: new Date().toISOString() };
      await offlinePhotoStore.saveCameraSession(updated);
      onSessionUpdated(updated);
      await photos.refresh();
      setRetryPhotoId(null);
      setCapturedFeedback(true);
      setTimeout(() => setCapturedFeedback(false), 1800);
    } catch {
      setUploadNotice("Upload failed — Retry");
    } finally {
      setSaving(false);
    }
  }, [effectiveRetryPhotoId, onSessionUpdated, photos, saving, session, sync]);

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
        minHeight: "100vh",
        backgroundColor: "var(--wedding-bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "calc(var(--sat) + 12px) 16px calc(var(--sab) + 16px)",
        position: "relative",
        userSelect: "none",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      {/* Full-screen optical flash burst when taking photo */}
      {isFlashBursting && <div className="screen-flash-burst" aria-hidden="true" />}

      {/* Top Wedding Header & Pass link */}
      <header
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
          padding: "0 4px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "18px",
              fontWeight: 600,
              color: "#FAF8F5",
              letterSpacing: "-0.01em",
            }}
          >
            {wedding.coupleNames}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--wedding-accent)",
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
              padding: "5px 10px",
              borderRadius: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#D8D4CC",
              fontSize: "11px",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              cursor: "pointer",
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

      {/* Physical Disposable Camera Body */}
      <section
        className="camera-grip-texture"
        style={{
          width: "100%",
          backgroundColor: "var(--camera-casing)",
          borderRadius: "24px",
          border: "2px solid var(--camera-rim)",
          boxShadow: 
            "0 20px 40px -10px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.12), inset 0 -2px 4px rgba(0, 0, 0, 0.5)",
          padding: "16px 14px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          position: "relative",
        }}
      >
        {/* Camera Top Bar: Flash Toggle, Printed Brand, Lens Flip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 6px",
          }}
        >
          {/* Flash Mode Toggle */}
          <button
            type="button"
            onClick={cycleFlashMode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "6px",
              backgroundColor: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: flashMode === "off" ? "#7D7871" : "var(--counter-amber)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
            }}
            aria-label={`Flash mode: ${flashMode}. Tap to change.`}
          >
            <FlashIcon size={13} />
            <span>{flashMode.toUpperCase()}</span>
            <span aria-label={hardwareTorchAvailable ? "Hardware torch available" : "Screen flash fallback"}>
              {hardwareTorchAvailable ? "LED" : "SCREEN"}
            </span>
          </button>

          {/* Stamped Disposable Camera label */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              letterSpacing: "0.18em",
              color: "#7E7972",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            DISPOSABLE 35MM
          </div>

          {/* Front / Rear Camera Flip */}
          <button
            type="button"
            onClick={toggleFacingMode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 10px",
              borderRadius: "6px",
              backgroundColor: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#D8D4CC",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              cursor: "pointer",
            }}
            aria-label="Switch front or back camera"
          >
            <FlipCameraIcon size={13} />
            <span>{facingMode === "environment" ? "REAR" : "FRONT"}</span>
          </button>
        </div>

        {/* Viewfinder Window */}
        <div
          className="viewfinder-housing"
          style={{
            height: "clamp(260px, 48vh, 360px)",
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
              transform: facingMode === "user" ? "scaleX(-1)" : "none",
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

          {/* Captured feedback notification badge */}
          {capturedFeedback && (
            <div
              className="captured-stamp"
              style={{
                position: "absolute",
                top: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "rgba(18, 17, 16, 0.85)",
                border: "1px solid var(--wedding-accent)",
                borderRadius: "999px",
                padding: "6px 16px",
                color: "#FAF8F5",
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                backdropFilter: "blur(6px)",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                zIndex: 50,
              }}
            >
              <span style={{ color: "var(--wedding-accent)", display: "flex", alignItems: "center" }}>
                <CheckIcon size={14} />
              </span>
              <span>{onlineCaptureRequired ? "Photo saved" : "Captured"}</span>
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
                backgroundColor: "#141312",
                color: "#E2DDD5",
                padding: "20px",
                textAlign: "center",
                zIndex: 35,
              }}
            >
              <div style={{ color: "var(--wedding-accent)", marginBottom: "10px" }}>
                <CameraIcon size={32} />
              </div>
              <p style={{ fontSize: "14px", color: "#A8A29A", marginBottom: "14px", maxWidth: "260px" }}>
                {cameraError ?? "Enable camera access to capture photos."}
              </p>
              <button
                type="button"
                onClick={() => void initCamera(facingMode)}
                style={{
                  padding: "10px 18px",
                  borderRadius: "8px",
                  backgroundColor: "var(--wedding-accent)",
                  border: "none",
                  color: "#181715",
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

        {/* Middle Status & Frame Counter Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 6px",
          }}
        >
          {/* LCD Frame Counter */}
          <div
            className={`frame-counter-box ${isWarning ? "warning" : ""}`}
            aria-live="polite"
            aria-label={counterText}
          >
            <span style={{ fontSize: "17px", fontWeight: 700, marginRight: "5px" }}>
              {shotsLeft.toString().padStart(2, "0")}
            </span>
            <span style={{ fontSize: "10px", fontWeight: 600, opacity: 0.85 }}>
              {finishingPending ? "FINISHING" : shotsLeft === 1 ? "LAST SHOT" : shotsLeft === 0 ? "EXHAUSTED" : "SHOTS LEFT"}
            </span>
          </div>

          {/* Fine Vintage Stamped Mark */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "#6D6862",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            ROLL NO. {session.cameraPassId.slice(0, 4).toUpperCase()}
          </div>
        </div>

        {/* Lower Control Deck: Shutter Button or Roll Finished */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 0 6px",
            minHeight: "110px",
          }}
        >
          <div role="group" aria-label="Photo filter" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px", marginBottom: "10px" }}>
            {CAMERA_FILTERS.map((filter) => {
              const selected = selectedFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedFilter(filter.id)}
                  style={{
                    border: `1px solid ${selected ? "var(--wedding-accent)" : "rgba(255,255,255,.16)"}`,
                    borderRadius: "999px",
                    padding: "7px 10px",
                    background: selected ? "var(--wedding-accent)" : "rgba(255,255,255,.06)",
                    color: selected ? "#181715" : "#D8D4CC",
                    fontSize: "11px",
                    fontWeight: selected ? 700 : 500,
                    cursor: "pointer",
                  }}
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
                disabled={!canStartCountedCapture({ requiresOnlineCapture: onlineCaptureRequired, backendOnline: !network.offline, cameraReady: cameraActive, saving, hasShots: usableCapacity > 0 && photos.canCapture })}
                onClick={() => void handleShutter()}
                aria-label={saving ? "Saving photo…" : `Take photo. ${counterText}.`}
              >
                <div className="shutter-inner-ring" />
              </button>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9.5px",
                  letterSpacing: "0.2em",
                  color: "#8C867E",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {saving
                  ? sync.checkingPhoto
                    ? "CHECKING PHOTO…"
                    : sync.savingUpload
                    ? "SAVING…"
                    : `UPLOADING…${sync.uploadPercent === null ? "" : ` ${sync.uploadPercent}%`}`
                  : finishingPending
                    ? `FINISHING ${photos.localPendingShots} PHOTO${photos.localPendingShots === 1 ? "" : "S"}…`
                  : onlineCaptureRequired && network.offline
                    ? "WI-FI OR MOBILE DATA REQUIRED"
                    : "SHUTTER"}
              </span>
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
          gap: "8px",
          marginTop: "12px",
        }}
      >
        {onlineCaptureRequired && (network.offline || uploadNotice || (effectiveRetryPhotoId && !saving)) && (
          <div role="status" style={{ maxWidth: "360px", textAlign: "center", color: "#F6C177", fontSize: "13px", lineHeight: 1.45 }}>
            <strong>{network.online ? "Upload failed" : "Internet connection required"}</strong><br />
            {uploadNotice ?? (effectiveRetryPhotoId ? "Upload failed — Retry" : "Connect to Wi-Fi or mobile data to take and upload photos.")}
          </div>
        )}
        {onlineCaptureRequired && effectiveRetryPhotoId && !saving && (
          <button type="button" onClick={() => void retryOnlineUpload()} style={{ padding: "10px 18px", borderRadius: "999px", border: 0, fontWeight: 700, cursor: "pointer" }}>
            Retry
          </button>
        )}
        {!onlineCaptureRequired && <SyncStatusBar
          state={sync.state}
          offline={offline || network.offline}
          waitingCount={photos.localPendingShots}
          attentionCount={attentionPhotos.length}
          retryableCount={retryablePhotos.length}
          authenticationRequired={!token}
          onOpenAttention={() => setShowAttentionModal(true)}
          progress={sync.progress}
          queueFailure={sync.queueFailure}
        />}
        {process.env.NODE_ENV !== "production" && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Clear locally queued test photos for this camera pass only? Server data is not changed.")) return;
              await offlinePhotoStore.clearPhotosForPass(session.cameraPassId);
              await photos.refresh();
            }}
            style={{ background: "none", border: 0, color: "#8c867e", fontSize: "11px", textDecoration: "underline" }}
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
