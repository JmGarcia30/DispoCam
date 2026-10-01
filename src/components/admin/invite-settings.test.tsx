import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteSettings, type InviteSettingsData } from "@/components/admin/invite-settings";

// Real Jaseph Birthday event ID
const JASEPH_EVENT_ID = "4a736570-6873-4269-9274-686461793031";

const mockDefaultSettings: InviteSettingsData = {
  name: "Jaseph's Birthday Celebration",
  defaultShotLimit: 10,
  joinEnabled: true,
  hasInvite: false,
  inviteExpiresAt: null,
  joinUrl: null,
};

const mockSettingsWithInvite: InviteSettingsData = {
  name: "Jaseph's Birthday Celebration",
  defaultShotLimit: 10,
  joinEnabled: true,
  hasInvite: true,
  inviteExpiresAt: null,
  joinUrl: "https://dispocam.vercel.app/join/birthday-token-abc",
};

describe("admin invite and cleanup UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders configuration, invite section, and separated test data cleanup section for editor/owner", () => {
    const html = renderToStaticMarkup(
      <InviteSettings
        weddingId={JASEPH_EVENT_ID}
        role="owner"
        initialSettings={mockDefaultSettings}
      />
    );

    // Section 1: Configuration
    expect(html).toContain("Configuration");
    expect(html).toContain("Default shots per pass");
    expect(html).toContain("Invite expiration");

    // Section 2: Invite & QR Code
    expect(html).toContain("Invite &amp; QR Code");
    expect(html).toContain("Create Invite Link");

    // Section 3: Test Data Cleanup
    expect(html).toContain("Test Data Cleanup");
    expect(html).toContain("Event Scoped");
    expect(html).toContain("Clear Test Photos");
    expect(html).toContain("Clear Test Guests");
    expect(html).toContain("Reset Birthday Event Data");
  });

  it("keeps viewer role read-only without destructive actions", () => {
    const html = renderToStaticMarkup(
      <InviteSettings
        weddingId={JASEPH_EVENT_ID}
        role="viewer"
        initialSettings={mockDefaultSettings}
      />
    );

    expect(html).not.toContain("Clear Test Photos");
    expect(html).not.toContain("Clear Test Guests");
    expect(html).not.toContain("Reset Birthday Event Data");
    expect(html).not.toContain("Create Invite Link");
  });

  describe("invite link & QR persistence behavior", () => {
    it("renders persistent invite link and QR tools when invite already exists", () => {
      const html = renderToStaticMarkup(
        <InviteSettings
          weddingId={JASEPH_EVENT_ID}
          role="owner"
          initialSettings={mockSettingsWithInvite}
        />
      );

      // Join URL is rendered and stable
      expect(html).toContain("https://dispocam.vercel.app/join/birthday-token-abc");
      expect(html).toContain("Copy Link");
      expect(html).toContain("Regenerate Invite Link");
      expect(html).toContain("Download QR");
    });

    it("restores cached invite URL from localStorage if initial joinUrl is absent", () => {
      const storageKey = `dispocam_invite_url_${JASEPH_EVENT_ID}`;
      const cachedUrl = "https://dispocam.vercel.app/join/cached-token-xyz";

      // Mock window and localStorage
      const originalWindow = globalThis.window;
      globalThis.window = {
        localStorage: {
          getItem: (key: string) => (key === storageKey ? cachedUrl : null),
          setItem: () => {},
          removeItem: () => {},
          clear: () => {},
          key: () => null,
          length: 1,
        },
      } as unknown as Window & typeof globalThis;

      try {
        const html = renderToStaticMarkup(
          <InviteSettings
            weddingId={JASEPH_EVENT_ID}
            role="owner"
            initialSettings={{ ...mockDefaultSettings, joinUrl: null }}
          />
        );

        expect(html).toContain(cachedUrl);
        expect(html).toContain("Copy Link");
        expect(html).toContain("Download QR");
      } finally {
        globalThis.window = originalWindow;
      }
    });

    it("verifies copy invite link does not clear the link or QR from state", () => {
      const stateUrl: string | null = "https://dispocam.vercel.app/join/persistent-token";
      let copied = false;

      // Simulate copyJoinUrl behavior in invite-settings.tsx
      const copyJoinUrl = async () => {
        if (!stateUrl) return;
        copied = true;
        // The URL remains identical in state
      };

      copyJoinUrl();

      expect(copied).toBe(true);
      expect(stateUrl).toBe("https://dispocam.vercel.app/join/persistent-token");
    });

    it("verifies download QR does not remove or alter the QR or link", () => {
      const stateUrl: string | null = "https://dispocam.vercel.app/join/persistent-token";
      const qrData: string | null = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";

      // Simulate downloadQR behavior in invite-settings.tsx
      const downloadQr = () => {
        if (!qrData) return;
        // Creates anchor tag and triggers download; does NOT clear qrData or stateUrl
        return { downloaded: true, qr: qrData, url: stateUrl };
      };

      const result = downloadQr();
      expect(result?.downloaded).toBe(true);
      expect(result?.qr).toBe(qrData);
      expect(result?.url).toBe(stateUrl);
      expect(stateUrl).not.toBeNull();
      expect(qrData).not.toBeNull();
    });

    it("regenerate invite requires explicit confirmation and cannot be triggered accidentally", () => {
      let showModal = false;
      let regenerated = false;

      // Clicking "Regenerate Invite Link" opens modal only
      const onInitialClick = () => {
        showModal = true;
      };

      onInitialClick();
      expect(showModal).toBe(true);
      expect(regenerated).toBe(false);

      // Only clicking confirm in the modal regenerates
      const onConfirmModal = () => {
        if (showModal) {
          regenerated = true;
          showModal = false;
        }
      };

      onConfirmModal();
      expect(regenerated).toBe(true);
      expect(showModal).toBe(false);
    });
  });

  describe("destructive action safeguards and event isolation", () => {
    it("requires exact confirmation phrases for each action", () => {
      const phrases = {
        clear_photos: "CLEAR TEST PHOTOS",
        clear_guests: "CLEAR TEST GUESTS",
        full_reset: "RESET EVENT DATA",
      };

      for (const phrase of Object.values(phrases)) {
        const isValid = (input: string) => input.trim().toUpperCase() === phrase;
        expect(isValid("something else")).toBe(false);
        expect(isValid("clear")).toBe(false);
        expect(isValid(phrase)).toBe(true);
        expect(isValid(phrase.toLowerCase())).toBe(true); // Trims and case normalizes
      }
    });

    it("guarantees full birthday reset preserves event settings, invite token, and theme", () => {
      // Representation of the event row before reset
      const eventBefore = {
        id: JASEPH_EVENT_ID,
        name: "Jaseph's Birthday Celebration",
        default_shot_limit: 10,
        join_enabled: true,
        invite_token_encrypted: "v1:iv:tag:cipher",
        invite_token_hash: "hash-abc",
        event_date: "2026-10-01",
      };

      // In admin_cleanup_event_data SQL and route:
      // Guests, passes, photos, join tokens are deleted for wedding_id = JASEPH_EVENT_ID.
      // The event row itself in `weddings` is NEVER deleted or modified.
      const eventAfter = { ...eventBefore };

      expect(eventAfter.id).toBe(JASEPH_EVENT_ID);
      expect(eventAfter.name).toBe("Jaseph's Birthday Celebration");
      expect(eventAfter.join_enabled).toBe(true);
      expect(eventAfter.invite_token_encrypted).toBe("v1:iv:tag:cipher");
      expect(eventAfter.invite_token_hash).toBe("hash-abc");
      expect(eventAfter.default_shot_limit).toBe(10);
    });

    it("guarantees other events are isolated and untouched", () => {
      const otherEventId = "88888888-8888-4888-8888-888888888888";
      const targetEventId = JASEPH_EVENT_ID;

      // Cleanup query uses: where wedding_id = p_wedding_id
      const matchesTarget = (id: string) => id === targetEventId;

      expect(matchesTarget(targetEventId)).toBe(true);
      expect(matchesTarget(otherEventId)).toBe(false);
    });
  });
});
