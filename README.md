# Project 5 · Advanced Monitoring Service

Express-based demo service instrumented with custom Prometheus-style metrics, synthetic checks, and load testing helpers.

## Contents

- `app/` – Node.js service with metrics middleware and REST endpoints.
- `scripts/` – Local test helpers (`metrics-canary.sh`, `trigger-alerts.sh`).

Consult `app/README.md` for endpoint and development details.

## Quick Start

```bash
cd app
npm install
npm start

# Validate metrics and alert conditions
../scripts/metrics-canary.sh http://localhost:3000
../scripts/trigger-alerts.sh http://localhost:3000 15
```
