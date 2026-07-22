import {
  API_BASE,
  API_HOST,
  ENDPOINT_GROUPS,
  GATEWAY_ERRORS,
  GLOBAL_HEADERS,
  INJECTED_HEADERS,
  SERVICES,
  type Endpoint,
  type HttpMethod,
  type Param,
  type ResponseSpec,
} from '@/lib/docs/endpoints';
import { ApiKeyBar, TryItProvider } from './TryItContext';
import { TryItPanel } from './TryItPanel';

export const dynamic = 'force-dynamic';

/** Full base every example is written against. */
const FULL_BASE = `${API_HOST}${API_BASE}`;

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: 'bg-sky-100 text-sky-800',
  POST: 'bg-emerald-100 text-emerald-800',
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-block w-14 shrink-0 rounded px-2 py-0.5 text-center text-xs font-semibold ${METHOD_STYLES[method]}`}
    >
      {method}
    </span>
  );
}

function statusStyle(status: number) {
  if (status < 300) return 'bg-emerald-100 text-emerald-800';
  if (status < 500) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">{children}</code>;
}

function Block({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">
      {children}
    </pre>
  );
}

/** Section heading used inside an expanded endpoint. */
function SubHead({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{children}</h4>;
}

/**
 * Table of headers / query params / path params / form fields. Same columns for
 * all four so the eye doesn't have to re-learn the layout per section.
 */
function ParamTable({ title, params }: { title: string; params: Param[] }) {
  if (params.length === 0) return null;
  return (
    <div className="mt-4">
      <SubHead>{title}</SubHead>
      <div className="mt-2 overflow-x-auto rounded-md border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Required</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Example</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {params.map((p) => (
              <tr key={p.name} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-medium text-gray-900">
                  {p.name}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {p.type}
                  {p.values && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.values.map((v) => (
                        <span
                          key={v}
                          className="rounded bg-gray-100 px-1 font-mono text-[10px] text-gray-700"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {p.required ? (
                    <span className="font-medium text-red-600">required</span>
                  ) : (
                    <span className="text-gray-400">optional</span>
                  )}
                  {p.default !== undefined && (
                    <div className="mt-0.5 text-[10px] text-gray-400">default: {p.default}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{p.description}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{p.example ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResponseList({ responses }: { responses: ResponseSpec[] }) {
  return (
    <div className="mt-4">
      <SubHead>Responses</SubHead>
      <ul className="mt-2 space-y-1.5">
        {responses.map((r, i) => (
          <li key={`${r.status}-${i}`} className="flex gap-2 text-xs">
            <span
              className={`mt-px inline-block w-10 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[10px] font-semibold ${statusStyle(r.status)}`}
            >
              {r.status}
            </span>
            <span className="text-gray-600">
              <span className="font-mono text-[11px] text-gray-800">{r.contentType}</span>
              {' — '}
              {r.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One collapsible endpoint. Native <details> keeps the page a server component. */
function EndpointCard({ endpoint: e }: { endpoint: Endpoint }) {
  return (
    <details
      id={e.id}
      className="group border-b border-gray-200 last:border-b-0 open:bg-gray-50/60"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-gray-50">
        <MethodBadge method={e.method} />
        <span className="whitespace-nowrap font-mono text-xs text-gray-900">
          {API_BASE}
          {e.path}
        </span>
        <span className="truncate text-xs text-gray-500">{e.summary}</span>
        <span className="ml-auto shrink-0 text-[11px] text-gray-400 group-open:hidden">
          show details
        </span>
        <span className="ml-auto hidden shrink-0 text-[11px] text-gray-400 group-open:inline">
          hide
        </span>
      </summary>

      <div className="border-t border-gray-200 bg-white px-4 py-4">
        <p className="max-w-3xl text-xs leading-relaxed text-gray-600">{e.description}</p>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-gray-500">
          <span>
            Request <Code>Content-Type</Code>: {e.contentType ?? 'none (no body)'}
          </span>
          <span>
            Auth: <Code>Authorization: Bearer &lt;key&gt;</Code> required
          </span>
        </div>

        <ParamTable title="Headers" params={e.headers} />
        <ParamTable title="Path parameters" params={e.pathParams} />
        <ParamTable title="Query parameters" params={e.queryParams} />
        <ParamTable title="Form fields (multipart/form-data)" params={e.formFields} />

        {e.body && (
          <div className="mt-4">
            <SubHead>Request body — {e.body.contentType}</SubHead>
            <p className="mt-1 text-xs text-gray-600">{e.body.description}</p>
            <div className="mt-2">
              <Block>{e.body.example}</Block>
            </div>
          </div>
        )}

        <ResponseList responses={e.responses} />

        <div className="mt-4">
          <SubHead>Example</SubHead>
          <div className="mt-2">
            <Block>{e.curl.replaceAll('{{BASE}}', FULL_BASE)}</Block>
          </div>
        </div>

        <TryItPanel endpoint={e} />
      </div>
    </details>
  );
}

export default function DocsPage() {
  const total = ENDPOINT_GROUPS.reduce((s, g) => s + g.endpoints.length, 0);

  return (
    <TryItProvider>
      <div className="pb-16">
        <h1 className="text-2xl font-semibold">API Documentation</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Call the Mustang e-invoice API through the gateway. Every request is authenticated by your
          API key and counted against your monthly quota. {total} endpoints are available — click any
          row to see its headers, parameters, body, a runnable example, and a live &ldquo;Try
          it&rdquo; form.
        </p>

        <ApiKeyBar />

        <section className="mt-8">
          <h2 className="text-lg font-medium">Base URL</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Every path below is relative to this base. Paths are case-sensitive.
          </p>
          <div className="mt-3">
            <Block>{`${FULL_BASE}

# e.g.
GET  ${FULL_BASE}/mustang/ping
POST ${FULL_BASE}/mustang/validate?ignoreNotices=true`}</Block>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium">Environments</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Every endpoint below is reachable through either environment — which one handles your
            call is decided purely by your key&apos;s own prefix, not by the path. There is no
            separate base URL or docs section per environment.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SERVICES.map((s) => (
              <div key={s.environment} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                      s.environment === 'live'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {s.label}
                  </span>
                  <code className="font-mono text-xs text-gray-700">{s.keyPrefix}*</code>
                  <span className="ml-auto font-mono text-[10px] text-gray-400">{s.serviceId}</span>
                </div>
                <p className="mt-2 text-xs text-gray-600">{s.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium">Authentication &amp; common headers</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Send your key in the <Code>Authorization</Code> header (or <Code>apikey</Code>). Never put
            keys in URLs or query strings — they end up in proxy and browser logs.
          </p>
          <ParamTable title="Request headers (all endpoints)" params={GLOBAL_HEADERS} />
          <div className="mt-3">
            <Block>{`curl ${FULL_BASE}/mustang/ping \\
  -H "Authorization: Bearer gw_live_8f2c1d9a4b7e6f30" \\
  -H "X-Request-Id: 3f9b2a10-7c44-4c8e-9a1f-0d6e2b5c8a71"`}</Block>
          </div>
          <ParamTable title="Headers the gateway adds upstream (informational)" params={INJECTED_HEADERS} />
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium">Gateway errors</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Returned by the gateway before your request reaches Mustang — they apply to every endpoint
            and are listed here rather than repeated on each one.
          </p>
          <ResponseList responses={GATEWAY_ERRORS} />
        </section>

        {ENDPOINT_GROUPS.map((group) => (
          <section key={group.key} className="mt-10">
            <h2 className="text-lg font-medium">
              {group.title}{' '}
              <span className="text-sm font-normal text-gray-400">
                ({group.endpoints.length} endpoints)
              </span>
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">{group.description}</p>
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
              {group.endpoints.map((e) => (
                <EndpointCard key={e.id} endpoint={e} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </TryItProvider>
  );
}
