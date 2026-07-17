/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: we deliberately do NOT use `env: {}` here — that would inline values
  // into the client bundle. Server-only secrets are read via process.env at
  // runtime in server-only modules. See LEAK PREVENTION rules.
  transpilePackages: ['@gw/shared', '@gw/db'],
};

export default nextConfig;
