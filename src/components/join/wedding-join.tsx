"use client";

import { FormEvent, useEffect, useState } from "react";
import { normalizeDisplayName } from "@/lib/camera/guest-name";
import { findReopenableCamera, getOrCreateJoinBrowserKey, saveJoinedCamera } from "@/lib/join/browser";
import { ArrowRightIcon } from "@/components/icons";

function GothicJoinCrest() {
  return (
    <div className="party-crest-symbol" aria-hidden="true">
      <svg width="42" height="42" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="18" stroke="rgba(185, 25, 40, 0.35)" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="20" cy="20" r="13" stroke="rgba(195, 190, 205, 0.4)" strokeWidth="1" />
        <path
          d="M20 2L22.8 14.5L35 12L25.5 20L35 28L22.8 25.5L20 38L17.2 25.5L5 28L14.5 20L5 12L17.2 14.5Z"
          fill="#1C090C"
          stroke="rgba(210, 35, 50, 0.75)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="20" r="4.5" fill="#BA1B2B" />
        <circle cx="20" cy="20" r="2.2" fill="#FF5E6F" />
      </svg>
    </div>
  );
}

export function WeddingJoin({ inviteToken }: { inviteToken: string }) {
  const [weddingName, setWeddingName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const existing = await findReopenableCamera(inviteToken);
        if (existing) { location.replace(`/camera/${encodeURIComponent(existing)}`); return; }
        const response = await fetch(`/api/join/${encodeURIComponent(inviteToken)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? "Invitation not found.");
        if (active) setWeddingName(payload.data.weddingName);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Invitation not found.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [inviteToken]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = normalizeDisplayName(displayName);
    if (!name) { setError("Please enter a name between 2 and 120 characters."); return; }
    setJoining(true); setError(null);
    try {
      const browserKey = await getOrCreateJoinBrowserKey(inviteToken);
      const response = await fetch(`/api/join/${encodeURIComponent(inviteToken)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name, browserKey }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Your camera pass could not be created.");
      await saveJoinedCamera(inviteToken, payload.data.cameraToken);
      location.replace(`/camera/${encodeURIComponent(payload.data.cameraToken)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your camera pass could not be created.");
      setJoining(false);
    }
  }

  const isJaseph = !weddingName || weddingName.toLowerCase().includes("jaseph");
  const eventTitle = isJaseph ? "JASEPH'S" : weddingName;
  const eventSubtitle = isJaseph ? "BIRTHDAY CELEBRATION" : "EVENT CAMERA PASS";

  if (loading) {
    return (
      <main className="party-invitation-container">
        <div className="party-flyer-card" style={{ padding: "48px 24px" }}>
          <div className="party-card-inner-border" />
          <GothicJoinCrest />
          <p style={{ color: "#D2CEC7", fontFamily: "var(--font-serif)", fontSize: "18px", fontStyle: "italic", margin: "14px 0 0" }}>
            Opening party invitation…
          </p>
        </div>
      </main>
    );
  }

  if (!weddingName) {
    return (
      <main className="party-invitation-container">
        <div className="party-flyer-card">
          <div className="party-card-inner-border" />
          <GothicJoinCrest />
          <div className="party-eyebrow">INVITATION UNAVAILABLE</div>
          <h1 className="party-hero-name" style={{ fontSize: "28px" }}>Pass Not Found</h1>
          <p style={{ color: "#FF5A6E", fontSize: "14px", margin: "12px 0 20px" }}>{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="party-invitation-container">
      <form className="party-flyer-card" onSubmit={(event) => void submit(event)}>
        <div className="party-card-inner-border" />
        <div className="party-corner party-corner-tl" />
        <div className="party-corner party-corner-tr" />
        <div className="party-corner party-corner-bl" />
        <div className="party-corner party-corner-br" />

        <GothicJoinCrest />

        <div className="party-eyebrow">
          ✦ EXCLUSIVE INVITATION ✦
        </div>

        <h1 className="party-hero-name">
          {eventTitle}
        </h1>

        <div className="party-hero-subtitle">
          {eventSubtitle}
        </div>

        <div className="party-theme-tag">
          <span className="party-theme-label">THEME</span>
          <span className="party-theme-name">HALLOWEEN PARTY</span>
        </div>

        <div className="party-costume-notice">
          ✦ COSTUME IS MANDATORY ✦
        </div>

        <div className="party-gothic-divider" aria-hidden="true">
          <span className="party-divider-line" />
          <span className="party-divider-glyph">◆</span>
          <span className="party-divider-line" />
        </div>

        <div style={{ width: "100%", margin: "4px 0 16px", textAlign: "left" }}>
          <label
            htmlFor="join-guest-name"
            style={{
              display: "block",
              fontFamily: "var(--font-serif)",
              fontSize: "22px",
              fontWeight: 600,
              color: "#FAF7F2",
              marginBottom: "6px",
              lineHeight: 1.2,
            }}
          >
            What should we call you?
          </label>
          <p style={{ fontSize: "13px", color: "#ADA9BA", marginBottom: "14px", lineHeight: 1.4 }}>
            Enter your name to claim your party disposable camera pass.
          </p>

          <input
            id="join-guest-name"
            autoFocus
            autoComplete="name"
            maxLength={120}
            aria-label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name or nickname"
            style={{
              boxSizing: "border-box",
              width: "100%",
              padding: "14px 16px",
              backgroundColor: "#0D0C12",
              border: "1px solid rgba(185, 25, 40, 0.45)",
              borderRadius: "10px",
              color: "#FAF7F2",
              fontFamily: "var(--font-sans)",
              fontSize: "16px",
              outline: "none",
              boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.6)",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 60, 80, 0.75)";
              e.currentTarget.style.boxShadow = "0 0 12px rgba(220, 30, 45, 0.35), inset 0 2px 4px rgba(0, 0, 0, 0.6)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(185, 25, 40, 0.45)";
              e.currentTarget.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.6)";
            }}
          />

          <p style={{ fontSize: "12px", color: "#8E8B98", marginTop: "10px", lineHeight: 1.4 }}>
            Your name will only be shown to the host with the photos you take.
          </p>

          {error && (
            <p
              role="alert"
              style={{
                fontSize: "13px",
                color: "#FF4A5E",
                marginTop: "10px",
                padding: "8px 12px",
                backgroundColor: "rgba(255, 60, 80, 0.1)",
                border: "1px solid rgba(255, 60, 80, 0.3)",
                borderRadius: "6px",
              }}
            >
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={joining}
          className="party-enter-btn"
          style={{ marginTop: "10px" }}
        >
          <span>{joining ? "Claiming your camera…" : "Continue to Party Pass"}</span>
          <span style={{ display: "flex", alignItems: "center", color: "#FF3B50" }}>
            <ArrowRightIcon size={16} />
          </span>
        </button>
      </form>
    </main>
  );
}

