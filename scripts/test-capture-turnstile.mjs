import assert from 'node:assert/strict';
import captureWorker from '../workers/applyfirst-capture-worker.js';

const originalFetch = globalThis.fetch;
const savedRows = [];
const waitlistRows = [];
const sentEmails = [];

const env = {
  TURNSTILE_SECRET: 'test-secret',
  TURNSTILE_HOSTNAMES: 'applyfirst-careers.pages.dev',
  CORS_ORIGIN: 'https://applyfirst-careers.pages.dev',
  PUBLIC_APP_URL: 'https://applyfirst-careers.pages.dev',
  ENABLE_WAITLIST_EMAIL_CONFIRMATION: 'true',
  ENABLE_OWNER_WAITLIST_NOTIFICATIONS: 'true',
  OWNER_NOTIFY_EMAIL: 'owner@example.com',
  CAPTURE_FROM_EMAIL: 'applyfirst@example.com',
  CAPTURE_FROM_NAME: 'ApplyFirst',
  EMAIL: {
    async send(message) {
      sentEmails.push(message);
      return { messageId: `message-${sentEmails.length}` };
    },
  },
  DB: {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async run() {
          if (/insert into waitlist_requests/i.test(sql)) {
            savedRows.push({ sql, values: this.values });
            const id = waitlistRows.length + 1;
            waitlistRows.push({
              id,
              source: this.values[0],
              referralSource: this.values[1],
              referralDetail: this.values[2],
              firstName: this.values[3],
              lastName: this.values[4],
              email: this.values[5],
              classYear: this.values[6],
              interest: this.values[7],
              school: this.values[8],
              note: this.values[9],
              preferenceSummary: this.values[10],
              notificationMode: this.values[11],
              emailConfirmationRequired: this.values[14],
              emailConfirmationTokenHash: this.values[15],
              emailConfirmationExpiresAt: this.values[16],
              savedAt: this.values[17],
              createdAt: '2026-10-25T12:00:00.000Z',
              emailConfirmationSentAt: null,
              emailConfirmedAt: null,
            });
            return { meta: { last_row_id: id, changes: 1 } };
          }

          if (/set email_confirmation_sent_at/i.test(sql)) {
            const row = waitlistRows.find((candidate) => candidate.id === this.values[1]);
            if (row) row.emailConfirmationSentAt = this.values[0];
            return { meta: { changes: row ? 1 : 0 } };
          }

          if (/set email_confirmed_at/i.test(sql)) {
            const row = waitlistRows.find((candidate) => (
              candidate.id === this.values[1]
              && candidate.emailConfirmationTokenHash === this.values[2]
              && !candidate.emailConfirmedAt
            ));
            if (row) row.emailConfirmedAt = this.values[0];
            return { meta: { changes: row ? 1 : 0 } };
          }

          return { meta: { changes: 0 } };
        },
        async first() {
          if (/email_confirmation_token_hash = \?/i.test(sql)) {
            return waitlistRows.find((row) => row.emailConfirmationTokenHash === this.values[0]) || null;
          }
          return null;
        },
      };
      return statement;
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
      source: 'applyfirst-waitlist',
      firstName: 'Kelly',
      lastName: 'Chen',
      email: 'student@example.com',
      classYear: 'Freshman',
      interest: 'Software Engineering',
      emailConsentAt: '2026-10-25T12:00:00.000Z',
      emailConsentText: 'I agree to receive ApplyFirst beta access and opportunity updates by email.',
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
      verificationCount <= 4
        ? { success: true, action: 'waitlist', hostname: 'applyfirst-careers.pages.dev' }
        : { success: false, 'error-codes': ['timeout-or-duplicate'] },
    );
  };

  response = await captureWorker.fetch(waitlistRequest('single-use-token'), env);
  assert.equal(response.status, 200, 'a valid token should allow the existing handler');
  const acceptedPayload = await response.json();
  assert.equal(acceptedPayload.confirmationRequired, true);
  assert.equal(savedRows.length, 1, 'a valid request should write exactly once');
  assert.ok(savedRows[0].sql.includes('referral_source'), 'referral attribution must be persisted');
  assert.ok(savedRows[0].sql.includes('referral_detail'), 'conditional referral detail must be persisted');
  assert.ok(savedRows[0].sql.includes('first_name'), 'student first name must be persisted');
  assert.ok(savedRows[0].sql.includes('last_name'), 'student last name must be persisted');
  assert.equal(savedRows[0].values[1], 'Other', 'self-reported referral must reach D1 separately from technical source');
  assert.equal(savedRows[0].values[2], 'Campus newsletter', 'conditional referral detail must reach D1');
  assert.equal(savedRows[0].values[3], 'Kelly');
  assert.equal(savedRows[0].values[4], 'Chen');
  assert.match(savedRows[0].values[12], /^\d{4}-\d{2}-\d{2}T/, 'consent time must be recorded by the server');
  assert.match(savedRows[0].values[13], /agree to receive ApplyFirst beta access/);
  assert.equal(savedRows[0].values[14], 1, 'new public waitlist rows must require email confirmation');
  assert.match(savedRows[0].values[15], /^[a-f0-9]{64}$/, 'only a confirmation token hash may be stored');
  assert.ok(savedRows[0].values[16], 'confirmation expiry must be stored');
  assert.ok(waitlistRows[0].emailConfirmationSentAt, 'confirmation send time must be stored');
  assert.equal(sentEmails.length, 1, 'a confirmation email must be sent before accepting the signup');
  assert.match(sentEmails[0].subject, /Confirm your ApplyFirst waitlist email/);

  const confirmationUrl = sentEmails[0].text.match(/https:\/\/[^\s]+\/waitlist\/confirm\?token=[a-f0-9]{64}/)?.[0];
  assert.ok(confirmationUrl, 'the confirmation email must include an expiring confirmation URL');
  const rawToken = new URL(confirmationUrl).searchParams.get('token');
  assert.notEqual(rawToken, waitlistRows[0].emailConfirmationTokenHash, 'the raw token must never be stored');

  let confirmationResponse = await captureWorker.fetch(new Request(confirmationUrl), env);
  assert.equal(confirmationResponse.status, 303);
  assert.equal(
    confirmationResponse.headers.get('Location'),
    'https://applyfirst-careers.pages.dev/?waitlist=confirmed#waitlist',
  );
  assert.ok(waitlistRows[0].emailConfirmedAt, 'confirmation must activate the waitlist row');
  assert.equal(sentEmails.length, 2, 'the owner should be notified only after the student confirms');
  assert.match(sentEmails[1].subject, /New ApplyFirst Signup/);

  confirmationResponse = await captureWorker.fetch(new Request(confirmationUrl), env);
  assert.equal(confirmationResponse.status, 303, 'confirmation links should be safe to reopen');
  assert.equal(sentEmails.length, 2, 'reopening a confirmation link must not duplicate the owner notification');

  confirmationResponse = await captureWorker.fetch(
    new Request('https://applyfirst-capture.example/waitlist/confirm?token=not-a-valid-token'),
    env,
  );
  assert.match(confirmationResponse.headers.get('Location'), /waitlist=invalid/);

  response = await captureWorker.fetch(waitlistRequest('missing-name', {
    firstName: '',
  }), env);
  assert.equal(response.status, 400, 'public waitlist requests must include both name fields');
  assert.equal(savedRows.length, 1, 'invalid identity data must not write to D1');

  response = await captureWorker.fetch(waitlistRequest('invalid-interest', {
    interest: 'General technology',
  }), env);
  assert.equal(response.status, 400, 'public waitlist requests must use a supported interest');
  assert.equal(savedRows.length, 1, 'invalid profile data must not write to D1');

  response = await captureWorker.fetch(waitlistRequest('valid-without-detail', {
    referralSource: 'APIA Scholars',
    referralDetail: 'must not be retained',
  }), env);
  assert.equal(response.status, 200, 'a valid referral without a follow-up field should be accepted');
  assert.equal(savedRows.length, 2, 'the second valid request should write exactly once');
  assert.equal(savedRows[1].values[1], 'APIA Scholars');
  assert.equal(savedRows[1].values[2], null, 'hidden referral detail must not be stored for unrelated choices');
  assert.equal(
    sentEmails.filter((message) => message.subject === 'Confirm your ApplyFirst waitlist email').length,
    2,
    'each valid public signup should receive one confirmation email',
  );

  const secondConfirmationEmail = sentEmails.findLast(
    (message) => message.subject === 'Confirm your ApplyFirst waitlist email',
  );
  const secondConfirmationUrl = secondConfirmationEmail.text.match(
    /https:\/\/[^\s]+\/waitlist\/confirm\?token=[a-f0-9]{64}/,
  )?.[0];
  waitlistRows[1].emailConfirmationExpiresAt = '2026-01-01T00:00:00.000Z';
  confirmationResponse = await captureWorker.fetch(new Request(secondConfirmationUrl), env);
  assert.match(confirmationResponse.headers.get('Location'), /waitlist=expired/);
  assert.equal(waitlistRows[1].emailConfirmedAt, null, 'expired links must not activate waitlist rows');

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
