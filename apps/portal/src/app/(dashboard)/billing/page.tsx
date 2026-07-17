import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  void: 'bg-gray-200 text-gray-700',
};

export default async function BillingPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('billing_records')
    .select('id,amount,currency,description,status,period_start,period_end,created_at')
    .order('created_at', { ascending: false });

  const records = data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Billing</h1>
      <p className="mt-1 text-sm text-gray-500">
        Mock billing for this MVP — no real charges are made.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No billing records yet.
                </td>
              </tr>
            )}
            {records.map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.description ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {r.period_start ?? '—'} → {r.period_end ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {Number(r.amount).toLocaleString()} {r.currency}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {r.status}
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
