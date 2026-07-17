import Link from 'next/link';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sign up with Google — a profile is created automatically on first sign-in.
        </p>
        <div className="mt-6">
          <GoogleSignInButton label="Sign up with Google" />
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
