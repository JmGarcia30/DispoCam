"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { unauthenticatedAdminRedirect } from "@/lib/admin/auth-flow";

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    void client.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace(unauthenticatedAdminRedirect(pathname));
      else setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/admin/login");
    });
    return () => data.subscription.unsubscribe();
  }, [pathname, router]);

  if (!ready) return <div className="admin-state">Loading admin…</div>;
  return <>{children}</>;
}
