#!/usr/bin/env bash
# Sends a signed carrier notice to the running real-stack gateway, the way the carrier would.
#   scripts/carrier-notice.sh <shipmentId> <IN_TRANSIT|DELIVERED|DELIVERY_FAILED|PARTIALLY_DELIVERED> <eventId> [reason]
set -euo pipefail
STATE_FILE="${TMPDIR:-/tmp}/commercelab-real-stack.state"
[[ -f "$STATE_FILE" ]] || { echo "No stack recorded in $STATE_FILE. Run scripts/real-stack.sh up." >&2; exit 1; }
# shellcheck disable=SC1090
source "$STATE_FILE"
[[ $# -ge 3 ]] || { echo "usage: $0 <shipmentId> <type> <eventId> [reason]" >&2; exit 2; }

body="$(python3 -c 'import json,sys; b={"eventId":sys.argv[3],"shipmentId":sys.argv[1],"type":sys.argv[2]}
if len(sys.argv)>4: b["reason"]=sys.argv[4]
print(json.dumps(b,separators=(",",":")),end="")' "$@")"
signature="$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$CARRIER_WEBHOOK_SECRET" -hex | awk '{print $NF}')"
curl -s -X POST "http://localhost:${GATEWAY_PORT}/api/v1/shipments/webhooks/carrier" \
  -H 'Content-Type: application/json' -H "X-Signature: $signature" --data-binary "$body"
echo
