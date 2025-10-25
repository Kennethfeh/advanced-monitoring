# Project 5: Advanced Monitoring Service

Node.js service instrumented for deep observability and synthetic monitoring.

## Features

- Prometheus-style metrics endpoint at `/metrics` with counters, gauges, and histograms.
- Health (`/health`), readiness (`/ready`), and liveness (`/live`) probes for Kubernetes.
- Synthetic check endpoint (`/synthetic-check`) to track downstream latency budgets.
- Load generator endpoint (`/load/:intensity?`) used to exercise auto-scaling and alert thresholds.

## Local Development

```bash
cd app
npm install
npm start
# In another terminal
curl http://localhost:3000/metrics
```

## Canary & Alert Tests

Use the helper scripts in `../scripts` to smoke test or force alerts locally:

- `metrics-canary.sh` – Validates health, readiness, synthetic checks, and metrics output.
- `trigger-alerts.sh` – Generates load/error conditions to validate alert rules end-to-end.
