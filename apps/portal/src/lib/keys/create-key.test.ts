import { describe, it, expect } from 'vitest';
import { createApiKeyForUser } from './create-key';
import { hashApiKey, parseKeyPrefix } from '@gw/shared';

const PEPPER = 'portal-test-pepper';

function fakeAdmin(
  behavior: (payload: any, attempt: number) => { data: any; error: any },
) {
  const inserts: any[] = [];
  const client = {
    inserts,
    from() {
      return {
        insert(payload: any) {
          inserts.push(payload);
          const attempt = inserts.length;
          return {
            select() {
              return {
                single: async () => behavior(payload, attempt),
              };
            },
          };
        },
      };
    },
  };
  return client as any;
}

describe('createApiKeyForUser', () => {
  it('returns the plaintext key exactly once and stores ONLY the hash', async () => {
    const admin = fakeAdmin((payload) => ({
      data: {
        id: 'key-1',
        key_prefix: payload.key_prefix,
        label: payload.label,
        environment: payload.environment,
        monthly_limit: payload.monthly_limit,
      },
      error: null,
    }));

    const created = await createApiKeyForUser(
      admin,
      { userId: 'user-1', label: 'my key', monthlyLimit: 1000 },
      PEPPER,
    );

    // plaintext returned to caller
    expect(created.fullKey).toMatch(/^gw_live_[0-9A-Za-z]+$/);
    expect(created.id).toBe('key-1');

    // stored payload contains the hash, NOT the plaintext
    const stored = admin.inserts[0];
    expect(stored.key_hash).toBe(hashApiKey(created.fullKey, PEPPER));
    expect(stored.key_hash).not.toBe(created.fullKey);
    expect(JSON.stringify(stored)).not.toContain(created.fullKey);
    expect('full_key' in stored).toBe(false);
    expect('fullKey' in stored).toBe(false);

    // prefix stored matches the plaintext's derived prefix
    expect(stored.key_prefix).toBe(parseKeyPrefix(created.fullKey));
    expect(created.keyPrefix).toBe(stored.key_prefix);
  });

  it('derives user_id from the passed session value, not client input', async () => {
    const admin = fakeAdmin((payload) => ({
      data: { id: 'k', key_prefix: payload.key_prefix, label: null, environment: 'live', monthly_limit: 5 },
      error: null,
    }));
    await createApiKeyForUser(admin, { userId: 'trusted-user', monthlyLimit: 5 }, PEPPER);
    expect(admin.inserts[0].user_id).toBe('trusted-user');
  });

  it('regenerates the prefix and retries on a unique collision (23505)', async () => {
    const admin = fakeAdmin((payload, attempt) => {
      if (attempt === 1) return { data: null, error: { code: '23505' } };
      return {
        data: { id: 'key-2', key_prefix: payload.key_prefix, label: null, environment: 'test', monthly_limit: 10 },
        error: null,
      };
    });

    const created = await createApiKeyForUser(
      admin,
      { userId: 'user-1', environment: 'test', monthlyLimit: 10 },
      PEPPER,
    );

    expect(admin.inserts).toHaveLength(2);
    expect(admin.inserts[0].key_prefix).not.toBe(admin.inserts[1].key_prefix);
    expect(created.environment).toBe('test');
    expect(created.fullKey.startsWith('gw_test_')).toBe(true);
  });

  it('throws on a non-collision DB error', async () => {
    const admin = fakeAdmin(() => ({ data: null, error: { code: '42501', message: 'denied' } }));
    await expect(
      createApiKeyForUser(admin, { userId: 'u', monthlyLimit: 1 }, PEPPER),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
