import Link from 'next/link';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">Access your API keys and usage.</p>
        <div className="mt-6">
          <GoogleSignInButton label="Sign in with Google" />
        </div>
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
