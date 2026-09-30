"use client";

import { FormEvent, useState } from "react";
import { normalizeDisplayName } from "@/lib/camera/guest-name";

export { needsGuestName, normalizeDisplayName } from "@/lib/camera/guest-name";

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
    <main className="guest-name-step">
      <form className="guest-name-card keepsake-paper-texture" onSubmit={(event) => void submit(event)}>
        <h1>What should we call you?</h1>
        <input
          autoFocus
          autoComplete="name"
          maxLength={120}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Display name"
          aria-describedby="guest-name-help guest-name-error"
        />
        <p id="guest-name-help">Your name will only be shown to the couple with the photos you take.</p>
        {error && <p id="guest-name-error" role="alert">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Continue"}</button>
      </form>
    </main>
  );
}
