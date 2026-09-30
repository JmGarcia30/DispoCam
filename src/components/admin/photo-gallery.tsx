"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/client";

export interface AdminPhoto {
  id: string; guest_id: string; secure_url: string; width: number; height: number;
  captured_at: string; uploaded_at: string; guest_name: string | null;
}

function PhotoImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="admin-image-failed" role="img" aria-label={alt}>Image unavailable</div>;
  // Cloudinary source dimensions and URLs are dynamic admin content.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function PhotoCards({ photos, onSelect = () => {} }: { photos: AdminPhoto[]; onSelect?: (photo: AdminPhoto) => void }) {
  if (!photos.length) return <div className="admin-empty">No guest photos yet.</div>;
  return <div className="admin-photo-grid">{photos.map((photo) => <button className="admin-photo-card" key={photo.id} onClick={() => onSelect(photo)}><PhotoImage src={photo.secure_url} alt={`Photo taken by ${photo.guest_name || "Unnamed Guest"}`} /><span><strong>Taken by: {photo.guest_name || "Unnamed Guest"}</strong><small>Captured: {new Date(photo.captured_at).toLocaleString()}</small></span></button>)}</div>;
}

export function PhotoGallery({ weddingId, guests }: { weddingId: string; guests: Array<{ id: string; display_name: string | null }> }) {
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [guestId, setGuestId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<AdminPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(append = false) {
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ limit: "30" });
      if (guestId) query.set("guestId", guestId);
      if (append && cursor) query.set("cursor", cursor);
      const payload = await (await adminFetch(`/api/admin/weddings/${weddingId}/photos?${query}`)).json();
      setPhotos((current) => append ? [...current, ...payload.data] : payload.data);
      setCursor(payload.meta.nextCursor); setHasMore(payload.meta.hasMore);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Photos could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(timer);
  }, [guestId, weddingId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function download(photo: AdminPhoto) {
    try {
      const response = await adminFetch(`/api/admin/weddings/${weddingId}/photos/${photo.id}/download`);
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "wedding-photo.jpg";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Download failed."); }
  }

  return <section aria-labelledby="photos-title">
    <div className="admin-section-heading"><div><h2 id="photos-title">Guest photos</h2><p>Newest uploads first.</p></div><label>Guest<select value={guestId} onChange={(event) => setGuestId(event.target.value)}><option value="">All guests</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.display_name || "Unnamed Guest"}</option>)}</select></label></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {(!loading || photos.length > 0) && <PhotoCards photos={photos} onSelect={setSelected} />}
    {loading && <div className="admin-state compact">Loading photos…</div>}
    {hasMore && !loading && <button className="admin-button secondary load-more" onClick={() => void load(true)}>Load more</button>}
    {selected && <div className="admin-modal-backdrop" role="presentation" onClick={() => setSelected(null)}><div className="admin-photo-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" aria-label="Close photo viewer" onClick={() => setSelected(null)}>×</button><PhotoImage src={selected.secure_url} alt={`Full photo taken by ${selected.guest_name || "Unnamed Guest"}`} /><div><h2>{selected.guest_name || "Unnamed Guest"}</h2><p>Captured: {new Date(selected.captured_at).toLocaleString()}</p><p>Uploaded: {new Date(selected.uploaded_at).toLocaleString()}</p><button className="admin-button" onClick={() => void download(selected)}>Download photo</button></div></div></div>}
  </section>;
}
