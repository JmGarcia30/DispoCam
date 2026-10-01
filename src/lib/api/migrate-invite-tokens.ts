import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encryptInviteToken } from "@/lib/api/invite-encryption";

/**
 * Migration utility: Encrypts any existing plaintext `invite_token` values in `public.weddings`,
 * saves the encrypted ciphertext to `invite_token_encrypted`, and clears the plaintext column.
 */
export async function migratePlaintextInviteTokens(): Promise<{ migratedCount: number }> {
  const { data: rows, error } = await supabaseAdmin
    .from("weddings")
    .select("id,invite_token,invite_token_encrypted")
    .not("invite_token", "is", null);

  if (error) throw error;
  if (!rows || rows.length === 0) {
    return { migratedCount: 0 };
  }

  let migratedCount = 0;

  for (const row of rows) {
    // Only migrate if there is a plaintext token
    if (row.invite_token) {
      const encrypted = encryptInviteToken(row.invite_token);
      const { error: updateError } = await supabaseAdmin
        .from("weddings")
        .update({
          invite_token_encrypted: encrypted,
          invite_token: null,
        })
        .eq("id", row.id);

      if (updateError) throw updateError;
      migratedCount++;
    }
  }

  return { migratedCount };
}
