"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { adminFetch } from "@/lib/admin/client";
import { createJoinQrDataUrl, eventQrFilename } from "@/lib/admin/join-qr";

export interface InviteSettingsData {
  name: string;
  defaultShotLimit: number;
  joinEnabled: boolean;
  hasInvite: boolean;
  inviteExpiresAt: string | null;
  joinUrl?: string | null;
}

type CleanupAction = "clear_photos" | "clear_guests" | "full_reset";

const CLEANUP_CONFIGS: Record<CleanupAction, {
  title: string;
  confirmationPhrase: string;
  description: string;
  buttonLabel: string;
}> = {
  clear_photos: {
    title: "Clear Birthday Test Photos",
    confirmationPhrase: "CLEAR TEST PHOTOS",
    description: "This will remove all test photo database records and reset camera pass shot counts for this event only. Test guests and camera passes will NOT be deleted.",
    buttonLabel: "Clear Test Photos",
  },
  clear_guests: {
    title: "Clear Birthday Test Guests",
    confirmationPhrase: "CLEAR TEST GUESTS",
    description: "This will permanently remove all test guests, their camera passes, and their photo records for this event only. The event settings and invite link will remain active.",
    buttonLabel: "Clear Test Guests",
  },
  full_reset: {
    title: "Reset Birthday Event Data",
    confirmationPhrase: "RESET EVENT DATA",
    description: "This will perform a full test reset: clearing all test guests, camera passes, photo records, and test join tokens for this event. Event settings, invite link, and QR code will NOT be changed.",
    buttonLabel: "Reset Event Data",
  },
};

export function InviteSettings({
  weddingId,
  role,
  initialSettings,
  onDataCleared,
}: {
  weddingId: string;
  role: string;
  initialSettings?: InviteSettingsData;
  onDataCleared?: () => void;
}) {
  const [settings, setSettings] = useState<InviteSettingsData | null>(initialSettings ?? null);
  const [joinUrl, setJoinUrl] = useState<string | null>(() => {
    if (initialSettings?.joinUrl) return initialSettings.joinUrl;
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
      return window.localStorage.getItem(`dispocam_invite_url_${weddingId}`);
    } catch {
      return null;
    }
  });
  const [qrResult, setQrResult] = useState<{ joinUrl: string; dataUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal states
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [activeCleanup, setActiveCleanup] = useState<CleanupAction | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [deleteCloudinary, setDeleteCloudinary] = useState(false);

  const canManage = role === "owner" || role === "editor";
  const qrDataUrl = qrResult?.joinUrl === joinUrl ? qrResult.dataUrl : null;

  async function load() {
    try {
      const response = await adminFetch(`/api/admin/weddings/${weddingId}/invite`);
      const payload = await response.json();
      setSettings(payload.data);
      if (payload.data?.joinUrl) {
        setJoinUrl(payload.data.joinUrl);
        try {
          window.localStorage?.setItem(`dispocam_invite_url_${weddingId}`, payload.data.joinUrl);
        } catch {
          // Ignore localStorage write failures
        }
      } else if (payload.data?.hasInvite === false) {
        setJoinUrl(null);
        try {
          window.localStorage?.removeItem(`dispocam_invite_url_${weddingId}`);
        } catch {
          // Ignore localStorage removal failures
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invite settings could not be loaded.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weddingId]);

  useEffect(() => {
    let active = true;
    if (joinUrl) {
      void createJoinQrDataUrl(joinUrl)
        .then((dataUrl) => { if (active) setQrResult({ joinUrl, dataUrl }); })
        .catch(() => { if (active) setError("The QR code could not be generated."); });
    }
    return () => { active = false; };
  }, [joinUrl]);

  async function updateSettings(body: object) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await adminFetch(`/api/admin/weddings/${weddingId}/invite`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Invite settings could not be updated.");
      setSettings(payload.data);
      if (payload.data.joinUrl) {
        setJoinUrl(payload.data.joinUrl);
        try {
          localStorage.setItem(`dispocam_invite_url_${weddingId}`, payload.data.joinUrl);
        } catch {}
      }
      setSuccess("Settings updated successfully.");
      window.setTimeout(() => setSuccess(null), 3000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invite settings could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function generateInvite() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setShowRegenerateModal(false);
    try {
      const response = await adminFetch(`/api/admin/weddings/${weddingId}/invite`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Invite could not be generated.");
      setSettings(payload.data);
      if (payload.data.joinUrl) {
        setJoinUrl(payload.data.joinUrl);
        try {
          localStorage.setItem(`dispocam_invite_url_${weddingId}`, payload.data.joinUrl);
        } catch {}
      }
      setSuccess("New invite link generated successfully.");
      window.setTimeout(() => setSuccess(null), 3000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invite could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function copyJoinUrl() {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("The link could not be copied. Select and copy the URL below.");
    }
  }

  async function executeCleanup() {
    if (!activeCleanup) return;
    const config = CLEANUP_CONFIGS[activeCleanup];
    if (confirmationText.trim().toUpperCase() !== config.confirmationPhrase) {
      setError(`Please type "${config.confirmationPhrase}" to confirm.`);
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await adminFetch(`/api/admin/weddings/${weddingId}/test-cleanup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: activeCleanup,
          deleteCloudinaryAssets: deleteCloudinary,
          confirmation: confirmationText.trim().toUpperCase(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Cleanup failed.");
      
      const details = payload.data;
      let msg = "Cleanup complete.";
      if (activeCleanup === "clear_photos") {
        msg = `Cleared ${details.photosRemoved} test photos. Camera pass counters reset.`;
      } else if (activeCleanup === "clear_guests") {
        msg = `Cleared ${details.guestsRemoved} test guests and ${details.passesRemoved} camera passes.`;
      } else if (activeCleanup === "full_reset") {
        msg = `Reset complete: removed ${details.guestsRemoved} test guests, ${details.photosRemoved} photos, and test join tokens. Event settings & invite link preserved.`;
      }

      setSuccess(msg);
      setActiveCleanup(null);
      setConfirmationText("");
      setDeleteCloudinary(false);
      await load();
      if (onDataCleared) onDataCleared();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cleanup failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <div className="admin-state compact">Loading invite settings…</div>;

  const currentCleanupConfig = activeCleanup ? CLEANUP_CONFIGS[activeCleanup] : null;

  return (
    <section>
      <div className="admin-section-heading">
        <div>
          <h2>Event Settings &amp; Invite</h2>
          <p>Manage the join link, QR code, and test data for {settings.name}.</p>
        </div>
      </div>

      {error && <p className="admin-error" role="alert" style={{ marginBottom: "16px" }}>{error}</p>}
      {success && (
        <p
          role="status"
          style={{
            marginBottom: "16px",
            padding: "10px 14px",
            borderRadius: "7px",
            backgroundColor: "#E0F3E6",
            color: "#1E5832",
            fontWeight: 600,
          }}
        >
          {success}
        </p>
      )}

      {/* SECTION 1: Event Configuration */}
      <div className="admin-card admin-settings-grid" style={{ marginBottom: "24px" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: "18px" }}>Configuration</h3>
        <label>
          Default shots per pass
          <input
            type="number"
            min={1}
            max={1000}
            value={settings.defaultShotLimit}
            disabled={!canManage || busy}
            onChange={(event) => setSettings({ ...settings, defaultShotLimit: Number(event.target.value) })}
          />
        </label>
        <label>
          Invite expiration
          <input
            type="datetime-local"
            disabled={!canManage || busy}
            value={settings.inviteExpiresAt ? settings.inviteExpiresAt.slice(0, 16) : ""}
            onChange={(event) =>
              setSettings({
                ...settings,
                inviteExpiresAt: event.target.value ? new Date(event.target.value).toISOString() : null,
              })
            }
          />
        </label>
        {canManage && (
          <div className="admin-settings-actions">
            <button
              className="admin-button secondary"
              disabled={busy}
              onClick={() => void updateSettings({ defaultShotLimit: settings.defaultShotLimit, inviteExpiresAt: settings.inviteExpiresAt })}
            >
              Save settings
            </button>
            <button
              className="admin-button secondary"
              disabled={busy || !settings.hasInvite}
              onClick={() => void updateSettings({ joinEnabled: !settings.joinEnabled })}
            >
              {settings.joinEnabled ? "Disable join link" : "Enable join link"}
            </button>
          </div>
        )}
      </div>

      {/* SECTION 2: Invite Link & QR Code */}
      <div className="admin-card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px" }}>Invite &amp; QR Code</h3>
            <p style={{ margin: "4px 0 0", color: "#6C6B66", fontSize: "13px" }}>
              Guests scan this QR or open the link to join and receive their camera pass.
            </p>
          </div>
          <span
            className={`admin-badge ${settings.joinEnabled ? "active" : "inactive"}`}
            style={{ alignSelf: "flex-start" }}
          >
            {settings.joinEnabled ? "Join Enabled" : "Join Disabled"}
          </span>
        </div>

        {!joinUrl && (
          <div style={{ padding: "18px 0" }}>
            <p style={{ color: "#6C6B66", marginBottom: "14px", fontSize: "14px" }}>
              No invite link is currently displayed. Generate one to start accepting guests.
            </p>
            {canManage && (
              <button
                className="admin-button"
                type="button"
                disabled={busy}
                onClick={() => void generateInvite()}
              >
                Create Invite Link
              </button>
            )}
          </div>
        )}

        {joinUrl && (
          <div className="admin-join-tools" style={{ marginTop: "12px" }}>
            <div className="admin-join-url">
              <strong style={{ fontSize: "14px" }}>Invite Link</strong>
              <code aria-label="Full production join URL" style={{ wordBreak: "break-all", padding: "10px", borderRadius: "6px", backgroundColor: "#EBE9E1" }}>
                {joinUrl}
              </code>
              <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => void copyJoinUrl()}
                >
                  {copied ? "Copied Link ✓" : "Copy Link"}
                </button>
                {canManage && (
                  <button
                    className="admin-button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setShowRegenerateModal(true)}
                  >
                    Regenerate Invite Link
                  </button>
                )}
              </div>
            </div>

            <div className="admin-qr-panel">
              <strong style={{ fontSize: "14px" }}>QR Code</strong>
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt="QR code for the exact join link shown above"
                  width={240}
                  height={240}
                  unoptimized
                />
              ) : (
                <span>Generating QR code…</span>
              )}
              <button
                className="admin-button secondary"
                type="button"
                disabled={!qrDataUrl}
                onClick={() => {
                  if (!qrDataUrl) return;
                  const link = document.createElement("a");
                  link.href = qrDataUrl;
                  link.download = eventQrFilename(settings.name);
                  link.click();
                }}
              >
                Download QR
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Test Data Cleanup (Clearly separated) */}
      {canManage && (
        <div
          className="admin-card"
          style={{
            border: "1px solid #D8C3BE",
            backgroundColor: "#FAF7F6",
            padding: "24px",
          }}
        >
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#8E1D16" }}>Test Data Cleanup</h3>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#FCEBE9",
                  color: "#9E231B",
                }}
              >
                Event Scoped
              </span>
            </div>
            <p style={{ margin: "6px 0 0", color: "#6C6B66", fontSize: "13px" }}>
              Safely clean up test data before the real event. These operations only affect <strong>{settings.name}</strong> and never affect other events or your invite link.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <button
              className="admin-button secondary"
              type="button"
              disabled={busy}
              style={{ color: "#8E1D16", borderColor: "#D8C3BE" }}
              onClick={() => {
                setActiveCleanup("clear_photos");
                setConfirmationText("");
                setDeleteCloudinary(false);
              }}
            >
              Clear Test Photos
            </button>

            <button
              className="admin-button secondary"
              type="button"
              disabled={busy}
              style={{ color: "#8E1D16", borderColor: "#D8C3BE" }}
              onClick={() => {
                setActiveCleanup("clear_guests");
                setConfirmationText("");
                setDeleteCloudinary(false);
              }}
            >
              Clear Test Guests
            </button>

            <button
              className="admin-button"
              type="button"
              disabled={busy}
              style={{ backgroundColor: "#8E1D16", borderColor: "#8E1D16", color: "white" }}
              onClick={() => {
                setActiveCleanup("full_reset");
                setConfirmationText("");
                setDeleteCloudinary(false);
              }}
            >
              Reset Birthday Event Data
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: Regenerate Invite Link */}
      {showRegenerateModal && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="regen-title">
          <div className="admin-card" style={{ width: "min(100%, 460px)", padding: "28px" }}>
            <h3 id="regen-title" style={{ margin: "0 0 12px", color: "#8E1D16" }}>
              Regenerate Invite Link?
            </h3>
            <p style={{ fontSize: "14px", lineHeight: "1.5", color: "#444", marginBottom: "18px" }}>
              Generating a new invite link will <strong>immediately deactivate the old link and QR code</strong>. Any guest attempting to join with the old link will be rejected.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                className="admin-button secondary"
                type="button"
                disabled={busy}
                onClick={() => setShowRegenerateModal(false)}
              >
                Cancel
              </button>
              <button
                className="admin-button"
                type="button"
                disabled={busy}
                style={{ backgroundColor: "#8E1D16", borderColor: "#8E1D16", color: "white" }}
                onClick={() => void generateInvite()}
              >
                {busy ? "Regenerating…" : "Confirm &amp; Regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: Test Data Cleanup */}
      {activeCleanup && currentCleanupConfig && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cleanup-title">
          <div className="admin-card" style={{ width: "min(100%, 500px)", padding: "28px" }}>
            <h3 id="cleanup-title" style={{ margin: "0 0 12px", color: "#8E1D16" }}>
              {currentCleanupConfig.title}
            </h3>
            <p style={{ fontSize: "14px", lineHeight: "1.5", color: "#444", marginBottom: "16px" }}>
              {currentCleanupConfig.description}
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", margin: "14px 0", fontSize: "13px", color: "#444" }}>
              <input
                type="checkbox"
                checked={deleteCloudinary}
                onChange={(e) => setDeleteCloudinary(e.target.checked)}
              />
              Also delete matching Cloudinary image files
            </label>

            <div style={{ margin: "16px 0" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                Type <code style={{ backgroundColor: "#FCEBE9", color: "#9E231B", padding: "2px 6px", borderRadius: "4px" }}>{currentCleanupConfig.confirmationPhrase}</code> to confirm:
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={currentCleanupConfig.confirmationPhrase}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #CCC", fontSize: "14px", boxSizing: "border-box" }}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                className="admin-button secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setActiveCleanup(null);
                  setConfirmationText("");
                  setDeleteCloudinary(false);
                }}
              >
                Cancel
              </button>
              <button
                className="admin-button"
                type="button"
                disabled={busy || confirmationText.trim().toUpperCase() !== currentCleanupConfig.confirmationPhrase}
                style={{
                  backgroundColor: confirmationText.trim().toUpperCase() === currentCleanupConfig.confirmationPhrase ? "#8E1D16" : "#CCC",
                  borderColor: confirmationText.trim().toUpperCase() === currentCleanupConfig.confirmationPhrase ? "#8E1D16" : "#CCC",
                  color: "white",
                  cursor: confirmationText.trim().toUpperCase() === currentCleanupConfig.confirmationPhrase ? "pointer" : "not-allowed",
                }}
                onClick={() => void executeCleanup()}
              >
                {busy ? "Processing…" : currentCleanupConfig.buttonLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
