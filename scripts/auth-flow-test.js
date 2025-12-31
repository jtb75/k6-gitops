import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const authErrors = new Rate('auth_errors');
const authLatency = new Trend('auth_latency');

// Configuration
const API_URL = __ENV.K6_API_URL || 'http://localhost:8000';

export const options = {
  stages: [
    { duration: '30s', target: 3 },   // Ramp up slowly (auth is expensive)
    { duration: '2m', target: 5 },    // Hold at 5 concurrent auth flows
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    auth_errors: ['rate<0.2'],        // Auth error rate under 20%
    auth_latency: ['p(95)<2000'],     // 95% of auth under 2s
  },
};

export function setup() {
  const res = http.get(`${API_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`API not available: ${res.status}`);
  }
  return { apiUrl: API_URL };
}

export default function (data) {
  const apiUrl = data.apiUrl;

  group('Authentication Flow', function () {
    // Test auth configuration endpoint (public)
    let res = http.get(`${apiUrl}/api/v1/auth/config`);
    authLatency.add(res.timings.duration);
    check(res, {
      'auth config accessible': (r) => r.status === 200 || r.status === 404,
    }) || authErrors.add(1);

    // Test token validation with invalid token (should return 401)
    res = http.get(`${apiUrl}/api/v1/users/me`, {
      headers: {
        'Authorization': 'Bearer invalid_token_for_load_test',
      },
    });
    authLatency.add(res.timings.duration);
    check(res, {
      'invalid token returns 401': (r) => r.status === 401 || r.status === 403,
      'auth check response time < 500ms': (r) => r.timings.duration < 500,
    }) || authErrors.add(1);
  });

  group('Protected Endpoint Access', function () {
    // Test that protected endpoints properly reject unauthenticated requests
    const endpoints = [
      '/api/v1/povs',
      '/api/v1/scds',
      '/api/v1/tpras',
    ];

    for (const endpoint of endpoints) {
      const res = http.get(`${apiUrl}${endpoint}`);
      authLatency.add(res.timings.duration);
      check(res, {
        [`${endpoint} requires auth`]: (r) => r.status === 401 || r.status === 403,
      }) || authErrors.add(1);
    }
  });

  sleep(2);  // Longer think time for auth tests
}

export function teardown(data) {
  console.log('Auth flow test completed');
}
