import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const requestCount = new Counter('requests_total');

// Configuration from environment
const API_URL = __ENV.K6_API_URL || 'http://localhost:8000';

// Test options
export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up to 5 users
    { duration: '2m', target: 10 },   // Hold at 10 users
    { duration: '1m', target: 20 },   // Spike to 20 users
    { duration: '1m', target: 10 },   // Scale down to 10
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% under 500ms, 99% under 1s
    errors: ['rate<0.1'],                             // Error rate under 10%
    http_req_failed: ['rate<0.05'],                   // Request failure under 5%
  },
};

// Setup - runs once before tests
export function setup() {
  // Verify API is accessible
  const res = http.get(`${API_URL}/api/v1/health`);
  if (res.status !== 200) {
    throw new Error(`API health check failed: ${res.status}`);
  }
  console.log(`API health check passed. Testing against: ${API_URL}`);
  return { apiUrl: API_URL };
}

// Main test function
export default function (data) {
  const apiUrl = data.apiUrl;

  group('Health Endpoints', function () {
    // Health check
    let res = http.get(`${apiUrl}/api/v1/health`);
    requestCount.add(1);
    apiLatency.add(res.timings.duration);
    check(res, {
      'health status is 200': (r) => r.status === 200,
      'health response time < 100ms': (r) => r.timings.duration < 100,
    }) || errorRate.add(1);

    // Readiness check
    res = http.get(`${apiUrl}/api/v1/ready`);
    requestCount.add(1);
    apiLatency.add(res.timings.duration);
    check(res, {
      'ready status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });

  group('Metrics Endpoint', function () {
    const res = http.get(`${apiUrl}/api/v2/metrics`);
    requestCount.add(1);
    apiLatency.add(res.timings.duration);
    check(res, {
      'metrics status is 200': (r) => r.status === 200,
      'metrics response time < 500ms': (r) => r.timings.duration < 500,
    }) || errorRate.add(1);
  });

  group('Public Endpoints', function () {
    // Version endpoint
    const res = http.get(`${apiUrl}/api/v1/version`);
    requestCount.add(1);
    apiLatency.add(res.timings.duration);
    check(res, {
      'version status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    }) || errorRate.add(1);
  });

  sleep(1);  // Think time between iterations
}

// Teardown - runs once after all tests
export function teardown(data) {
  console.log('Load test completed');
}
