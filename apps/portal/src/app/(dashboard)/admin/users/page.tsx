import { requireAdmin } from '@/lib/auth/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@gw/db';

export const dynamic = 'force-dynamic';

type ProfileLite = {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string | null;
};

export default async function AdminUsersPage() {
  await requireAdmin();
  const admin = createAdminClient();

  // profiles holds the app-level fields; auth.users holds the email. Merge by id.
  const [{ data: profiles }, { data: authList }] = await Promise.all([
    admin.from('profiles').select('id,full_name,role,is_active,created_at'),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? '—']));
  const rows = ((profiles ?? []) as ProfileLite[]).sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  );

  return (
    <div>
      <div className="mb-4 text-sm text-gray-500">{rows.length.toLocaleString()} users</div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No users yet.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium">{emailById.get(u.id) ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{u.full_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.role === 'admin' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {u.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
