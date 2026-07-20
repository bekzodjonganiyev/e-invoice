#!/usr/bin/env node
/**
 * Seed an admin account. Admins have no self-service signup — run this once per
 * admin. It creates a Supabase auth user (email pre-confirmed) and flips the
 * auto-created profile row to role = 'admin'.
 *
 * Requires the SERVICE_ROLE key (never ship this to the browser). Run it from a
 * trusted machine / the VPS, not from client code:
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/seed-admin.mjs admin@example.com 'a-strong-password'
 *
 * Re-running for an existing email promotes that user to admin (idempotent).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, password] = process.argv.slice(2);

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: node scripts/seed-admin.mjs <email> <password>');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(targetEmail) {
  // paginate through users; fine for the small admin set
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  let userId;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    // Already exists → look it up and (re)set the password so it stays known.
    const existing = await findUserByEmail(email);
    if (!existing) throw createErr;
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    console.log(`User already existed — password reset, promoting to admin: ${email}`);
  } else {
    userId = created.user.id;
    console.log(`Created auth user: ${email}`);
  }

  // The on_auth_user_created trigger inserts the profile row (role defaults to
  // 'user'); flip it to admin.
  const { error: roleErr } = await admin
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', userId);
  if (roleErr) throw roleErr;

  console.log(`✓ ${email} is now an admin (id: ${userId})`);
}

main().catch((e) => {
  console.error('Failed:', e.message ?? e);
  process.exit(1);
});
