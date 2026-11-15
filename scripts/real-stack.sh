#!/usr/bin/env bash
# Starts the real backend (../be Compose stack: gateway, IAM, Postgres, Redis, ...) in a uniquely named project
# and the production build of this app pointed at its gateway, so a person can walk through the journeys in Chrome.
# Everything is removed again by `down`, which also reports anything left behind.
#
#   scripts/real-stack.sh up     start the stack and the app, print the address to open
#   scripts/real-stack.sh down   stop the app, remove the Compose project, report leftovers
set -euo pipefail

cd "$(dirname "$0")/.."
BE_DIR="${BE_DIR:-../be}"
STATE_FILE="${TMPDIR:-/tmp}/commercelab-real-stack.state"

free_port() {
  python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

up() {
  if [[ -f "$STATE_FILE" ]]; then
    echo "A stack is already recorded in $STATE_FILE. Run '$0 down' first." >&2
    exit 1
  fi

  local project="commerce-e2e-$$-${RANDOM}"
  local gateway_port fe_port
  gateway_port="$(free_port)"
  fe_port="$(free_port)"
  local access_secret refresh_secret auth_secret
  access_secret="$(openssl rand -hex 32)"
  refresh_secret="$(openssl rand -hex 32)"
  auth_secret="$(openssl rand -base64 32)"

  {
    echo "PROJECT=$project"
    echo "GATEWAY_PORT=$gateway_port"
    echo "FE_PORT=$fe_port"
  } >"$STATE_FILE"

  echo "Starting the backend in Compose project $project (building images, this takes a few minutes)..."
  (
    cd "$BE_DIR"
    export JWT_ACCESS_SECRET="$access_secret" JWT_REFRESH_SECRET="$refresh_secret"
    export API_GATEWAY_HOST_PORT="$gateway_port"
    export POSTGRES_HOST_PORT="$(free_port)" MONGO_HOST_PORT="$(free_port)" REDIS_HOST_PORT="$(free_port)"
    export REDPANDA_KAFKA_HOST_PORT="$(free_port)" REDPANDA_ADMIN_HOST_PORT="$(free_port)"
    export BACKOFFICE_SUPPORT_HOST_PORT="$(free_port)" NOTIFICATION_SERVICE_HOST_PORT="$(free_port)"
    export S3_HOST_PORT="$(free_port)"
    docker compose -p "$project" --profile app up -d --build --wait --wait-timeout 600
    echo "POSTGRES_PORT=$POSTGRES_HOST_PORT" >>"$STATE_FILE"
    echo "S3_PORT=$S3_HOST_PORT" >>"$STATE_FILE"

    echo "Loading the demo catalog and its opening stock (make seed) ..."
    DATABASE_URL_INVENTORY="postgres://inventory_svc_user:inventory_secret@localhost:${POSTGRES_HOST_PORT}/commerce_lab?sslmode=disable&search_path=inventory" \
      DATABASE_URL_PRICING="postgres://pricing_svc_user:pricing_secret@localhost:${POSTGRES_HOST_PORT}/commerce_lab?sslmode=disable&search_path=pricing" \
      MONGO_URI="mongodb://mongo_admin:mongo_password@localhost:${MONGO_HOST_PORT}/commerce_lab_doc?authSource=admin" \
      make seed
  )

  echo "Building the app against http://localhost:$gateway_port/api/v1 ..."
  NEXT_PUBLIC_MOCK_MODE=false \
    NEXT_PUBLIC_API_BASE_URL="http://localhost:$gateway_port/api/v1" \
    NEXT_PUBLIC_BACKOFFICE_API_BASE_URL="http://localhost:$gateway_port/api/v1" \
    pnpm build >/dev/null

  NEXT_PUBLIC_MOCK_MODE=false \
    NEXT_PUBLIC_API_BASE_URL="http://localhost:$gateway_port/api/v1" \
    NEXTAUTH_URL="http://localhost:$fe_port" NEXTAUTH_SECRET="$auth_secret" \
    nohup pnpm start --port "$fe_port" >"${TMPDIR:-/tmp}/commercelab-real-stack-app.log" 2>&1 &
  echo "APP_PID=$!" >>"$STATE_FILE"

  for _ in $(seq 1 30); do
    curl -fs "http://localhost:$fe_port/login" >/dev/null 2>&1 && break
    sleep 1
  done
  echo "Ready. Open http://localhost:$fe_port  (gateway http://localhost:$gateway_port)"
  echo "Seeded accounts all use the development password from be/.env.example (DEV_SEED_PASSWORD):"
  echo "  customer lan@example.com, staff admin@commercelab.vn, wh.hcm@commercelab.vn,"
  echo "  product@commercelab.vn (PRODUCT_STAFF), marketing@commercelab.vn (MARKETING),"
  echo "  whmgr.hcm@commercelab.vn (WAREHOUSE_MGR, WH-HCM-01 only), whmgr.all@commercelab.vn (WAREHOUSE_MGR, every warehouse)"
  echo "Product images upload straight to the object storage service at http://localhost:$(grep '^S3_PORT=' "$STATE_FILE" | cut -d= -f2)"
}

down() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "No stack recorded in $STATE_FILE."
    return 0
  fi
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  if [[ -n "${APP_PID:-}" ]]; then
    kill "$APP_PID" 2>/dev/null || true
    pkill -f "next start --port ${FE_PORT:-0}" 2>/dev/null || true
  fi
  (
    cd "$BE_DIR"
    docker compose -p "$PROJECT" --profile app down --volumes --remove-orphans >/dev/null 2>&1 || true
  )
  docker images --filter "reference=${PROJECT}-*" -q | sort -u | xargs docker rmi -f >/dev/null 2>&1 || true
  local containers images volumes networks
  containers="$(docker ps -aq --filter "label=com.docker.compose.project=${PROJECT}" | wc -l | tr -d ' ')"
  images="$(docker images --filter "reference=${PROJECT}-*" -q | wc -l | tr -d ' ')"
  volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT}" | wc -l | tr -d ' ')"
  networks="$(docker network ls -q --filter "label=com.docker.compose.project=${PROJECT}" | wc -l | tr -d ' ')"
  echo "Leftover containers: ${containers}, images: ${images}, volumes: ${volumes}, networks: ${networks}"
  rm -f "$STATE_FILE"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  *) echo "usage: $0 up|down" >&2; exit 2 ;;
esac
