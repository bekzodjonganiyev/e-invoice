import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * OAuth (PKCE) callback. Exchanges the `code` for a session (cookies set via
 * @supabase/ssr) and redirects into the dashboard. The `handle_new_user`
 * trigger creates the profiles row on first sign-in.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/dashboard';

  // Behind nginx the standalone server sees its internal bind (0.0.0.0:3000) in
  // request.url, so `url.origin` would redirect the browser to a dead host.
  // Rebuild the public origin from the proxy's forwarded headers (nginx sets
  // Host, X-Forwarded-Host and X-Forwarded-Proto), falling back to url.origin
  // for local dev where there is no proxy.
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const proto =
    request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const origin = host ? `${proto}://${host}` : url.origin;

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
