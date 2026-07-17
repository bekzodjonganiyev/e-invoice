import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = { name: string; value: string; options: CookieOptions };
import type { Database } from '@gw/db';
import { publicSupabaseUrl, publicSupabaseAnonKey } from '../env.public';

/**
 * Server-side Supabase client bound to the request's cookie session. Uses the
 * ANON key with the user's session, so RLS still applies (own rows only).
 * Used in Server Components, Route Handlers, and Server Actions.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(publicSupabaseUrl(), publicSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Session refresh is handled by middleware, so this is safe to ignore.
        }
      },
    },
  });
}
