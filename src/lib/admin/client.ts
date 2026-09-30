"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export async function getAdminAccessToken(): Promise<string> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your admin session has expired. Please sign in again.");
  return token;
}

export async function adminFetch(path: string, init: RequestInit = {}) {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? "The admin request could not be completed.");
  }
  return response;
}
