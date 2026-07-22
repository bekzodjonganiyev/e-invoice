import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { API_BASE, API_HOST, ENDPOINT_GROUPS } from '@/lib/docs/endpoints';
import { ApiKeyBar, TryItProvider } from './TryItContext';
import { TryItPanel } from './TryItPanel';

const pingEndpoint = ENDPOINT_GROUPS.flatMap((g) => g.endpoints).find((e) => e.id === 'mustang-ping')!;
const calculateEndpoint = ENDPOINT_GROUPS.flatMap((g) => g.endpoints).find(
  (e) => e.id === 'mustang-calculate',
)!;

function Harness({ endpoint }: { endpoint: typeof pingEndpoint }) {
  return (
    <TryItProvider>
      <ApiKeyBar />
      <TryItPanel endpoint={endpoint} />
    </TryItProvider>
  );
}

describe('TryItPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to send without an API key', async () => {
    render(<Harness endpoint={pingEndpoint} />);
    fireEvent.click(screen.getByRole('button', { name: /send get request/i }));
    await waitFor(() => {
      expect(screen.getByText(/enter an api key/i)).toBeInTheDocument();
    });
  });

  it('sends a Bearer-authenticated GET to the right URL and renders a JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness endpoint={pingEndpoint} />);
    fireEvent.change(screen.getByPlaceholderText('gw_test_…'), {
      target: { value: 'gw_test_abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send get request/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_HOST}${API_BASE}${pingEndpoint.path}`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer gw_test_abc123');

    await waitFor(() => {
      expect(screen.getByText('200 OK')).toBeInTheDocument();
    });
    expect(screen.getByText('{"ok":true}')).toBeInTheDocument();
  });

  it('sends the edited JSON body on a POST endpoint with the right Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness endpoint={calculateEndpoint} />);
    fireEvent.change(screen.getByPlaceholderText('gw_test_…'), {
      target: { value: 'gw_test_abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send post request/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(calculateEndpoint.body!.example);
  });
});
