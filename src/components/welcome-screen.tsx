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

function GothicPartyCrest() {
  return (
    <div className="party-crest-symbol" aria-hidden="true">
      <svg width="42" height="42" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Outer dashed aura ring */}
        <circle cx="20" cy="20" r="18" stroke="rgba(185, 25, 40, 0.35)" strokeWidth="1" strokeDasharray="3 3" />
        {/* Inner silver frame ring */}
        <circle cx="20" cy="20" r="13" stroke="rgba(195, 190, 205, 0.4)" strokeWidth="1" />
        {/* 8-pointed gothic star emblem */}
        <path
          d="M20 2L22.8 14.5L35 12L25.5 20L35 28L22.8 25.5L20 38L17.2 25.5L5 28L14.5 20L5 12L17.2 14.5Z"
          fill="#1C090C"
          stroke="rgba(210, 35, 50, 0.75)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Blood red radiant core */}
        <circle cx="20" cy="20" r="4.5" fill="#BA1B2B" />
        <circle cx="20" cy="20" r="2.2" fill="#FF5E6F" />
      </svg>
    </div>
  );
}

export function WelcomeScreen({
  wedding,
  shotsRemaining,
  onEnterCamera,
  isLoading = false,
}: WelcomeScreenProps) {
  const isJaseph = !wedding.coupleNames || wedding.coupleNames.toLowerCase().includes("jaseph");
  const heroTitle = isJaseph ? "JASEPH'S" : wedding.coupleNames;

  return (
    <main className="party-invitation-container">
      {/* Gothic Halloween Birthday Party Flyer Card */}
      <div className="party-flyer-card">
        {/* Inner hairline ornamental border */}
        <div className="party-card-inner-border" />

        {/* Four gothic metallic corner brackets */}
        <div className="party-corner party-corner-tl" />
        <div className="party-corner party-corner-tr" />
        <div className="party-corner party-corner-bl" />
        <div className="party-corner party-corner-br" />

        {/* Top Gothic Emblem (8-pointed star / dark crest) */}
        <GothicPartyCrest />

        {/* Top Invitation Eyebrow */}
        <div className="party-eyebrow">
          {wedding.editionLabel || "EXCLUSIVE INVITATION"}
        </div>

        {/* Center: Large Hero Name */}
        <h1 className="party-hero-name">
          {heroTitle}
        </h1>

        {/* Below: Event Subtitle */}
        <div className="party-hero-subtitle">
          BIRTHDAY CELEBRATION
        </div>

        {/* Theme Pill: HALLOWEEN PARTY */}
        <div className="party-theme-tag">
          <span className="party-theme-label">THEME</span>
          <span className="party-theme-name">HALLOWEEN PARTY</span>
        </div>

        {/* Costume Rule: COSTUME IS MANDATORY */}
        <div className="party-costume-notice">
          ✦ COSTUME IS MANDATORY ✦
        </div>

        {/* VIP Guest Reservation (if provided) */}
        {wedding.guestName && (
          <div className="party-vip-guest">
            VIP PASS RESERVED FOR: <strong>{wedding.guestName}</strong>
          </div>
        )}

        {/* Gothic ornamental divider */}
        <div className="party-gothic-divider" aria-hidden="true">
          <span className="party-divider-line" />
          <span className="party-divider-glyph">◆</span>
          <span className="party-divider-line" />
        </div>

        {/* Welcome Message / Atmosphere Quote */}
        <p className="party-welcome-quote">
          &ldquo;{wedding.welcomeMessage}&rdquo;
        </p>

        {/* Lower Section: Event Details Grid (Party Flyer Presentation) */}
        <div className="party-details-grid">
          <div className="party-detail-card">
            <span className="party-detail-label">DATE</span>
            <span className="party-detail-value">{wedding.weddingDate}</span>
            {wedding.days && (
              <span style={{ fontSize: "11px", color: "#ADA9BA", marginTop: "2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {wedding.days}
              </span>
            )}
          </div>

          <div className="party-detail-card">
            <span className="party-detail-label">TIME</span>
            <span className="party-detail-value">{wedding.time || "6:00 PM"}</span>
          </div>

          <div className="party-detail-card">
            <span className="party-detail-label">VILLA</span>
            <span className="party-detail-value">{wedding.villa || "Casa de Elvira"}</span>
          </div>

          <div className="party-detail-card">
            <span className="party-detail-label">WHAT TO BRING</span>
            <span className="party-detail-value">
              {wedding.whatToBring || "Alak"}
            </span>
          </div>

          <div className="party-detail-card party-detail-full">
            <span className="party-detail-label">LOCATION</span>
            <span className="party-detail-value" style={{ fontSize: "12px", lineHeight: "1.35", letterSpacing: "0.01em" }}>
              {wedding.location || "Block 12, Lot 19 Mercury Street, Santo Niño, San Fernando, Pampanga, 2000"}
            </span>
          </div>
        </div>

        {/* Party Shots Counter Badge */}
        <div className="party-shots-badge">
          <span className="party-shots-dot" />
          <span className="party-shots-count">{shotsRemaining}</span>
          <span className="party-shots-label">
            {shotsRemaining === 1 ? "Shot Remaining" : "Shots Remaining"}
          </span>
        </div>

        {/* Primary Action Button: Open Camera */}
        <button
          type="button"
          disabled={isLoading}
          onClick={onEnterCamera}
          className="party-enter-btn"
          aria-label="Open Camera"
        >
          <span>{isLoading ? "Preparing Camera…" : "Open Camera"}</span>
          <span style={{ display: "flex", alignItems: "center", color: "#FF3B50" }}>
            <ArrowRightIcon size={16} />
          </span>
        </button>

        {/* Helper Subtext */}
        <div className="party-subtext">
          {wedding.subMessage}
        </div>
      </div>
    </main>
  );
}
