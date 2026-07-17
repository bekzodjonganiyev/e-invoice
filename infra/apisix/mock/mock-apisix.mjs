#!/usr/bin/env node
/**
 * Local MOCK of the APISIX forward-auth route (a faithful port of
 * ../apisix.tpl.yaml). Lets you exercise the REAL gateway + a mock upstream
 * without running APISIX itself. Mirrors, per request:
 *
 *   1. proxy-rewrite         → inject X-Gateway-Secret (proves caller is APISIX)
 *   2. forward-auth          → GET {GATEWAY_AUTH_URL}; add X-Forwarded-Method/Uri/Proto,
 *                              forward client Authorization/apikey/X-Request-Id
 *        • 2xx  → copy X-User-Id / X-Api-Key-Id onto the upstream request
 *        • deny → relay the auth status + body (+ client_headers) to the client
 *   3. serverless(before_proxy) → strip X-Gateway-Secret before the upstream
 *   4. proxy to {UPSTREAM_URL} (mock Mustang)
 *
 * Env:
 *   LISTEN_PORT=9080
 *   GATEWAY_AUTH_URL=http://127.0.0.1:4000/auth
 *   UPSTREAM_URL=http://127.0.0.1:9081
 *   GATEWAY_FORWARD_AUTH_SECRET=<same as the gateway>
 */
import http from 'node:http';

const LISTEN_PORT = Number(process.env.LISTEN_PORT ?? 9080);
const GATEWAY_AUTH_URL = process.env.GATEWAY_AUTH_URL ?? 'http://127.0.0.1:4000/auth';
const UPSTREAM_URL = process.env.UPSTREAM_URL ?? 'http://127.0.0.1:9081';
const SECRET = process.env.GATEWAY_FORWARD_AUTH_SECRET;

if (!SECRET) {
  console.error('[mock-apisix] GATEWAY_FORWARD_AUTH_SECRET is required');
  process.exit(1);
}

// forward-auth: which auth-response headers to copy upstream on ALLOW.
const UPSTREAM_HEADERS = ['x-user-id', 'x-api-key-id'];
// forward-auth: which auth-response headers to relay to the client on DENY.
const CLIENT_HEADERS = ['www-authenticate', 'x-forward-auth'];

function request(urlStr, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const server = http.createServer((clientReq, clientRes) => {
  const chunks = [];
  clientReq.on('data', (c) => chunks.push(c));
  clientReq.on('end', async () => {
    const clientBody = Buffer.concat(chunks);
    const inbound = clientReq.headers;

    // (1)+(2) forward-auth subrequest
    const authHeaders = {
      'x-gateway-secret': SECRET,
      'x-forwarded-method': clientReq.method,
      'x-forwarded-uri': clientReq.url,
      'x-forwarded-proto': 'http',
    };
    if (inbound['authorization']) authHeaders['authorization'] = inbound['authorization'];
    if (inbound['apikey']) authHeaders['apikey'] = inbound['apikey'];
    if (inbound['x-request-id']) authHeaders['x-request-id'] = inbound['x-request-id'];

    let auth;
    try {
      auth = await request(GATEWAY_AUTH_URL, { method: 'GET', headers: authHeaders });
    } catch (e) {
      // forward-auth status_on_error: fail CLOSED (auth backend unreachable).
      console.log(`[mock-apisix] ${clientReq.method} ${clientReq.url} → auth UNREACHABLE → 503`);
      clientRes.writeHead(503, { 'content-type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'auth backend unreachable', detail: String(e) }));
      return;
    }

    // DENY → relay auth status + selected client_headers, never touch upstream.
    if (auth.status < 200 || auth.status >= 300) {
      console.log(`[mock-apisix] ${clientReq.method} ${clientReq.url} → DENY ${auth.status} (upstream NOT hit)`);
      const relay = { 'content-type': auth.headers['content-type'] ?? 'application/json' };
      for (const h of CLIENT_HEADERS) if (auth.headers[h]) relay[h] = auth.headers[h];
      clientRes.writeHead(auth.status, relay);
      clientRes.end(auth.body);
      return;
    }

    // ALLOW → build upstream request: strip secret, inject identity.
    const upstreamHeaders = { ...inbound };
    delete upstreamHeaders['x-gateway-secret'];
    delete upstreamHeaders['host'];
    delete upstreamHeaders['content-length'];
    for (const h of UPSTREAM_HEADERS) if (auth.headers[h]) upstreamHeaders[h] = auth.headers[h];

    let up;
    try {
      up = await request(`${UPSTREAM_URL}${clientReq.url}`, {
        method: clientReq.method,
        headers: upstreamHeaders,
        body: clientBody.length ? clientBody : undefined,
      });
    } catch (e) {
      console.log(`[mock-apisix] ${clientReq.method} ${clientReq.url} → upstream error`);
      clientRes.writeHead(502, { 'content-type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'upstream error', detail: String(e) }));
      return;
    }
    console.log(`[mock-apisix] ${clientReq.method} ${clientReq.url} → ALLOW (user=${auth.headers['x-user-id']}) → upstream ${up.status}`);
    clientRes.writeHead(up.status, { 'content-type': up.headers['content-type'] ?? 'application/json' });
    clientRes.end(up.body);
  });
});

server.listen(LISTEN_PORT, () => {
  console.log(`[mock-apisix] listening on :${LISTEN_PORT}`);
  console.log(`[mock-apisix]   forward-auth → ${GATEWAY_AUTH_URL}`);
  console.log(`[mock-apisix]   upstream     → ${UPSTREAM_URL}`);
});
