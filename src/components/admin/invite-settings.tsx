"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { adminFetch } from "@/lib/admin/client";
import { createJoinQrDataUrl, eventQrFilename } from "@/lib/admin/join-qr";

interface InviteSettingsData {
  name: string;
  defaultShotLimit: number;
  joinEnabled: boolean;
  hasInvite: boolean;
  inviteExpiresAt: string | null;
}

export function InviteSettings({ weddingId, role }: { weddingId: string; role: string }) {
  const [settings, setSettings] = useState<InviteSettingsData | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [qrResult, setQrResult] = useState<{ joinUrl: string; dataUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = role === "owner" || role === "editor";
  const qrDataUrl = qrResult?.joinUrl === joinUrl ? qrResult.dataUrl : null;

  async function load() {
    try {
      const response = await adminFetch(`/api/admin/weddings/${weddingId}/invite`);
      const payload = await response.json();
      setSettings(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invite settings could not be loaded.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // The wedding ID is the only load dependency.
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

  async function mutate(method: "POST" | "PATCH", body?: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/weddings/${weddingId}/invite`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Invite settings could not be updated.");
      setSettings(payload.data);
      if (payload.data.joinUrl) setJoinUrl(payload.data.joinUrl);
      else if (method === "POST") setJoinUrl(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invite settings could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function copyJoinUrl() {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("The link could not be copied. Select and copy the URL below.");
    }
  }

  if (!settings) return <div className="admin-state compact">Loading invite settings…</div>;

  return (
    <section>
      <div className="admin-section-heading">
        <div><h2>Event Settings</h2><p>Manage the join link and QR code for {settings.name}.</p></div>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-card admin-settings-grid">
        <label>
          Default shots
          <input
            type="number" min={1} max={1000} value={settings.defaultShotLimit}
            disabled={!canManage || busy}
            onChange={(event) => setSettings({ ...settings, defaultShotLimit: Number(event.target.value) })}
          />
        </label>
        <label>
          Invite expiration
          <input
            type="datetime-local" disabled={!canManage || busy}
            value={settings.inviteExpiresAt ? settings.inviteExpiresAt.slice(0, 16) : ""}
            onChange={(event) => setSettings({ ...settings, inviteExpiresAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
          />
        </label>
        {canManage && (
          <div className="admin-settings-actions">
            <button className="admin-button secondary" disabled={busy} onClick={() => void mutate("PATCH", { defaultShotLimit: settings.defaultShotLimit, inviteExpiresAt: settings.inviteExpiresAt })}>Save settings</button>
            <button className="admin-button secondary" disabled={busy || !settings.hasInvite} onClick={() => void mutate("PATCH", { joinEnabled: !settings.joinEnabled })}>{settings.joinEnabled ? "Disable join link" : "Enable join link"}</button>
            <button className="admin-button" disabled={busy} onClick={() => { if (!settings.hasInvite || window.confirm("Generate a new invite? The previous join URL will stop working.")) void mutate("POST"); }}>{settings.hasInvite ? "Rotate join URL" : "Create join URL"}</button>
          </div>
        )}
        {settings.hasInvite && !joinUrl && (
          <p>The invite exists. Its raw token is not stored, so rotate it to display a new URL and QR code.</p>
        )}
        {joinUrl && (
          <div className="admin-join-tools">
            <div className="admin-join-url">
              <strong>Join Link</strong>
              <code aria-label="Full production join URL">{joinUrl}</code>
              <button className="admin-button secondary" type="button" onClick={() => void copyJoinUrl()}>{copied ? "Copied" : "Copy Link"}</button>
            </div>
            <div className="admin-qr-panel">
              <strong>QR Code</strong>
              {qrDataUrl ? <Image src={qrDataUrl} alt="QR code for the exact join link shown above" width={240} height={240} unoptimized /> : <span>Generating QR code…</span>}
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
    </section>
  );
}
