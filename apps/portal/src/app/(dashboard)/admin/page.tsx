import { requireAdmin } from '@/lib/auth/admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  // head:true + count:exact → COUNT(*) with no rows transferred.
  const [users, admins, activeKeys, totalKeys, reqMonth] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
    admin.from('api_keys').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('api_keys').select('*', { count: 'exact', head: true }),
    admin
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .gte('occurred_at', monthStart),
  ]);

  const n = (v: number | null) => (v ?? 0).toLocaleString();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Stat label="Users" value={n(users.count)} hint={`${n(admins.count)} admins`} />
      <Stat label="Active API keys" value={n(activeKeys.count)} hint={`${n(totalKeys.count)} total`} />
      <Stat label="Requests this month" value={n(reqMonth.count)} hint="across all tenants" />
    </div>
  );
}
