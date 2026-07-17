#!/bin/sh
# Render the shared secret into the declarative route config, then start APISIX.
# We use a unique __TOKEN__ + sed (not envsubst) so no other `$...` in the YAML
# is accidentally expanded. The rendered file lives only inside the container.
set -eu

: "${GATEWAY_FORWARD_AUTH_SECRET:?GATEWAY_FORWARD_AUTH_SECRET must be set}"

TPL=/opt/apisix.tpl.yaml
OUT=/usr/local/apisix/conf/apisix.yaml

# `|` delimiter + escape any `|` and `&` in the secret to keep sed happy.
esc=$(printf '%s' "$GATEWAY_FORWARD_AUTH_SECRET" | sed -e 's/[&|\\]/\\&/g')
sed "s|__GATEWAY_FORWARD_AUTH_SECRET__|$esc|g" "$TPL" > "$OUT"

echo "[entrypoint] rendered $OUT (secret injected, $(wc -l < "$OUT") lines)"
exec /docker-entrypoint.sh docker-start
