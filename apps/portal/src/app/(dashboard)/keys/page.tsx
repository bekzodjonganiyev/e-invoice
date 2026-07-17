import { createServerSupabase } from '@/lib/supabase/server';
import { KEY_LIST_COLUMNS, toKeyListItem } from '@/lib/keys/list';
import { CreateKeyDialog } from './CreateKeyDialog';
import { RevokeKeyButton } from './RevokeKeyButton';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  exhausted: 'bg-amber-100 text-amber-800',
  revoked: 'bg-red-100 text-red-800',
  expired: 'bg-gray-200 text-gray-700',
};

export default async function KeysPage() {
  const supabase = await createServerSupabase();
  // RLS restricts this to the current user's keys. key_hash is NOT selected
  // (and is column-revoked from authenticated clients regardless).
  const { data } = await supabase
    .from('api_keys')
    .select(KEY_LIST_COLUMNS)
    .order('created_at', { ascending: false });

  const keys = (data ?? []).map((r) => toKeyListItem(r as any));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="mt-1 text-sm text-gray-500">
            Keys are hashed at rest. The full key is shown only once at creation.
          </p>
        </div>
        <CreateKeyDialog />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Env</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No keys yet. Create your first key to get started.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="px-4 py-3 font-medium">{k.label ?? '—'}</td>
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
                <td className="px-4 py-3 text-right">
                  {k.status !== 'revoked' && <RevokeKeyButton keyId={k.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
