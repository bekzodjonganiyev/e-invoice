'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Google OAuth sign-in (Plane A — human auth). Uses the browser Supabase client
 * (anon key). Google credentials live in the Supabase Dashboard, not in the app.
 */
export function GoogleSignInButton({ label = 'Continue with Google' }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
      >
        <span aria-hidden className="text-lg">G</span>
        {loading ? 'Redirecting…' : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
