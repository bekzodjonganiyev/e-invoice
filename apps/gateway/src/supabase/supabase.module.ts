import { Global, Module } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@gw/db';
import { CONFIG, GatewayConfig } from '../config/configuration';

export const SUPABASE = 'SUPABASE_CLIENT';

export type GatewaySupabase = SupabaseClient<Database>;

/**
 * Supabase client using the SERVICE_ROLE (secret) key. Bypasses RLS.
 * Used only for the Gateway's own DB I/O — never to authenticate an incoming
 * API request (that is done purely on the API key).
 */
@Global()
@Module({
  providers: [
    {
      provide: SUPABASE,
      inject: [CONFIG],
      useFactory: (config: GatewayConfig): GatewaySupabase => {
        return createClient<Database>(
          config.supabaseUrl,
          config.supabaseServiceRoleKey,
          {
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );
      },
    },
  ],
  exports: [SUPABASE],
})
export class SupabaseModule {}
