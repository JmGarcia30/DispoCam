import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96 bits recommended for GCM

function getEncryptionKey(): Buffer {
  const customSecret = process.env.INVITE_TOKEN_ENCRYPTION_KEY;
  const baseSecret = customSecret || env.SUPABASE_SERVICE_ROLE_KEY;
  // Derive a fixed 256-bit (32-byte) key specifically domain-separated for invite token encryption
  return createHash("sha256")
    .update(`dispocam:invite_token_encryption_v1:${baseSecret}`)
    .digest();
}

/**
 * Encrypts an invite token using authenticated AES-256-GCM.
 * Output format: v1:<iv_base64url>:<auth_tag_base64url>:<ciphertext_base64url>
 */
export function encryptInviteToken(token: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

/**
 * Decrypts an AES-256-GCM encrypted invite token payload.
 * Validates the authentication tag before returning plaintext.
 * Returns null if the ciphertext or auth tag has been tampered with or is invalid.
 */
export function decryptInviteToken(encryptedPayload: string): string | null {
  try {
    const parts = encryptedPayload.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") {
      return null;
    }

    const iv = Buffer.from(parts[1], "base64url");
    const authTag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");

    if (iv.length !== IV_LENGTH_BYTES || authTag.length !== 16) {
      return null;
    }

    const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
