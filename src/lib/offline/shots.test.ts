import { describe, expect, it } from "vitest";
import { calculateEffectiveRemainingShots, countLocalPendingShots } from "@/lib/offline/shots";

describe("offline shot accounting", () => {
  it("subtracts locally outstanding photos from server remaining shots", () => {
    expect(calculateEffectiveRemainingShots(10, 3)).toBe(7);
  });

  it("never returns a negative result", () => {
    expect(calculateEffectiveRemainingShots(2, 5)).toBe(0);
  });

  it("counts pending, uploading, and failed photos but not uploaded photos", () => {
    expect(
      countLocalPendingShots([
        { status: "pending" },
        { status: "uploading" },
        { status: "failed" },
        { status: "uploaded" },
      ]),
    ).toBe(3);
  });
});
