"use client";

/* eslint-disable @next/next/no-img-element -- Cloudinary source URLs are dynamic admin content. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/client";
import { PhotoGallery } from "@/components/admin/photo-gallery";
import { GuestList, type AdminGuest } from "@/components/admin/guest-list";
import { InviteSettings } from "@/components/admin/invite-settings";

interface DashboardData { wedding: { id: string; name: string; event_date: string | null }; role: string; stats: { totalGuests: number; totalPhotos: number; totalShotsUsed: number; totalShotCapacity: number; remainingShotCapacity: number; activeCameraPasses: number }; recentUploads: Array<{ id: string; secure_url: string; guest_name: string | null; uploaded_at: string }> }

export function WeddingDashboard({ weddingId }: { weddingId: string }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [tab, setTab] = useState<"overview" | "photos" | "guests" | "settings">("overview");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [dashboardPayload, guestPayload] = await Promise.all([
        adminFetch(`/api/admin/weddings/${weddingId}/dashboard`).then((r) => r.json()),
        adminFetch(`/api/admin/weddings/${weddingId}/guests`).then((r) => r.json()),
      ]);
      setDashboard(dashboardPayload.data); setGuests(guestPayload.data); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Wedding dashboard could not be loaded."); }
  }, [weddingId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (error) return <div className="admin-state error"><h1>Unable to open wedding</h1><p>{error}</p><Link href="/admin">Back to weddings</Link></div>;
  if (!dashboard) return <div className="admin-state">Loading wedding dashboard…</div>;
  const stats = dashboard.stats;
  return <main className="admin-page"><div className="admin-title-row"><div><Link href="/admin">← Weddings</Link><h1>{dashboard.wedding.name}</h1><p>{dashboard.wedding.event_date || "Wedding date not set"} · {dashboard.role}</p></div><span className="admin-badge active">Receiving photos</span></div><nav className="admin-tabs" aria-label="Wedding dashboard sections">{(["overview","photos","guests","settings"] as const).map((item) => <button className={tab === item ? "selected" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>{tab === "overview" && <><div className="admin-metric-grid">{[["Guests",stats.totalGuests],["Photos",stats.totalPhotos],["Shots used",stats.totalShotsUsed],["Shot capacity",stats.totalShotCapacity],["Remaining",stats.remainingShotCapacity],["Active passes",stats.activeCameraPasses]].map(([label,value]) => <article className="admin-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><section><div className="admin-section-heading"><div><h2>Recent uploads</h2><p>Use this to verify photos are arriving.</p></div><button className="admin-button secondary" onClick={() => void load()}>Refresh</button></div>{dashboard.recentUploads.length ? <div className="admin-recent-grid">{dashboard.recentUploads.map((photo) => <article key={photo.id}><img src={photo.secure_url} alt="Recent guest upload" /><strong>{photo.guest_name || "Unnamed Guest"}</strong><small>{new Date(photo.uploaded_at).toLocaleString()}</small></article>)}</div> : <div className="admin-empty">No guest photos yet.</div>}</section></>}{tab === "photos" && <PhotoGallery weddingId={weddingId} guests={guests} />}{tab === "guests" && <GuestList weddingId={weddingId} initialGuests={guests} role={dashboard.role} onChanged={load} />}{tab === "settings" && <InviteSettings weddingId={weddingId} role={dashboard.role} onDataCleared={load} />}</main>;
}
