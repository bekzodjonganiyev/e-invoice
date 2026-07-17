import { createServerSupabase } from '@/lib/supabase/server';
import { bucketByDay } from '@/lib/usage/aggregate';

export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const supabase = await createServerSupabase();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from('usage_events')
    .select('id,method,source_path,occurred_at,api_key_id')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(500);

  const rows = events ?? [];
  const buckets = bucketByDay(rows as { occurred_at: string }[], new Date(), 14);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Usage</h1>
      <p className="mt-1 text-sm text-gray-500">Last 14 days — {total.toLocaleString()} requests.</p>

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
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Path</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  No requests recorded yet.
                </td>
              </tr>
            )}
            {rows.slice(0, 50).map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(r.occurred_at).toLocaleString()}
                </td>
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
