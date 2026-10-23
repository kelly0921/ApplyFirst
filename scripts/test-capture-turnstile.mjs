import assert from 'node:assert/strict';
import captureWorker from '../workers/applyfirst-capture-worker.js';

const originalFetch = globalThis.fetch;
const savedRows = [];

const env = {
  TURNSTILE_SECRET: 'test-secret',
  TURNSTILE_HOSTNAMES: 'applyfirst-careers.pages.dev',
  CORS_ORIGIN: 'https://applyfirst-careers.pages.dev',
  ENABLE_OWNER_WAITLIST_NOTIFICATIONS: 'false',
  DB: {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              savedRows.push({ sql, values });
              return { meta: { last_row_id: savedRows.length } };
            },
          };
        },
      };
    },
  },
};

function waitlistRequest(token = '', overrides = {}) {
  return new Request('https://applyfirst-capture.example/waitlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://applyfirst-careers.pages.dev',
      'CF-Connecting-IP': '203.0.113.10',
    },
    body: JSON.stringify({
      source: 'turnstile-test',
      email: 'student@example.com',
      referralSource: 'Other',
      referralDetail: 'Campus newsletter',
      turnstileToken: token,
      ...overrides,
    }),
  });
}

async function run() {
  let response = await captureWorker.fetch(waitlistRequest(), env);
  assert.equal(response.status, 403, 'missing tokens must fail closed');
  assert.equal(savedRows.length, 0, 'failed verification must not write to D1');

  globalThis.fetch = async () => Response.json({
    success: true,
    action: 'contribution',
    hostname: 'applyfirst-careers.pages.dev',
  });
  response = await captureWorker.fetch(waitlistRequest('wrong-action'), env);
  assert.equal(response.status, 403, 'wrong actions must be rejected');
  assert.equal(savedRows.length, 0);

  globalThis.fetch = async () => Response.json({
    success: true,
    action: 'waitlist',
    hostname: 'preview.example.com',
  });
  response = await captureWorker.fetch(waitlistRequest('wrong-host'), env);
  assert.equal(response.status, 403, 'unapproved hostnames must be rejected');
  assert.equal(savedRows.length, 0);

  let verificationCount = 0;
  globalThis.fetch = async () => {
    verificationCount += 1;
    return Response.json(
      verificationCount <= 2
        ? { success: true, action: 'waitlist', hostname: 'applyfirst-careers.pages.dev' }
        : { success: false, 'error-codes': ['timeout-or-duplicate'] },
    );
  };

  response = await captureWorker.fetch(waitlistRequest('single-use-token'), env);
  assert.equal(response.status, 200, 'a valid token should allow the existing handler');
  assert.equal(savedRows.length, 1, 'a valid request should write exactly once');
  assert.ok(savedRows[0].sql.includes('referral_source'), 'referral attribution must be persisted');
  assert.ok(savedRows[0].sql.includes('referral_detail'), 'conditional referral detail must be persisted');
  assert.equal(savedRows[0].values[1], 'Other', 'self-reported referral must reach D1 separately from technical source');
  assert.equal(savedRows[0].values[2], 'Campus newsletter', 'conditional referral detail must reach D1');

  response = await captureWorker.fetch(waitlistRequest('valid-without-detail', {
    referralSource: 'APIA Scholars',
    referralDetail: 'must not be retained',
  }), env);
  assert.equal(response.status, 200, 'a valid referral without a follow-up field should be accepted');
  assert.equal(savedRows.length, 2, 'the second valid request should write exactly once');
  assert.equal(savedRows[1].values[1], 'APIA Scholars');
  assert.equal(savedRows[1].values[2], null, 'hidden referral detail must not be stored for unrelated choices');

  response = await captureWorker.fetch(waitlistRequest('single-use-token'), env);
  assert.equal(response.status, 403, 'replayed tokens must be rejected');
  assert.equal(savedRows.length, 2, 'a replay must not create another row');

  console.log('Capture Worker Turnstile checks passed.');
}

try {
  await run();
} finally {
  globalThis.fetch = originalFetch;
}
