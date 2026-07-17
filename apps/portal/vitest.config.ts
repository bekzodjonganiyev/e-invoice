import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `server-only` throws when imported outside an RSC bundler; stub it in tests.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@gw/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@gw/db': fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
