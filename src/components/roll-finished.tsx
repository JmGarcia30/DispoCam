"use client";

import React from "react";
import type { PhotoSyncUiState } from "@/hooks/use-photo-sync";
import { FilmRollIcon } from "@/components/icons";

interface RollFinishedProps {
  weddingName: string;
  waitingCount: number;
  syncState: PhotoSyncUiState;
  onOpenAttention?: () => void;
  attentionCount?: number;
}

export function RollFinished({
  weddingName,
  waitingCount,
  syncState,
  onOpenAttention,
  attentionCount = 0,
}: RollFinishedProps) {
  let uploadMessage = "All photos are uploaded and safe with the couple.";
  let statusToneColor = "#10B981";

  if (attentionCount > 0) {
    uploadMessage =
      attentionCount === 1
        ? "1 photo couldn't be uploaded. Tap to review."
        : `${attentionCount} photos need attention. Tap to review.`;
    statusToneColor = "#F59E0B";
  } else if (waitingCount > 0) {
    uploadMessage =
      waitingCount === 1
        ? "1 photo is waiting to upload."
        : `${waitingCount} photos are waiting to upload.`;
    statusToneColor = "#F2A33A";
  } else if (syncState === "uploading") {
    uploadMessage = "Uploading your final photos to the gallery…";
    statusToneColor = "#38BDF8";
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "24px 20px",
        borderRadius: "16px",
        backgroundColor: "rgba(14, 13, 17, 0.96)",
        border: "1px solid rgba(185, 185, 198, 0.28)",
        boxShadow: "inset 0 2px 6px rgba(0, 0, 0, 0.7), 0 8px 24px rgba(0, 0, 0, 0.6)",
        width: "100%",
        maxWidth: "340px",
        margin: "0 auto",
      }}
    >
      {/* Film roll icon / hallmark */}
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          backgroundColor: "rgba(128, 10, 21, 0.2)",
          color: "#E02438",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "12px",
        }}
      >
        <FilmRollIcon size={24} />
      </div>

      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "24px",
          fontWeight: 600,
          color: "#FAF8F5",
          margin: "0 0 6px",
          letterSpacing: "-0.01em",
        }}
      >
        Your roll is finished.
      </h2>

      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: "16px",
          color: "#A8A29A",
          margin: "0 0 16px",
          lineHeight: 1.3,
        }}
      >
        Thanks for capturing the night for {weddingName}.
      </p>

      {/* Upload status indicator */}
      <div
        onClick={attentionCount > 0 ? onOpenAttention : undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          borderRadius: "8px",
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          border: `1px solid ${attentionCount > 0 ? "rgba(245, 158, 11, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
          cursor: attentionCount > 0 ? "pointer" : "default",
          fontSize: "12px",
          color: "#D8D4CC",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: statusToneColor,
            boxShadow: `0 0 6px ${statusToneColor}`,
          }}
          aria-hidden="true"
        />
        <span>{uploadMessage}</span>
      </div>

      {waitingCount > 0 && (
        <div style={{ marginTop: "10px", fontSize: "11px", color: "#8E8880" }}>
          Photos remain safely saved on your device and upload automatically when connected.
        </div>
      )}
    </div>
  );
}
