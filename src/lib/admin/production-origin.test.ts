import { describe, expect, it } from "vitest";
import { productionOrigin } from "@/lib/admin/production-origin";

describe("canonical production join origin", () => {
  it("prefers the configured public production URL", () => {
    expect(productionOrigin("http://localhost:3000/admin", "https://dispocam.example/path")).toBe("https://dispocam.example");
  });

  it("uses Vercel's canonical project production hostname", () => {
    expect(productionOrigin("http://localhost:3000", undefined, "dispocam.example")).toBe("https://dispocam.example");
  });

  it("never creates a localhost or non-HTTPS join link", () => {
    expect(() => productionOrigin("http://localhost:3000")).toThrow("Configure the production app URL");
    expect(() => productionOrigin("https://admin.example", "http://admin.example")).toThrow("Configure the production app URL");
  });

  it("does not use a Vercel preview URL as the production join origin", () => {
    expect(() => productionOrigin("https://preview-branch.vercel.app", undefined, undefined, "preview")).toThrow("Configure the production app URL");
  });
});
