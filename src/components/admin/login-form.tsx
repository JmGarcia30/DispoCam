"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { adminDestination, signInAdmin } from "@/lib/admin/auth-flow";

export function AdminLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getSupabaseBrowserClient().auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/admin");
    }).catch(() => setError("Admin login is not configured."));
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await signInAdmin(getSupabaseBrowserClient().auth, String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      router.replace(adminDestination(search.get("next")));
    } catch {
      setError("Email or password is incorrect.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-login-card" onSubmit={(event) => void submit(event)}>
      <p className="admin-eyebrow">DispoCam</p>
      <h1>Admin sign in</h1>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
