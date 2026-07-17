import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: we deliberately do NOT use `env: {}` here — that would inline values
  // into the client bundle. Server-only secrets are read via process.env at
  // runtime in server-only modules. See LEAK PREVENTION rules.
  transpilePackages: ['@gw/shared', '@gw/db'],

  // Emit a self-contained server bundle for the container image.
  output: 'standalone',
  // Trace from the monorepo root, otherwise the workspace packages @gw/shared
  // and @gw/db (which live outside apps/portal) are missed and the standalone
  // server crashes at startup on a missing module.
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
