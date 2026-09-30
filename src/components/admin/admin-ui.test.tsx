import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoCards, type AdminPhoto } from "@/components/admin/photo-gallery";
import { GuestList, type AdminGuest } from "@/components/admin/guest-list";

const photo: AdminPhoto = {
  id: "photo", guest_id: "guest", secure_url: "https://example.com/photo.jpg", width: 1200, height: 900,
  captured_at: "2026-11-19T21:42:00.000Z", uploaded_at: "2026-11-19T21:43:00.000Z", guest_name: "Miguel Garcia",
};

describe("admin photo gallery", () => {
  it("renders real photo attribution", () => {
    const html = renderToStaticMarkup(<PhotoCards photos={[photo]} />);
    expect(html).toContain("https://example.com/photo.jpg");
    expect(html).toContain("Taken by: Miguel Garcia");
    expect(html).toContain("Captured:");
  });

  it("renders the empty gallery state", () => {
    expect(renderToStaticMarkup(<PhotoCards photos={[]} />)).toContain("No guest photos yet.");
  });
});

describe("admin guest list", () => {
  const guests: AdminGuest[] = [{ id: "guest", display_name: null, last_activity: null, passes: [{ id: "pass", shot_limit: 10, shots_used: 4, shots_remaining: 6, is_active: true, expires_at: null }] }];
  it("shows guest shot counts and unnamed fallback", () => {
    const html = renderToStaticMarkup(<GuestList weddingId="wedding" initialGuests={guests} role="owner" onChanged={async () => {}} />);
    expect(html).toContain("Unnamed Guest"); expect(html).toContain("4 / 10 used"); expect(html).toContain("6 remaining");
    expect(html).toContain("+5"); expect(html).toContain("Testing / Development");
  });

  it("shows a newly self-service joined guest with their issued pass", () => {
    const joined: AdminGuest[] = [{
      id: "joined-guest", display_name: "Miguel Garcia", last_activity: null,
      passes: [{ id: "joined-pass", shot_limit: 10, shots_used: 0, shots_remaining: 10, is_active: true, expires_at: null }],
    }];
    const html = renderToStaticMarkup(<GuestList weddingId="wedding" initialGuests={joined} role="viewer" onChanged={async () => {}} />);
    expect(html).toContain("Miguel Garcia");
    expect(html).toContain("0 / 10 used");
    expect(html).toContain("10 remaining");
  });

  it("keeps viewer role read-only", () => {
    const html = renderToStaticMarkup(<GuestList weddingId="wedding" initialGuests={guests} role="viewer" onChanged={async () => {}} />);
    expect(html).not.toContain("Grant:"); expect(html).not.toContain("Deactivate"); expect(html).not.toContain("Full test reset");
  });
});
