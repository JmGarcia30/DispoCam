"use client";

import React from "react";
import type { PhotoSyncUiState } from "@/hooks/use-photo-sync";

interface SyncStatusBarProps {
  state: PhotoSyncUiState;
  offline: boolean;
  waitingCount: number;
  attentionCount: number;
  retryableCount?: number;
  authenticationRequired?: boolean;
  onOpenAttention?: () => void;
  className?: string;
}

export function SyncStatusBar({
  state,
  offline,
  waitingCount,
  attentionCount,
  retryableCount = 0,
  authenticationRequired = false,
  onOpenAttention,
  className = "",
}: SyncStatusBarProps) {
  // Determine message and visual tone
  let label = "All photos saved";
  let isActionable = false;

  if (authenticationRequired && waitingCount > 0) {
    label = "Photo saved on this device • Reopen your wedding camera link to upload";
  } else if (attentionCount > 0 || state === "needs-attention") {
    label = attentionCount === 1 ? "1 photo couldn't be uploaded" : `${attentionCount} photos need attention`;
    isActionable = true;
  } else if (offline || state === "waiting-for-connection" || state === "checking-connection") {
    if (waitingCount > 0) {
      label = waitingCount === 1 ? "Saved on this device • Waiting for connection" : `${waitingCount} photos saved on this device • Waiting for connection`;
    } else {
      label = "Offline — photos save safely here";
    }
  } else if (state === "retrying") {
    label = "Retrying upload…";
  } else if (state === "uploading") {
    label = waitingCount > 0 ? `Uploading ${waitingCount} ${waitingCount === 1 ? "photo" : "photos"}…` : "Syncing photos…";
  } else if (state === "retry-scheduled") {
    label = "Saved on this device • We'll try again when the connection improves.";
    isActionable = retryableCount > 0;
  }

  const content = (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        padding: "4px 10px",
        borderRadius: "999px",
        backgroundColor: "rgba(18, 17, 16, 0.75)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        fontSize: "12px",
        color: "#D0CBC4",
        backdropFilter: "blur(6px)",
      }}
      className={className}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          display: "inline-block",
          backgroundColor:
            attentionCount > 0
              ? "#F59E0B"
              : offline || state === "waiting-for-connection"
                ? "#EAB308"
                : state === "uploading"
                  ? "#38BDF8"
                  : "#10B981",
          boxShadow:
            attentionCount > 0
              ? "0 0 6px rgba(245, 158, 11, 0.6)"
              : offline
                ? "0 0 5px rgba(234, 179, 8, 0.4)"
                : state === "uploading"
                  ? "0 0 6px rgba(56, 189, 248, 0.6)"
                  : "0 0 5px rgba(16, 185, 129, 0.4)",
        }}
        aria-hidden="true"
      />
      <span style={{ fontWeight: 500, letterSpacing: "-0.01em" }}>{label}</span>
      {isActionable && onOpenAttention && (
        <span
          style={{
            textDecoration: "underline",
            color: "#FBBF24",
            marginLeft: "2px",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          {state === "retry-scheduled" ? "Details" : "View"}
        </span>
      )}
    </div>
  );

  if (isActionable && onOpenAttention) {
    return (
      <button
        type="button"
        onClick={onOpenAttention}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "inherit",
        }}
        aria-label={`${label}. Click to review.`}
      >
        {content}
      </button>
    );
  }

  return content;
}
