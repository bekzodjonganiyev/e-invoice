import 'server-only';

import { generateApiKey, hashApiKey, type KeyEnvironment } from '@gw/shared';
import type { AdminSupabase } from '../supabase/admin';

export interface CreateKeyParams {
  userId: string;
  label?: string | null;
  environment?: KeyEnvironment;
  monthlyLimit: number;
  rateLimitPerMin?: number | null;
}

export interface CreatedKey {
  /** Plaintext key — returned EXACTLY ONCE. Never stored, never retrievable. */
  fullKey: string;
  id: string;
  keyPrefix: string;
  label: string | null;
  environment: KeyEnvironment;
  monthlyLimit: number;
}

const MAX_PREFIX_ATTEMPTS = 5;

/**
 * Create an API key for a user. Generates the key, stores ONLY the HMAC hash
 * and the public prefix, and returns the plaintext once. Retries on the rare
 * key_prefix unique collision.
 *
 * `userId` MUST come from a verified server session — never from client input.
 */
export async function createApiKeyForUser(
  admin: AdminSupabase,
  params: CreateKeyParams,
  pepper: string,
): Promise<CreatedKey> {
  const environment: KeyEnvironment = params.environment ?? 'live';

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_PREFIX_ATTEMPTS; attempt++) {
    const { fullKey, keyPrefix } = generateApiKey(environment);
    const key_hash = hashApiKey(fullKey, pepper);

    const { data, error } = await admin
      .from('api_keys')
      .insert({
        user_id: params.userId,
        label: params.label ?? null,
        environment,
        key_prefix: keyPrefix,
        key_hash, // ONLY the hash is persisted. fullKey is never stored.
        monthly_limit: params.monthlyLimit,
        rate_limit_per_min: params.rateLimitPerMin ?? null,
      })
      .select('id,key_prefix,label,environment,monthly_limit')
      .single();

    if (!error && data) {
      return {
        fullKey,
        id: data.id,
        keyPrefix: data.key_prefix,
        label: data.label ?? null,
        environment: data.environment as KeyEnvironment,
        monthlyLimit: data.monthly_limit,
      };
    }

    // 23505 = unique_violation (prefix collision) → regenerate and retry.
    if (error && (error as { code?: string }).code === '23505') {
      lastError = error;
      continue;
    }
    // Any other error is fatal.
    throw error ?? new Error('Failed to create API key');
  }

  throw lastError ?? new Error('Failed to create API key after retries');
}
