"use client";

import React from "react";
import type { WeddingConfig } from "@/lib/wedding/config";
import { ArrowRightIcon } from "@/components/icons";

interface WelcomeScreenProps {
  wedding: WeddingConfig;
  shotsRemaining: number;
  onEnterCamera: () => void;
  isLoading?: boolean;
}

export function WelcomeScreen({
  wedding,
  shotsRemaining,
  onEnterCamera,
  isLoading = false,
}: WelcomeScreenProps) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(var(--sat) + 24px) 20px calc(var(--sab) + 24px)",
        backgroundColor: "var(--wedding-bg)",
        backgroundImage: "radial-gradient(ellipse at 50% 20%, rgba(195, 153, 107, 0.12) 0%, transparent 70%)",
      }}
    >
      {/* Keepsake Pass Card */}
      <div
        className="keepsake-paper-texture"
        style={{
          width: "100%",
          maxWidth: "390px",
          borderRadius: "20px",
          padding: "36px 26px 32px",
          boxShadow: 
            "0 24px 48px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(195, 153, 107, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.6)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle decorative inner border */}
        <div
          style={{
            position: "absolute",
            inset: "10px",
            border: "1px solid rgba(195, 153, 107, 0.35)",
            borderRadius: "14px",
            pointerEvents: "none",
          }}
        />

        {/* Small corner ticket notches */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "-10px",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: "var(--wedding-bg)",
            transform: "translateY(-50%)",
            boxShadow: "inset -2px 0 3px rgba(0, 0, 0, 0.3)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            right: "-10px",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: "var(--wedding-bg)",
            transform: "translateY(-50%)",
            boxShadow: "inset 2px 0 3px rgba(0, 0, 0, 0.3)",
          }}
        />

        {/* Monogram crest */}
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            border: "1.5px solid var(--wedding-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--wedding-accent)",
            fontFamily: "var(--font-serif)",
            fontSize: "20px",
            fontStyle: "italic",
            marginBottom: "18px",
            boxShadow: "0 2px 6px rgba(195, 153, 107, 0.2)",
          }}
        >
          {wedding.monogram}
        </div>

        {/* Pass Header Label */}
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "10.5px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--wedding-accent)",
            fontWeight: 700,
            marginBottom: "12px",
          }}
        >
          {wedding.editionLabel}
        </div>

        {/* Couple Names */}
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "36px",
            fontWeight: 500,
            lineHeight: 1.15,
            color: "var(--wedding-text-primary)",
            margin: "0 0 10px",
            letterSpacing: "-0.015em",
          }}
        >
          {wedding.coupleNames}
        </h1>

        {/* Wedding Date */}
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--wedding-text-muted)",
            fontWeight: 500,
            marginBottom: "24px",
          }}
        >
          {wedding.weddingDate}
        </div>

        {/* Guest Greeting if available */}
        {wedding.guestName && (
          <div
            style={{
              fontSize: "13px",
              fontStyle: "italic",
              fontFamily: "var(--font-serif)",
              color: "var(--wedding-text-muted)",
              marginBottom: "12px",
            }}
          >
            Reserved for {wedding.guestName}
          </div>
        )}

        {/* Dashed tear line */}
        <div
          style={{
            width: "calc(100% - 20px)",
            borderBottom: "1px dashed rgba(195, 153, 107, 0.4)",
            margin: "4px 0 24px",
          }}
        />

        {/* Message */}
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "19px",
            fontStyle: "italic",
            color: "var(--wedding-text-primary)",
            lineHeight: 1.35,
            marginBottom: "22px",
            maxWidth: "280px",
          }}
        >
          &ldquo;{wedding.welcomeMessage}&rdquo;
        </p>

        {/* Remaining shots tag */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "rgba(195, 153, 107, 0.12)",
            border: "1px solid rgba(195, 153, 107, 0.3)",
            borderRadius: "8px",
            padding: "6px 14px",
            marginBottom: "28px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--wedding-text-primary)",
            }}
          >
            {shotsRemaining}
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "11px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--wedding-text-muted)",
            }}
          >
            {shotsRemaining === 1 ? "Shot Remaining" : "Shots Remaining"}
          </span>
        </div>

        {/* Primary Action: Open Camera */}
        <button
          type="button"
          disabled={isLoading}
          onClick={onEnterCamera}
          style={{
            width: "100%",
            padding: "16px 24px",
            borderRadius: "12px",
            backgroundColor: "#201E1C",
            color: "#FAF8F5",
            border: "1px solid rgba(195, 153, 107, 0.4)",
            fontFamily: "var(--font-sans)",
            fontSize: "15px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            cursor: isLoading ? "wait" : "pointer",
            boxShadow: "0 8px 18px rgba(0, 0, 0, 0.35)",
            transition: "transform 0.12s ease, background-color 0.12s ease, box-shadow 0.12s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "scale(0.98)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <span>{isLoading ? "Preparing Camera…" : "Open Camera"}</span>
          <span style={{ display: "flex", alignItems: "center", color: "var(--wedding-accent)" }}>
            <ArrowRightIcon size={16} />
          </span>
        </button>

        {/* Helper subtext */}
        <div
          style={{
            marginTop: "16px",
            fontSize: "12px",
            color: "var(--wedding-text-muted)",
            lineHeight: 1.4,
            maxWidth: "260px",
          }}
        >
          {wedding.subMessage}
        </div>
      </div>
    </main>
  );
}
