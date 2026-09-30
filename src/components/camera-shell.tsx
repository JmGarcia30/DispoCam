"use client";

import React, { useCallback, useEffect, useState } from "react";
import { canReachApplication } from "@/lib/network/connectivity";
import { offlinePhotoStore } from "@/lib/offline/database";
import { fingerprintCameraToken } from "@/lib/security/browser-token";
import type { CameraPageMode, OfflineCameraSession } from "@/lib/offline/types";
import { resolveWeddingConfig, DEFAULT_WEDDING_CONFIG } from "@/lib/wedding/config";
import { WelcomeScreen } from "@/components/welcome-screen";
import { DisposableCamera } from "@/components/disposable-camera";
import { CameraIcon } from "@/components/icons";
import { GuestNameStep, needsGuestName } from "@/components/guest-name-step";
import { createDemoCameraSession } from "@/lib/camera/demo-session";
import { saveGuestDisplayName } from "@/lib/camera/guest-name";
import { fetchWithTimeout } from "@/lib/network/fetch-timeout";
import { NETWORK_TIMEOUTS } from "@/lib/network/timeouts";

interface PassApiResponse {
  data: {
    pass_id: string;
    wedding_id: string;
    wedding_name: string;
    event_date: string | null;
    guest_id: string;
    guest_name: string | null;
    shots_remaining: number;
    expires_at: string | null;
    requires_online_capture: boolean;
  };
  capabilities: { maxUploadBytes: number };
}

function readCameraToken(): string | null {
  if (typeof window === "undefined") return null;
  const match = location.pathname.match(/^\/camera\/([^/]+)$/);
  if (!match || match[1] === "offline-shell") return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function CameraShell({ pageMode }: { pageMode: CameraPageMode }) {
  const [resolved, setResolved] = useState<{
    token: string | null;
    session: OfflineCameraSession;
    offline: boolean;
  } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<"welcome" | "camera">("welcome");
  const [isInitializing, setIsInitializing] = useState(true);

  const updateResolvedSession = useCallback((session: OfflineCameraSession) => {
    setResolved((current) => (current ? { ...current, session } : current));
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const token = readCameraToken();

      if (!token) {
        const latest = await offlinePhotoStore.getMostRecentCameraSession();
        if (
          latest &&
          (latest.weddingName === "Sophia & Julian" ||
            latest.weddingName === "Sophia and Julian" ||
            latest.tokenFingerprint === "demo-wedding-fingerprint")
        ) {
          latest.weddingName = DEFAULT_WEDDING_CONFIG.coupleNames;
          await offlinePhotoStore.saveCameraSession(latest);
        }
        const valid = latest && (!latest.expiresAt || Date.parse(latest.expiresAt) > Date.now());
        if (active && valid) {
          setResolved({ token: null, session: latest, offline: true });
        } else if (active) {
          // If no token and no cached session, check if we can create or offer a demo session in dev
          setUnavailable(true);
        }
        setIsInitializing(false);
        return;
      }

      const fingerprint = await fingerprintCameraToken(token);
      const cached = await offlinePhotoStore.getCameraSession(fingerprint);

      if (await canReachApplication()) {
        try {
          const response = await fetchWithTimeout(fetch, `/api/camera/${encodeURIComponent(token)}`, { cache: "no-store" }, NETWORK_TIMEOUTS.cameraPassMs);
          if (!response.ok) throw new Error("Camera pass is unavailable.");
          const payload = (await response.json()) as PassApiResponse;
          const session: OfflineCameraSession = {
            tokenFingerprint: fingerprint,
            cameraPassId: payload.data.pass_id,
            weddingId: payload.data.wedding_id,
            weddingName: payload.data.wedding_name,
            eventDate: payload.data.event_date,
            guestId: payload.data.guest_id,
            guestName: payload.data.guest_name,
            serverRemainingShots: payload.data.shots_remaining,
            maxUploadBytes: payload.capabilities.maxUploadBytes,
            requiresOnlineCapture: payload.data.requires_online_capture,
            expiresAt: payload.data.expires_at,
            resolvedAt: new Date().toISOString(),
          };
          await offlinePhotoStore.saveCameraSession(session);
          if (active) {
            setResolved({ token, session, offline: false });
          }
          setIsInitializing(false);
          return;
        } catch {
          if (active) setUnavailable(true);
          setIsInitializing(false);
          return;
        }
      }

      const cachedStillValid = cached && (!cached.expiresAt || Date.parse(cached.expiresAt) > Date.now());
      if (active && cachedStillValid) {
        setResolved({ token, session: cached, offline: true });
      } else if (active) {
        setUnavailable(true);
      }
      setIsInitializing(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  // Demo pass launcher for testing and previewing when no QR code was scanned
  const handleLaunchDemoPass = useCallback(async () => {
    const demoSession = createDemoCameraSession();
    await offlinePhotoStore.saveCameraSession(demoSession);
    setResolved({ token: null, session: demoSession, offline: true });
    setUnavailable(false);
  }, []);

  if (isInitializing) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--wedding-bg)",
          color: "#E2DDD5",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ width: "32px", height: "32px", border: "2px solid rgba(195, 153, 107, 0.3)", borderTopColor: "var(--wedding-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: "16px" }} />
        <p style={{ fontSize: "14px", color: "var(--wedding-accent)", letterSpacing: "0.05em" }}>Opening camera pass…</p>
      </main>
    );
  }

  if (unavailable) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 20px",
          backgroundColor: "var(--wedding-bg)",
          color: "#E2DDD5",
          textAlign: "center",
        }}
      >
        <div
          className="keepsake-paper-texture"
          style={{
            width: "100%",
            maxWidth: "380px",
            borderRadius: "18px",
            padding: "36px 24px",
            color: "var(--wedding-text-primary)",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(195, 153, 107, 0.3)",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              border: "1px solid var(--wedding-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              color: "var(--wedding-accent)",
            }}
          >
            <CameraIcon size={22} />
          </div>

          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "26px",
              fontWeight: 600,
              margin: "0 0 12px",
              lineHeight: 1.25,
            }}
          >
            Wedding camera unavailable offline
          </h1>

          <p
            style={{
              fontSize: "14px",
              color: "var(--wedding-text-muted)",
              lineHeight: 1.5,
              marginBottom: "20px",
            }}
          >
            Open this camera once while connected, then it can use its saved pass information offline.
          </p>

          <p
            style={{
              fontSize: "13px",
              color: "var(--wedding-text-muted)",
              marginBottom: "24px",
            }}
          >
            Please scan the wedding QR code from your table or invitation.
          </p>

          <button
            type="button"
            onClick={() => void handleLaunchDemoPass()}
            style={{
              padding: "12px 20px",
              borderRadius: "10px",
              backgroundColor: "#201E1C",
              color: "#FAF8F5",
              border: "1px solid rgba(195, 153, 107, 0.4)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Launch Camera Pass Preview
          </button>
        </div>
      </main>
    );
  }

  if (!resolved) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--wedding-bg)",
          color: "#E2DDD5",
        }}
      >
        <p>Opening camera…</p>
      </main>
    );
  }

  const wedding = resolveWeddingConfig(resolved.session);

  if (needsGuestName(resolved.session.guestName)) {
    return (
      <GuestNameStep
        onContinue={async (displayName) => {
          const updated = await saveGuestDisplayName(
            { session: resolved.session, token: resolved.token, offline: resolved.offline, displayName },
            { saveSession: (session) => offlinePhotoStore.saveCameraSession(session) },
          );
          updateResolvedSession(updated);
        }}
      />
    );
  }

  if (currentScreen === "welcome") {
    return (
      <WelcomeScreen
        wedding={wedding}
        shotsRemaining={resolved.session.serverRemainingShots}
        onEnterCamera={() => setCurrentScreen("camera")}
      />
    );
  }

  return (
    <DisposableCamera
      token={resolved.token}
      session={resolved.session}
      wedding={wedding}
      offline={resolved.offline}
      onSessionUpdated={updateResolvedSession}
      onBackToPass={() => setCurrentScreen("welcome")}
      pageMode={pageMode}
    />
  );
}
