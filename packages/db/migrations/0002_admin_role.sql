-- ===== Admin role on profiles =====
-- Customers (Google sign-in) default to 'user'. Admins are seeded manually
-- (scripts/seed-admin.mjs) — there is NO self-service admin signup. Admin-scoped
-- reads run server-side with the service_role key AFTER verifying this column,
-- so no new RLS policy is required; the existing "own profile read" policy is
-- enough for a user to read their own role.
alter table public.profiles
  add column role text not null default 'user'
  check (role in ('user', 'admin'));
