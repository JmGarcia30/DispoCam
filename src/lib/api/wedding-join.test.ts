import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const maybeSingle = vi.fn();
const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-at-least-twenty-characters" } }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc, from: vi.fn(() => query) } }));

const inviteToken = "i".repeat(43);
const browserKey = "b".repeat(64);
const request = new Request("http://test", { headers: { "x-forwarded-for": "203.0.113.4" } });

describe("wedding invite validation", () => {
  beforeEach(() => { rpc.mockReset(); maybeSingle.mockReset(); });

  it("accepts a valid active wedding invite", async () => {
    maybeSingle.mockResolvedValue({ data: { name: "Test Wedding", join_enabled: true, invite_expires_at: null }, error: null });
    const { getWeddingInvite } = await import("@/lib/api/wedding-join");
    await expect(getWeddingInvite(inviteToken)).resolves.toEqual({ weddingName: "Test Wedding" });
  });

  it("rejects invalid, disabled, and expired invites", async () => {
    const { getWeddingInvite } = await import("@/lib/api/wedding-join");
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getWeddingInvite(inviteToken)).rejects.toMatchObject({ code: "invite_not_found" });
    maybeSingle.mockResolvedValueOnce({ data: { name: "Test", join_enabled: false, invite_expires_at: null }, error: null });
    await expect(getWeddingInvite(inviteToken)).rejects.toMatchObject({ code: "invite_disabled" });
    maybeSingle.mockResolvedValueOnce({ data: { name: "Test", join_enabled: true, invite_expires_at: "2020-01-01T00:00:00.000Z" }, error: null });
    await expect(getWeddingInvite(inviteToken)).rejects.toMatchObject({ code: "invite_expired" });
  });
});

describe("atomic onboarding contract", () => {
  beforeEach(() => rpc.mockReset());

  it("returns a created guest/pass with the default 10 shots and stores only token hashes", async () => {
    rpc.mockResolvedValue({ data: [{ result_status: "created", guest_id: "guest-1", camera_pass_id: "pass-1", shot_limit: 10 }], error: null });
    const { createWeddingGuestPass } = await import("@/lib/api/wedding-join");
    const result = await createWeddingGuestPass({ inviteToken, displayName: "Miguel Garcia", browserKey, request });
    expect(result).toMatchObject({ guestId: "guest-1", cameraPassId: "pass-1", shotLimit: 10 });
    const args = rpc.mock.calls[0][1];
    expect(args.p_camera_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_camera_token_hash).not.toBe(result.cameraToken);
    expect(JSON.stringify(args)).not.toContain(result.cameraToken);
    expect(args.p_invite_token_hash).not.toBe(inviteToken);
    expect(args.p_browser_key_hash).not.toBe(browserKey);
  });

  it("allows only one concurrent join for the same browser key", async () => {
    rpc.mockResolvedValueOnce({ data: [{ result_status: "created", guest_id: "guest-1", camera_pass_id: "pass-1", shot_limit: 10 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ result_status: "already_joined", guest_id: "guest-1", camera_pass_id: "pass-1", shot_limit: 10 }], error: null });
    const { createWeddingGuestPass } = await import("@/lib/api/wedding-join");
    const [first, retry] = await Promise.allSettled([
      createWeddingGuestPass({ inviteToken, displayName: "Miguel", browserKey, request }),
      createWeddingGuestPass({ inviteToken, displayName: "Miguel", browserKey, request }),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(retry.status).toBe("rejected");
    if (retry.status === "rejected") expect(retry.reason).toMatchObject({ code: "already_joined" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
