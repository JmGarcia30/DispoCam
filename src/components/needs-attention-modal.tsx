"use client";

import React, { useState } from "react";
import type { OfflinePhoto } from "@/lib/offline/types";
import { AlertCircleIcon, CheckIcon } from "@/components/icons";
import type { PhotoSyncUiState } from "@/hooks/use-photo-sync";

interface NeedsAttentionModalProps {
  isOpen: boolean;
  onClose: () => void;
  failedPhotos: OfflinePhoto[];
  onRetry: (photoId?: string) => Promise<unknown>;
  syncState: PhotoSyncUiState;
  offline: boolean;
  backendReachable: boolean;
}

export function getRetryButtonState(
  syncState: PhotoSyncUiState,
  offline: boolean,
  backendReachable: boolean,
  manualRetrying: boolean,
) {
  const syncActive = syncState === "uploading" || syncState === "checking-connection" || syncState === "retrying";
  const waitingForConnection = offline || !backendReachable || syncState === "waiting-for-connection";
  return {
    disabled: manualRetrying || syncActive || waitingForConnection,
    label: waitingForConnection
      ? "Waiting for connection…"
      : syncState === "uploading"
        ? "Uploading…"
        : manualRetrying || syncState === "retrying"
          ? "Retrying…"
          : "Retry Upload",
  };
}

export function NeedsAttentionModal({
  isOpen,
  onClose,
  failedPhotos,
  onRetry,
  syncState,
  offline,
  backendReachable,
}: NeedsAttentionModalProps) {
  const [retrying, setRetrying] = useState(false);
  const [savedSuccessId, setSavedSuccessId] = useState<string | null>(null);

  if (!isOpen) return null;

  const count = failedPhotos.length;
  const retryableCount = failedPhotos.filter((photo) => photo.failureKind === "retryable").length;
  const headline = retryableCount === count
    ? count === 1 ? "1 photo is waiting to retry" : `${count} photos are waiting to retry`
    : count === 1 ? "1 photo needs attention" : `${count} photos need attention`;
  const { disabled: retryDisabled, label: retryLabel } = getRetryButtonState(syncState, offline, backendReachable, retrying);

  const handleRetryAll = async () => {
    if (retryDisabled) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const handleSavePhoto = (photo: OfflinePhoto) => {
    try {
      const url = URL.createObjectURL(photo.image);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wedding-photo-${photo.id.slice(0, 8)}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSavedSuccessId(photo.id);
      setTimeout(() => setSavedSuccessId(null), 3000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attention-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          backgroundColor: "#1F1E1C",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7)",
          padding: "24px 20px",
          color: "#E8E4DD",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "rgba(245, 158, 11, 0.15)",
              color: "#F59E0B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertCircleIcon size={18} />
          </div>
          <h2 id="attention-title" style={{ fontSize: "17px", fontWeight: 600, color: "#FFFFFF", margin: 0 }}>
            {headline}
          </h2>
        </div>

        <p style={{ fontSize: "14px", color: "#A8A29A", lineHeight: 1.5, marginBottom: "20px" }}>
          Don’t worry — your photos are safely preserved on this device. You can retry the upload now, or save them directly to your phone.
        </p>

        {/* List of photos with individual actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
          {failedPhotos.map((photo, idx) => (
            <div
              key={photo.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: "10px",
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div style={{ display: "grid", gap: "3px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "var(--counter-amber)",
                    letterSpacing: "0.05em",
                  }}
                >
                  #{idx + 1}
                </span>
                <span style={{ fontSize: "13px", color: "#D1CCC4" }}>
                  {new Date(photo.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                </div>
                <small style={{ color: photo.failureKind === "retryable" ? "#A8D5BA" : "#F6C177", fontSize: "11px" }}>
                  {photo.failureKind === "retryable"
                    ? "Your photo is safe. We'll retry automatically."
                    : "This photo needs manual attention."}
                </small>
                {photo.failureCode && (
                  <dl style={{ margin: "5px 0 0", color: "#A8A29A", fontFamily: "var(--font-mono)", fontSize: "9px", lineHeight: 1.5 }}>
                    <div><dt style={{ display: "inline" }}>Stage: </dt><dd style={{ display: "inline", margin: 0 }}>{photo.failureStage ?? "sync"}</dd></div>
                    <div><dt style={{ display: "inline" }}>Status: </dt><dd style={{ display: "inline", margin: 0 }}>{photo.failureStatus ?? "network"}</dd></div>
                    <div><dt style={{ display: "inline" }}>Code: </dt><dd style={{ display: "inline", margin: 0 }}>{photo.failureCode}</dd></div>
                    <div><dt style={{ display: "inline" }}>Message: </dt><dd style={{ display: "inline", margin: 0 }}>{photo.lastError ?? "The upload will be retried."}</dd></div>
                  </dl>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => handleSavePhoto(photo)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: savedSuccessId === photo.id ? "#10B981" : "#E5E1DA",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {savedSuccessId === photo.id ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <CheckIcon size={12} />
                      Saved
                    </span>
                  ) : (
                    "Save Photo"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            disabled={retryDisabled}
            onClick={() => void handleRetryAll()}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "10px",
              backgroundColor: "var(--wedding-accent)",
              border: "none",
              color: "#181715",
              fontSize: "14px",
              fontWeight: 600,
              cursor: retryDisabled ? "not-allowed" : "pointer",
              opacity: retryDisabled ? 0.65 : 1,
              transition: "background-color 0.15s ease",
            }}
          >
            {retryLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#D4CEC5",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
