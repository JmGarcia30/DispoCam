"use client";

interface SavedJoin { version: 1; cameraToken: string }

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function joinStorageKey(inviteToken: string) {
  return `dispocam-join:${await fingerprint(inviteToken)}`;
}

export async function browserKeyStorageKey(inviteToken: string) {
  return `${await joinStorageKey(inviteToken)}:client`;
}

export async function getOrCreateJoinBrowserKey(inviteToken: string, storage: Storage = localStorage) {
  const key = await browserKeyStorageKey(inviteToken);
  const existing = storage.getItem(key);
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  storage.setItem(key, value);
  return value;
}

export async function saveJoinedCamera(inviteToken: string, cameraToken: string, storage: Storage = localStorage) {
  const saved: SavedJoin = { version: 1, cameraToken };
  storage.setItem(await joinStorageKey(inviteToken), JSON.stringify(saved));
  storage.removeItem(await browserKeyStorageKey(inviteToken));
}

export async function findReopenableCamera(
  inviteToken: string,
  storage: Storage = localStorage,
  fetcher: typeof fetch = fetch,
) {
  const key = await joinStorageKey(inviteToken);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as SavedJoin;
    if (saved.version !== 1 || typeof saved.cameraToken !== "string") throw new Error("invalid");
    const response = await fetcher(`/api/camera/${encodeURIComponent(saved.cameraToken)}`, { cache: "no-store" });
    if (response.ok) return saved.cameraToken;
    if (response.status !== 403 && response.status !== 404) return saved.cameraToken;
  } catch {
    // Offline/network failure: preserve the pass and let the existing offline camera shell handle it.
    try {
      const saved = JSON.parse(raw) as SavedJoin;
      if (saved.version === 1 && typeof saved.cameraToken === "string") return saved.cameraToken;
    } catch { /* handled below */ }
  }
  storage.removeItem(key);
  return null;
}
