#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
INTENSITY="${2:-15}"
REQUESTS="${REQUESTS:-5}"

echo "[INFO] Triggering synthetic load to validate alerting pipeline"

for i in $(seq 1 "${REQUESTS}"); do
  echo "[INFO] Iteration ${i}/${REQUESTS} (intensity=${INTENSITY})"
  curl -sS "${BASE_URL}/load/${INTENSITY}" >/dev/null || true
  curl -sS -o /dev/null -w '' "${BASE_URL}/does-not-exist" || true
  sleep 2
done

echo "[INFO] Load generation complete. Check Prometheus alerts for HighErrorRate or SlowHttpResponses."
