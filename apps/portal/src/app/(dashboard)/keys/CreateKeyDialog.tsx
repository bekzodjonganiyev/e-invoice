'use client';

import { useState } from 'react';
import type { KeyEnvironment } from '@gw/shared';
import { createApiKeyAction } from './actions';

/**
 * Create-key flow. On success the plaintext is shown ONCE in a modal with a
 * copy button and a "shown only once" warning. The key is never persisted
 * client-side (no localStorage/sessionStorage).
 */
export function CreateKeyDialog() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState<KeyEnvironment>('live');
  const [monthlyLimit, setMonthlyLimit] = useState('10000');
  const [rateLimit, setRateLimit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await createApiKeyAction({
      label,
      environment,
      monthlyLimit: Number(monthlyLimit),
      rateLimitPerMin: rateLimit ? Number(rateLimit) : null,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? 'Failed');
      return;
    }
    setCreatedKey(res.fullKey ?? null);
  }

  function reset() {
    setOpen(false);
    setCreatedKey(null);
    setCopied(false);
    setLabel('');
    setMonthlyLimit('10000');
    setRateLimit('');
    setError(null);
  }

  async function copy() {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Create key
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            {createdKey ? (
              <div>
                <h2 className="text-lg font-semibold">Your new API key</h2>
                <p className="mt-1 text-sm text-amber-700">
                  Copy it now — this key is shown <strong>only once</strong> and cannot be
                  retrieved again.
                </p>
                <pre className="mt-4 overflow-x-auto rounded-md bg-gray-100 p-3 text-xs">
                  {createdKey}
                </pre>
                <div className="mt-4 flex justify-between">
                  <button
                    onClick={copy}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={reset}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2 className="text-lg font-semibold">Create API key</h2>
                <label className="mt-4 block text-sm">
                  Label
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Production server"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  Environment
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as KeyEnvironment)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="live">live</option>
                    <option value="test">test</option>
                  </select>
                </label>
                <label className="mt-3 block text-sm">
                  Monthly request limit
                  <input
                    type="number"
                    min={1}
                    value={monthlyLimit}
                    onChange={(e) => setMonthlyLimit(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  Rate limit / min (optional)
                  <input
                    type="number"
                    min={1}
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {submitting ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
