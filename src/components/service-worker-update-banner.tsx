"use client";

import React from "react";
import { usePwaUpdate } from "@/components/pwa-provider";

interface ServiceWorkerUpdateBannerProps {
  isCapturingOrSaving: boolean;
}

export function ServiceWorkerUpdateBanner({ isCapturingOrSaving }: ServiceWorkerUpdateBannerProps) {
  const { updateAvailable, applyUpdate } = usePwaUpdate();

  // If no update or user is currently in the middle of capturing/saving, do not show or interrupt!
  if (!updateAvailable || isCapturingOrSaving) {
    return null;
  }

  const handleUpdate = () => {
    applyUpdate(true);
  };

  return (
    <aside
      aria-label="Software update"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        margin: "0 auto",
        maxWidth: "420px",
        width: "calc(100% - 24px)",
        padding: "8px 14px",
        borderRadius: "10px",
        backgroundColor: "rgba(35, 33, 31, 0.9)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        backdropFilter: "blur(8px)",
        color: "#E2DDD5",
        fontSize: "12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
        zIndex: 30,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#38BDF8",
            display: "inline-block",
          }}
          aria-hidden="true"
        />
        <span style={{ fontWeight: 500 }}>Camera update available</span>
      </div>

      <button
        type="button"
        onClick={handleUpdate}
        style={{
          padding: "4px 10px",
          borderRadius: "6px",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          color: "#FFFFFF",
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Update
      </button>
    </aside>
  );
}
