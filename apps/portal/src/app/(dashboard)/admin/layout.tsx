import { requireAdmin } from '@/lib/auth/admin';
import { AdminTabs } from '@/components/AdminTabs';

export const dynamic = 'force-dynamic';

/**
 * Admin area gate. requireAdmin() redirects non-admins to /dashboard and
 * unauthenticated visitors to /login, so nothing below renders — and none of
 * the service_role reads in the child pages run — for a non-admin.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <div className="mb-2">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-gray-500">System-wide view across all tenants.</p>
      </div>
      <AdminTabs />
      {children}
    </div>
  );
}
