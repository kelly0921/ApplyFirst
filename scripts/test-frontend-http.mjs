import assert from 'node:assert/strict';
import { fetchJson, postJson } from '../src/http.js';

const originalFetch = globalThis.fetch;

try {
  const attempt = {
    id: 'attempt-1',
    programId: 'example-program',
    appliedAt: '2026-10-04T12:00:00.000Z',
  };

  globalThis.fetch = async (_endpoint, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    return new Response(JSON.stringify({ ok: true, created: true, attempt }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const createdAttempt = await postJson('https://worker.example/analytics/application-attempts', {
    programId: 'example-program',
  });
  assert.deepEqual(createdAttempt.attempt, attempt);

  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Workspace not found.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(
    () => postJson('https://worker.example/missing', {}),
    (error) => error.message === 'Workspace not found.' && error.status === 404,
  );

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, records: 72 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  assert.deepEqual(await fetchJson('https://worker.example/library/status'), { ok: true, records: 72 });

  console.log('Frontend HTTP helper checks passed.');
} finally {
  globalThis.fetch = originalFetch;
}
