import 'server-only';

import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import type { UserRole } from '@gw/db';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Resolve the current session user together with their role. The role is read
 * from `profiles` under the user's own session (RLS "own profile read" allows
 * this), so it needs no elevated key. Missing profile → treated as 'user'.
 */
export async function getSessionUserAndRole(): Promise<{
  user: User | null;
  role: UserRole | null;
}> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null };

  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = ((data as { role?: UserRole } | null)?.role ?? 'user') as UserRole;
  return { user, role };
}

/** True when the current session belongs to an admin. Safe to call in Server Components. */
export async function isAdmin(): Promise<boolean> {
  const { role } = await getSessionUserAndRole();
  return role === 'admin';
}

/**
 * Gate for the admin area. Redirects unauthenticated users to /login and
 * non-admins to the customer dashboard. Returns the admin user on success.
 * Call this at the top of every admin Server Component / layout.
 */
export async function requireAdmin(): Promise<User> {
  const { user, role } = await getSessionUserAndRole();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');
  return user;
}
