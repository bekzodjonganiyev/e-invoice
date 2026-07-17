import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Static guards for the LEAK PREVENTION rules (section 9). These assert on
 * source, so a regression fails fast in CI without needing a full build.
 */
describe('secret handling (source-level guards)', () => {
  function read(rel: string): string {
    return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  }

  it('env.server.ts is server-only and reads secrets without NEXT_PUBLIC_', () => {
    const src = read('./env.server.ts');
    expect(src).toContain("import 'server-only'");
    expect(src).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(src).toContain('API_KEY_PEPPER');
    // secrets must NOT be exposed via a NEXT_PUBLIC_ variable
    expect(src).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
    expect(src).not.toContain('NEXT_PUBLIC_API_KEY_PEPPER');
  });

  it('admin (service_role) client is guarded by server-only', () => {
    const src = read('./supabase/admin.ts');
    expect(src).toContain("import 'server-only'");
  });

  it('create-key logic is guarded by server-only', () => {
    const src = read('./keys/create-key.ts');
    expect(src).toContain("import 'server-only'");
  });

  it('the browser client only uses the public anon key', () => {
    const src = read('./supabase/client.ts');
    expect(src).toContain('publicSupabaseAnonKey');
    expect(src).not.toContain('SERVICE_ROLE');
    expect(src).not.toContain('serviceRoleKey');
  });
});
