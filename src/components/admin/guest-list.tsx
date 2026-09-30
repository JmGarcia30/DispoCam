"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/admin/client";

export interface AdminPass { id: string; shot_limit: number; shots_used: number; shots_remaining: number; is_active: boolean; expires_at: string | null }
export interface AdminGuest { id: string; display_name: string | null; last_activity: string | null; passes: AdminPass[] }

export function GuestList({ weddingId, initialGuests, role, onChanged }: { weddingId: string; initialGuests: AdminGuest[]; role: string; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = role === "owner" || role === "editor";

  async function patch(passId: string, body: object) {
    setBusy(passId); setError(null);
    try { await adminFetch(`/api/admin/weddings/${weddingId}/camera-passes/${passId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Pass could not be updated."); }
    finally { setBusy(null); }
  }

  async function reset(passId: string, mode: "shot_count" | "full") {
    const message = mode === "full" ? "Full reset deletes this pass's server photo records and upload intents. It does not clear photos queued in the guest device's IndexedDB. Continue?" : "Reset the server shot count? Locally queued photos remain on the guest device.";
    if (!window.confirm(message)) return;
    setBusy(passId); setError(null);
    try { await adminFetch(`/api/admin/weddings/${weddingId}/camera-passes/${passId}/test-reset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, deleteCloudinaryAssets: false, confirmation: "RESET TEST CAMERA PASS" }) }); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Test reset failed."); }
    finally { setBusy(null); }
  }

  if (!initialGuests.length) return <div className="admin-empty">No guests yet.</div>;
  return <section><div className="admin-section-heading"><div><h2>Guests and camera passes</h2><p>Grant extra shots for real guests. Reset is for testing only.</p></div></div>{error && <p className="admin-error">{error}</p>}<div className="admin-guest-list">{initialGuests.map((guest) => <article className="admin-card" key={guest.id}><div className="admin-guest-heading"><div><h3>{guest.display_name || "Unnamed Guest"}</h3><p>Last activity: {guest.last_activity ? new Date(guest.last_activity).toLocaleString() : "None yet"}</p></div></div>{guest.passes.length ? guest.passes.map((pass) => <div className="admin-pass" key={pass.id}><div className="admin-pass-stats"><span className={`admin-badge ${pass.is_active ? "active" : "inactive"}`}>{pass.is_active ? "Active" : "Inactive"}</span><strong>{pass.shots_used} / {pass.shot_limit} used</strong><span>{pass.shots_remaining} remaining</span></div>{canManage && <div className="admin-pass-actions"><span>Grant:</span>{[1,5,10].map((amount) => <button key={amount} disabled={busy === pass.id} onClick={() => void patch(pass.id, { grantShots: amount })}>+{amount}</button>)}<button disabled={busy === pass.id} onClick={() => void patch(pass.id, { isActive: !pass.is_active })}>{pass.is_active ? "Deactivate" : "Reactivate"}</button><details><summary>Testing / Development</summary><p>Server reset does not clear the guest device’s local IndexedDB queue.</p><button disabled={busy === pass.id} onClick={() => void reset(pass.id, "shot_count")}>Reset shot count</button><button className="danger" disabled={busy === pass.id} onClick={() => void reset(pass.id, "full")}>Full test reset</button></details></div>}</div>) : <p>No camera pass assigned.</p>}</article>)}</div></section>;
}
