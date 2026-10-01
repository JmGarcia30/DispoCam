"use client";

import { FormEvent, useState } from "react";
import { normalizeDisplayName } from "@/lib/camera/guest-name";
import { ArrowRightIcon } from "@/components/icons";

export { needsGuestName, normalizeDisplayName } from "@/lib/camera/guest-name";

function GothicStepCrest() {
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

export function GuestNameStep({ onContinue }: { onContinue: (displayName: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const displayName = normalizeDisplayName(value);
    if (!displayName) {
      setError("Please enter a name between 2 and 120 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onContinue(displayName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your name could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="party-invitation-container">
      <form className="party-flyer-card" onSubmit={(event) => void submit(event)}>
        <div className="party-card-inner-border" />
        <div className="party-corner party-corner-tl" />
        <div className="party-corner party-corner-tr" />
        <div className="party-corner party-corner-bl" />
        <div className="party-corner party-corner-br" />

        <GothicStepCrest />

        <div className="party-eyebrow">
          ✦ DISPOSABLE CAMERA PASS ✦
        </div>

        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "28px",
            fontWeight: 650,
            color: "#FAF7F2",
            margin: "0 0 6px",
            lineHeight: 1.15,
          }}
        >
          What should we call you?
        </h1>

        <p style={{ fontSize: "13px", color: "#ADA9BA", marginBottom: "20px", lineHeight: 1.4 }}>
          Enter your name to claim your party disposable camera pass.
        </p>

        <div style={{ width: "100%", textAlign: "left", marginBottom: "16px" }}>
          <input
            autoFocus
            autoComplete="name"
            maxLength={120}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label="Display name"
            aria-describedby="guest-name-help guest-name-error"
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
            }}
          />

          <p id="guest-name-help" style={{ fontSize: "12px", color: "#8E8B98", marginTop: "10px", lineHeight: 1.4 }}>
            Your name will only be shown to the couple with the photos you take.
          </p>

          {error && (
            <p
              id="guest-name-error"
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
          disabled={saving}
          className="party-enter-btn"
        >
          <span>{saving ? "Saving…" : "Continue"}</span>
          <span style={{ display: "flex", alignItems: "center", color: "#FF3B50" }}>
            <ArrowRightIcon size={16} />
          </span>
        </button>
      </form>
    </main>
  );
}
