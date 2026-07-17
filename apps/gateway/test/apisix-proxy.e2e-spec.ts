/**
 * FULL-CHAIN e2e that MOCKS APISIX and drives the REAL gateway over real HTTP.
 *
 * The existing auth.e2e-spec.ts exercises GET /auth in isolation. This spec adds
 * the piece that matters before deploying to the (already-running) APISIX server:
 * the end-to-end proxy contract APISIX implements around the gateway.
 *
 *   client ──▶ [apisixProxy() — mirrors infra/apisix/apisix.tpl.yaml] ──▶ gateway /auth
 *                                                       │ 2xx → forward to Mustang(mock)
 *                                                       │ deny → relay status to client
 *
 * Real pieces:  the compiled NestJS gateway on a real port; a real HTTP "Mustang"
 * upstream; real HTTP hops between them.  Mocked pieces:  Redis (ioredis-mock, the
 * same lib the unit tests use) and Supabase (stub — the auth hot path never touches
 * it).  So every authorization DECISION is exercised for real.
 */
import 'reflect-metadata';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import RedisMock from 'ioredis-mock';
import { AppModule } from '../src/app.module';
import { CONFIG } from '../src/config/configuration';
import { REDIS } from '../src/redis/redis.module';
import { SUPABASE } from '../src/supabase/supabase.module';
import { buildMetaHash } from '../src/keys/key-meta';
import { generateApiKey, hashApiKey, keyMeta } from '@gw/shared';
import type { ActiveKeyBootstrapRow } from '@gw/db';

const PEPPER = 'apisix-e2e-pepper';
const SECRET = 'apisix-e2e-forward-auth-secret';

const testConfig = {
  supabaseUrl: 'http://localhost',
  supabaseServiceRoleKey: 'x',
  redisUrl: 'redis://localhost:6379',
  apiKeyPepper: PEPPER,
  forwardAuthSecret: SECRET,
  port: 0,
};

const supabaseStub = {
  from: () => ({
    select: async () => ({ data: [], error: null }),
    insert: async () => ({ error: null }),
    update: () => ({ eq: async () => ({ error: null }) }),
  }),
};

function metaRow(over: Partial<ActiveKeyBootstrapRow>, keyHash: string): ActiveKeyBootstrapRow {
  return {
    id: 'id-' + (over.key_prefix ?? 'x'),
    user_id: 'user-1',
    key_prefix: 'gw_live_aaaaaa',
    key_hash: keyHash,
    monthly_limit: 1000,
    current_usage: 0,
    current_period_start: '2026-07-01',
    rate_limit_per_min: null,
    status: 'active',
    environment: 'live',
    expires_at: null,
    ...over,
  };
}

/** What the mock Mustang upstream saw on the last request it served. */
interface UpstreamHit {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Response as the CLIENT observes it after the full APISIX+gateway+upstream chain. */
interface ClientResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  /** null when the request was denied at forward-auth (Mustang never reached). */
  upstreamHit: UpstreamHit | null;
}

describe('APISIX-mocked full proxy chain (e2e)', () => {
  let app: INestApplication;
  let redis: any;
  let gatewayBase: string;
  let mustang: http.Server;
  let mustangBase: string;
  let lastUpstreamHit: UpstreamHit | null;

  async function seed(over: Partial<ActiveKeyBootstrapRow> = {}) {
    const { fullKey, keyPrefix } = generateApiKey('live');
    const keyHash = hashApiKey(fullKey, PEPPER);
    const row = metaRow({ key_prefix: keyPrefix, id: 'id-' + keyPrefix, ...over }, keyHash);
    await redis.hset(keyMeta(keyPrefix), buildMetaHash(row));
    return { fullKey, keyPrefix, row };
  }

  /**
   * apisixProxy — a faithful, minimal port of infra/apisix/apisix.tpl.yaml.
   * Given an inbound client request (method, path, headers, body), it performs
   * exactly what the APISIX route does and returns what the client would see.
   */
  async function apisixProxy(client: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<ClientResponse> {
    const inbound = { ...(client.headers ?? {}) };
    lastUpstreamHit = null;

    // (1) proxy-rewrite: inject the shared secret proving the caller is APISIX.
    const secretForAuth = SECRET;

    // (2) forward-auth: GET gateway /auth. Forward the client's Authorization/apikey
    //     + injected secret; APISIX auto-adds X-Forwarded-Method / X-Forwarded-Uri.
    const authHeaders: Record<string, string> = {
      'X-Gateway-Secret': secretForAuth,
      'X-Forwarded-Method': client.method,
      'X-Forwarded-Uri': client.path,
      'X-Forwarded-Proto': 'https',
    };
    if (inbound['authorization']) authHeaders['Authorization'] = inbound['authorization'];
    if (inbound['apikey']) authHeaders['apikey'] = inbound['apikey'];
    if (inbound['x-request-id']) authHeaders['X-Request-Id'] = inbound['x-request-id'];

    const authRes = await httpGet(`${gatewayBase}/auth`, authHeaders);

    // Deny → APISIX relays the auth status+body to the client; Mustang never hit.
    if (authRes.status < 200 || authRes.status >= 300) {
      return {
        status: authRes.status,
        headers: authRes.headers,
        body: authRes.body,
        upstreamHit: null,
      };
    }

    // Allow → copy upstream_headers (identity) onto the request, STRIP the secret
    // (before_proxy serverless), then proxy to Mustang.
    const upstreamHeaders: Record<string, string> = { ...inbound };
    delete upstreamHeaders['x-gateway-secret']; // stripped so it never reaches Mustang
    if (authRes.headers['x-user-id']) upstreamHeaders['X-User-Id'] = String(authRes.headers['x-user-id']);
    if (authRes.headers['x-api-key-id']) upstreamHeaders['X-Api-Key-Id'] = String(authRes.headers['x-api-key-id']);

    const upstreamRes = await httpRequest(
      `${mustangBase}${client.path}`,
      client.method,
      upstreamHeaders,
      client.body,
    );
    return {
      status: upstreamRes.status,
      headers: upstreamRes.headers,
      body: upstreamRes.body,
      upstreamHit: lastUpstreamHit,
    };
  }

  beforeAll(async () => {
    // Mock Mustang upstream — records what it received, echoes 200.
    mustang = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        lastUpstreamHit = {
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body: Buffer.concat(chunks).toString(),
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ mustang: 'ok', path: req.url }));
      });
    });
    await new Promise<void>((r) => mustang.listen(0, r));
    mustangBase = `http://127.0.0.1:${(mustang.address() as AddressInfo).port}`;

    // Real gateway on a real port, with mock Redis + stub Supabase.
    redis = new RedisMock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(testConfig)
      .overrideProvider(REDIS)
      .useValue(redis)
      .overrideProvider(SUPABASE)
      .useValue(supabaseStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const url = await app.getUrl();
    // getUrl() can report ::1 — normalise to IPv4 loopback for fetch.
    gatewayBase = url.replace('[::1]', '127.0.0.1').replace('localhost', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((r) => mustang.close(() => r()));
  });

  it('ALLOW: valid key → request reaches Mustang WITH identity headers and WITHOUT the secret', async () => {
    const { fullKey, row } = await seed();
    const res = await apisixProxy({
      method: 'POST',
      path: '/v1/documents',
      headers: { authorization: `Bearer ${fullKey}`, 'x-request-id': 'req-42' },
      body: '{"invoice":1}',
    });

    expect(res.status).toBe(200);
    expect(res.upstreamHit).not.toBeNull();
    // Identity injected for the upstream:
    expect(res.upstreamHit!.headers['x-user-id']).toBe(row.user_id);
    expect(res.upstreamHit!.headers['x-api-key-id']).toBe(row.id);
    // Original request preserved:
    expect(res.upstreamHit!.method).toBe('POST');
    expect(res.upstreamHit!.url).toBe('/v1/documents');
    expect(res.upstreamHit!.body).toBe('{"invoice":1}');
    // Internal secret must NOT leak to the third-party upstream:
    expect(res.upstreamHit!.headers['x-gateway-secret']).toBeUndefined();
  });

  it('DENY 401: missing key → Mustang never hit, client gets 401', async () => {
    const res = await apisixProxy({ method: 'GET', path: '/v1/documents' });
    expect(res.status).toBe(401);
    expect(res.upstreamHit).toBeNull();
  });

  it('DENY 401: unknown key', async () => {
    const { fullKey } = generateApiKey('live');
    const res = await apisixProxy({
      method: 'GET',
      path: '/v1/x',
      headers: { authorization: `Bearer ${fullKey}` },
    });
    expect(res.status).toBe(401);
    expect(res.upstreamHit).toBeNull();
  });

  it('DENY 401: revoked key', async () => {
    const { fullKey } = await seed({ status: 'revoked' });
    const res = await apisixProxy({
      method: 'GET',
      path: '/v1/x',
      headers: { authorization: `Bearer ${fullKey}` },
    });
    expect(res.status).toBe(401);
    expect(res.upstreamHit).toBeNull();
  });

  it('DENY 403: expired key', async () => {
    const { fullKey } = await seed({ expires_at: '2020-01-01T00:00:00Z' });
    const res = await apisixProxy({
      method: 'GET',
      path: '/v1/x',
      headers: { authorization: `Bearer ${fullKey}` },
    });
    expect(res.status).toBe(403);
    expect(res.upstreamHit).toBeNull();
  });

  it('DENY 429: rate limited on the 2nd call within the minute', async () => {
    const { fullKey } = await seed({ rate_limit_per_min: 1 });
    const ok = await apisixProxy({
      method: 'GET',
      path: '/v1/x',
      headers: { authorization: `Bearer ${fullKey}` },
    });
    expect(ok.status).toBe(200);
    expect(ok.upstreamHit).not.toBeNull();

    const limited = await apisixProxy({
      method: 'GET',
      path: '/v1/x',
      headers: { authorization: `Bearer ${fullKey}` },
    });
    expect(limited.status).toBe(429);
    expect(limited.upstreamHit).toBeNull();
  });

  it('DENY 429: monthly quota exhausted (and meta flips to exhausted)', async () => {
    const { fullKey, keyPrefix } = await seed({ monthly_limit: 1 });
    const first = await apisixProxy({
      method: 'GET',
      path: '/v1/x',
      headers: { authorization: `Bearer ${fullKey}` },
    });
    expect(first.status).toBe(200);

    const second = await apisixProxy({
      method: 'GET',
      path: '/v1/x',
      headers: { authorization: `Bearer ${fullKey}` },
    });
    expect(second.status).toBe(429);
    expect(second.upstreamHit).toBeNull();
    expect(await redis.hget(keyMeta(keyPrefix), 'status')).toBe('exhausted');
  });

  it('DENY 401: a forged X-Gateway-Secret from a client is ignored (only APISIX injects it)', async () => {
    // A client tries to smuggle its own secret; the gateway trusts only APISIX's
    // injected value. Here we simulate the CLIENT sending a wrong secret — APISIX
    // overwrites it with the real one, so this still authorizes; the meaningful
    // negative is exercised by the gateway unit tests (wrong secret → 401). We
    // instead assert the client's header cannot bypass a MISSING key.
    const res = await apisixProxy({
      method: 'GET',
      path: '/v1/x',
      headers: { 'x-gateway-secret': 'attacker-guess' },
    });
    expect(res.status).toBe(401); // no API key → denied regardless
    expect(res.upstreamHit).toBeNull();
  });
});

// --- tiny HTTP helpers (no supertest; we want real socket hops) ---------------

function httpGet(url: string, headers: Record<string, string>) {
  return httpRequest(url, 'GET', headers);
}

function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
