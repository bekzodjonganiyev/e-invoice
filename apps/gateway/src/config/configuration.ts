/** Typed config surface derived from environment variables. */
export interface GatewayConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  redisUrl: string;
  apiKeyPepper: string;
  forwardAuthSecret: string;
  port: number;
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    supabaseUrl: required('SUPABASE_URL', env.SUPABASE_URL),
    supabaseServiceRoleKey: required(
      'SUPABASE_SERVICE_ROLE_KEY',
      env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    apiKeyPepper: required('API_KEY_PEPPER', env.API_KEY_PEPPER),
    forwardAuthSecret: required(
      'GATEWAY_FORWARD_AUTH_SECRET',
      env.GATEWAY_FORWARD_AUTH_SECRET,
    ),
    port: Number(env.PORT ?? 4000),
  };
}

export const CONFIG = 'GATEWAY_CONFIG';
