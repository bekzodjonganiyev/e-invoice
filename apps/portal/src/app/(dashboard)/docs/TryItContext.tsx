'use client';

import { createContext, useContext, useState } from 'react';

interface TryItContextValue {
  apiKey: string;
  setApiKey: (v: string) => void;
}

const TryItContext = createContext<TryItContextValue | null>(null);

/** Wraps the docs page so every EndpointCard's "Try it" panel shares one key field. */
export function TryItProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState('');
  return <TryItContext.Provider value={{ apiKey, setApiKey }}>{children}</TryItContext.Provider>;
}

export function useTryItKey(): TryItContextValue {
  const ctx = useContext(TryItContext);
  if (!ctx) throw new Error('useTryItKey must be used within TryItProvider');
  return ctx;
}

/** Display-only parse of the env a key claims — the gateway is the real check. */
export function parseEnvFromKey(key: string): 'live' | 'test' | null {
  const m = /^gw_(live|test)_/.exec(key.trim());
  return m ? (m[1] as 'live' | 'test') : null;
}

export function ApiKeyBar() {
  const { apiKey, setApiKey } = useTryItKey();
  const env = apiKey.trim() ? parseEnvFromKey(apiKey) : null;

  return (
    <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3">
      <label className="block text-sm font-medium text-indigo-900">
        API key for &ldquo;Try it&rdquo;
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="gw_test_…"
          className="mt-1 w-full max-w-md rounded-md border border-indigo-300 bg-white px-3 py-1.5 font-mono text-xs"
        />
      </label>
      <p className="mt-2 text-xs text-indigo-800">
        Only paste a <strong>gw_test_</strong> sandbox key here — it hits the mustang-mock service,
        never real Mustang. A gw_live_ key will fail with a CORS error by design (the live service
        does not allow browser calls). Create a test key on the{' '}
        <a href="/keys" className="underline">
          Keys
        </a>{' '}
        page. The key is kept only in this tab&apos;s memory — never stored, never sent anywhere but
        the API.
      </p>
      {apiKey.trim() !== '' && env === null && (
        <p className="mt-1 text-xs font-medium text-red-700">
          Doesn&apos;t look like a gw_live_/gw_test_ key — check for extra spaces.
        </p>
      )}
      {env === 'live' && (
        <p className="mt-1 text-xs font-medium text-amber-700">
          This is a live key — requests below will be blocked by CORS (expected, live traffic isn&apos;t
          browser-callable). Use a test key instead.
        </p>
      )}
    </div>
  );
}
