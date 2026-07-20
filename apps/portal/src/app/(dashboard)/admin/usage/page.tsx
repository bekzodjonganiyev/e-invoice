import { requireAdmin } from '@/lib/auth/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { bucketByDay } from '@/lib/usage/aggregate';

export const dynamic = 'force-dynamic';

export default async function AdminUsagePage() {
  await requireAdmin();
  const admin = createAdminClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // service_role → usage across ALL tenants.
  const [{ data: events }, { data: authList }] = await Promise.all([
    admin
      .from('usage_events')
      .select('id,method,source_path,occurred_at,user_id')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(1000),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? '—']));
  const rows = events ?? [];
  const buckets = bucketByDay(rows as { occurred_at: string }[], new Date(), 14);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div>
      <p className="text-sm text-gray-500">
        Last 14 days — {total.toLocaleString()} requests across all tenants.
      </p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex h-40 items-end gap-2">
          {buckets.map((b) => (
            <div key={b.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-indigo-500"
                style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count > 0 ? 4 : 0 }}
                title={`${b.day}: ${b.count}`}
              />
              <span className="text-[10px] text-gray-400">{b.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mt-8 text-lg font-medium">Recent requests</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Path</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No requests recorded yet.
                </td>
              </tr>
            )}
            {rows.slice(0, 60).map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(r.occurred_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-gray-600">{emailById.get(r.user_id) ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.method}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.source_path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
