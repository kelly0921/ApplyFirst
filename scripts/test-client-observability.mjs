import assert from 'node:assert/strict';
import {
  reportClientIssue,
  resetClientIssueThrottleForTests,
  sanitizeClientErrorText,
  sanitizeClientStackText,
} from '../src/client-observability.js';

const unsafeText = 'AF-SECRET-1234 failed for student@example.com at https://applyfirst.example/private';
const sanitizedText = sanitizeClientErrorText(unsafeText);

assert.equal(sanitizedText.includes('AF-SECRET-1234'), false);
assert.equal(sanitizedText.includes('student@example.com'), false);
assert.equal(sanitizedText.includes('https://applyfirst.example/private'), false);
assert.match(sanitizedText, /\[invite-code\]/);
assert.match(sanitizedText, /\[email\]/);
assert.match(sanitizedText, /\[url\]/);
assert.match(sanitizeClientStackText('at https://applyfirst.example/assets/index-ABC.js:14:22'), /\[script:index-ABC\.js:14:22\]/);

const requests = [];
const fetchImpl = async (url, options) => {
  requests.push({ url, options, body: JSON.parse(options.body) });
  return new Response(JSON.stringify({ ok: true }), { status: 201 });
};
const error = new Error(unsafeText);
error.status = 502;
error.stack = `Error: ${unsafeText}\n    at https://applyfirst.example/app.js:1:2`;

resetClientIssueThrottleForTests();
const firstReported = await reportClientIssue({
  workerBaseUrl: 'https://worker.example/',
  accessCode: 'AF-TEST-1234',
  sessionId: 'session-1',
  operation: 'workspace_save',
  error,
  details: {
    view: 'programs',
    programId: 'example-program',
    componentStack: `Widget student@example.com https://applyfirst.example/private`,
  },
  fetchImpl,
  now: Date.parse('2026-10-04T12:00:00.000Z'),
});
const duplicateReported = await reportClientIssue({
  workerBaseUrl: 'https://worker.example',
  accessCode: 'AF-TEST-1234',
  operation: 'workspace_save',
  error,
  fetchImpl,
  now: Date.parse('2026-10-04T12:01:00.000Z'),
});

assert.equal(firstReported, true);
assert.equal(duplicateReported, false);
assert.equal(requests.length, 1);
assert.equal(requests[0].url, 'https://worker.example/analytics/client-errors');
assert.equal(requests[0].body.httpStatus, 502);
assert.equal(requests[0].body.programId, 'example-program');
assert.equal(requests[0].body.message.includes('AF-TEST-1234'), false);
assert.equal(requests[0].body.message.includes('student@example.com'), false);
assert.equal(requests[0].body.stack.includes('https://applyfirst.example'), false);
assert.match(requests[0].body.stack, /\[script:app\.js:1:2\]/);
assert.equal(requests[0].options.keepalive, true);

const invalidCodeReported = await reportClientIssue({
  workerBaseUrl: 'https://worker.example',
  accessCode: 'EARLYACCESS',
  operation: 'workspace_load',
  error: new Error('Local-only access'),
  fetchImpl,
});

assert.equal(invalidCodeReported, false);
assert.equal(requests.length, 1);

console.log('Client observability checks passed.');
