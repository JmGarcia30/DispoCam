import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    SUPABASE_SERVICE_ROLE_KEY: "secret-service-role-key-for-test-32bytes-long",
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe("invite token migration path", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("migrates plaintext tokens to invite_token_encrypted and clears plaintext", async () => {
    const rawPlaintextToken = "legacy-plaintext-invite-token-999";
    const weddingId = "4a736570-6873-4269-9274-686461793031";

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockSelect = vi.fn().mockReturnValue({
      not: vi.fn().mockResolvedValue({
        data: [
          {
            id: weddingId,
            invite_token: rawPlaintextToken,
            invite_token_encrypted: null,
          },
        ],
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "weddings") {
        return {
          select: mockSelect,
          update: mockUpdate,
        };
      }
      return {};
    });

    const { migratePlaintextInviteTokens } = await import("@/lib/api/migrate-invite-tokens");
    const result = await migratePlaintextInviteTokens();

    expect(result.migratedCount).toBe(1);

    // Verify update saved encrypted token and cleared plaintext
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        invite_token_encrypted: expect.stringMatching(/^v1:[^:]+:[^:]+:[^:]+$/),
        invite_token: null,
      })
    );

    // Check that the saved encrypted payload does NOT contain raw plaintext
    const updateCallArg = mockUpdate.mock.calls[0][0];
    expect(updateCallArg.invite_token_encrypted).not.toContain(rawPlaintextToken);

    // Verify it decrypts back accurately
    const { decryptInviteToken } = await import("@/lib/api/invite-encryption");
    const decrypted = decryptInviteToken(updateCallArg.invite_token_encrypted);
    expect(decrypted).toBe(rawPlaintextToken);
  });
});
