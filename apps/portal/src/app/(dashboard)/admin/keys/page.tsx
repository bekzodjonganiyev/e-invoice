import { requireAdmin } from '@/lib/auth/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { KEY_LIST_COLUMNS, toKeyListItem } from '@/lib/keys/list';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  exhausted: 'bg-amber-100 text-amber-800',
  revoked: 'bg-red-100 text-red-800',
  expired: 'bg-gray-200 text-gray-700',
};

export default async function AdminKeysPage() {
  await requireAdmin();
  const admin = createAdminClient();

  // service_role → every tenant's keys. key_hash is never selected.
  const [{ data }, { data: authList }] = await Promise.all([
    admin
      .from('api_keys')
      .select(`${KEY_LIST_COLUMNS},user_id`)
      .order('created_at', { ascending: false })
      .limit(500),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? '—']));
  const keys = (data ?? []).map((r) => ({
    ...toKeyListItem(r as any),
    owner: emailById.get((r as { user_id: string }).user_id) ?? '—',
  }));

  return (
    <div>
      <div className="mb-4 text-sm text-gray-500">{keys.length.toLocaleString()} keys</div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Env</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No keys yet.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="px-4 py-3 font-medium">{k.owner}</td>
                <td className="px-4 py-3 text-gray-600">{k.label ?? '—'}</td>
                <td className="px-4 py-3">{k.environment}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{k.key_prefix}…</td>
                <td className="px-4 py-3">
                  {k.current_usage.toLocaleString()} / {k.monthly_limit.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[k.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {k.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
