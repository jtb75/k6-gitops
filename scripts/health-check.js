import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const healthErrors = new Rate('health_errors');

// Configuration
const API_URL = __ENV.K6_API_URL || 'http://localhost:8000';

// Simple smoke test options
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    health_errors: ['rate==0'],           // Zero errors allowed
    http_req_duration: ['p(95)<200'],     // Fast responses required
  },
};

export default function () {
  // Health endpoint
  let res = http.get(`${API_URL}/api/v1/health`);
  check(res, {
    'health status 200': (r) => r.status === 200,
    'health response < 100ms': (r) => r.timings.duration < 100,
  }) || healthErrors.add(1);

  // Readiness endpoint
  res = http.get(`${API_URL}/api/v1/ready`);
  check(res, {
    'ready status 200': (r) => r.status === 200,
  }) || healthErrors.add(1);

  // Prometheus metrics endpoint
  res = http.get(`${API_URL}/api/v2/metrics`);
  check(res, {
    'metrics accessible': (r) => r.status === 200,
    'metrics has prometheus format': (r) => r.body.includes('# HELP') || r.body.includes('# TYPE'),
  }) || healthErrors.add(1);

  sleep(1);
}
