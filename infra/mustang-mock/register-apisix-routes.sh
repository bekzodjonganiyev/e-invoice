#!/usr/bin/env bash
# =============================================================================
# Register the Mustang mock endpoints on the VPS APISIX (etcd mode, Admin API).
#
# Creates, once:
#   - one upstream  "mustang"  → mustang-mock:4001
#   - one plugin_config "1"    → the forward-auth chain that calls the gateway's
#                                single /auth endpoint (proxy-rewrite injects the
#                                secret, forward-auth checks it, serverless strips
#                                it before the upstream). Every route reuses it.
#   - one route per Mustang/S3 endpoint (exact path + method), each pointing at
#     the mustang upstream and referencing the shared auth plugin_config.
#
# Secrets come from the environment — nothing is hard-coded here, so this file is
# safe to commit. Set them first, then run:
#
#   export ADMIN=http://127.0.0.1:9180
#   export KEY=<APISIX admin key>                # apisix config.yaml → deployment.admin.admin_key
#   export SECRET=<GATEWAY_FORWARD_AUTH_SECRET>  # same value as the gateway .env
#   bash register-apisix-routes.sh
# =============================================================================
set -euo pipefail

: "${ADMIN:?set ADMIN, e.g. export ADMIN=http://127.0.0.1:9180}"
: "${KEY:?set KEY to the APISIX admin key}"
: "${SECRET:?set SECRET to GATEWAY_FORWARD_AUTH_SECRET}"

BASE=/api/v1.8.2

echo "==> upstream: mustang -> mustang-mock:4001"
curl -sS "$ADMIN/apisix/admin/upstreams/mustang" -H "X-API-KEY: $KEY" -X PUT -d '{
  "name": "mustang-mock",
  "type": "roundrobin",
  "scheme": "http",
  "pass_host": "pass",
  "nodes": { "mustang-mock:4001": 1 }
}' >/dev/null && echo "    ok"

echo "==> plugin_config 1: forward-auth chain -> gateway:4000/auth"
curl -sS "$ADMIN/apisix/admin/plugin_configs/1" -H "X-API-KEY: $KEY" -X PUT -d '{
  "desc": "gateway forward-auth chain (inject secret, verify, strip)",
  "plugins": {
    "proxy-rewrite": {
      "headers": { "set": { "X-Gateway-Secret": "'"$SECRET"'" } }
    },
    "forward-auth": {
      "uri": "http://gateway:4000/auth",
      "request_method": "GET",
      "request_headers": ["Authorization", "apikey", "X-Gateway-Secret", "X-Request-Id"],
      "upstream_headers": ["X-User-Id", "X-Api-Key-Id"],
      "client_headers": ["WWW-Authenticate"],
      "ssl_verify": false,
      "timeout": 3000,
      "allow_degradation": false,
      "status_on_error": 503
    },
    "serverless-pre-function": {
      "phase": "before_proxy",
      "functions": ["return function(conf, ctx) local core = require(\"apisix.core\"); core.request.set_header(ctx, \"X-Gateway-Secret\", nil) end"]
    }
  }
}' >/dev/null && echo "    ok"

# create_route <id> <METHOD> <uri>
create_route () {
  local id="$1" method="$2" uri="$3"
  curl -sS "$ADMIN/apisix/admin/routes/$id" -H "X-API-KEY: $KEY" -X PUT -d '{
    "name": "'"$id"'",
    "uris": ["'"$uri"'"],
    "methods": ["'"$method"'"],
    "upstream_id": "mustang",
    "plugin_config_id": "1"
  }' >/dev/null && echo "    ok  $method $uri"
}

echo "==> routes: mustang group"
create_route mustang-ping                  GET  "$BASE/mustang/ping"
create_route mustang-notice                GET  "$BASE/mustang/notice"
create_route mustang-xmltopdf              POST "$BASE/mustang/xmltopdf"
create_route mustang-xmltohtml             POST "$BASE/mustang/xmltohtml"
create_route mustang-validationreporttopdf POST "$BASE/mustang/validationReportToPDF"
create_route mustang-validate              POST "$BASE/mustang/validate"
create_route mustang-styledinvoicetofx     POST "$BASE/mustang/styledinvoicetofx"
create_route mustang-phive                 POST "$BASE/mustang/phive"
create_route mustang-pdf2pdfa              POST "$BASE/mustang/pdf2pdfa"
create_route mustang-parse                 POST "$BASE/mustang/parse"
create_route mustang-invoice2xml           POST "$BASE/mustang/invoice2XML"
create_route mustang-extract               POST "$BASE/mustang/extract"
create_route mustang-detach                POST "$BASE/mustang/detach"
create_route mustang-combine               POST "$BASE/mustang/combine"
create_route mustang-combinexml            POST "$BASE/mustang/combineXML"
create_route mustang-ciitoubl             POST "$BASE/mustang/ciitoubl"
create_route mustang-cii2ubl               POST "$BASE/mustang/cii2ubl"
create_route mustang-calculate             POST "$BASE/mustang/calculate"

echo "==> routes: s3 group"
create_route s3-upload   POST "$BASE/s3/upload"
create_route s3-list     GET  "$BASE/s3/list"
# {key} is a path param — APISIX matches it with a trailing wildcard.
create_route s3-download GET  "$BASE/s3/download/*"
create_route s3-delete   GET  "$BASE/s3/delete/*"

echo "==> done. 22 routes + 1 upstream + 1 auth plugin_config registered."
