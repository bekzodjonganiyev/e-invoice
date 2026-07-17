'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@gw/db';
import { publicSupabaseUrl, publicSupabaseAnonKey } from '../env.public';

/**
 * Browser Supabase client using the PUBLISHABLE/ANON key. Safe in the browser
 * because RLS restricts every read to `user_id = auth.uid()`.
 */
export function createClient() {
  return createBrowserClient<Database>(publicSupabaseUrl(), publicSupabaseAnonKey());
}
