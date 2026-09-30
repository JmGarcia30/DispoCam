"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/client";

interface InviteSettingsData { name: string; defaultShotLimit: number; joinEnabled: boolean; hasInvite: boolean; inviteExpiresAt: string | null }

export function InviteSettings({ weddingId, role }: { weddingId: string; role: string }) {
  const [settings, setSettings] = useState<InviteSettingsData | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = role === "owner" || role === "editor";
  async function load() { try { const payload = await (await adminFetch(`/api/admin/weddings/${weddingId}/invite`)).json(); setSettings(payload.data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Invite settings could not be loaded."); } }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [weddingId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function mutate(method: "POST" | "PATCH", body?: object) { setBusy(true); setError(null); try { const response = await adminFetch(`/api/admin/weddings/${weddingId}/invite`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); const payload = await response.json(); setSettings(payload.data); if (payload.data.joinPath) setJoinUrl(`${location.origin}${payload.data.joinPath}`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Invite settings could not be updated."); } finally { setBusy(false); } }
  if (!settings) return <div className="admin-state compact">Loading invite settings…</div>;
  return <section><div className="admin-section-heading"><div><h2>Wedding guest join link</h2><p>One private join URL can be encoded into the wedding QR code.</p></div></div>{error && <p className="admin-error">{error}</p>}<div className="admin-card admin-settings-grid"><label>Default shots<input type="number" min={1} max={1000} value={settings.defaultShotLimit} disabled={!canManage || busy} onChange={(event) => setSettings({ ...settings, defaultShotLimit: Number(event.target.value) })} /></label><label>Invite expiration<input type="datetime-local" disabled={!canManage || busy} value={settings.inviteExpiresAt ? settings.inviteExpiresAt.slice(0,16) : ""} onChange={(event) => setSettings({ ...settings, inviteExpiresAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>{canManage && <div className="admin-settings-actions"><button className="admin-button secondary" disabled={busy} onClick={() => void mutate("PATCH", { defaultShotLimit: settings.defaultShotLimit, inviteExpiresAt: settings.inviteExpiresAt })}>Save settings</button><button className="admin-button secondary" disabled={busy || !settings.hasInvite} onClick={() => void mutate("PATCH", { joinEnabled: !settings.joinEnabled })}>{settings.joinEnabled ? "Disable join link" : "Enable join link"}</button><button className="admin-button" disabled={busy} onClick={() => { if (!settings.hasInvite || window.confirm("Generate a new invite? The previous join URL will stop working.")) void mutate("POST"); }}>{settings.hasInvite ? "Rotate join URL" : "Create join URL"}</button></div>}{settings.hasInvite && !joinUrl && <p>The invite exists. Its raw token is not stored, so rotate it to display a new URL.</p>}{joinUrl && <div className="admin-join-url"><strong>Copy this URL now:</strong><code>{joinUrl}</code><button className="admin-button secondary" onClick={() => void navigator.clipboard.writeText(joinUrl)}>Copy</button></div>}</div></section>;
}
