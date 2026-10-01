import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    SUPABASE_SERVICE_ROLE_KEY: "secret-service-role-key-for-test-32bytes-long",
  },
}));

describe("invite token encryption module", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypts and decrypts invite token correctly using AES-256-GCM", async () => {
    const { encryptInviteToken, decryptInviteToken } = await import("@/lib/api/invite-encryption");

    const rawToken = "my-high-entropy-invite-token-123456789";
    const encrypted = encryptInviteToken(rawToken);

    // Encrypted string must not expose raw token
    expect(encrypted).not.toContain(rawToken);
    expect(encrypted.startsWith("v1:")).toBe(true);

    // Split format check
    const parts = encrypted.split(":");
    expect(parts.length).toBe(4); // v1, iv, authTag, ciphertext

    // Decrypts accurately back to original plaintext
    const decrypted = decryptInviteToken(encrypted);
    expect(decrypted).toBe(rawToken);
  });

  it("produces distinct ciphertexts for repeated encryptions due to random IV", async () => {
    const { encryptInviteToken } = await import("@/lib/api/invite-encryption");

    const rawToken = "same-token-repeated";
    const enc1 = encryptInviteToken(rawToken);
    const enc2 = encryptInviteToken(rawToken);

    expect(enc1).not.toBe(enc2);
  });

  it("rejects tampered ciphertext, auth tag, or iv gracefully without crashing", async () => {
    const { encryptInviteToken, decryptInviteToken } = await import("@/lib/api/invite-encryption");

    const rawToken = "tamper-test-token";
    const encrypted = encryptInviteToken(rawToken);
    const parts = encrypted.split(":");

    // 1. Tampered ciphertext
    const tamperedCipher = `v1:${parts[1]}:${parts[2]}:tampered_${parts[3]}`;
    expect(decryptInviteToken(tamperedCipher)).toBeNull();

    // 2. Tampered auth tag
    const tamperedTag = `v1:${parts[1]}:badtag:${parts[3]}`;
    expect(decryptInviteToken(tamperedTag)).toBeNull();

    // 3. Invalid format
    expect(decryptInviteToken("invalid-payload")).toBeNull();
    expect(decryptInviteToken("v2:something:else")).toBeNull();
  });
});
