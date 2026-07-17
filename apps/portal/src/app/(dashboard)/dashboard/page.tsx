import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { KEY_LIST_COLUMNS, toKeyListItem } from '@/lib/keys/list';

export const dynamic = 'force-dynamic';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('api_keys').select(KEY_LIST_COLUMNS);
  const keys = (data ?? []).map((r) => toKeyListItem(r as any));

  const activeKeys = keys.filter((k) => k.status === 'active').length;
  const totalUsage = keys.reduce((sum, k) => sum + k.current_usage, 0);
  const totalLimit = keys.reduce((sum, k) => sum + k.monthly_limit, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">Your usage this billing period.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Active keys" value={String(activeKeys)} />
        <Stat label="Requests this month" value={totalUsage.toLocaleString()} />
        <Stat
          label="Monthly quota"
          value={totalLimit > 0 ? totalLimit.toLocaleString() : '—'}
        />
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium">Getting started</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-600">
          <li>
            Create an API key on the{' '}
            <Link href="/keys" className="text-indigo-600 hover:underline">
              API Keys
            </Link>{' '}
            page.
          </li>
          <li>
            Call the gateway with <code className="rounded bg-gray-100 px-1">Authorization: Bearer gw_live_…</code>.
          </li>
          <li>
            Track consumption on the{' '}
            <Link href="/usage" className="text-indigo-600 hover:underline">
              Usage
            </Link>{' '}
            page.
          </li>
        </ol>
      </div>
    </div>
  );
}
