import 'server-only';

// SERVER-ONLY secrets. Importing this file from a Client Component fails the
// build (via `server-only`), so these values can never ship in the browser
// bundle. They have NO `NEXT_PUBLIC_` prefix by design.

export function serviceRoleKey(): string {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return v;
}

export function apiKeyPepper(): string {
  const v = process.env.API_KEY_PEPPER;
  if (!v) throw new Error('Missing API_KEY_PEPPER');
  return v;
}
