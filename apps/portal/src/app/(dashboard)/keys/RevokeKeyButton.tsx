'use client';

import { useState, useTransition } from 'react';
import { revokeApiKeyAction } from './actions';

export function RevokeKeyButton({ keyId }: { keyId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm font-medium text-red-600 hover:underline"
      >
        Revoke
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <button
        disabled={pending}
        onClick={() => startTransition(() => revokeApiKeyAction(keyId).then(() => undefined))}
        className="font-medium text-red-600 hover:underline disabled:opacity-60"
      >
        {pending ? 'Revoking…' : 'Confirm'}
      </button>
      <button onClick={() => setConfirming(false)} className="text-gray-500 hover:underline">
        Cancel
      </button>
    </span>
  );
}
