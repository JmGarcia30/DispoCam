import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WelcomeScreen } from "@/components/welcome-screen";
import { RollFinished } from "@/components/roll-finished";
import { SyncStatusBar } from "@/components/sync-status-bar";
import { getRetryButtonState, NeedsAttentionModal } from "@/components/needs-attention-modal";
import type { OfflinePhoto } from "@/lib/offline/types";
import { resolveWeddingConfig, DEFAULT_WEDDING_CONFIG } from "@/lib/wedding/config";

describe("Guest-facing UI Components", () => {
  describe("Wedding Configuration Resolution", () => {
    it("returns default configuration when no session or overrides provided", () => {
      const config = resolveWeddingConfig();
      expect(config.coupleNames).toBe(DEFAULT_WEDDING_CONFIG.coupleNames);
      expect(config.monogram).toBe(DEFAULT_WEDDING_CONFIG.monogram);
    });

    it("extracts couple names and monogram from session wedding name", () => {
      const config = resolveWeddingConfig({
        weddingName: "Emma & Noah Wedding",
        guestName: "Olivia",
      });
      expect(config.coupleNames).toBe("Emma & Noah");
      expect(config.monogram).toBe("E & N");
      expect(config.guestName).toBe("Olivia");
    });
  });

  describe("Screen 1 — WelcomeScreen Keepsake Pass", () => {
    it("renders couple names, wedding date, welcome message, and Open Camera button", () => {
      const config = resolveWeddingConfig({
        weddingName: "Charlotte & Liam",
      });
      const html = renderToStaticMarkup(
        <WelcomeScreen
          wedding={config}
          shotsRemaining={10}
          onEnterCamera={() => {}}
        />,
      );

      expect(html).toContain("Charlotte &amp; Liam");
      expect(html).toContain("November 19, 2026");
      expect(html).toContain("Capture the night from your point of view.");
      expect(html).toContain("10");
      expect(html).toContain("Shots Remaining");
      expect(html).toContain("Open Camera");
      expect(html).toContain("No app needed. Your photos will upload automatically.");
    });

    it("renders Jaseph's gothic Halloween birthday party flyer with required party details and no wedding language", () => {
      const config = resolveWeddingConfig({
        weddingName: "Jaseph's Birthday",
      });
      const html = renderToStaticMarkup(
        <WelcomeScreen
          wedding={config}
          shotsRemaining={10}
          onEnterCamera={() => {}}
        />,
      );

      // Verify birthday party hierarchy
      expect(html).toContain("JASEPH&#x27;S");
      expect(html).toContain("BIRTHDAY CELEBRATION");
      expect(html).toContain("HALLOWEEN PARTY");
      expect(html).toContain("COSTUME IS MANDATORY");

      // Verify real Jaseph party details
      expect(html).toContain("DATE");
      expect(html).toContain("TIME");
      expect(html).toContain("VILLA");
      expect(html).toContain("LOCATION");
      expect(html).toContain("WHAT TO BRING");
      expect(html).toContain("Casa de Elvira");
      expect(html).toContain("October 1–2, 2026");
      expect(html).toContain("Thursday–Friday");
      expect(html).toContain("6:00 PM");
      expect(html).toContain("Alak");
      expect(html).toContain("Block 12, Lot 19 Mercury Street");
      expect(html).toContain("San Fernando, Pampanga");

      // Verify NO wedding language
      expect(html.toLowerCase()).not.toContain("wedding");
      expect(html.toLowerCase()).not.toContain("bridal");
      expect(html.toLowerCase()).not.toContain("groom");
      expect(html.toLowerCase()).not.toContain("ceremony");
      expect(html.toLowerCase()).not.toContain("save the date");
      expect(html.toLowerCase()).not.toContain("cordially invited");
      expect(html.toLowerCase()).not.toContain("together with their families");
    });
  });

  describe("Screen 2 — Zero-Shot / RollFinished State", () => {
    it("renders roll finished message and thanks the guest", () => {
      const html = renderToStaticMarkup(
        <RollFinished
          weddingName="Paul and Angelica"
          waitingCount={0}
          syncState="idle"
        />,
      );

      expect(html).toContain("Your roll is finished.");
      expect(html).toContain("Thanks for capturing the night");
      expect(html).toContain("All photos are uploaded and safe with the couple.");
    });

    it("renders waiting photos count if photos are pending upload", () => {
      const html = renderToStaticMarkup(
        <RollFinished
          weddingName="Paul and Angelica"
          waitingCount={3}
          syncState="waiting-for-connection"
        />,
      );

      expect(html).toContain("Your roll is finished.");
      expect(html).toContain("3 photos are waiting to upload.");
    });
  });

  describe("Synchronization & Network Status States", () => {
    it("renders 'All photos saved' in idle state", () => {
      const html = renderToStaticMarkup(
        <SyncStatusBar
          state="idle"
          offline={false}
          waitingCount={0}
          attentionCount={0}
        />,
      );
      expect(html).toContain("All photos saved");
    });

    it("renders uploading status with count", () => {
      const html = renderToStaticMarkup(
        <SyncStatusBar
          state="uploading"
          offline={false}
          waitingCount={2}
          attentionCount={0}
        />,
      );
      expect(html).toContain("Uploading photo…");
    });

    it("shows one-at-a-time manual queue progress", () => {
      const html = renderToStaticMarkup(<SyncStatusBar state="retrying" offline={false} waitingCount={3} attentionCount={0} progress={{ current: 2, total: 3 }} />);
      expect(html).toContain("Uploading 2 of 3…");
    });

    it("renders calm offline status without alarming errors", () => {
      const html = renderToStaticMarkup(
        <SyncStatusBar
          state="waiting-for-connection"
          offline={true}
          waitingCount={2}
          attentionCount={0}
        />,
      );
      expect(html).toContain("2 photos saved on this device • Waiting for connection");
    });

    it("renders needs-attention status when a photo fails", () => {
      const html = renderToStaticMarkup(
        <SyncStatusBar
          state="needs-attention"
          offline={false}
          waitingCount={1}
          attentionCount={1}
        />,
      );
      expect(html).toContain("1 photo couldn&#x27;t be uploaded");
    });

    it("uses calm retry-scheduled and active retry messages", () => {
      const scheduled = renderToStaticMarkup(<SyncStatusBar state="retry-scheduled" offline={false} waitingCount={1} attentionCount={0} retryableCount={1} onOpenAttention={() => {}} />);
      const retrying = renderToStaticMarkup(<SyncStatusBar state="retrying" offline={false} waitingCount={1} attentionCount={0} />);
      expect(scheduled).toContain("1 photo ready to upload");
      expect(scheduled).toContain("Upload Saved Photos");
      expect(retrying).toContain("Uploading photo…");
    });

    it("shows safe retryable diagnostics in the details modal", () => {
      const retryablePhoto: OfflinePhoto = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        cameraPassId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        image: new Blob(["photo"], { type: "image/jpeg" }),
        capturedAt: "2029-12-31T22:00:00.000Z",
        createdAt: "2029-12-31T22:00:00.000Z",
        width: 1200,
        height: 900,
        byteSize: 5,
        status: "failed",
        attempts: 1,
        failureKind: "retryable",
        failureStage: "cloudinary",
        failureMethod: "server-fallback",
        failureStatus: 408,
        failureCode: "request_timeout",
        lastError: "The upload request timed out and will be retried.",
      };
      const html = renderToStaticMarkup(
        <NeedsAttentionModal
          isOpen
          onClose={() => {}}
          failedPhotos={[retryablePhoto]}
          onRetry={async () => {}}
          syncState="retry-scheduled"
          offline={false}
          backendReachable
        />,
      );
      expect(html).toContain("Your photo is safe. Upload it when you&#x27;re ready.");
      expect(html).toContain("Stage: ");
      expect(html).toContain("cloudinary");
      expect(html).toContain("Method: ");
      expect(html).toContain("server-fallback");
      expect(html).toContain("Status: ");
      expect(html).toContain("408");
      expect(html).toContain("request_timeout");
      expect(html).toContain("The upload request timed out and will be retried.");
      expect(html).not.toContain("camera-token");
      expect(html).not.toContain("temporary-signature");
    });

    it("disables retry from actual sync and connectivity states", () => {
      expect(getRetryButtonState("uploading", false, true, false)).toMatchObject({ disabled: true, label: "Uploading…" });
      expect(getRetryButtonState("retrying", false, true, false)).toMatchObject({ disabled: true, label: "Retrying…" });
      expect(getRetryButtonState("idle", true, false, false)).toMatchObject({ disabled: true, label: "Waiting for connection…" });
      expect(getRetryButtonState("idle", false, true, false)).toMatchObject({ disabled: false, label: "Retry Upload" });
      expect(getRetryButtonState("idle", false, true, true).disabled).toBe(true);
      expect(getRetryButtonState("idle", false, true, false, true)).toMatchObject({ disabled: true, label: "Reopen camera link" });
    });

    it("requires the original camera link when the restored shell has no token", () => {
      const html = renderToStaticMarkup(
        <SyncStatusBar state="waiting-for-connection" offline={false} waitingCount={1} attentionCount={0} authenticationRequired />,
      );
      expect(html).toContain("Reopen your wedding camera link to upload");
    });
  });
});
