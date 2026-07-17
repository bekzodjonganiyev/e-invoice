# @gw/db

Shared database contract: the SQL migration and the TypeScript types both apps import.

## Files

- `migrations/0001_init.sql` — apply exactly (enums, tables, RLS, trigger, bootstrap view,
  Realtime publication, and the hard guard revoking `SELECT (key_hash)` from clients).
- `src/types.ts` — hand-maintained `Database` types kept in sync with the migration.

## Applying the migration

Local Supabase (Docker) or the hosted project:

```bash
# hosted project (uses SUPABASE_DB_URL from your migration tooling env)
psql "$SUPABASE_DB_URL" -f migrations/0001_init.sql

# or via the Supabase SQL editor: paste the file contents and run.
```

After applying, confirm Realtime is enabled on `public.api_keys` (the migration adds it to
the `supabase_realtime` publication).
