import { API_BASE, ENDPOINT_GROUPS, type HttpMethod } from '@/lib/docs/endpoints';

export const dynamic = 'force-dynamic';

// Public API host. Every path below is called as https://api.smartlist.uz/api/v1.8.2/...
const API_HOST = 'https://api.smartlist.uz';

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: 'bg-sky-100 text-sky-800',
  POST: 'bg-emerald-100 text-emerald-800',
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-block w-14 rounded px-2 py-0.5 text-center text-xs font-semibold ${METHOD_STYLES[method]}`}
    >
      {method}
    </span>
  );
}

export default function DocsPage() {
  const total = ENDPOINT_GROUPS.reduce((s, g) => s + g.endpoints.length, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold">API Documentation</h1>
      <p className="mt-2 max-w-2xl text-sm text-gray-600">
        Call the Mustang e-invoice API through the gateway. Every request is authenticated by your
        API key and counted against your monthly quota. {total} endpoints are available.
      </p>

      {/* Sandbox not built yet — set expectations explicitly. */}
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        A live &ldquo;try it&rdquo; sandbox is coming soon. For now this page is a reference — send
        requests with <code className="rounded bg-amber-100 px-1">curl</code> or your HTTP client.
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-medium">Base URL &amp; authentication</h2>
        <p className="mt-1 text-sm text-gray-600">
          Send your key in the <code className="rounded bg-gray-100 px-1">Authorization</code>{' '}
          header (or <code className="rounded bg-gray-100 px-1">apikey</code>). Never put keys in
          URLs or query strings.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-gray-900 p-4 text-xs text-gray-100">
{`# Base URL
${API_HOST}${API_BASE}

curl ${API_HOST}${API_BASE}/mustang/ping \\
  -H "Authorization: Bearer gw_live_xxxxxxxx"`}
        </pre>
      </section>

      {ENDPOINT_GROUPS.map((group) => (
        <section key={group.key} className="mt-8">
          <h2 className="text-lg font-medium">{group.title}</h2>
          <p className="mt-1 text-sm text-gray-500">{group.description}</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Path</th>
                  <th className="px-4 py-3">Body</th>
                  <th className="px-4 py-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.endpoints.map((e) => (
                  <tr key={`${e.method} ${e.path}`}>
                    <td className="px-4 py-3">
                      <MethodBadge method={e.method} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-800">
                      {API_BASE}
                      {e.path}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-500">
                      {e.contentType ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {e.summary}
                      <div className="mt-0.5 text-[11px] text-gray-400">→ {e.returns}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Response codes</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li><strong>200</strong> — request authorized and proxied to Mustang.</li>
          <li><strong>401</strong> — missing, unknown, or revoked key.</li>
          <li><strong>403</strong> — key expired.</li>
          <li><strong>429</strong> — rate limit or monthly quota exceeded.</li>
        </ul>
      </section>
    </div>
  );
}
