'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/keys', label: 'API Keys' },
  { href: '/admin/usage', label: 'Usage' },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 text-sm">
      {TABS.map((t) => {
        // Overview matches only the exact path; others match their subtree.
        const active = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-md px-3 py-1.5 font-medium ${
              active ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
