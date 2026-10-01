import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const requireRole = vi.fn();
const mockFrom = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-at-least-twenty-characters",
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "test-key",
    CLOUDINARY_API_SECRET: "test-secret",
  },
}));
vi.mock("@/lib/api/admin-auth", () => ({ requireWeddingAdmin: requireAdmin }));
vi.mock("@/lib/api/admin-mutations", () => ({ requireMutationRole: requireRole }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const JASEPH_EVENT_ID = "4a736570-6873-4269-9274-686461793031";
const context = { params: Promise.resolve({ weddingId: JASEPH_EVENT_ID }) };

describe("admin invite route - security hardening & encrypted token persistence", () => {
  beforeEach(() => {
    requireAdmin.mockReset().mockResolvedValue({ role: "owner" });
    requireRole.mockReset();
    mockFrom.mockReset();
  });

  it("GET decrypts invite_token_encrypted server-side and returns persistent joinUrl without exposing raw token field", async () => {
    const { encryptInviteToken } = await import("@/lib/api/invite-encryption");
    const rawToken = "existing-birthday-invite-token-xyz123";
    const encryptedToken = encryptInviteToken(rawToken);
    const existingHash = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: JASEPH_EVENT_ID,
            name: "Jaseph's Birthday Celebration",
            default_shot_limit: 10,
            join_enabled: true,
            invite_token_hash: existingHash,
            invite_expires_at: null,
            invite_token_encrypted: encryptedToken,
            invite_token: null, // No raw token in database
          },
          error: null,
        }),
      }),
    });

    mockFrom.mockReturnValue({ select: mockSelect });

    const { GET } = await import("@/app/api/admin/weddings/[weddingId]/invite/route");
    const request = new Request("https://dispocam.vercel.app/api/admin/weddings/invite", {
      headers: { host: "dispocam.vercel.app" },
    });

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const payload = await response.json();
    // Decrypted URL correctly constructed for admin
    expect(payload.data.joinPath).toBe(`/join/${rawToken}`);
    expect(payload.data.joinUrl).toBe(`https://dispocam.vercel.app/join/${rawToken}`);
    expect(payload.data.hasInvite).toBe(true);
    expect(payload.data.joinEnabled).toBe(true);
    // Raw token or encrypted ciphertext must not be returned in settings object
    expect(payload.data.invite_token_encrypted).toBeUndefined();
    expect(payload.data.inviteToken).toBeUndefined();
  });

  it("GET handles legacy plaintext token by migrating and encrypting it on the fly", async () => {
    const legacyToken = "legacy-plaintext-token-abc";
    const existingHash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: JASEPH_EVENT_ID,
            name: "Jaseph's Birthday Celebration",
            default_shot_limit: 10,
            join_enabled: true,
            invite_token_hash: existingHash,
            invite_expires_at: null,
            invite_token_encrypted: null,
            invite_token: legacyToken,
          },
          error: null,
        }),
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

    const { GET } = await import("@/app/api/admin/weddings/[weddingId]/invite/route");
    const request = new Request("https://dispocam.vercel.app/api/admin/weddings/invite", {
      headers: { host: "dispocam.vercel.app" },
    });

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.data.joinUrl).toContain(`/join/${legacyToken}`);

    // Verify automatic background migration call
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        invite_token_encrypted: expect.stringMatching(/^v1:[^:]+:[^:]+:[^:]+$/),
        invite_token: null,
      })
    );
  });

  it("rejects unauthorized admin from retrieving invite URL", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized admin access"));

    const { GET } = await import("@/app/api/admin/weddings/[weddingId]/invite/route");
    const request = new Request("https://dispocam.vercel.app/api/admin/weddings/invite");

    const response = await GET(request, context);
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.data).toBeUndefined();
  });

  it("PATCH preserves encrypted token and hash without modifying either", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: JASEPH_EVENT_ID,
            name: "Jaseph's Birthday Celebration",
            default_shot_limit: 20,
            join_enabled: false,
            invite_token_hash: "hash123",
            invite_expires_at: null,
            invite_token_encrypted: "v1:iv:tag:cipher",
            invite_token: null,
          },
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "weddings") {
        return {
          update: mockUpdate,
          select: mockSelect,
        };
      }
      return {};
    });

    const { PATCH } = await import("@/app/api/admin/weddings/[weddingId]/invite/route");
    const request = new Request("https://dispocam.vercel.app/api/admin/weddings/invite", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", host: "dispocam.vercel.app" },
      body: JSON.stringify({ joinEnabled: false, defaultShotLimit: 20 }),
    });

    const response = await PATCH(request, context);
    expect(response.status).toBe(200);

    // Update touched ONLY settings, never cleared tokens
    expect(mockUpdate).toHaveBeenCalledWith({
      join_enabled: false,
      default_shot_limit: 20,
    });
  });

  it("POST regenerates invite token, stores encrypted token + hash atomically, and zeroes plaintext", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: JASEPH_EVENT_ID,
            name: "Jaseph's Birthday Celebration",
            default_shot_limit: 10,
            join_enabled: true,
            invite_token_hash: "new-hash",
            invite_expires_at: null,
            invite_token_encrypted: "v1:iv:tag:newcipher",
            invite_token: null,
          },
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "weddings") {
        return {
          update: mockUpdate,
          select: mockSelect,
        };
      }
      return {};
    });

    const { POST } = await import("@/app/api/admin/weddings/[weddingId]/invite/route");
    const request = new Request("https://dispocam.vercel.app/api/admin/weddings/invite", {
      method: "POST",
      headers: { host: "dispocam.vercel.app" },
    });

    const response = await POST(request, context);
    expect(response.status).toBe(201);

    // Verify atomic update with encrypted token and hash, and null plaintext
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        invite_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        invite_token_encrypted: expect.stringMatching(/^v1:[^:]+:[^:]+:[^:]+$/),
        invite_token: null,
        join_enabled: true,
      })
    );

    const updatePayload = mockUpdate.mock.calls[0][0];
    // Decrypt the newly generated and stored encrypted token
    const { decryptInviteToken } = await import("@/lib/api/invite-encryption");
    const decryptedNewToken = decryptInviteToken(updatePayload.invite_token_encrypted);
    expect(decryptedNewToken).toBeDefined();

    // Verify hash matches sha256 of decrypted token
    const { hashInviteToken } = await import("@/lib/api/wedding-join");
    expect(hashInviteToken(decryptedNewToken!)).toBe(updatePayload.invite_token_hash);
  });
});
