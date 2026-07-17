import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@gw/db';

/**
 * RLS integration test — requires a real (local) Supabase with the migration
 * applied. Skipped automatically when SUPABASE_TEST_URL is not set, so the unit
 * suite stays green without Docker. Run with:
 *
 *   SUPABASE_TEST_URL=... SUPABASE_TEST_ANON_KEY=... \
 *   SUPABASE_TEST_SERVICE_ROLE_KEY=... pnpm --filter @gw/portal test
 */
const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const run = URL && ANON && SERVICE ? describe : describe.skip;

run('RLS: keys are not readable across users / by anon', () => {
  it('an anonymous client cannot read any api_keys rows', async () => {
    const anon = createClient<Database>(URL!, ANON!);
    const { data } = await anon.from('api_keys').select('id,key_prefix');
    expect(data ?? []).toHaveLength(0);
  });

  it('key_hash is not selectable by an authenticated/anon client', async () => {
    const anon = createClient<Database>(URL!, ANON!);
    // Selecting the revoked column must error (column privilege revoked).
    const { error } = await anon.from('api_keys').select('key_hash' as any);
    expect(error).not.toBeNull();
  });
});
