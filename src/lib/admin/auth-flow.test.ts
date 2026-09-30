import { describe, expect, it, vi } from "vitest";
import { adminDestination, signInAdmin, unauthenticatedAdminRedirect } from "@/lib/admin/auth-flow";

describe("admin authentication flow", () => {
  it("redirects unauthenticated admin pages to login", () => {
    expect(unauthenticatedAdminRedirect("/admin/weddings/abc")).toBe("/admin/login?next=%2Fadmin%2Fweddings%2Fabc");
  });

  it("signs in valid credentials and accepts only admin redirect targets", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    await signInAdmin({ signInWithPassword }, " couple@example.com ", "secret");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "couple@example.com", password: "secret" });
    expect(adminDestination("/admin/weddings/123")).toBe("/admin/weddings/123");
    expect(adminDestination("//attacker.example")).toBe("/admin");
  });

  it("shows a safe error for invalid credentials", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: new Error("provider details") });
    await expect(signInAdmin({ signInWithPassword }, "bad@example.com", "bad")).rejects.toThrow("Email or password is incorrect");
  });
});
