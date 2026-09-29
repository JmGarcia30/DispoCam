"use client";

import React, { useEffect, useState } from "react";
import { CameraIcon, CloseIcon } from "@/components/icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)
    );
  });

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  if (isStandalone || dismissed || !deferredPrompt) {
    return null;
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    } else {
      setDismissed(true);
    }
  };

  return (
    <aside
      aria-label="Install app"
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
        border: "1px solid rgba(195, 153, 107, 0.25)",
        backdropFilter: "blur(8px)",
        color: "#E2DDD5",
        fontSize: "12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
        zIndex: 30,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--wedding-accent)", display: "flex", alignItems: "center" }}>
          <CameraIcon size={16} />
        </span>
        <span style={{ fontWeight: 500 }}>Add this camera to your Home Screen</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          style={{
            padding: "4px 10px",
            borderRadius: "6px",
            backgroundColor: "var(--wedding-accent)",
            border: "none",
            color: "#181715",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            background: "none",
            border: "none",
            color: "#9E978E",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: "4px",
          }}
          aria-label="Dismiss install suggestion"
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </aside>
  );
}
