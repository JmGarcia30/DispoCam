"use client";

import { FormEvent, useEffect, useState } from "react";
import { normalizeDisplayName } from "@/lib/camera/guest-name";
import { findReopenableCamera, getOrCreateJoinBrowserKey, saveJoinedCamera } from "@/lib/join/browser";

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
        if (!response.ok) throw new Error(payload?.error?.message ?? "Wedding invite not found.");
        if (active) setWeddingName(payload.data.weddingName);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Wedding invite not found.");
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

  if (loading) return <main className="join-page"><div className="join-card keepsake-paper-texture"><p>Opening wedding invitation…</p></div></main>;
  if (!weddingName) return <main className="join-page"><div className="join-card keepsake-paper-texture"><h1>Invitation unavailable</h1><p className="join-error">{error}</p></div></main>;
  return <main className="join-page"><form className="join-card keepsake-paper-texture" onSubmit={(event) => void submit(event)}><p className="join-eyebrow">Wedding camera</p><h1>{weddingName}</h1><h2>What should we call you?</h2><input autoFocus autoComplete="name" maxLength={120} aria-label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><p>Your name will only be shown to the couple with the photos you take.</p>{error && <p className="join-error" role="alert">{error}</p>}<button type="submit" disabled={joining}>{joining ? "Creating your camera…" : "Continue"}</button></form></main>;
}
