# k6 Performance Tests

Kubernetes-native performance testing for Codex using [k6](https://k6.io/).

## Overview

This Helm chart deploys k6 performance tests that run on a schedule and export metrics to Prometheus for visualization in Grafana.

## Test Scripts

| Script | Purpose | Duration |
|--------|---------|----------|
| `api-load-test.js` | Main API load test with ramping VUs | ~5 min |
| `auth-flow-test.js` | Authentication flow testing | ~3 min |
| `health-check.js` | Smoke test for health endpoints | 30 sec |

## Configuration

Edit `values.yaml` to configure:

```yaml
target:
  apiUrl: "http://codexdb-backend.codex-dev.svc.cluster.local:8000"

tests:
  vus: 10           # Virtual users
  duration: "5m"    # Test duration

schedule: "0 6 * * *"  # Daily at 6 AM UTC
```

## Running Tests Manually

```bash
# Create a one-time job
kubectl create job --from=cronjob/k6-scheduled-test k6-manual-run -n k6-perf

# Watch the logs
kubectl logs -f job/k6-manual-run -n k6-perf

# Clean up
kubectl delete job k6-manual-run -n k6-perf
```

## Local Development

```bash
# Run locally against dev environment
k6 run --vus 5 --duration 1m scripts/api-load-test.js

# Run with Prometheus output
k6 run --out experimental-prometheus-rw scripts/api-load-test.js
```

## Metrics

k6 exports these metrics to Prometheus:

- `k6_http_req_duration` - Request duration histogram
- `k6_http_reqs` - Request count
- `k6_http_req_failed` - Failed request rate
- `k6_vus` - Active virtual users
- Custom: `api_latency`, `errors`, `auth_errors`

## Dashboard

The k6 performance dashboard is deployed via grafana-gitops:
- Dashboard: `codex-k6-performance.json`
- Template: `codex-k6-performance.yaml`
