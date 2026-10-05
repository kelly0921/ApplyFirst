import assert from 'node:assert/strict';
import {
  createApplicationAttempt,
  loadBetaWorkspace,
  saveApplicationOutcome,
  saveBetaWorkspace,
  saveProgramEvidence,
  saveProgramWatch,
} from '../src/workspace-api.js';

const originalFetch = globalThis.fetch;
const workerBaseUrl = 'https://worker.example';
const accessCode = 'AF-STUDENT-1234';
const requests = [];
let workspaceState = null;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

try {
  globalThis.fetch = async (endpoint, options = {}) => {
    const url = new URL(endpoint);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, pathname: url.pathname, search: url.search, body });

    if (method === 'GET' && url.pathname === '/workspace') {
      assert.equal(url.searchParams.get('code'), accessCode);
      return json({ ok: true, exists: Boolean(workspaceState), invited: true, state: workspaceState });
    }

    if (method === 'POST' && url.pathname === '/workspace') {
      assert.equal(body.accessCode, accessCode);
      workspaceState = body.state;
      return json({ ok: true, workspaceId: 'workspace-1' });
    }

    if (method === 'POST' && url.pathname === '/analytics/program-watches') {
      assert.equal(body.accessCode, accessCode);
      return json({ ok: true, programId: body.programId, watching: body.watching });
    }

    if (method === 'POST' && url.pathname === '/analytics/program-evidence') {
      assert.equal(body.accessCode, accessCode);
      return json({ ok: true, programId: body.programId }, 201);
    }

    if (method === 'POST' && url.pathname === '/analytics/application-attempts') {
      assert.equal(body.accessCode, accessCode);
      return json({
        ok: true,
        created: true,
        attempt: {
          id: 'attempt-1',
          programId: body.programId,
          appliedAt: body.appliedAt,
          cycleLabel: body.cycleLabel,
          outcome: 'pending',
        },
      }, 201);
    }

    if (method === 'POST' && url.pathname === '/analytics/application-attempts/attempt-1/outcome') {
      assert.equal(body.accessCode, accessCode);
      return json({ ok: true, attemptId: 'attempt-1', outcome: body.outcome });
    }

    return json({ ok: false, error: 'Unexpected contract request.' }, 404);
  };

  const firstLoad = await loadBetaWorkspace(workerBaseUrl, accessCode);
  assert.equal(firstLoad.exists, false);
  assert.equal(firstLoad.invited, true);

  const expectedWorkspace = {
    savedIds: ['example-program'],
    watchIntentProgramIds: ['example-program'],
  };
  await saveBetaWorkspace(workerBaseUrl, accessCode, expectedWorkspace);
  assert.deepEqual((await loadBetaWorkspace(workerBaseUrl, accessCode)).state, expectedWorkspace);

  await saveProgramWatch(workerBaseUrl, {
    accessCode,
    programId: 'example-program',
    watching: true,
  });
  await saveProgramEvidence(workerBaseUrl, {
    accessCode,
    programId: 'example-program',
    relevance: 'this_cycle',
  });
  const applicationResult = await createApplicationAttempt(workerBaseUrl, {
    accessCode,
    programId: 'example-program',
    appliedAt: '2026-10-04T12:00:00.000Z',
    cycleLabel: '2026',
  });
  assert.equal(applicationResult.attempt.id, 'attempt-1');
  await saveApplicationOutcome(workerBaseUrl, 'attempt-1', {
    accessCode,
    outcome: 'not_selected',
  });

  assert.deepEqual(
    requests.map((request) => `${request.method} ${request.pathname}`),
    [
      'GET /workspace',
      'POST /workspace',
      'GET /workspace',
      'POST /analytics/program-watches',
      'POST /analytics/program-evidence',
      'POST /analytics/application-attempts',
      'POST /analytics/application-attempts/attempt-1/outcome',
    ],
  );

  console.log('Synced workspace frontend contract checks passed.');
} finally {
  globalThis.fetch = originalFetch;
}
