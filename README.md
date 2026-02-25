# Advanced Monitoring Service

Purpose-built Express service instrumented with custom Prometheus-style metrics, health probes, and synthetic checks. Use it to demo observability guardrails, SLO validation, or canary rollouts without relying on third-party dependencies.

## Objectives

- Show how operators can expose HTTP/JSON endpoints plus `/metrics` in a single lightweight service.
- Provide helper scripts that validate probes, metrics, and alert thresholds the same way production runbooks do.
- Offer a realistic target for chaos, load, and synthetic experiments.

## Repository layout

| Path | Description |
| --- | --- |
| `app/` | Node.js service with `/health`, `/ready`, `/live`, `/synthetic-check`, `/load/:intensity?`, and `/metrics`. Ships a custom Prometheus registry (counter, gauge, histogram) and exposes structured JSON responses for dashboards. |
| `scripts/metrics-canary.sh` | Curl-based smoke test that walks the health endpoints, exercises `/synthetic-check`, and validates `/metrics` output. |
| `scripts/trigger-alerts.sh` | Issues bursts of load/error responses to force alert conditions so SLO dashboards can be inspected. |

## Prerequisites

- Node.js 18+
- npm
- Optional: `hey`/`ab` for ad-hoc load tests and `jq` for script output

## Local development

```bash
cd app
npm install
npm run dev
```

In another terminal:

```bash
curl http://localhost:3000/metrics
curl http://localhost:3000/ready
curl http://localhost:3000/synthetic-check
```

## Prometheus-style metrics

The service ships its own registry and exposes:

- `http_requests_total`, `http_request_duration_seconds`, `nodejs_active_requests`
- `application_errors_total`, `application_readiness_status`
- `synthetic_latency_ms`, `load_test_duration_seconds`
- Standard process uptime and memory gauges

Targets can be annotated with labels (e.g., `env`, `version`) through environment variables when deploying to Kubernetes or ECS.

## Smoke tests & alert drills

```bash
# Validate readiness + metrics
./scripts/metrics-canary.sh http://localhost:3000

# Generate sustained load to trigger alerts
./scripts/trigger-alerts.sh http://localhost:3000 20
```

Each script returns non-zero exit codes when any health check or threshold fails, making them safe to drop into CI or GitOps workflows.

## Suggested CI pipeline

1. `npm ci`
2. `npm test`
3. `npm run lint`
4. Spin up the service (Docker/PM2) and invoke `scripts/metrics-canary.sh`

The scripts act as executable documentation: everything your SRE team expects before a deployment promotion can be run locally or in CI.

## Deployment tips

- Containerize with the included `Dockerfile` or rely on `node:18-alpine` and copy `app/` in.
- Expose `/metrics` via ServiceMonitor/PodMonitor when running on Kubernetes.
- Wire `/synthetic-check` into Datadog/Grafana synthetic checks to simulate customer flows and feed SLOs.

Use this repo as a lab environment for observability practices—swap the endpoints or add new metrics as needed while keeping the operational tooling close to the code.
