import { fetchJson, postJson } from './http.js';

function encodeAccessCode(accessCode) {
  return encodeURIComponent(String(accessCode ?? '').trim());
}

export function loadBetaWorkspace(workerBaseUrl, accessCode) {
  return fetchJson(`${workerBaseUrl}/workspace?code=${encodeAccessCode(accessCode)}`);
}

export function saveBetaWorkspace(workerBaseUrl, accessCode, state) {
  return postJson(`${workerBaseUrl}/workspace`, { accessCode, state });
}

export function saveProgramWatch(workerBaseUrl, payload) {
  return postJson(`${workerBaseUrl}/analytics/program-watches`, payload);
}

export function saveProgramEvidence(workerBaseUrl, payload) {
  return postJson(`${workerBaseUrl}/analytics/program-evidence`, payload);
}

export function createApplicationAttempt(workerBaseUrl, payload) {
  return postJson(`${workerBaseUrl}/analytics/application-attempts`, payload);
}

export function saveApplicationOutcome(workerBaseUrl, attemptId, payload) {
  return postJson(
    `${workerBaseUrl}/analytics/application-attempts/${encodeURIComponent(attemptId)}/outcome`,
    payload,
  );
}
