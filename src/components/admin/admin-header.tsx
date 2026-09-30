"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AdminHeader() {
  const router = useRouter();
  return (
    <header className="admin-header">
      <Link href="/admin" className="admin-brand">DispoCam Admin</Link>
      <button type="button" className="admin-button secondary" onClick={async () => {
        await getSupabaseBrowserClient().auth.signOut();
        router.replace("/admin/login");
      }}>Sign out</button>
    </header>
  );
}
