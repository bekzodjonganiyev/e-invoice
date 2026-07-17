import 'server-only';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@gw/db';
import { publicSupabaseUrl } from '../env.public';
import { serviceRoleKey } from '../env.server';

export type AdminSupabase = SupabaseClient<Database>;

/**
 * SERVICE_ROLE Supabase client — bypasses RLS. SERVER ONLY. Never import this
 * from a Client Component (the `server-only` guard makes that a build error).
 * Used only for privileged writes (key creation/revocation) with a verified
 * session already checked upstream.
 */
export function createAdminClient(): AdminSupabase {
  return createClient<Database>(publicSupabaseUrl(), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
