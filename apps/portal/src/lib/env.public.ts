// Public env — safe to reach the browser (RLS protects the anon key).
// Only NEXT_PUBLIC_* values belong here.

export function publicSupabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  return v;
}

export function publicSupabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return v;
}
