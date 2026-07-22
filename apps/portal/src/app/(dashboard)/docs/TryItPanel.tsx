'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE, API_HOST, type Endpoint } from '@/lib/docs/endpoints';
import { useTryItKey } from './TryItContext';

interface ResultState {
  status: number;
  statusText: string;
  contentType: string;
  contentDisposition: string;
  elapsedMs: number;
  bodyKind: 'json' | 'text' | 'binary';
  bodyText?: string;
  blobUrl?: string;
  blobSize?: number;
}

/**
 * Generic "Try it" form driven entirely by the Endpoint spec — one component
 * covers all 24 endpoints instead of per-endpoint bespoke forms. Runs a real
 * fetch from the browser straight to the API host (no server-side proxy);
 * only works with a gw_test_ key because only the sandbox service allows the
 * smartlist.uz origin via CORS (see infra/apisix/services.json).
 */
export function TryItPanel({ endpoint: e }: { endpoint: Endpoint }) {
  const { apiKey } = useTryItKey();
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of e.queryParams) init[p.name] = p.default ?? '';
    return init;
  });
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [rawBody, setRawBody] = useState(e.body?.example ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const lastBlobUrl = useRef<string | undefined>(undefined);

  useEffect(
    () => () => {
      if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
    },
    [],
  );

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!apiKey.trim()) {
      setError('Enter an API key in the box above first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let path = e.path;
      for (const p of e.pathParams) {
        path = path.replace(`{${p.name}}`, encodeURIComponent(pathValues[p.name] ?? ''));
      }
      const qs = new URLSearchParams();
      for (const p of e.queryParams) {
        const v = queryValues[p.name];
        if (v) qs.set(p.name, v);
      }
      const query = qs.toString();
      const url = `${API_HOST}${API_BASE}${path}${query ? `?${query}` : ''}`;

      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey.trim()}` };
      let body: BodyInit | undefined;
      if (e.contentType === 'multipart/form-data') {
        const fd = new FormData();
        for (const f of e.formFields) {
          if (f.type === 'file') {
            const file = files[f.name];
            if (file) fd.append(f.name, file);
          } else {
            fd.append(f.name, formValues[f.name] ?? '');
          }
        }
        body = fd; // browser sets Content-Type (with boundary) itself
      } else if (e.contentType) {
        headers['Content-Type'] = e.contentType;
        body = rawBody;
      }

      const started = performance.now();
      const res = await fetch(url, { method: e.method, headers, body });
      const elapsedMs = Math.round(performance.now() - started);
      const contentType = res.headers.get('content-type') ?? '';
      const contentDisposition = res.headers.get('content-disposition') ?? '';

      if (lastBlobUrl.current) {
        URL.revokeObjectURL(lastBlobUrl.current);
        lastBlobUrl.current = undefined;
      }

      let rest: Pick<ResultState, 'bodyKind' | 'bodyText' | 'blobUrl' | 'blobSize'>;
      if (contentType.includes('application/json')) {
        rest = { bodyKind: 'json', bodyText: await res.text() };
      } else if (contentType.startsWith('text/') || contentType.includes('xml')) {
        rest = { bodyKind: 'text', bodyText: await res.text() };
      } else {
        const blob = await res.blob();
        const blobUrl = blob.size > 0 ? URL.createObjectURL(blob) : undefined;
        lastBlobUrl.current = blobUrl;
        rest = { bodyKind: 'binary', blobUrl, blobSize: blob.size };
      }

      setResult({
        status: res.status,
        statusText: res.statusText,
        contentType,
        contentDisposition,
        elapsedMs,
        ...rest,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — if this is a network/CORS error, check you used a gw_test_ key.`
          : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  const hasFields =
    e.pathParams.length > 0 ||
    e.queryParams.length > 0 ||
    e.formFields.length > 0 ||
    e.body !== undefined;

  return (
    <div className="mt-4 rounded-md border border-gray-200 bg-gray-50/60 p-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Try it</h4>
      <form onSubmit={submit} className="mt-2 space-y-3">
        {e.pathParams.map((p) => (
          <label key={p.name} className="block text-xs">
            <span className="font-mono text-gray-700">{`{${p.name}}`}</span>
            <input
              value={pathValues[p.name] ?? ''}
              onChange={(ev) => setPathValues((s) => ({ ...s, [p.name]: ev.target.value }))}
              placeholder={p.example}
              required={p.required}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-xs"
            />
          </label>
        ))}

        {e.queryParams.map((p) => (
          <label key={p.name} className="block text-xs">
            <span className="text-gray-700">
              {p.name} <span className="text-gray-400">({p.type})</span>
            </span>
            {p.values ? (
              <select
                value={queryValues[p.name] ?? ''}
                onChange={(ev) => setQueryValues((s) => ({ ...s, [p.name]: ev.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              >
                {!p.required && <option value="">(omit)</option>}
                {p.values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={queryValues[p.name] ?? ''}
                onChange={(ev) => setQueryValues((s) => ({ ...s, [p.name]: ev.target.value }))}
                placeholder={p.example}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-xs"
              />
            )}
          </label>
        ))}

        {e.formFields.map((f) =>
          f.type === 'file' ? (
            <label key={f.name} className="block text-xs">
              <span className="text-gray-700">{f.name} (file)</span>
              <input
                type="file"
                required={f.required}
                onChange={(ev) => setFiles((s) => ({ ...s, [f.name]: ev.target.files?.[0] ?? null }))}
                className="mt-1 block w-full text-xs"
              />
            </label>
          ) : (
            <label key={f.name} className="block text-xs">
              <span className="text-gray-700">{f.name}</span>
              <textarea
                value={formValues[f.name] ?? ''}
                onChange={(ev) => setFormValues((s) => ({ ...s, [f.name]: ev.target.value }))}
                placeholder={f.example}
                required={f.required}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-xs"
              />
            </label>
          ),
        )}

        {e.body && (
          <label className="block text-xs">
            <span className="text-gray-700">Body ({e.body.contentType})</span>
            <textarea
              value={rawBody}
              onChange={(ev) => setRawBody(ev.target.value)}
              rows={8}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-[11px]"
            />
          </label>
        )}

        {!hasFields && <p className="text-xs text-gray-500">No parameters — just send it.</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? 'Sending…' : `Send ${e.method} request`}
        </button>
      </form>

      {error && <p className="mt-3 text-xs font-medium text-red-700">{error}</p>}

      {result && (
        <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              className={`rounded px-1.5 py-0.5 font-mono font-semibold ${
                result.status < 300
                  ? 'bg-emerald-100 text-emerald-800'
                  : result.status < 500
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
              }`}
            >
              {result.status} {result.statusText}
            </span>
            <span className="text-gray-500">{result.elapsedMs} ms</span>
            <span className="font-mono text-gray-500">{result.contentType || '—'}</span>
          </div>
          {result.bodyKind === 'binary' ? (
            result.blobUrl ? (
              <a
                href={result.blobUrl}
                download
                className="mt-2 inline-block text-xs font-medium text-indigo-600 underline"
              >
                Download response ({result.blobSize?.toLocaleString()} bytes)
                {result.contentDisposition ? ` — ${result.contentDisposition}` : ''}
              </a>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Empty response body.</p>
            )
          ) : (
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-gray-900 p-2 text-[11px] leading-relaxed text-gray-100">
              {result.bodyText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
