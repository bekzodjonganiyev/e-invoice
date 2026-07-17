import { describe, it, expect } from 'vitest';
import { KEY_LIST_COLUMNS, toKeyListItem } from './list';

describe('key list shaping (no secret ever reaches the browser)', () => {
  it('the select column list never requests key_hash', () => {
    expect(KEY_LIST_COLUMNS).not.toContain('key_hash');
    expect(KEY_LIST_COLUMNS).toContain('key_prefix');
    expect(KEY_LIST_COLUMNS).toContain('current_usage');
  });

  it('toKeyListItem exposes the prefix but strips key_hash even if present', () => {
    const item = toKeyListItem({
      id: 'k1',
      key_prefix: 'gw_live_abcdef',
      label: 'prod',
      environment: 'live',
      monthly_limit: 1000,
      current_usage: 12,
      rate_limit_per_min: 60,
      status: 'active',
      // a hash that must NOT survive projection:
      key_hash: 'deadbeef' as any,
    } as any);

    expect(item.key_prefix).toBe('gw_live_abcdef');
    expect(Object.keys(item)).not.toContain('key_hash');
    expect(JSON.stringify(item)).not.toContain('deadbeef');
  });

  it('applies safe defaults for missing optional fields', () => {
    const item = toKeyListItem({ id: 'k2', key_prefix: 'gw_test_zzzzzz' });
    expect(item.status).toBe('active');
    expect(item.monthly_limit).toBe(0);
    expect(item.rate_limit_per_min).toBeNull();
  });
});
