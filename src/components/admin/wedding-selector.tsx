"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/admin/client";

type Membership = { role: "owner" | "editor" | "viewer"; weddings: { id: string; name: string; event_date: string | null } | null };

export function WeddingSelector() {
  const router = useRouter();
  const [items, setItems] = useState<Membership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void adminFetch("/api/admin/weddings").then((response) => response.json()).then((payload) => {
    const memberships = (payload.data as Membership[]).filter((item) => item.weddings);
    if (memberships.length === 1) router.replace(`/admin/weddings/${memberships[0].weddings!.id}`);
    else setItems(memberships);
  }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load weddings.")); }, [router]);
  if (error) return <div className="admin-state error">{error}</div>;
  if (!items) return <div className="admin-state">Loading weddings…</div>;
  if (!items.length) return <div className="admin-state"><h1>No authorized weddings</h1><p>Ask the wedding owner to add your account.</p></div>;
  return <section className="admin-page"><h1>Your weddings</h1><div className="admin-selector-grid">{items.map((item) => <Link className="admin-card" href={`/admin/weddings/${item.weddings!.id}`} key={item.weddings!.id}><h2>{item.weddings!.name}</h2><p>{item.weddings!.event_date ?? "Date not set"} · {item.role}</p></Link>)}</div></section>;
}
