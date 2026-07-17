export const dynamic = 'force-dynamic';

export default function DocsPage() {
  return (
    <div className="prose max-w-none">
      <h1 className="text-2xl font-semibold">API Documentation</h1>
      <p className="mt-2 text-sm text-gray-600">
        Call the Mustang e-invoice API through the gateway. Every request is authenticated by
        your API key and counted against your monthly quota.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-medium">Authentication</h2>
        <p className="mt-1 text-sm text-gray-600">
          Send your key in the <code className="rounded bg-gray-100 px-1">Authorization</code>{' '}
          header. Never put keys in URLs or query strings.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-gray-900 p-4 text-xs text-gray-100">
{`curl https://gateway.example.com/v1/documents \\
  -H "Authorization: Bearer gw_live_xxxxxxxx"`}
        </pre>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-medium">Responses</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li><strong>200</strong> — request authorized and proxied to Mustang.</li>
          <li><strong>401</strong> — missing, unknown, or revoked key.</li>
          <li><strong>403</strong> — key expired.</li>
          <li><strong>429</strong> — rate limit or monthly quota exceeded.</li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-medium">Quota &amp; rate limits</h2>
        <p className="mt-1 text-sm text-gray-600">
          Each authorized request counts as one unit against your monthly limit. Quotas reset
          automatically at the start of each calendar month.
        </p>
      </section>
    </div>
  );
}
