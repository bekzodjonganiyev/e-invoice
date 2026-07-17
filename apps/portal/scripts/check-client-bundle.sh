#!/usr/bin/env bash
# Bundle-leak verification (LEAK PREVENTION 9.8).
# Fails (exit 1) if any server-only secret appears in the client bundle.
# Run AFTER `pnpm --filter @gw/portal build`.
set -euo pipefail

STATIC_DIR="$(cd "$(dirname "$0")/.." && pwd)/.next/static"

if [ ! -d "$STATIC_DIR" ]; then
  echo "ERROR: $STATIC_DIR not found. Run 'pnpm --filter @gw/portal build' first." >&2
  exit 2
fi

fail=0

# check <label> <regex> [--literal]
# Uses extended regex by default; pass --literal for fixed-string (secret values).
check() {
  local label="$1"
  local pattern="$2"
  local mode="${3:-}"
  if [ -z "$pattern" ]; then
    return 0
  fi
  local grep_opts=(-rnE)
  [ "$mode" = "--literal" ] && grep_opts=(-rnF)
  if grep "${grep_opts[@]}" -- "$pattern" "$STATIC_DIR" >/dev/null 2>&1; then
    echo "LEAK: found '$label' in client bundle ($STATIC_DIR)" >&2
    grep "${grep_opts[@]}" -- "$pattern" "$STATIC_DIR" | head -5 >&2
    fail=1
  fi
}

# Static marker: a REAL secret key is `sb_secret_` followed by a long token.
# We require >=12 token chars so the bare `sb_secret_…` string that the bundled
# @supabase/*-js libraries carry in their JSDoc (no token) does NOT false-positive.
# (The word "service_role" alone is dropped as a marker — supabase-js references
#  it in library code, and a real service-role KEY is caught by the checks below.)
check "sb_secret_ key token" 'sb_secret_[A-Za-z0-9_-]{12,}'

# Actual secret VALUES from the environment — the authoritative guard.
check "API_KEY_PEPPER value" "${API_KEY_PEPPER:-}" --literal
check "SUPABASE_SERVICE_ROLE_KEY value" "${SUPABASE_SERVICE_ROLE_KEY:-}" --literal

if [ "$fail" -ne 0 ]; then
  echo "FAIL: secrets detected in client bundle." >&2
  exit 1
fi

echo "OK: no secrets in client bundle"
