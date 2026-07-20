import Link from 'next/link';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { EmailPasswordForm } from '@/components/EmailPasswordForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">Access your API keys and usage.</p>

        {/* Email + password — the admin sign-in path (pre-seeded accounts). */}
        <div className="mt-6">
          <EmailPasswordForm />
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-xs uppercase tracking-wide text-gray-400">or</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        {/* Google — the customer sign-in path. */}
        <GoogleSignInButton label="Sign in with Google" />

        <p className="mt-6 text-center text-sm text-gray-500">
          New here?{' '}
          <Link href="/signup" className="font-medium text-indigo-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
