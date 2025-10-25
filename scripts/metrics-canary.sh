#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
TIMEOUT="${TIMEOUT:-5}"

function curl_check() {
  local endpoint="$1"
  local expect_status="${2:-200}"

  echo "[INFO] Checking ${BASE_URL}${endpoint}"
  local status
  status=$(curl -s -o /tmp/metrics-canary.$$ --max-time "${TIMEOUT}" -w '%{http_code}' "${BASE_URL}${endpoint}") || status=000

  if [[ "${status}" != "${expect_status}" ]]; then
    echo "[ERROR] ${endpoint} returned status ${status} (expected ${expect_status})" >&2
    echo "--- Response body ---"
    cat /tmp/metrics-canary.$$
    rm -f /tmp/metrics-canary.$$
    exit 1
  fi

  if [[ "${endpoint}" == "/metrics" ]]; then
    grep -E '^http_requests_total' /tmp/metrics-canary.$$ | head -n 3 || echo "[WARN] No http_requests_total metrics found"
  fi

  rm -f /tmp/metrics-canary.$$
}

curl_check "/health"
curl_check "/ready" 200 || true
curl_check "/synthetic-check"
curl_check "/metrics"

echo "[INFO] Metrics canary completed successfully"
