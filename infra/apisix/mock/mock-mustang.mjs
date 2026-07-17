#!/usr/bin/env node
/**
 * Mock Mustang upstream. Stands in for einvoiceservice.officefreund.de during
 * local testing. Echoes back what it received (method, path, and the identity
 * headers the gateway/APISIX injected) so you can see the full chain end-to-end.
 *
 *   PORT=9081 node mock-mustang.mjs
 */
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 9081);

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    // Surface what identity the edge injected — this is what a real backend uses.
    const seen = {
      method: req.method,
      path: req.url,
      'x-user-id': req.headers['x-user-id'] ?? null,
      'x-api-key-id': req.headers['x-api-key-id'] ?? null,
      // must be ABSENT — the internal secret is stripped before upstream:
      'x-gateway-secret': req.headers['x-gateway-secret'] ?? null,
    };
    console.log(`[mustang] ${req.method} ${req.url}  user=${seen['x-user-id']} key=${seen['x-api-key-id']} secretLeaked=${seen['x-gateway-secret'] !== null}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ mustang: 'ok', received: seen, body: body || null }, null, 2));
  });
});

server.listen(PORT, () => console.log(`[mustang] mock upstream listening on :${PORT}`));
