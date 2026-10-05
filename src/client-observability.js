const inviteCodePattern = /\bAF-[A-Z0-9][A-Z0-9-]{4,58}[A-Z0-9]\b/gi;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const urlPattern = /https?:\/\/[^\s)\]}>'"]+/gi;
const workspaceInviteCodePattern = /^AF-[A-Z0-9][A-Z0-9-]{4,58}[A-Z0-9]$/;
const reportThrottleMs = 5 * 60 * 1000;
const recentReports = new Map();

export function sanitizeClientErrorText(value, maxLength = 600) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(inviteCodePattern, '[invite-code]')
    .replace(emailPattern, '[email]')
    .replace(urlPattern, '[url]')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeClientStackText(value, maxLength = 3000) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(inviteCodePattern, '[invite-code]')
    .replace(emailPattern, '[email]')
    .replace(urlPattern, (url) => formatSafeStackLocation(url))
    .replace(/[^\S\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function reportClientIssue({
  workerBaseUrl,
  accessCode,
  sessionId = '',
  operation,
  error,
  details = {},
  fetchImpl = globalThis.fetch,
  now = Date.now(),
}) {
  const normalizedOperation = sanitizeClientErrorText(operation, 80) || 'unknown_operation';
  const httpStatus = Number.isFinite(error?.status) ? Number(error.status) : null;
  const message = sanitizeClientErrorText(error?.message || String(error || 'Unknown client error.'), 600);
  const stack = sanitizeClientStackText(error?.stack, 3000);
  const errorName = sanitizeClientErrorText(error?.name || 'Error', 80);

  console.error('[ApplyFirst client issue]', {
    operation: normalizedOperation,
    status: httpStatus,
    message,
  });

  const normalizedCode = String(accessCode || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!workerBaseUrl || !workspaceInviteCodePattern.test(normalizedCode) || typeof fetchImpl !== 'function') {
    return Promise.resolve(false);
  }

  const throttleKey = [normalizedOperation, httpStatus ?? '', message, stack.slice(0, 300)].join('|');
  const previousReportAt = recentReports.get(throttleKey) ?? 0;

  if (now - previousReportAt < reportThrottleMs) {
    return Promise.resolve(false);
  }

  recentReports.set(throttleKey, now);
  pruneReportThrottle(now);

  return fetchImpl(`${String(workerBaseUrl).replace(/\/$/, '')}/analytics/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      accessCode: normalizedCode,
      operation: normalizedOperation,
      errorName,
      httpStatus,
      message,
      stack,
      componentStack: sanitizeClientErrorText(details.componentStack, 2000),
      view: sanitizeClientErrorText(details.view, 80),
      programId: sanitizeClientErrorText(details.programId, 160),
      sessionId: sanitizeClientErrorText(sessionId, 120),
      occurredAt: new Date(now).toISOString(),
    }),
  })
    .then((response) => response.ok)
    .catch(() => false);
}

function formatSafeStackLocation(value) {
  const withoutQuery = String(value).split(/[?#]/, 1)[0];
  const filenameWithLocation = withoutQuery.split('/').pop() || 'script';
  const safeFilename = filenameWithLocation.replace(/[^A-Z0-9._:-]/gi, '').slice(-160) || 'script';
  return `[script:${safeFilename}]`;
}

function pruneReportThrottle(now) {
  if (recentReports.size <= 100) {
    return;
  }

  for (const [key, reportedAt] of recentReports) {
    if (now - reportedAt >= reportThrottleMs) {
      recentReports.delete(key);
    }
  }
}

export function resetClientIssueThrottleForTests() {
  recentReports.clear();
}
