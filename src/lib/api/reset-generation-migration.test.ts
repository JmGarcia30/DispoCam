import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("camera pass reset generation migration", () => {
  it("increments reset_generation for both test reset modes", async () => {
    const sql = await readFile(new URL("../../../supabase/migrations/202610010002_camera_pass_reset_generation.sql", import.meta.url), "utf8");
    expect(sql).toContain("reset_generation integer not null default 0");
    expect(sql).toContain("set shots_used = 0, reset_generation = reset_generation + 1");
    expect(sql).toContain("delete from public.upload_intents");
  });
});
