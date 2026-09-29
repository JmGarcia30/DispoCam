import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfflinePage from "@/app/offline/page";

describe("offline fallback", () => {
  it("explains that the camera must first be opened online", () => {
    const html = renderToStaticMarkup(<OfflinePage />);
    expect(html).toContain("offline");
    expect(html).toContain("opened once while connected");
    expect(html).toContain("QR code");
  });
});
