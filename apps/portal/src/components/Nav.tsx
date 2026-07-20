import Link from 'next/link';
import { signOut } from '@/lib/auth/actions';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/keys', label: 'API Keys' },
  { href: '/usage', label: 'Usage' },
  { href: '/billing', label: 'Billing' },
  { href: '/docs', label: 'Docs' },
];

export function Nav({ email, isAdmin = false }: { email: string | null; isAdmin?: boolean }) {
  const links = isAdmin ? [...LINKS, { href: '/admin', label: 'Admin' }] : LINKS;
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">API Gateway</span>
          <nav className="flex gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-gray-600 hover:text-gray-900">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {email && <span className="text-gray-500">{email}</span>}
          <form action={signOut}>
            <button className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
