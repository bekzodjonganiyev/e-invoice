'use server';

import { revalidatePath } from 'next/cache';
import type { KeyEnvironment } from '@gw/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createApiKeyForUser } from '@/lib/keys/create-key';
import { apiKeyPepper } from '@/lib/env.server';

export interface CreateKeyResult {
  ok: boolean;
  error?: string;
  /** Plaintext key — present only on success, shown to the user exactly once. */
  fullKey?: string;
  keyPrefix?: string;
}

/**
 * Create an API key for the CURRENT session user. user_id is derived from the
 * verified session — never from client input. Returns the plaintext once.
 */
export async function createApiKeyAction(input: {
  label?: string;
  environment?: KeyEnvironment;
  monthlyLimit: number;
  rateLimitPerMin?: number | null;
}): Promise<CreateKeyResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const monthlyLimit = Number(input.monthlyLimit);
  if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
    return { ok: false, error: 'Monthly limit must be a positive number' };
  }

  const admin = createAdminClient();
  try {
    const created = await createApiKeyForUser(
      admin,
      {
        userId: user.id,
        label: input.label?.trim() || null,
        environment: input.environment ?? 'live',
        monthlyLimit,
        rateLimitPerMin: input.rateLimitPerMin ?? null,
      },
      apiKeyPepper(),
    );
    revalidatePath('/keys');
    return { ok: true, fullKey: created.fullKey, keyPrefix: created.keyPrefix };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Failed to create key' };
  }
}

/** Revoke a key owned by the current user. */
export async function revokeApiKeyAction(keyId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('api_keys')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', user.id); // ownership guard even though admin bypasses RLS

  if (error) return { ok: false, error: error.message };
  revalidatePath('/keys');
  return { ok: true };
}
