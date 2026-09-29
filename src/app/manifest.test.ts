import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("web app manifest", () => {
  it("defines an installable neutral standalone application", () => {
    const value = manifest();
    expect(value.name).toBeTruthy();
    expect(value.short_name).toBeTruthy();
    expect(value.display).toBe("standalone");
    expect(value.orientation).toBe("portrait-primary");
    expect(value.start_url).toBe("/");
    expect(value.theme_color).toMatch(/^#/);
    expect(value.background_color).toMatch(/^#/);
    expect(value.icons?.length).toBeGreaterThan(0);
  });
});
