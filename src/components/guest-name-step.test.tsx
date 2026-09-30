import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestNameStep, needsGuestName, normalizeDisplayName } from "@/components/guest-name-step";

describe("guest name step", () => {
  it("prompts an unnamed guest with privacy helper text", () => {
    const html = renderToStaticMarkup(<GuestNameStep onContinue={async () => {}} />);
    expect(html).toContain("What should we call you?");
    expect(html).toContain("only be shown to the couple");
  });

  it("normalizes valid names and rejects blank names", () => {
    expect(normalizeDisplayName("  Miguel Garcia  ")).toBe("Miguel Garcia");
    expect(normalizeDisplayName("   ")).toBeNull();
  });

  it("skips the prompt when a guest already has a name", () => {
    expect(needsGuestName("Pre-created Guest")).toBe(false);
    expect(needsGuestName(null)).toBe(true);
  });
});
