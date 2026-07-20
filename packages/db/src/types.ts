// Hand-maintained Supabase schema types shared by Portal + Gateway.
// (In a real project these would be produced by `supabase gen types typescript`;
// they are kept in sync with migrations/0001_init.sql.)

export type UserRole = 'user' | 'admin';
export type KeyEnvironment = 'live' | 'test';
export type ApiKeyStatus = 'active' | 'exhausted' | 'revoked' | 'expired';
export type BillingStatus = 'pending' | 'paid' | 'void';
export type SyncEventType = 'key_created' | 'key_updated' | 'key_revoked';

export type ProfileRow = {
  id: string;
  full_name: string | null;
  is_active: boolean;
  role: UserRole;
  created_at: string | null;
  updated_at: string | null;
}

export type ApiKeyRow = {
  id: string;
  user_id: string;
  label: string | null;
  environment: KeyEnvironment;
  key_prefix: string;
  key_hash: string;
  monthly_limit: number;
  current_usage: number;
  current_period_start: string;
  rate_limit_per_min: number | null;
  status: ApiKeyStatus;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type UsageEventRow = {
  id: number;
  api_key_id: string;
  user_id: string;
  request_id: string | null;
  method: string;
  source_path: string;
  target_path: string | null;
  status_code: number | null;
  latency_ms: number | null;
  billable: boolean;
  occurred_at: string;
  created_at: string | null;
}

export type BillingRecordRow = {
  id: string;
  user_id: string;
  api_key_id: string | null;
  amount: string; // decimal(14,2) is returned as string by supabase-js
  currency: string;
  description: string | null;
  status: BillingStatus;
  period_start: string | null;
  period_end: string | null;
  created_at: string | null;
}

export type GatewaySyncEventRow = {
  id: number;
  event_type: SyncEventType;
  api_key_id: string | null;
  payload: Record<string, unknown> | null;
  consumed_at: string | null;
  created_at: string | null;
}

// Subset returned by the active_keys_bootstrap view (no user-facing columns).
export type ActiveKeyBootstrapRow = {
  id: string;
  user_id: string;
  key_prefix: string;
  key_hash: string;
  monthly_limit: number;
  current_usage: number;
  current_period_start: string;
  rate_limit_per_min: number | null;
  status: ApiKeyStatus;
  environment: KeyEnvironment;
  expires_at: string | null;
}

// Insert payloads (server-side / service_role only).
export type ApiKeyInsert = Pick<
  ApiKeyRow,
  'user_id' | 'label' | 'environment' | 'key_prefix' | 'key_hash' | 'monthly_limit'
> &
  Partial<Pick<ApiKeyRow, 'rate_limit_per_min' | 'expires_at' | 'status'>>;

export type UsageEventInsert = Pick<
  UsageEventRow,
  'api_key_id' | 'user_id' | 'method' | 'source_path' | 'occurred_at'
> &
  Partial<
    Pick<
      UsageEventRow,
      'request_id' | 'target_path' | 'status_code' | 'latency_ms' | 'billable'
    >
  >;

// Minimal Database shape for `createClient<Database>()` typing in both apps.
// The empty `Relationships: []` and `Functions: {}` members are required so the
// type satisfies supabase-js's GenericSchema constraint (otherwise Insert/Update
// payload types silently degrade to `never`).
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      api_keys: {
        Row: ApiKeyRow;
        Insert: ApiKeyInsert;
        Update: Partial<ApiKeyRow>;
        Relationships: [];
      };
      usage_events: {
        Row: UsageEventRow;
        Insert: UsageEventInsert;
        Update: Partial<UsageEventRow>;
        Relationships: [];
      };
      billing_records: {
        Row: BillingRecordRow;
        Insert: Partial<BillingRecordRow>;
        Update: Partial<BillingRecordRow>;
        Relationships: [];
      };
      gateway_sync_events: {
        Row: GatewaySyncEventRow;
        Insert: Partial<GatewaySyncEventRow>;
        Update: Partial<GatewaySyncEventRow>;
        Relationships: [];
      };
    };
    Views: {
      active_keys_bootstrap: { Row: ActiveKeyBootstrapRow; Relationships: [] };
    };
    Functions: Record<string, never>;
    Enums: {
      key_environment: KeyEnvironment;
      api_key_status: ApiKeyStatus;
      billing_status: BillingStatus;
      sync_event_type: SyncEventType;
    };
    CompositeTypes: Record<string, never>;
  };
}
