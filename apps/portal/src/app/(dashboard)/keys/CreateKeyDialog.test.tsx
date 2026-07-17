import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the server action so the component test never touches the DB/secrets.
const createApiKeyAction = vi.fn();
vi.mock('./actions', () => ({ createApiKeyAction: (...a: any[]) => createApiKeyAction(...a) }));

import { CreateKeyDialog } from './CreateKeyDialog';

describe('CreateKeyDialog', () => {
  beforeEach(() => {
    createApiKeyAction.mockReset();
  });

  it('shows the plaintext key exactly once with a "shown only once" warning', async () => {
    createApiKeyAction.mockResolvedValue({
      ok: true,
      fullKey: 'gw_live_SUPERSECRETPLAINTEXT',
      keyPrefix: 'gw_live_SUPERS',
    });

    render(<CreateKeyDialog />);
    fireEvent.click(screen.getByRole('button', { name: /create key/i }));
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText('gw_live_SUPERSECRETPLAINTEXT')).toBeInTheDocument();
    });
    expect(screen.getByText(/only once/i)).toBeInTheDocument();

    // Dismissing the modal removes the plaintext from the DOM (never re-shown).
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByText('gw_live_SUPERSECRETPLAINTEXT')).not.toBeInTheDocument();
  });

  it('surfaces an error without showing any key', async () => {
    createApiKeyAction.mockResolvedValue({ ok: false, error: 'Monthly limit must be positive' });

    render(<CreateKeyDialog />);
    fireEvent.click(screen.getByRole('button', { name: /create key/i }));
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText(/monthly limit must be positive/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/only once/i)).not.toBeInTheDocument();
  });
});
