import {
  buildDeliveryCopyState,
  buildDeliveryDedupeKey,
  buildFocusDescription,
  buildStudentMatchReason,
  classifyDeliveryCandidate,
  evaluateStudentDelivery,
  formatFocusRoleTrack,
  getDeliveryBatchDisposition,
  hasPriorApplicationInDifferentCycle,
  inferProgramCycleKey,
  isFreshActionableForProfile,
  matchProgramToFocus,
  normalizeDeliveryEntrySource,
  selectDigestItems,
} from './proactive-delivery.js';

const MAX_SOURCE_BYTES = 250_000;
const MAX_STORED_TEXT = 80_000;
const DEFAULT_MONITOR_LIMIT = 12;
const DEFAULT_DISCOVERY_SEARCH_LIMIT = 5;
const DEFAULT_DISCOVERY_QUERIES_PER_PROGRAM = 3;
const DEFAULT_DISCOVERY_RESULTS_PER_QUERY = 5;
const DEFAULT_SCHEDULED_DISCOVERY_SEARCH_LIMIT = 3;
const DEFAULT_SCHEDULED_DISCOVERY_QUERIES_PER_PROGRAM = 2;
const DEFAULT_SCHEDULED_DISCOVERY_RESULTS_PER_QUERY = 3;
const AUTO_SENDABLE_CONFIDENCES = new Set(['high']);
const BETA_WORKSPACE_CODE_PATTERN = /^AF-[A-Z0-9][A-Z0-9-]{4,58}[A-Z0-9]$/;
const PRODUCT_EVENT_NAMES = new Set([
  'session_started',
  'search_used',
  'program_viewed',
  'program_saved',
  'program_unsaved',
  'watch_started',
  'watch_stopped',
  'application_recorded',
  'application_outcome_updated',
  'focus_saved',
  'alerts_enabled',
  'official_source_clicked',
  'contribution_submitted',
  'outcome_reported',
]);
const PRODUCT_OUTCOMES = new Set(['found_relevant_program', 'applied_earlier', 'not_yet']);
const PRODUCT_EVENT_CONTEXT_FIELDS = new Set([
  'view',
  'source',
  'status',
  'resultCount',
  'queryLength',
  'entrySource',
  'deliveryToken',
]);
const CLIENT_ERROR_OPERATIONS = new Set([
  'workspace_load',
  'workspace_save',
  'program_evidence_load',
  'program_relevance_save',
  'program_watches_load',
  'program_watch_save',
  'application_attempts_load',
  'application_attempt_save',
  'application_outcome_save',
  'invite_verification',
  'react_render',
  'runtime_error',
  'unhandled_promise',
]);
const PROGRAM_RELEVANCE_VALUES = new Set([
  'this_cycle',
  'future_cycle',
  'not_a_fit',
  'not_eligible',
  'eligibility_unclear',
]);
const PRIOR_AWARENESS_VALUES = new Set(['yes', 'no', 'unsure']);
const ELIGIBILITY_UNCLEAR_REASONS = new Set([
  'class_year',
  'major_or_field',
  'location',
  'work_authorization',
  'experience_requirements',
  'other',
]);
const APPLICATION_OUTCOMES = new Set([
  'pending',
  'accepted',
  'not_selected',
  'withdrew',
  'did_not_complete',
  'prefer_not_to_say',
]);
const PROGRAM_ACTION_VALUES = new Set([
  'preparing',
  'started_application',
  'submitted',
  'registered_interest',
  'decided_not_to_apply',
  'waiting',
  'watching',
  'no_action_yet',
]);
const EXTERNAL_ACTION_VALUES = new Set(['started_application', 'submitted', 'registered_interest']);
const SUPPORT_LEVEL_VALUES = new Set([
  'none',
  'product_only',
  'generic_reminder',
  'group_support',
  'one_to_one_support',
]);
const ATTRIBUTION_VALUES = new Set(['yes', 'no', 'unsure']);
const FRICTION_CATEGORY_VALUES = new Set([
  'did_not_know_program_existed',
  'eligibility_unclear',
  'timing_unclear',
  'deadline_unclear',
  'stale_information',
  'broken_or_indirect_link',
  'not_relevant',
  'location_restriction',
  'missing_opportunity_type',
  'too_much_information',
  'not_enough_information',
  'needed_personal_advice',
  'other',
]);
const MONITORING_AUDIT_TYPES = new Set(['known_opening', 'information_accuracy', 'correction']);
const OPERATIONAL_TIME_CATEGORIES = new Set(['monitoring_review', 'data_correction', 'user_support']);
const TESTER_SEGMENT_VALUES = new Set(['unknown', 'rsa_assisted', 'independent_waitlist', 'other']);
const BETA_INVITATION_STATUS_VALUES = new Set(['not_sent', 'sent', 'active', 'paused', 'revoked']);
const ACTIVE_BETA_INVITATION_STATUS_VALUES = new Set(['sent', 'active']);
const ALERT_ENGAGEMENT_ACTIONS = new Set([
  'source_clicked',
  'useful',
  'not_relevant',
  'already_knew',
  'inaccurate',
]);
const PROACTIVE_DELIVERY_ENGAGEMENT_ACTIONS = new Set([
  'source_clicked',
  'program_opened',
  'useful',
  'not_relevant',
  'already_knew',
  'inaccurate',
]);
const DISCOVERY_SEARCH_PROVIDERS = new Set(['brave', 'tavily']);
const NEW_PROGRAM_CANDIDATE_STATUSES = new Set(['candidate', 'verified', 'added', 'monitored', 'rejected']);
const NEW_PROGRAM_CANDIDATE_SOURCES = new Set([
  'scheduled_research',
  'maintainer_research',
  'student_suggestion',
  'trusted_list',
  'other',
]);
const NEW_PROGRAM_DUPLICATE_TYPES = new Set([
  'new_program',
  'new_subprogram',
  'existing_cycle',
  'updated_url',
  'low_confidence_lead',
]);
const NEW_PROGRAM_OPPORTUNITY_TYPES = new Set([
  'Discovery Program',
  'Fellowship',
  'Startup / VC Fellowship',
  'Winternship',
  'Scholarship / Funding',
  'Conference / Travel Funding',
  'Community / Prep Program',
  'Full-Time Alternative',
]);
const NEW_PROGRAM_TRANSITIONS = {
  candidate: new Set(['verified', 'rejected']),
  verified: new Set(['candidate', 'added', 'rejected']),
  added: new Set(['verified', 'monitored', 'rejected']),
  monitored: new Set(['added', 'rejected']),
  rejected: new Set(['candidate']),
};
const SOURCE_TRUNCATION_NOTICE = 'ApplyFirst note: source page was truncated at the monitoring byte limit.';
const JOB_BOARD_HOSTS = new Set([
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.ashbyhq.com',
  'jobs.lever.co',
  'lever.co',
]);
const DISCOVERY_CONTEXT_PATTERN =
  /\b(apply|application|applications|deadline|deadlines|open|opens|opening|internship|fellowship|scholarship|program|academy|conference|summer|student|students|cohort)\b/i;
const LOW_SIGNAL_DISCOVERY_HOSTS = new Set([
  'github.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'simplify.jobs',
  'levels.fyi',
  'reddit.com',
  'youtube.com',
]);

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runMonitoring(env, {
        limit: Number(env.WATCH_RUN_LIMIT || DEFAULT_MONITOR_LIMIT),
        trigger: controller.cron || 'scheduled',
      }),
    );

    if (shouldRunScheduledDiscoverySearch(env)) {
      ctx.waitUntil(runScheduledDiscoverySearch(env, controller).catch((error) => logScheduledDiscoveryError(error)));
    }

    if (shouldRunScheduledProactiveDelivery(env)) {
      ctx.waitUntil(
        runProactiveDelivery(env, {
          trigger: controller.cron || 'scheduled',
          scheduled: true,
          dryRun: false,
        }).catch((error) => logProactiveDeliveryError(error)),
      );
    }
  },
};

async function runScheduledDiscoverySearch(env, controller) {
  return runDiscoverySearch(env, {
    trigger: 'scheduled_discovery',
    limit: env.AUTO_DISCOVERY_SEARCH_LIMIT || DEFAULT_SCHEDULED_DISCOVERY_SEARCH_LIMIT,
    maxQueriesPerProgram:
      env.AUTO_DISCOVERY_QUERIES_PER_PROGRAM || DEFAULT_SCHEDULED_DISCOVERY_QUERIES_PER_PROGRAM,
    maxResultsPerQuery:
      env.AUTO_DISCOVERY_RESULTS_PER_QUERY || DEFAULT_SCHEDULED_DISCOVERY_RESULTS_PER_QUERY,
    dryRun: env.AUTO_DISCOVERY_SEARCH_DRY_RUN === 'true',
    scheduledCron: controller?.cron || '',
  });
}

function shouldRunScheduledDiscoverySearch(env) {
  return env.AUTO_DISCOVERY_SEARCH_ENABLED === 'true';
}

function logScheduledDiscoveryError(error) {
  console.error(
    JSON.stringify({
      event: 'scheduled_discovery_search_failed',
      error: cleanString(error?.message || String(error), 500),
    }),
  );
}

function shouldRunScheduledProactiveDelivery(env) {
  return env.PROACTIVE_DELIVERY_ENABLED === 'true';
}

function logProactiveDeliveryError(error) {
  console.error(
    JSON.stringify({
      event: 'proactive_delivery_failed',
      error: cleanString(error?.message || String(error), 500),
    }),
  );
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const candidateSendMatch = url.pathname.match(/^\/watch\/candidates\/([^/]+)\/send$/);
  const discoveryCandidateReviewMatch = url.pathname.match(/^\/watch\/discovery\/candidates\/([^/]+)\/review$/);
  const newProgramCandidateReviewMatch = url.pathname.match(/^\/watch\/program-candidates\/([^/]+)\/review$/);
  const applicationOutcomeMatch = url.pathname.match(/^\/analytics\/application-attempts\/([^/]+)\/outcome$/);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  try {
    requireDatabase(env);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(env, { ok: true, service: 'applyfirst-watch' });
    }

    if (request.method === 'GET' && url.pathname === '/watch/status') {
      return jsonResponse(env, await getWatchStatus(env));
    }

    if (request.method === 'GET' && url.pathname === '/library/status') {
      return jsonResponse(env, await getPublicLibraryStatus(env), {
        headers: { 'cache-control': 'public, max-age=60, s-maxage=300' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/workspace') {
      return jsonResponse(env, await getBetaWorkspace(env, url));
    }

    if (request.method === 'POST' && url.pathname === '/workspace') {
      const body = await readJson(request, {});
      return jsonResponse(env, await saveBetaWorkspace(env, body));
    }

    if (request.method === 'POST' && url.pathname === '/analytics/events') {
      const body = await readJson(request, {});
      return jsonResponse(env, await recordProductEvent(env, body), { status: 201 });
    }

    if (request.method === 'POST' && url.pathname === '/analytics/client-errors') {
      const body = await readJson(request, {});
      return jsonResponse(env, await recordClientError(env, body), { status: 201 });
    }

    if (request.method === 'GET' && url.pathname === '/analytics/client-errors') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getClientErrorLog(env, url));
    }

    if (request.method === 'GET' && url.pathname === '/analytics/program-evidence') {
      return jsonResponse(env, await getProgramEvidence(env, url));
    }

    if (request.method === 'POST' && url.pathname === '/analytics/program-evidence') {
      const body = await readJson(request, {});
      return jsonResponse(env, await saveProgramEvidence(env, body), { status: 201 });
    }

    if (request.method === 'GET' && url.pathname === '/analytics/application-attempts') {
      return jsonResponse(env, await getApplicationAttempts(env, url));
    }

    if (request.method === 'POST' && url.pathname === '/analytics/application-attempts') {
      const body = await readJson(request, {});
      const result = await createApplicationAttempt(env, body);
      return jsonResponse(env, result, { status: result.created ? 201 : 200 });
    }

    if (request.method === 'POST' && applicationOutcomeMatch) {
      const body = await readJson(request, {});
      return jsonResponse(env, await updateApplicationOutcome(env, applicationOutcomeMatch[1], body));
    }

    if (request.method === 'GET' && url.pathname === '/analytics/program-watches') {
      return jsonResponse(env, await getProgramWatches(env, url));
    }

    if (request.method === 'POST' && url.pathname === '/analytics/program-watches') {
      const body = await readJson(request, {});
      return jsonResponse(env, await saveProgramWatch(env, body));
    }

    if (request.method === 'GET' && url.pathname === '/analytics/summary') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getBetaAnalyticsSummary(env));
    }

    if (request.method === 'GET' && url.pathname === '/analytics/participants') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getBetaParticipantActivity(env, url));
    }

    if (request.method === 'POST' && url.pathname === '/analytics/participants/segment') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(env, await updateBetaWorkspaceSegment(env, body));
    }

    if (request.method === 'POST' && url.pathname === '/analytics/invitations/sync') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(env, await syncBetaInvitations(env, body));
    }

    if (request.method === 'POST' && url.pathname === '/analytics/monitoring-audits') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(env, await saveMonitoringAudit(env, body), { status: 201 });
    }

    if (request.method === 'POST' && url.pathname === '/analytics/operations') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(env, await saveOperationalTimeEntry(env, body), { status: 201 });
    }

    if (request.method === 'GET' && url.pathname === '/watch/engagement') {
      return handleAlertEngagement(env, url);
    }

    if (request.method === 'GET' && url.pathname === '/delivery/engagement') {
      return handleProactiveDeliveryEngagement(env, url);
    }

    if (request.method === 'GET' && url.pathname === '/watch/readiness') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getReadinessQueue(env));
    }

    if (request.method === 'GET' && url.pathname === '/watch/history') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getReviewHistory(env, url));
    }

    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/watch/unsubscribe') {
      return handleUnsubscribe(request, url, env);
    }

    if (request.method === 'GET' && url.pathname === '/watch/candidates') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getPendingCandidates(env));
    }

    if (request.method === 'GET' && url.pathname === '/watch/discovery') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getDiscoveryQueue(env, url));
    }

    if (request.method === 'GET' && url.pathname === '/watch/discovery/candidates') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getDiscoveryCandidates(env, url));
    }

    if (request.method === 'GET' && url.pathname === '/watch/program-candidates') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await getNewProgramCandidates(env, url));
    }

    if (request.method === 'POST' && url.pathname === '/watch/program-candidates') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      const result = await saveNewProgramCandidate(env, body);
      return jsonResponse(env, result, { status: result.created ? 201 : 200 });
    }

    if (request.method === 'POST' && newProgramCandidateReviewMatch) {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(
        env,
        await reviewNewProgramCandidate(env, newProgramCandidateReviewMatch[1], body),
      );
    }

    if (request.method === 'POST' && url.pathname === '/watch/discovery/search') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(env, await runDiscoverySearch(env, body));
    }

    if (request.method === 'POST' && url.pathname === '/watch/discovery/candidates') {
      await requireAdminToken(request, env);
      return jsonResponse(env, await saveDiscoveryCandidate(request, env), { status: 201 });
    }

    if (request.method === 'POST' && discoveryCandidateReviewMatch) {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(env, await reviewDiscoveryCandidate(env, discoveryCandidateReviewMatch[1], body));
    }

    if (request.method === 'POST' && candidateSendMatch) {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(env, await sendCandidateNotifications(env, candidateSendMatch[1], body));
    }

    if (request.method === 'POST' && url.pathname === '/watch') {
      return jsonResponse(env, await saveWatchRequest(request, env, ctx), { status: 201 });
    }

    if (request.method === 'POST' && url.pathname === '/watch/run') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      const result = await runMonitoring(env, {
        limit: Number(body.limit || env.WATCH_RUN_LIMIT || DEFAULT_MONITOR_LIMIT),
        force: Boolean(body.force),
        dryRun: Boolean(body.dryRun),
        programIds: getRunProgramIds(body),
        trigger: 'manual',
      });
      return jsonResponse(env, result);
    }

    if (request.method === 'POST' && url.pathname === '/delivery/run') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(
        env,
        await runProactiveDelivery(env, {
          dryRun: body.dryRun !== false,
          force: Boolean(body.force),
          watchRequestId: cleanString(body.watchRequestId, 120),
          trigger: 'manual',
        }),
      );
    }

    return jsonResponse(env, { ok: false, error: 'Not found.' }, { status: 404 });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      console.error('[ApplyFirst watch worker failure]', {
        method: request.method,
        pathname: url.pathname,
        status,
        message: error?.message || 'Unknown worker error.',
        stack: error?.stack || '',
      });
    }
    return jsonResponse(
      env,
      {
        ok: false,
        error: status === 500 ? 'ApplyFirst watch worker failed.' : error.message,
      },
      { status },
    );
  }
}

async function getBetaWorkspace(env, url) {
  const accessCode = normalizeAccessCode(url.searchParams.get('code'));

  if (!BETA_WORKSPACE_CODE_PATTERN.test(accessCode)) {
    throw httpError(400, 'A valid beta workspace code is required.');
  }

  const accessCodeHash = await hashAccessCode(accessCode);
  const row = await env.DB.prepare(
    `select id, code_label, state_json, last_seen_at, updated_at, created_at
     from beta_access_workspaces
     where access_code_hash = ?
     limit 1`,
  )
    .bind(accessCodeHash)
    .first();

  if (!row) {
    const invitation = await findBetaInvitationByHash(env, accessCodeHash);

    if (!ACTIVE_BETA_INVITATION_STATUS_VALUES.has(invitation?.status)) {
      throw httpError(403, 'Invite code is not active.');
    }

    return {
      ok: true,
      exists: false,
      invited: true,
      state: null,
    };
  }

  return {
    ok: true,
    exists: true,
    workspaceId: row.id,
    codeLabel: row.code_label,
    state: parseJsonObject(row.state_json),
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

async function saveBetaWorkspace(env, body) {
  const accessCode = normalizeAccessCode(body.accessCode || body.code);

  if (!BETA_WORKSPACE_CODE_PATTERN.test(accessCode)) {
    throw httpError(400, 'A valid beta workspace code is required.');
  }

  const accessCodeHash = await hashAccessCode(accessCode);
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    `select id, tester_segment as testerSegment
     from beta_access_workspaces
     where access_code_hash = ?
     limit 1`,
  )
    .bind(accessCodeHash)
    .first();
  const invitation = await findBetaInvitationByHash(env, accessCodeHash);

  if (!existing?.id && !ACTIVE_BETA_INVITATION_STATUS_VALUES.has(invitation?.status)) {
    throw httpError(403, 'Invite code is not active.');
  }
  const stateJson = JSON.stringify(normalizeWorkspaceState(body.state));
  const codeLabel = createAccessCodeLabel(accessCode);
  const workspaceId = existing?.id || crypto.randomUUID();
  const testerSegment = invitation?.testerSegment && invitation.testerSegment !== 'unknown'
    ? invitation.testerSegment
    : existing?.testerSegment || 'unknown';

  if (existing?.id) {
    await env.DB.prepare(
      `update beta_access_workspaces
       set code_label = ?,
           state_json = ?,
           tester_segment = ?,
           last_seen_at = ?,
           updated_at = ?
       where id = ?`,
    )
      .bind(codeLabel, stateJson, testerSegment, now, now, existing.id)
      .run();
  } else {
    await env.DB.prepare(
      `insert into beta_access_workspaces (
        id,
        access_code_hash,
        code_label,
        state_json,
        tester_segment,
        last_seen_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(workspaceId, accessCodeHash, codeLabel, stateJson, testerSegment, now, now)
      .run();
  }

  return {
    ok: true,
    workspaceId,
    codeLabel,
    savedAt: now,
  };
}

async function findBetaInvitationByHash(env, accessCodeHash) {
  return env.DB.prepare(
    `select tester_segment as testerSegment, status
     from beta_invitations
     where access_code_hash = ?
     limit 1`,
  )
    .bind(accessCodeHash)
    .first();
}

async function recordProductEvent(env, body) {
  const accessCode = normalizeAccessCode(body.accessCode || body.code);
  const eventName = cleanString(body.eventName || body.event, 80).toLowerCase();
  const outcome = cleanString(body.outcome, 80).toLowerCase();

  if (!BETA_WORKSPACE_CODE_PATTERN.test(accessCode)) {
    throw httpError(400, 'A valid beta workspace code is required.');
  }

  if (!PRODUCT_EVENT_NAMES.has(eventName)) {
    throw httpError(400, 'Unsupported product event.');
  }

  if (eventName === 'outcome_reported' && !PRODUCT_OUTCOMES.has(outcome)) {
    throw httpError(400, 'Choose a supported beta outcome.');
  }

  const accessCodeHash = await hashAccessCode(accessCode);
  const workspace = await env.DB.prepare(
    `select id
     from beta_access_workspaces
     where access_code_hash = ?
     limit 1`,
  )
    .bind(accessCodeHash)
    .first();

  if (!workspace?.id) {
    throw httpError(409, 'Beta workspace is still initializing. Try again shortly.');
  }

  const eventId = cleanString(body.eventId, 120) || crypto.randomUUID();
  const occurredAt = normalizeEventTimestamp(body.occurredAt);
  const context = await resolveProductEventContext(
    env,
    workspace.id,
    cleanString(body.programId, 160),
    normalizeProductEventContext(body.context),
  );

  await env.DB.prepare(
    `insert or ignore into beta_product_events (
      id,
      workspace_id,
      session_id,
      event_name,
      program_id,
      outcome,
      context_json,
      occurred_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      eventId,
      workspace.id,
      cleanString(body.sessionId, 120),
      eventName,
      cleanString(body.programId, 160),
      eventName === 'outcome_reported' ? outcome : '',
      JSON.stringify(context),
      occurredAt,
    )
    .run();

  return {
    ok: true,
    eventId,
    recordedAt: new Date().toISOString(),
  };
}

async function recordClientError(env, body) {
  const workspace = await findWorkspaceByAccessCode(env, body.accessCode || body.code);
  const operation = normalizeRequiredEnum(body.operation, CLIENT_ERROR_OPERATIONS, 'client operation');
  const errorName = sanitizeClientErrorField(body.errorName, 80);
  const httpStatus = normalizeClientErrorStatus(body.httpStatus);
  const message = sanitizeClientErrorField(body.message || 'Unknown client error.', 600);
  const stack = sanitizeClientErrorField(body.stack, 3000);
  const componentStack = sanitizeClientErrorField(body.componentStack, 2000);
  const view = sanitizeClientErrorField(body.view, 80);
  const programId = sanitizeClientErrorField(body.programId, 160);
  const sessionId = sanitizeClientErrorField(body.sessionId, 120);
  const occurredAt = normalizeEventTimestamp(body.occurredAt);
  const dayKey = occurredAt.slice(0, 10);
  const fingerprint = await sha256Hex([
    operation,
    errorName,
    httpStatus ?? '',
    message,
    stack.slice(0, 500),
  ].join('|'));
  const now = new Date().toISOString();

  await env.DB.prepare(
    `insert into beta_client_errors (
      id,
      workspace_id,
      fingerprint,
      day_key,
      operation,
      error_name,
      http_status,
      message,
      stack,
      component_stack,
      view,
      program_id,
      session_id,
      occurrence_count,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    on conflict(workspace_id, fingerprint, day_key) do update set
      occurrence_count = beta_client_errors.occurrence_count + 1,
      last_seen_at = excluded.last_seen_at,
      stack = case when excluded.stack <> '' then excluded.stack else beta_client_errors.stack end,
      component_stack = case
        when excluded.component_stack <> '' then excluded.component_stack
        else beta_client_errors.component_stack
      end,
      view = case when excluded.view <> '' then excluded.view else beta_client_errors.view end,
      program_id = case
        when excluded.program_id <> '' then excluded.program_id
        else beta_client_errors.program_id
      end,
      session_id = case
        when excluded.session_id <> '' then excluded.session_id
        else beta_client_errors.session_id
      end,
      updated_at = excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      workspace.id,
      fingerprint,
      dayKey,
      operation,
      errorName,
      httpStatus,
      message,
      stack,
      componentStack,
      view,
      programId,
      sessionId,
      occurredAt,
      occurredAt,
      now,
      now,
    )
    .run();

  console.log(JSON.stringify({
    event: 'client_error_reported',
    workspaceId: workspace.id,
    fingerprint,
    operation,
    httpStatus,
    occurredAt,
  }));

  return {
    ok: true,
    fingerprint,
    recordedAt: now,
  };
}

async function getClientErrorLog(env, url) {
  const requestedLimit = Number(url.searchParams.get('limit') || 12);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
    : 12;
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [summary, operationsResult, recentResult] = await Promise.all([
    env.DB.prepare(
      `select
        coalesce(sum(case when last_seen_at >= ? then occurrence_count else 0 end), 0) as occurrences7Days,
        count(distinct case when last_seen_at >= ? then workspace_id end) as affectedWorkspaces7Days,
        coalesce(sum(case when last_seen_at >= ? then occurrence_count else 0 end), 0) as occurrences30Days,
        count(distinct case when last_seen_at >= ? then workspace_id end) as affectedWorkspaces30Days
       from beta_client_errors`,
    )
      .bind(sevenDaysAgo, sevenDaysAgo, thirtyDaysAgo, thirtyDaysAgo)
      .first(),
    env.DB.prepare(
      `select
        operation,
        sum(occurrence_count) as occurrences,
        count(distinct workspace_id) as affectedWorkspaces,
        max(last_seen_at) as lastSeenAt
       from beta_client_errors
       where last_seen_at >= ?
       group by operation
       order by occurrences desc, lastSeenAt desc`,
    )
      .bind(thirtyDaysAgo)
      .all(),
    env.DB.prepare(
      `select
        error.id,
        workspace.code_label as codeLabel,
        error.fingerprint,
        error.operation,
        error.error_name as errorName,
        error.http_status as httpStatus,
        error.message,
        error.stack,
        error.component_stack as componentStack,
        error.view,
        error.program_id as programId,
        error.occurrence_count as occurrenceCount,
        error.first_seen_at as firstSeenAt,
        error.last_seen_at as lastSeenAt
       from beta_client_errors error
       inner join beta_access_workspaces workspace on workspace.id = error.workspace_id
       order by error.last_seen_at desc
       limit ?`,
    )
      .bind(limit)
      .all(),
  ]);

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    summary: {
      occurrences7Days: numberOrZero(summary?.occurrences7Days),
      affectedWorkspaces7Days: numberOrZero(summary?.affectedWorkspaces7Days),
      occurrences30Days: numberOrZero(summary?.occurrences30Days),
      affectedWorkspaces30Days: numberOrZero(summary?.affectedWorkspaces30Days),
    },
    operations: (operationsResult.results || []).map((row) => ({
      ...row,
      occurrences: numberOrZero(row.occurrences),
      affectedWorkspaces: numberOrZero(row.affectedWorkspaces),
    })),
    recent: (recentResult.results || []).map((row) => ({
      ...row,
      httpStatus: row.httpStatus === null || row.httpStatus === undefined ? null : Number(row.httpStatus),
      occurrenceCount: numberOrZero(row.occurrenceCount),
    })),
  };
}

async function getProgramEvidence(env, url) {
  const workspace = await findWorkspaceByAccessCode(env, url.searchParams.get('code'));
  const programId = cleanString(url.searchParams.get('programId'), 160);
  const whereProgram = programId ? 'and program_id = ?' : '';
  const statement = env.DB.prepare(
    `select
      id,
      program_id as programId,
      relevance,
      relevance_source as relevanceSource,
      relevance_updated_at as relevanceUpdatedAt,
      prior_awareness as priorAwareness,
      eligibility_unclear_reason as eligibilityUnclearReason,
      first_relevant_at as firstRelevantAt,
      action_state as actionState,
      action_at as actionAt,
      support_level as supportLevel,
      attribution,
      friction_category as frictionCategory,
      class_year as classYear,
      role_track as roleTrack,
      opportunity_category as opportunityCategory,
      updated_at as updatedAt
     from beta_program_evidence
     where workspace_id = ?
       ${whereProgram}
     order by updated_at desc`,
  );
  const result = programId
    ? await statement.bind(workspace.id, programId).all()
    : await statement.bind(workspace.id).all();

  return {
    ok: true,
    evidence: result.results || [],
  };
}

async function saveProgramEvidence(env, body) {
  const workspace = await findWorkspaceByAccessCode(env, body.accessCode || body.code);
  const programId = cleanString(body.programId, 160);

  if (!programId) {
    throw httpError(400, 'Program is required.');
  }

  const relevance = normalizeOptionalEnum(body.relevance, PROGRAM_RELEVANCE_VALUES, 'program relevance');
  const priorAwareness = normalizeOptionalEnum(body.priorAwareness, PRIOR_AWARENESS_VALUES, 'prior awareness');
  const eligibilityUnclearReason = normalizeOptionalEnum(
    body.eligibilityUnclearReason,
    ELIGIBILITY_UNCLEAR_REASONS,
    'eligibility uncertainty reason',
  );
  const actionState = normalizeOptionalEnum(body.actionState, PROGRAM_ACTION_VALUES, 'program action');
  const supportLevel = normalizeOptionalEnum(body.supportLevel, SUPPORT_LEVEL_VALUES, 'support level');
  const attribution = normalizeOptionalEnum(body.attribution, ATTRIBUTION_VALUES, 'ApplyFirst attribution');
  const frictionCategory = normalizeOptionalEnum(body.frictionCategory, FRICTION_CATEGORY_VALUES, 'friction category');

  if (
    !relevance &&
    !actionState &&
    !priorAwareness &&
    !eligibilityUnclearReason &&
    !supportLevel &&
    !attribution &&
    !frictionCategory
  ) {
    throw httpError(400, 'Add at least one supported program decision field.');
  }

  if (eligibilityUnclearReason && relevance !== 'eligibility_unclear') {
    throw httpError(400, 'Eligibility uncertainty details require an eligibility-unclear response.');
  }

  if (priorAwareness && !['this_cycle', 'future_cycle'].includes(relevance)) {
    throw httpError(400, 'Prior awareness is only collected for relevant opportunities.');
  }

  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    `select id, relevance, relevance_source as relevanceSource,
      first_relevant_at as firstRelevantAt,
      first_decision_at as firstDecisionAt, action_state as actionState, action_at as actionAt
     from beta_program_evidence
     where workspace_id = ? and program_id = ?
     limit 1`,
  )
    .bind(workspace.id, programId)
    .first();
  const becomesRelevant = ['this_cycle', 'future_cycle'].includes(relevance);
  const firstRelevantAt = existing?.firstRelevantAt || (becomesRelevant ? now : null);
  const effectiveRelevance = relevance || existing?.relevance || '';
  const effectiveActionState = actionState || existing?.actionState || '';
  const firstDecisionAt = existing?.firstDecisionAt || (
    isEligibleActivation({ relevance: effectiveRelevance, actionState: effectiveActionState }) ? now : null
  );
  const actionAt = actionState && actionState !== existing?.actionState
    ? now
    : existing?.actionAt || null;
  const id = existing?.id || crypto.randomUUID();

  await env.DB.prepare(
    `insert into beta_program_evidence (
      id,
      workspace_id,
      program_id,
      relevance,
      relevance_source,
      relevance_updated_at,
      prior_awareness,
      eligibility_unclear_reason,
      first_relevant_at,
      first_decision_at,
      action_state,
      action_at,
      support_level,
      attribution,
      friction_category,
      class_year,
      role_track,
      opportunity_category,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(workspace_id, program_id) do update set
      relevance = coalesce(nullif(excluded.relevance, ''), beta_program_evidence.relevance),
      relevance_source = case
        when excluded.relevance != '' then 'explicit'
        else beta_program_evidence.relevance_source
      end,
      relevance_updated_at = case
        when excluded.relevance != '' then excluded.relevance_updated_at
        else beta_program_evidence.relevance_updated_at
      end,
      prior_awareness = case
        when excluded.relevance in ('not_a_fit', 'not_eligible', 'eligibility_unclear') then null
        else coalesce(nullif(excluded.prior_awareness, ''), beta_program_evidence.prior_awareness)
      end,
      eligibility_unclear_reason = case
        when excluded.relevance = 'eligibility_unclear' then nullif(excluded.eligibility_unclear_reason, '')
        when excluded.relevance != '' then null
        else beta_program_evidence.eligibility_unclear_reason
      end,
      first_relevant_at = coalesce(beta_program_evidence.first_relevant_at, excluded.first_relevant_at),
      first_decision_at = coalesce(beta_program_evidence.first_decision_at, excluded.first_decision_at),
      action_state = coalesce(nullif(excluded.action_state, ''), beta_program_evidence.action_state),
      action_at = case
        when excluded.action_state != '' and excluded.action_state != coalesce(beta_program_evidence.action_state, '')
          then excluded.action_at
        else beta_program_evidence.action_at
      end,
      support_level = coalesce(nullif(excluded.support_level, ''), beta_program_evidence.support_level),
      attribution = coalesce(nullif(excluded.attribution, ''), beta_program_evidence.attribution),
      friction_category = coalesce(nullif(excluded.friction_category, ''), beta_program_evidence.friction_category),
      class_year = coalesce(nullif(excluded.class_year, ''), beta_program_evidence.class_year),
      role_track = coalesce(nullif(excluded.role_track, ''), beta_program_evidence.role_track),
      opportunity_category = coalesce(nullif(excluded.opportunity_category, ''), beta_program_evidence.opportunity_category),
      updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      workspace.id,
      programId,
      relevance,
      relevance ? 'explicit' : '',
      relevance ? now : null,
      priorAwareness,
      eligibilityUnclearReason,
      firstRelevantAt,
      firstDecisionAt,
      actionState,
      actionAt,
      supportLevel,
      attribution,
      frictionCategory,
      cleanString(body.classYear, 80),
      cleanString(body.roleTrack, 120),
      cleanString(body.opportunityCategory, 120),
      now,
    )
    .run();

  if (actionState && actionState !== existing?.actionState) {
    await env.DB.prepare(
      `insert into beta_program_action_events (
        id, workspace_id, program_id, action_state, action_at, support_level, source
      ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        programId,
        actionState,
        actionAt || now,
        supportLevel || null,
        'student_check_in',
      )
      .run();
  }

  return {
    ok: true,
    id,
    programId,
    eligibleActivated: Boolean(firstDecisionAt),
    savedAt: now,
  };
}

async function getApplicationAttempts(env, url) {
  const workspace = await findWorkspaceByAccessCode(env, url.searchParams.get('code'));
  const programId = cleanString(url.searchParams.get('programId'), 160);
  const whereProgram = programId ? 'and program_id = ?' : '';
  const statement = env.DB.prepare(
    `select
      id,
      program_id as programId,
      applied_at as appliedAt,
      cycle_label as cycleLabel,
      outcome,
      outcome_updated_at as outcomeUpdatedAt,
      source,
      created_at as createdAt,
      updated_at as updatedAt
     from beta_application_attempts
     where workspace_id = ?
       ${whereProgram}
     order by applied_at desc, created_at desc`,
  );
  const result = programId
    ? await statement.bind(workspace.id, programId).all()
    : await statement.bind(workspace.id).all();

  return { ok: true, attempts: result.results || [] };
}

async function createApplicationAttempt(env, body) {
  const workspace = await findWorkspaceByAccessCode(env, body.accessCode || body.code);
  const programId = cleanString(body.programId, 160);

  if (!programId) {
    throw httpError(400, 'Program is required.');
  }

  if (body.allowDuplicate !== undefined && typeof body.allowDuplicate !== 'boolean') {
    throw httpError(400, 'allowDuplicate must be true or false.');
  }

  if (body.cycleUnspecified !== undefined && typeof body.cycleUnspecified !== 'boolean') {
    throw httpError(400, 'cycleUnspecified must be true or false.');
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const appliedAt = normalizeOptionalTimestamp(body.appliedAt) || now;
  const suppliedCycleLabel = cleanString(body.cycleLabel, 80);
  const attemptYear = /^\d{4}/.test(appliedAt) ? appliedAt.slice(0, 4) : '';
  const cycleLabel = body.cycleUnspecified === true ? '' : suppliedCycleLabel || attemptYear;
  const allowDuplicate = body.allowDuplicate === true;
  const idempotencyKey = allowDuplicate ? null : buildApplicationAttemptKey(cycleLabel, appliedAt);
  const creationMode = allowDuplicate ? 'explicit_additional' : 'ordinary';
  const outcome = normalizeRequiredEnum(body.outcome || 'pending', APPLICATION_OUTCOMES, 'application outcome');
  const source = allowDuplicate ? 'student_add_another_application' : 'student_mark_applied';

  const insertResult = await env.DB.prepare(
    `insert or ignore into beta_application_attempts (
      id, workspace_id, program_id, applied_at, cycle_label,
      idempotency_key, creation_mode, outcome, outcome_updated_at,
      source, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      workspace.id,
      programId,
      appliedAt,
      cycleLabel,
      idempotencyKey,
      creationMode,
      outcome,
      outcome === 'pending' ? null : now,
      source,
      now,
      now,
    )
    .run();

  const created = Number(insertResult.meta?.changes ?? 1) > 0;

  if (!created && idempotencyKey) {
    const existingAttempt = await env.DB.prepare(
      `select id, program_id as programId, applied_at as appliedAt,
        cycle_label as cycleLabel, outcome, outcome_updated_at as outcomeUpdatedAt,
        source, created_at as createdAt, updated_at as updatedAt
       from beta_application_attempts
       where workspace_id = ? and program_id = ? and idempotency_key = ?
       limit 1`,
    )
      .bind(workspace.id, programId, idempotencyKey)
      .first();

    if (!existingAttempt) {
      throw httpError(409, 'An application attempt already exists for this cycle.');
    }

    return { ok: true, created: false, attempt: existingAttempt };
  }

  const existingEvidence = await env.DB.prepare(
    `select id, relevance, relevance_source as relevanceSource
     from beta_program_evidence
     where workspace_id = ? and program_id = ?
     limit 1`,
  )
    .bind(workspace.id, programId)
    .first();

  if (existingEvidence?.relevanceSource !== 'explicit') {
    await env.DB.prepare(
      `insert into beta_program_evidence (
        id, workspace_id, program_id, relevance, relevance_source,
        relevance_updated_at, first_relevant_at, first_decision_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(workspace_id, program_id) do update set
        relevance = case
          when beta_program_evidence.relevance_source = 'explicit' then beta_program_evidence.relevance
          else excluded.relevance
        end,
        relevance_source = case
          when beta_program_evidence.relevance_source = 'explicit' then beta_program_evidence.relevance_source
          else excluded.relevance_source
        end,
        relevance_updated_at = case
          when beta_program_evidence.relevance_source = 'explicit' then beta_program_evidence.relevance_updated_at
          else excluded.relevance_updated_at
        end,
        first_relevant_at = coalesce(beta_program_evidence.first_relevant_at, excluded.first_relevant_at),
        first_decision_at = coalesce(beta_program_evidence.first_decision_at, excluded.first_decision_at),
        updated_at = excluded.updated_at`,
    )
      .bind(
        existingEvidence?.id || crypto.randomUUID(),
        workspace.id,
        programId,
        'this_cycle',
        'inferred_applied',
        now,
        appliedAt,
        appliedAt,
        now,
      )
      .run();
  }

  return {
    ok: true,
    created: true,
    attempt: {
      id,
      programId,
      appliedAt,
      cycleLabel,
      outcome,
      outcomeUpdatedAt: outcome === 'pending' ? null : now,
      source,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function updateApplicationOutcome(env, attemptIdValue, body) {
  const workspace = await findWorkspaceByAccessCode(env, body.accessCode || body.code);
  const attemptId = cleanString(attemptIdValue, 160);
  const outcome = normalizeRequiredEnum(body.outcome, APPLICATION_OUTCOMES, 'application outcome');
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `update beta_application_attempts
     set outcome = ?, outcome_updated_at = ?, updated_at = ?
     where id = ? and workspace_id = ?`,
  )
    .bind(outcome, outcome === 'pending' ? null : now, now, attemptId, workspace.id)
    .run();

  if (!Number(result.meta?.changes || 0)) {
    throw httpError(404, 'Application attempt was not found.');
  }

  return { ok: true, attemptId, outcome, updatedAt: now };
}

async function getProgramWatches(env, url) {
  const workspace = await findWorkspaceByAccessCode(env, url.searchParams.get('code'));
  const result = await env.DB.prepare(
    `select program_id as programId, is_watching as isWatching,
      started_at as startedAt, stopped_at as stoppedAt, updated_at as updatedAt
     from beta_program_watches
     where workspace_id = ?
     order by updated_at desc`,
  )
    .bind(workspace.id)
    .all();

  return {
    ok: true,
    watches: (result.results || []).map((row) => ({ ...row, isWatching: Boolean(row.isWatching) })),
  };
}

async function saveProgramWatch(env, body) {
  const workspace = await findWorkspaceByAccessCode(env, body.accessCode || body.code);
  const programId = cleanString(body.programId, 160);

  if (!programId || typeof body.watching !== 'boolean') {
    throw httpError(400, 'Program and watching state are required.');
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `insert into beta_program_watches (
      id, workspace_id, program_id, is_watching, started_at, stopped_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)
    on conflict(workspace_id, program_id) do update set
      is_watching = excluded.is_watching,
      started_at = case
        when excluded.is_watching = 1 then coalesce(beta_program_watches.started_at, excluded.started_at)
        else beta_program_watches.started_at
      end,
      stopped_at = case when excluded.is_watching = 0 then excluded.stopped_at else null end,
      updated_at = excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      workspace.id,
      programId,
      body.watching ? 1 : 0,
      body.watching ? now : null,
      body.watching ? null : now,
      now,
    )
    .run();

  if (body.watching) {
    await env.DB.prepare(
      `insert into watch_request_programs (
        id, watch_request_id, program_id, program_name, organization,
        official_url, readiness, reason, created_at
      )
      select lower(hex(randomblob(16))), request.id, ?, ?, ?, ?, ?, ?, ?
      from watch_requests request
      where request.workspace_id = ?
        and request.status = 'active'
        and (request.unsubscribed_at is null or request.unsubscribed_at = '')
        and not exists (
          select 1 from watch_request_programs linked
          where linked.watch_request_id = request.id and linked.program_id = ?
        )`,
    )
      .bind(
        programId,
        cleanString(body.programName, 180),
        cleanString(body.organization, 160),
        cleanString(body.officialUrl, 500),
        cleanString(body.readiness, 120),
        'Watched by student',
        now,
        workspace.id,
        programId,
      )
      .run();
  }

  return { ok: true, programId, watching: body.watching, updatedAt: now };
}

async function findWorkspaceByAccessCode(env, value) {
  const accessCode = normalizeAccessCode(value);

  if (!BETA_WORKSPACE_CODE_PATTERN.test(accessCode)) {
    throw httpError(400, 'A valid beta workspace code is required.');
  }

  const accessCodeHash = await hashAccessCode(accessCode);
  const workspace = await env.DB.prepare(
    `select id
     from beta_access_workspaces
     where access_code_hash = ?
     limit 1`,
  )
    .bind(accessCodeHash)
    .first();

  if (!workspace?.id) {
    throw httpError(409, 'Beta workspace is still initializing. Try again shortly.');
  }

  return workspace;
}

async function saveMonitoringAudit(env, body) {
  const programId = cleanString(body.programId, 160);
  const auditType = normalizeRequiredEnum(body.auditType, MONITORING_AUDIT_TYPES, 'audit type');

  if (!programId) {
    throw httpError(400, 'Program is required.');
  }

  const id = cleanString(body.id, 120) || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `insert into monitoring_audits (
      id, program_id, official_source_id, audit_type, event_at, verified_deadline_at,
      detected, detected_at, alert_candidate_id, status_correct, deadline_correct,
      eligibility_correct, url_correct, freshness_correct, alert_correct, evidence_url, evidence_note,
      reported_at, resolved_at, reviewed_by, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      event_at = excluded.event_at,
      verified_deadline_at = excluded.verified_deadline_at,
      detected = excluded.detected,
      detected_at = excluded.detected_at,
      alert_candidate_id = excluded.alert_candidate_id,
      status_correct = excluded.status_correct,
      deadline_correct = excluded.deadline_correct,
      eligibility_correct = excluded.eligibility_correct,
      url_correct = excluded.url_correct,
      freshness_correct = excluded.freshness_correct,
      alert_correct = excluded.alert_correct,
      evidence_url = excluded.evidence_url,
      evidence_note = excluded.evidence_note,
      reported_at = excluded.reported_at,
      resolved_at = excluded.resolved_at,
      reviewed_by = excluded.reviewed_by,
      updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      programId,
      cleanString(body.officialSourceId, 120) || null,
      auditType,
      normalizeOptionalTimestamp(body.eventAt),
      normalizeOptionalTimestamp(body.verifiedDeadlineAt),
      normalizeNullableBoolean(body.detected),
      normalizeOptionalTimestamp(body.detectedAt),
      cleanString(body.alertCandidateId, 120) || null,
      normalizeNullableBoolean(body.statusCorrect),
      normalizeNullableBoolean(body.deadlineCorrect),
      normalizeNullableBoolean(body.eligibilityCorrect),
      normalizeNullableBoolean(body.urlCorrect),
      normalizeNullableBoolean(body.freshnessCorrect),
      normalizeNullableBoolean(body.alertCorrect),
      cleanString(body.evidenceUrl, 500),
      cleanString(body.evidenceNote, 1200),
      normalizeOptionalTimestamp(body.reportedAt),
      normalizeOptionalTimestamp(body.resolvedAt),
      cleanString(body.reviewedBy || 'Kelly', 120),
      now,
    )
    .run();

  return { ok: true, id, savedAt: now };
}

async function saveOperationalTimeEntry(env, body) {
  const category = normalizeRequiredEnum(body.category, OPERATIONAL_TIME_CATEGORIES, 'operational category');
  const minutes = Math.round(Number(body.minutes));

  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
    throw httpError(400, 'Minutes must be between 1 and 1440.');
  }

  const periodDate = normalizeDateOnly(body.periodDate) || new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `insert into operational_time_entries (id, category, minutes, period_date, note)
     values (?, ?, ?, ?, ?)`,
  )
    .bind(id, category, minutes, periodDate, cleanString(body.note, 500))
    .run();

  return { ok: true, id, savedAt: new Date().toISOString() };
}

async function updateBetaWorkspaceSegment(env, body) {
  const workspaceId = cleanString(body.workspaceId, 120);
  const testerSegment = normalizeRequiredEnum(body.testerSegment, TESTER_SEGMENT_VALUES, 'tester segment');

  if (!workspaceId) {
    throw httpError(400, 'Workspace is required.');
  }

  const result = await env.DB.prepare(
    `update beta_access_workspaces
     set tester_segment = ?, updated_at = ?
     where id = ?`,
  )
    .bind(testerSegment, new Date().toISOString(), workspaceId)
    .run();

  if (!Number(result.meta?.changes || 0)) {
    throw httpError(404, 'Workspace was not found.');
  }

  return { ok: true, workspaceId, testerSegment };
}

async function syncBetaInvitations(env, body) {
  const invitations = Array.isArray(body.invitations) ? body.invitations.slice(0, 500) : [];

  if (!invitations.length) {
    throw httpError(400, 'Add at least one invitation record.');
  }

  const normalized = invitations.map((invitation) => {
    const accessCodeHash = cleanString(invitation?.accessCodeHash, 64).toLowerCase();
    const codeLabel = cleanString(invitation?.codeLabel, 20);
    const status = normalizeRequiredEnum(
      invitation?.status || 'not_sent',
      BETA_INVITATION_STATUS_VALUES,
      'invitation status',
    );
    const testerSegment = normalizeRequiredEnum(
      invitation?.testerSegment || 'unknown',
      TESTER_SEGMENT_VALUES,
      'tester segment',
    );

    if (!/^[a-f0-9]{64}$/.test(accessCodeHash)) {
      throw httpError(400, 'Invitation hashes must be 64-character SHA-256 values.');
    }

    if (!/^\.\.\.[A-Z0-9]{4}$/.test(codeLabel)) {
      throw httpError(400, 'Invitation labels must use the masked ...1234 format.');
    }

    return {
      accessCodeHash,
      recipientEmailHash: normalizeOptionalHash(invitation?.recipientEmailHash, 'recipient email hash'),
      codeLabel,
      status,
      testerSegment,
      invitedAt: normalizeOptionalTimestamp(invitation?.invitedAt),
    };
  });
  const now = new Date().toISOString();

  for (const invitation of normalized) {
    await env.DB.prepare(
      `insert into beta_invitations (
        access_code_hash, recipient_email_hash, code_label, tester_segment, status, invited_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(access_code_hash) do update set
        recipient_email_hash = excluded.recipient_email_hash,
        code_label = excluded.code_label,
        tester_segment = excluded.tester_segment,
        status = excluded.status,
        invited_at = coalesce(excluded.invited_at, beta_invitations.invited_at),
        updated_at = excluded.updated_at`,
    )
      .bind(
        invitation.accessCodeHash,
        invitation.recipientEmailHash,
        invitation.codeLabel,
        invitation.testerSegment,
        invitation.status,
        invitation.invitedAt,
        now,
      )
      .run();

    if (invitation.testerSegment !== 'unknown') {
      await env.DB.prepare(
        `update beta_access_workspaces
         set tester_segment = ?, updated_at = ?
         where access_code_hash = ?`,
      )
        .bind(invitation.testerSegment, now, invitation.accessCodeHash)
        .run();
    }
  }

  const currentHashes = normalized.map((invitation) => invitation.accessCodeHash);
  const deleteResult = await env.DB.prepare(
    `delete from beta_invitations
     where access_code_hash not in (${currentHashes.map(() => '?').join(', ')})`,
  )
    .bind(...currentHashes)
    .run();

  return {
    ok: true,
    synced: normalized.length,
    invited: normalized.filter((invitation) => ['sent', 'active'].includes(invitation.status)).length,
    emailLinked: normalized.filter((invitation) => invitation.recipientEmailHash).length,
    removed: Number(deleteResult?.meta?.changes || 0),
    savedAt: now,
  };
}

async function getBetaAnalyticsSummary(env) {
  const now = Date.now();
  const since7Days = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30Days = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const funnelEvents = [
    'session_started',
    'program_viewed',
    'program_saved',
    'watch_started',
    'focus_saved',
    'alerts_enabled',
    'official_source_clicked',
    'contribution_submitted',
  ];

  const [
    workspaceTotals,
    funnelResult,
    activatedResult,
    returningResult,
    outcomesResult,
    meaningfulOutcomesResult,
    topProgramsResult,
    alertEngagementResult,
    waitlistTotals,
    waitlistPipeline,
    studentValue,
    independentUsability,
    reliability,
    operations,
    waitlistSegments,
    invitations,
    programLifecycle,
    proactiveDelivery,
  ] = await Promise.all([
    env.DB.prepare(
      `select
        count(*) as total,
        count(case when last_seen_at >= ? then 1 end) as active7Days,
        count(case when last_seen_at >= ? then 1 end) as active30Days
       from beta_access_workspaces`,
    )
      .bind(since7Days, since30Days)
      .first(),
    env.DB.prepare(
      `select event_name as eventName,
        count(distinct workspace_id) as participants,
        count(*) as events
       from beta_product_events
       where created_at >= ?
         and event_name in (${funnelEvents.map(() => '?').join(', ')})
       group by event_name`,
    )
      .bind(since30Days, ...funnelEvents)
      .all(),
    env.DB.prepare(
      `select count(*) as count
       from (
         select workspace_id
         from beta_product_events
         where created_at >= ?
           and event_name in ('program_saved', 'focus_saved', 'alerts_enabled')
         group by workspace_id
         having count(distinct event_name) = 3
       )`,
    )
      .bind(since30Days)
      .first(),
    env.DB.prepare(
      `select count(*) as count
       from (
         select workspace_id
         from beta_product_events
         where created_at >= ?
         group by workspace_id
         having count(distinct substr(created_at, 1, 10)) >= 2
       )`,
    )
      .bind(since30Days)
      .first(),
    env.DB.prepare(
      `select outcome,
        count(distinct workspace_id) as participants,
        count(*) as responses
       from beta_product_events
       where event_name = 'outcome_reported'
         and created_at >= ?
       group by outcome`,
    )
      .bind(since30Days)
      .all(),
    env.DB.prepare(
      `select count(distinct workspace_id) as count
       from beta_product_events
       where event_name = 'outcome_reported'
         and created_at >= ?
         and outcome in ('found_relevant_program', 'applied_earlier')`,
    )
      .bind(since30Days)
      .first(),
    env.DB.prepare(
      `select program_id as programId,
        count(distinct case when event_name = 'program_viewed' then workspace_id end) as uniqueViewers,
        count(distinct case when event_name = 'program_saved' then workspace_id end) as saves,
        count(distinct case when event_name = 'official_source_clicked' then workspace_id end) as sourceClicks
       from beta_product_events
       where created_at >= ?
         and program_id is not null
         and program_id != ''
         and event_name in ('program_viewed', 'program_saved', 'official_source_clicked')
       group by program_id
       order by saves desc, sourceClicks desc, uniqueViewers desc
       limit 8`,
    )
      .bind(since30Days)
      .all(),
    env.DB.prepare(
      `select action,
        count(distinct watch_request_id) as participants,
        count(*) as events
       from alert_engagement_events
       where created_at >= ?
       group by action`,
    )
      .bind(since30Days)
      .all(),
    getCaptureWaitlistTotals(env),
    getCaptureWaitlistPipeline(env),
    getStudentValueMetrics(env, since30Days),
    getIndependentUsabilityMetrics(env, since30Days),
    getReliabilityMetrics(env, since30Days),
    getOperationsMetrics(env, since7Days, since30Days),
    getCaptureWaitlistSegments(env),
    getBetaInvitationMetrics(env, since30Days),
    getProgramLifecycleMetrics(env, since30Days),
    getProactiveDeliveryMetrics(env, since30Days),
  ]);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    periodDays: 30,
    workspaces: {
      total: Number(workspaceTotals?.total || 0),
      active7Days: Number(workspaceTotals?.active7Days || 0),
      active30Days: Number(workspaceTotals?.active30Days || 0),
      activated30Days: Number(activatedResult?.count || 0),
      returning30Days: Number(returningResult?.count || 0),
    },
    waitlist: {
      ...waitlistTotals,
      pipeline: waitlistPipeline,
      segments: waitlistSegments,
    },
    invitations,
    funnel: normalizeCountRows(funnelResult.results, 'eventName'),
    outcomes: normalizeCountRows(outcomesResult.results, 'outcome'),
    meaningfulOutcomes30Days: Number(meaningfulOutcomesResult?.count || 0),
    alertEngagement: normalizeCountRows(alertEngagementResult.results, 'action'),
    topPrograms: (topProgramsResult.results || []).map((row) => ({
      programId: row.programId,
      uniqueViewers: Number(row.uniqueViewers || 0),
      saves: Number(row.saves || 0),
      sourceClicks: Number(row.sourceClicks || 0),
    })),
    studentValue,
    programLifecycle,
    proactiveDelivery,
    independentUsability: {
      ...independentUsability,
      setupCompleted30Days: Number(activatedResult?.count || 0),
      ordinaryReturn30Days: Number(returningResult?.count || 0),
    },
    reliability,
    operations,
  };
}

async function getProactiveDeliveryMetrics(env, since30Days) {
  const [summaryRow, deliveryRows, engagementRows, downstreamRows, valueRow, unsubscribeRow, runRow] = await Promise.all([
    env.DB.prepare(
      `select
        count(distinct watch_request_id) as eligibleRecipients,
        count(*) as attemptedDeliveries,
        count(case when status = 'sent' then 1 end) as sent,
        count(case when status = 'failed' then 1 end) as failed,
        count(case when status in ('skipped', 'unsubscribed') then 1 end) as skipped,
        count(case when delivery_format = 'immediate' then 1 end) as immediate,
        count(case when delivery_format = 'digest' then 1 end) as digest
       from proactive_delivery_batches
       where created_at >= ?`,
    ).bind(since30Days).first(),
    env.DB.prepare(
      `select
        delivery_format as deliveryFormat,
        delivery_class as deliveryClass,
        status,
        count(*) as deliveries,
        count(distinct watch_request_id) as recipients
       from proactive_delivery_batches
       where created_at >= ?
       group by delivery_format, delivery_class, status
       order by delivery_format, delivery_class, status`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select
        batch.delivery_format as deliveryFormat,
        event.action,
        count(*) as events,
        count(distinct batch.watch_request_id) as recipients
       from proactive_delivery_engagement_events event
       inner join proactive_delivery_batches batch on batch.id = event.batch_id
       where event.created_at >= ?
       group by batch.delivery_format, event.action
       order by batch.delivery_format, event.action`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select
        json_extract(context_json, '$.entrySource') as entrySource,
        event_name as eventName,
        count(*) as events,
        count(distinct workspace_id) as students
       from beta_product_events
       where created_at >= ?
         and json_extract(context_json, '$.entrySource') in (
           'watched_program_alert', 'personalized_discovery_digest', 'prepare_alert',
           'manual_library', 'search', 'direct_or_shared_link'
         )
       group by entrySource, event_name
       order by entrySource, event_name`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select
        count(distinct item.id) as deliveredProgramItems,
        count(distinct case
          when evidence.relevance_source = 'explicit'
            and evidence.relevance in ('this_cycle', 'future_cycle')
            and evidence.relevance_updated_at >= batch.sent_at
          then item.id end) as relevantProgramItems,
        count(distinct case
          when evidence.relevance_source = 'explicit'
            and evidence.relevance in ('this_cycle', 'future_cycle')
            and evidence.relevance_updated_at >= batch.sent_at
            and evidence.prior_awareness = 'no'
            and evidence.updated_at >= batch.sent_at
          then item.id end) as newRelevantProgramItems,
        count(distinct case
          when evidence.relevance_source = 'explicit'
            and evidence.relevance in ('this_cycle', 'future_cycle')
            and evidence.relevance_updated_at >= batch.sent_at
            and evidence.prior_awareness in ('yes', 'no', 'unsure')
            and evidence.updated_at >= batch.sent_at
          then item.id end) as awarenessAnsweredItems
       from proactive_delivery_items item
       inner join proactive_delivery_batches batch on batch.id = item.batch_id
       left join beta_program_evidence evidence
         on evidence.workspace_id = batch.workspace_id
        and evidence.program_id = item.program_id
       where batch.sent_at >= ?`,
    ).bind(since30Days).first(),
    env.DB.prepare(
      `select count(distinct id) as recipients
       from watch_requests
       where unsubscribed_at is not null
         and unsubscribed_at >= ?`,
    ).bind(since30Days).first(),
    env.DB.prepare(
      `select
        sum(considered_recipient_count) as consideredRecipients,
        sum(no_match_count) as noMatch,
        sum(duplicate_suppressed_count) as duplicateSuppressed
       from proactive_delivery_runs
       where created_at >= ?`,
    ).bind(since30Days).first(),
  ]);

  return {
    summary: {
      eligibleRecipients: Number(summaryRow?.eligibleRecipients || 0),
      attemptedDeliveries: Number(summaryRow?.attemptedDeliveries || 0),
      sent: Number(summaryRow?.sent || 0),
      failed: Number(summaryRow?.failed || 0),
      skipped: Number(summaryRow?.skipped || 0),
      unsubscribedRecipients: Number(unsubscribeRow?.recipients || 0),
      consideredRecipients: Number(runRow?.consideredRecipients || 0),
      noMatch: Number(runRow?.noMatch || 0),
      duplicateSuppressed: Number(runRow?.duplicateSuppressed || 0),
      immediate: Number(summaryRow?.immediate || 0),
      digest: Number(summaryRow?.digest || 0),
    },
    deliveries: (deliveryRows.results || []).map((row) => ({
      deliveryFormat: cleanString(row.deliveryFormat, 40),
      deliveryClass: cleanString(row.deliveryClass, 40),
      status: cleanString(row.status, 40),
      deliveries: Number(row.deliveries || 0),
      recipients: Number(row.recipients || 0),
    })),
    engagement: (engagementRows.results || []).map((row) => ({
      deliveryFormat: cleanString(row.deliveryFormat, 40),
      action: cleanString(row.action, 80),
      events: Number(row.events || 0),
      recipients: Number(row.recipients || 0),
    })),
    downstream: (downstreamRows.results || []).map((row) => ({
      entrySource: cleanString(row.entrySource, 80),
      eventName: cleanString(row.eventName, 80),
      events: Number(row.events || 0),
      students: Number(row.students || 0),
    })),
    studentValue: {
      deliveredProgramItems: Number(valueRow?.deliveredProgramItems || 0),
      relevantProgramItems: Number(valueRow?.relevantProgramItems || 0),
      newRelevantProgramItems: Number(valueRow?.newRelevantProgramItems || 0),
      awarenessAnsweredItems: Number(valueRow?.awarenessAnsweredItems || 0),
    },
  };
}

async function getProgramLifecycleMetrics(env, since30Days) {
  const [relevanceRows, applicationRows, repeatRow, watchRow, persistenceRow] = await Promise.all([
    env.DB.prepare(
      `select relevance as value,
        count(distinct workspace_id) as students,
        count(*) as programPairs
       from beta_program_evidence
       where relevance_source = 'explicit'
         and relevance_updated_at >= ?
       group by relevance
       order by programPairs desc`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select outcome as value,
        count(distinct workspace_id) as students,
        count(*) as attempts
       from beta_application_attempts
       where applied_at >= ?
       group by outcome
       order by attempts desc`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select count(*) as repeatProgramPairs,
        count(case when namedCycles > 1 then 1 end) as namedCycleReapplicationPairs
       from (
         select workspace_id, program_id,
           count(distinct case
             when cycle_label is not null and trim(cycle_label) != '' then cycle_label
           end) as namedCycles
         from beta_application_attempts
         group by workspace_id, program_id
         having count(*) > 1
       )`,
    ).first(),
    env.DB.prepare(
      `select count(distinct workspace_id) as students,
        count(*) as programPairs
       from beta_program_watches
       where is_watching = 1`,
    ).first(),
    env.DB.prepare(
      `select
        count(case when exists (
          select 1 from beta_application_attempts attempt
          where attempt.workspace_id = watch.workspace_id
            and attempt.program_id = watch.program_id
        ) then 1 end) as appliedAndWatching,
        count(case when exists (
          select 1 from beta_application_attempts attempt
          where attempt.workspace_id = watch.workspace_id
            and attempt.program_id = watch.program_id
            and attempt.outcome = 'not_selected'
        ) then 1 end) as notSelectedAndWatching,
        count(case when exists (
          select 1 from beta_program_evidence evidence
          where evidence.workspace_id = watch.workspace_id
            and evidence.program_id = watch.program_id
            and evidence.relevance = 'future_cycle'
            and evidence.relevance_source = 'explicit'
        ) then 1 end) as futureCycleAndWatching
       from beta_program_watches watch
       where watch.is_watching = 1`,
    ).first(),
  ]);

  return {
    relevance: (relevanceRows.results || []).map((row) => ({
      value: cleanString(row.value, 80),
      students: Number(row.students || 0),
      programPairs: Number(row.programPairs || 0),
    })),
    applications: {
      outcomes: (applicationRows.results || []).map((row) => ({
        value: cleanString(row.value, 80),
        students: Number(row.students || 0),
        attempts: Number(row.attempts || 0),
      })),
      repeatProgramPairs: Number(repeatRow?.repeatProgramPairs || 0),
      namedCycleReapplicationPairs: Number(repeatRow?.namedCycleReapplicationPairs || 0),
    },
    watches: {
      students: Number(watchRow?.students || 0),
      programPairs: Number(watchRow?.programPairs || 0),
    },
    persistentValue: {
      appliedAndWatching: Number(persistenceRow?.appliedAndWatching || 0),
      notSelectedAndWatching: Number(persistenceRow?.notSelectedAndWatching || 0),
      futureCycleAndWatching: Number(persistenceRow?.futureCycleAndWatching || 0),
    },
  };
}

async function getBetaParticipantActivity(env, url) {
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 50, 100));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const [totalRow, participantResult] = await Promise.all([
    env.DB.prepare('select count(*) as total from beta_access_workspaces').first(),
    env.DB.prepare(
      `with workspace_page as (
        select id, code_label, tester_segment, created_at, last_seen_at
        from beta_access_workspaces
        order by coalesce(last_seen_at, created_at) desc
        limit ? offset ?
      )
       select
        w.id as workspaceId,
        w.code_label as codeLabel,
        w.tester_segment as testerSegment,
        w.created_at as firstSeenAt,
        w.last_seen_at as lastSeenAt,
        coalesce(max(e.created_at), w.last_seen_at, w.created_at) as latestActivityAt,
        count(distinct e.session_id) as sessions,
        count(distinct substr(e.created_at, 1, 10)) as activeDays,
        count(case when e.event_name = 'program_viewed' then 1 end) as programViews,
        count(distinct case when e.event_name = 'program_saved' then e.program_id end) as programsSaved,
        count(distinct case when e.event_name = 'watch_started' then e.program_id end) as programsWatched,
        max(case when e.event_name = 'focus_saved' then 1 else 0 end) as focusCompleted,
        max(case when e.event_name = 'alerts_enabled' then 1 else 0 end) as alertsEnabled,
        count(case when e.event_name = 'official_source_clicked' then 1 end) as sourceClicks,
        count(case when e.event_name = 'contribution_submitted' then 1 end) as contributions,
        exists(
          select 1 from beta_program_evidence activation
          where activation.workspace_id = w.id
            and activation.relevance_source = 'explicit'
            and activation.first_decision_at is not null
        ) as eligibleActivated,
        (
          select count(*) from beta_program_evidence relevant
          where relevant.workspace_id = w.id
            and relevant.relevance_source = 'explicit'
            and relevant.relevance in ('this_cycle', 'future_cycle')
        ) as relevantPrograms,
        (
          select count(*) from beta_program_evidence discovery
          where discovery.workspace_id = w.id
            and discovery.relevance_source = 'explicit'
            and discovery.prior_awareness = 'no'
            and discovery.relevance in ('this_cycle', 'future_cycle')
        ) as newDiscoveries,
        (
          select count(distinct attempt.program_id) from beta_application_attempts attempt
          where attempt.workspace_id = w.id
        ) as externalActions,
        (
          select 'applied' from beta_application_attempts latest_attempt
          where latest_attempt.workspace_id = w.id
          order by latest_attempt.applied_at desc, latest_attempt.created_at desc limit 1
        ) as latestActionState,
        (
          select support_level from beta_program_evidence latest_support
          where latest_support.workspace_id = w.id and latest_support.support_level is not null
          order by latest_support.updated_at desc limit 1
        ) as latestSupportLevel,
        exists(
          select 1
          from alert_deliveries relevant_delivery
          inner join watch_requests relevant_request on relevant_request.id = relevant_delivery.watch_request_id
          where relevant_request.workspace_id = w.id
            and relevant_delivery.status = 'sent'
            and relevant_delivery.sent_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-48 hours')
        ) as relevantWindowEligible,
        exists(
          select 1
          from alert_deliveries relevant_delivery
          inner join watch_requests relevant_request on relevant_request.id = relevant_delivery.watch_request_id
          inner join beta_product_events return_event on return_event.workspace_id = relevant_request.workspace_id
          where relevant_request.workspace_id = w.id
            and relevant_delivery.status = 'sent'
            and relevant_delivery.sent_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-48 hours')
            and return_event.created_at > relevant_delivery.sent_at
        ) as relevantWindowReturned,
        (
          select outcome
          from beta_product_events outcome_event
          where outcome_event.workspace_id = w.id
            and outcome_event.event_name = 'outcome_reported'
          order by outcome_event.created_at desc
          limit 1
        ) as latestOutcome
       from workspace_page w
       left join beta_product_events e on e.workspace_id = w.id
       group by w.id, w.code_label, w.tester_segment, w.created_at, w.last_seen_at
       order by latestActivityAt desc`,
    )
      .bind(limit, offset)
      .all(),
  ]);

  const total = Number(totalRow?.total || 0);

  const response = {
    ok: true,
    generatedAt: new Date().toISOString(),
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
    participants: (participantResult.results || []).map((row) => ({
      workspaceId: row.workspaceId,
      codeLabel: row.codeLabel || 'Unlabeled',
      testerSegment: row.testerSegment || 'unknown',
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      latestActivityAt: row.latestActivityAt,
      sessions: Number(row.sessions || 0),
      activeDays: Number(row.activeDays || 0),
      programViews: Number(row.programViews || 0),
      programsSaved: Number(row.programsSaved || 0),
      programsWatched: Number(row.programsWatched || 0),
      focusCompleted: Boolean(row.focusCompleted),
      alertsEnabled: Boolean(row.alertsEnabled),
      sourceClicks: Number(row.sourceClicks || 0),
      contributions: Number(row.contributions || 0),
      eligibleActivated: Boolean(row.eligibleActivated),
      relevantPrograms: Number(row.relevantPrograms || 0),
      newDiscoveries: Number(row.newDiscoveries || 0),
      externalActions: Number(row.externalActions || 0),
      latestActionState: row.latestActionState || '',
      latestSupportLevel: row.latestSupportLevel || '',
      relevantWindowEligible: Boolean(row.relevantWindowEligible),
      relevantWindowReturned: Boolean(row.relevantWindowReturned),
      latestOutcome: row.latestOutcome || '',
    })),
  };

  return response;
}

async function getCaptureWaitlistTotals(env) {
  if (!env.CAPTURE_DB) {
    return { total: null, uniqueEmails: null, available: false };
  }

  try {
    const row = await env.CAPTURE_DB.prepare(
      `select
        count(*) as total,
        count(distinct lower(trim(email))) as uniqueEmails
       from waitlist_requests
       where email is not null
         and trim(email) != ''
         and source = 'applyfirst-waitlist'`,
    ).first();

    return {
      total: Number(row?.total || 0),
      uniqueEmails: Number(row?.uniqueEmails || 0),
      available: true,
    };
  } catch (error) {
    console.error(JSON.stringify({ event: 'capture_waitlist_metrics_failed', error: error.message }));
    return { total: null, uniqueEmails: null, available: false };
  }
}

async function getCaptureWaitlistPipeline(env) {
  const unavailable = {
    available: false,
    interested: null,
    invitedFromWaitlist: null,
    openedFromWaitlist: null,
    stillWaiting: null,
  };

  if (!env.CAPTURE_DB) return unavailable;

  try {
    const [waitlistResult, invitationResult] = await Promise.all([
      env.CAPTURE_DB.prepare(
        `select lower(trim(email)) as email
         from waitlist_requests
         where email is not null
           and trim(email) != ''
           and source = 'applyfirst-waitlist'
         group by lower(trim(email))`,
      ).all(),
      env.DB.prepare(
        `select invitation.recipient_email_hash as recipientEmailHash,
          invitation.status,
          workspace.id as workspaceId
         from beta_invitations invitation
         left join beta_access_workspaces workspace
           on workspace.access_code_hash = invitation.access_code_hash
         where invitation.recipient_email_hash is not null
           and invitation.recipient_email_hash != ''`,
      ).all(),
    ]);
    const waitlistHashes = new Set(await Promise.all(
      (waitlistResult.results || []).map((row) => sha256Hex(`applyfirst-waitlist-email:${row.email}`)),
    ));
    const invitedHashes = new Set();
    const openedHashes = new Set();

    for (const invitation of invitationResult.results || []) {
      const emailHash = cleanString(invitation.recipientEmailHash, 64).toLowerCase();
      if (!waitlistHashes.has(emailHash) || !['sent', 'active'].includes(invitation.status)) continue;
      invitedHashes.add(emailHash);
      if (invitation.workspaceId) openedHashes.add(emailHash);
    }

    return {
      available: true,
      interested: waitlistHashes.size,
      invitedFromWaitlist: invitedHashes.size,
      openedFromWaitlist: openedHashes.size,
      stillWaiting: Math.max(0, waitlistHashes.size - invitedHashes.size),
    };
  } catch (error) {
    console.error(JSON.stringify({ event: 'capture_waitlist_pipeline_failed', error: error.message }));
    return unavailable;
  }
}

async function getCaptureWaitlistSegments(env) {
  if (!env.CAPTURE_DB) {
    return { available: false, classYears: [], interests: [] };
  }

  try {
    const [classYears, interests] = await Promise.all([
      env.CAPTURE_DB.prepare(
        `with latest_waitlist as (
          select email, class_year, interest,
            row_number() over (
              partition by lower(trim(email))
              order by datetime(created_at) desc, id desc
            ) as row_number
          from waitlist_requests
          where email is not null
            and trim(email) != ''
            and source = 'applyfirst-waitlist'
        )
         select coalesce(nullif(trim(class_year), ''), 'Not provided') as label,
          count(distinct lower(email)) as students
         from latest_waitlist
         where row_number = 1
         group by label
         order by students desc
         limit 12`,
      ).all(),
      env.CAPTURE_DB.prepare(
        `with latest_waitlist as (
          select email, class_year, interest,
            row_number() over (
              partition by lower(trim(email))
              order by datetime(created_at) desc, id desc
            ) as row_number
          from waitlist_requests
          where email is not null
            and trim(email) != ''
            and source = 'applyfirst-waitlist'
        )
         select coalesce(nullif(trim(interest), ''), 'Not provided') as label,
          count(distinct lower(email)) as students
         from latest_waitlist
         where row_number = 1
         group by label
         order by students desc
         limit 12`,
      ).all(),
    ]);

    return {
      available: true,
      classYears: normalizeSegmentRows(classYears.results),
      interests: normalizeSegmentRows(interests.results),
    };
  } catch (error) {
    console.error(JSON.stringify({ event: 'capture_waitlist_segments_failed', error: error.message }));
    return { available: false, classYears: [], interests: [] };
  }
}

function normalizeOptionalHash(value, label) {
  const hash = cleanString(value, 64).toLowerCase();
  if (!hash) return null;
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw httpError(400, `${label} must be a 64-character SHA-256 value.`);
  }
  return hash;
}

async function getBetaInvitationMetrics(env, since30Days) {
  const row = await env.DB.prepare(
    `select
      count(*) as registered,
      count(case when invitation.status in ('sent', 'active') then 1 end) as invited,
      count(case
        when invitation.status in ('sent', 'active')
          and workspace.id is not null
        then 1 end) as opened,
      count(case
        when invitation.status in ('sent', 'active')
          and invitation.invited_at >= ?
        then 1 end) as invited30Days,
      count(case
        when invitation.status in ('sent', 'active')
          and invitation.invited_at >= ?
          and workspace.id is not null
        then 1 end) as opened30Days,
      count(case when invitation.status = 'not_sent' then 1 end) as notSent,
      count(case when invitation.status = 'paused' then 1 end) as paused,
      count(case when invitation.status = 'revoked' then 1 end) as revoked
     from beta_invitations invitation
     left join beta_access_workspaces workspace
       on workspace.access_code_hash = invitation.access_code_hash`,
  )
    .bind(since30Days, since30Days)
    .first();

  return {
    registered: Number(row?.registered || 0),
    invited: Number(row?.invited || 0),
    opened: Number(row?.opened || 0),
    invited30Days: Number(row?.invited30Days || 0),
    opened30Days: Number(row?.opened30Days || 0),
    notSent: Number(row?.notSent || 0),
    paused: Number(row?.paused || 0),
    revoked: Number(row?.revoked || 0),
  };
}

async function getStudentValueMetrics(env, since30Days) {
  const [
    summaryRow,
    evidenceRows,
    actionRows,
    actionSummaryRow,
    supportRows,
    frictionRows,
    segmentRows,
    cohortRows,
    categoryRows,
    programRows,
    programActionRows,
  ] = await Promise.all([
    env.DB.prepare(
      `select
        count(distinct case
          when relevance_source = 'explicit' and relevance is not null and relevance != ''
          then workspace_id end) as decisionStudents,
        count(distinct case
          when relevance_source = 'explicit' and first_decision_at is not null
          then workspace_id end) as eligibleActivated,
        count(distinct case
          when relevance_source = 'explicit' and relevance in ('this_cycle', 'future_cycle')
          then workspace_id end) as foundRelevant,
        count(distinct case
          when relevance_source = 'explicit'
            and prior_awareness = 'no' and relevance in ('this_cycle', 'future_cycle')
          then workspace_id end) as newDiscoveryStudents,
        count(case
          when relevance_source = 'explicit'
            and prior_awareness = 'no' and relevance in ('this_cycle', 'future_cycle')
          then 1 end) as newDiscoveryPairs,
        count(case
          when relevance_source = 'explicit'
            and prior_awareness in ('yes', 'no', 'unsure')
            and relevance in ('this_cycle', 'future_cycle')
          then 1 end) as awarenessAnsweredPairs,
        (
          select count(*) from beta_program_watches watch
          where watch.is_watching = 1
        ) as watchingPairs,
        0 as preparingPairs,
        0 as deliberateSkipPairs,
        count(case
          when relevance_source = 'explicit'
            and relevance in ('this_cycle', 'future_cycle')
            and (prior_awareness is null or prior_awareness = '')
          then 1 end) as awarenessUnknownPairs,
        count(case when relevance_source = 'explicit' then 1 end) as evidencePairs
       from beta_program_evidence
       where updated_at >= ?`,
    ).bind(since30Days).first(),
    env.DB.prepare(
      `select
        workspace_id as workspaceId,
        program_id as programId,
        first_relevant_at as firstRelevantAt,
        action_state as actionState,
        action_at as actionAt,
        (
          select verified_deadline_at
          from monitoring_audits audit
          where audit.program_id = beta_program_evidence.program_id
            and audit.verified_deadline_at is not null
            and audit.verified_deadline_at != ''
          order by audit.created_at desc
          limit 1
        ) as deadlineAt
       from beta_program_evidence
       where updated_at >= ?
         and relevance_source = 'explicit'
         and relevance in ('this_cycle', 'future_cycle')`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select
        attempt.workspace_id as workspaceId,
        attempt.program_id as programId,
        'submitted' as actionState,
        attempt.applied_at as actionAt,
        (
          select verified_deadline_at
          from monitoring_audits audit
          where audit.program_id = attempt.program_id
            and audit.verified_deadline_at is not null
            and audit.verified_deadline_at != ''
          order by audit.created_at desc
          limit 1
        ) as deadlineAt
       from beta_application_attempts attempt
       where attempt.applied_at >= ?`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select
        count(distinct workspace_id) as externalActionStudents,
        count(distinct workspace_id || ':' || program_id) as externalActionPairs,
        count(*) as submittedPairs
       from beta_application_attempts
       where applied_at >= ?`,
    ).bind(since30Days).first(),
    env.DB.prepare(
      `select coalesce(nullif(support_level, ''), 'unknown') as label,
        count(distinct workspace_id) as students,
        count(*) as records
       from beta_program_evidence
       where updated_at >= ?
         and relevance_source = 'explicit'
       group by label
       order by records desc`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select friction_category as label,
        count(distinct workspace_id) as students,
        count(*) as records
       from beta_program_evidence
       where updated_at >= ?
         and friction_category is not null
         and friction_category != ''
       group by friction_category
       order by records desc`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select class_year as classYear, role_track as roleTrack,
        count(distinct workspace_id) as students,
        count(*) as records
       from beta_program_evidence
       where updated_at >= ?
         and (class_year != '' or role_track != '')
       group by class_year, role_track
       order by records desc
       limit 20`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select coalesce(nullif(workspace.tester_segment, ''), 'unknown') as testerSegment,
        count(distinct evidence.workspace_id) as students,
        count(distinct case
          when evidence.relevance_source = 'explicit' and evidence.first_decision_at is not null
          then evidence.workspace_id end) as eligibleActivated,
        count(distinct case
          when evidence.relevance_source = 'explicit'
            and evidence.relevance in ('this_cycle', 'future_cycle')
          then evidence.workspace_id end) as foundRelevant,
        count(distinct case
          when evidence.relevance_source = 'explicit'
            and evidence.prior_awareness = 'no'
            and evidence.relevance in ('this_cycle', 'future_cycle')
          then evidence.workspace_id end) as newDiscoveryStudents,
        count(distinct case
          when exists (
            select 1 from beta_application_attempts attempt
            where attempt.workspace_id = evidence.workspace_id
              and attempt.applied_at >= ?
          )
          then evidence.workspace_id end) as externalActionStudents
       from beta_program_evidence evidence
       inner join beta_access_workspaces workspace on workspace.id = evidence.workspace_id
       where evidence.updated_at >= ?
         and evidence.relevance_source = 'explicit'
       group by testerSegment
       order by students desc`,
    ).bind(since30Days, since30Days).all(),
    env.DB.prepare(
      `select coalesce(nullif(opportunity_category, ''), 'Not provided') as label,
        count(distinct workspace_id) as students,
        count(*) as records,
        count(distinct case
          when relevance_source = 'explicit' and relevance in ('this_cycle', 'future_cycle')
          then workspace_id end) as relevantStudents,
        count(distinct case
          when exists (
            select 1 from beta_application_attempts attempt
            where attempt.workspace_id = beta_program_evidence.workspace_id
              and attempt.program_id = beta_program_evidence.program_id
              and attempt.applied_at >= ?
          ) then workspace_id end) as externalActionStudents
       from beta_program_evidence
       where updated_at >= ?
         and relevance_source = 'explicit'
       group by label
       order by records desc`,
    ).bind(since30Days, since30Days).all(),
    env.DB.prepare(
      `select program_id as programId,
        count(distinct workspace_id) as students,
        count(distinct case
          when relevance_source = 'explicit' and relevance in ('this_cycle', 'future_cycle')
          then workspace_id end) as relevantStudents,
        count(distinct case
          when relevance_source = 'explicit'
            and prior_awareness = 'no' and relevance in ('this_cycle', 'future_cycle')
          then workspace_id end) as newDiscoveryStudents
       from beta_program_evidence
       where updated_at >= ?
         and relevance_source = 'explicit'
       group by program_id
       order by relevantStudents desc, students desc
       limit 12`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select program_id as programId,
        count(distinct workspace_id) as externalActionStudents,
        count(*) as submissions
       from beta_application_attempts
       where applied_at >= ?
       group by program_id`,
    ).bind(since30Days).all(),
  ]);
  const timing = calculateTimingEvidence(evidenceRows.results || [], actionRows.results || []);
  const programActionsById = new Map(
    (programActionRows.results || []).map((row) => [row.programId, row]),
  );
  const programEvidenceById = new Map(
    (programRows.results || []).map((row) => [row.programId, row]),
  );
  const measuredProgramIds = new Set([...programEvidenceById.keys(), ...programActionsById.keys()]);

  return {
    eligibleActivation: {
      numerator: Number(summaryRow?.eligibleActivated || 0),
      denominator: Number(summaryRow?.decisionStudents || 0),
    },
    foundRelevant: Number(summaryRow?.foundRelevant || 0),
    newToStudentDiscovery: {
      students: Number(summaryRow?.newDiscoveryStudents || 0),
      programPairs: Number(summaryRow?.newDiscoveryPairs || 0),
      unknownPairs: Number(summaryRow?.awarenessUnknownPairs || 0),
      denominator: Number(summaryRow?.awarenessAnsweredPairs || 0),
    },
    externalActions: {
      students: Number(actionSummaryRow?.externalActionStudents || 0),
      programPairs: Number(actionSummaryRow?.externalActionPairs || 0),
      submissions: Number(actionSummaryRow?.submittedPairs || 0),
      watching: Number(summaryRow?.watchingPairs || 0),
      preparing: Number(summaryRow?.preparingPairs || 0),
      deliberateSkips: Number(summaryRow?.deliberateSkipPairs || 0),
    },
    discoveryLeadTime: timing.discoveryLeadTime,
    timelyExternalAction: timing.timelyExternalAction,
    supportLevels: normalizeGroupedRows(supportRows.results),
    frictionCategories: normalizeGroupedRows(frictionRows.results),
    segments: (segmentRows.results || []).map((row) => ({
      classYear: cleanString(row.classYear, 80) || 'Not provided',
      roleTrack: cleanString(row.roleTrack, 120) || 'Not provided',
      students: Number(row.students || 0),
      records: Number(row.records || 0),
    })),
    testerSegments: (cohortRows.results || []).map((row) => ({
      testerSegment: cleanString(row.testerSegment, 80) || 'unknown',
      students: Number(row.students || 0),
      eligibleActivated: Number(row.eligibleActivated || 0),
      foundRelevant: Number(row.foundRelevant || 0),
      newDiscoveryStudents: Number(row.newDiscoveryStudents || 0),
      externalActionStudents: Number(row.externalActionStudents || 0),
    })),
    opportunityCategories: (categoryRows.results || []).map((row) => ({
      label: cleanString(row.label, 120),
      students: Number(row.students || 0),
      records: Number(row.records || 0),
      relevantStudents: Number(row.relevantStudents || 0),
      externalActionStudents: Number(row.externalActionStudents || 0),
    })),
    programEvidence: [...measuredProgramIds].map((programId) => {
      const evidence = programEvidenceById.get(programId) || {};
      const actions = programActionsById.get(programId) || {};
      return {
        programId: cleanString(programId, 160),
        students: Number(evidence.students || 0),
        relevantStudents: Number(evidence.relevantStudents || 0),
        newDiscoveryStudents: Number(evidence.newDiscoveryStudents || 0),
        externalActionStudents: Number(actions.externalActionStudents || 0),
        submissions: Number(actions.submissions || 0),
      };
    }),
  };
}

async function getIndependentUsabilityMetrics(env, since30Days) {
  const [decisionRows, relevantWindowRows] = await Promise.all([
    env.DB.prepare(
      `select workspace.created_at as workspaceCreatedAt,
        min(evidence.first_decision_at) as firstDecisionAt
       from beta_access_workspaces workspace
       inner join beta_program_evidence evidence on evidence.workspace_id = workspace.id
       where evidence.first_decision_at >= ?
       group by workspace.id`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select
        delivery.id as deliveryId,
        request.workspace_id as workspaceId,
        candidate.program_id as programId,
        delivery.sent_at as sentAt,
        max(case when event.created_at > delivery.sent_at then 1 else 0 end) as returned,
        max(case
          when event.event_name = 'official_source_clicked'
            and event.program_id = candidate.program_id
            and event.created_at > delivery.sent_at
          then 1 else 0 end) as sourceClicked,
        max(case when engagement.created_at > delivery.sent_at then 1 else 0 end) as feedbackGiven,
        max(case
          when attempt.applied_at > delivery.sent_at
          then 1 else 0 end) as externalAction
       from alert_deliveries delivery
       inner join watch_requests request on request.id = delivery.watch_request_id
       inner join alert_candidates candidate on candidate.id = delivery.alert_candidate_id
       left join beta_product_events event on event.workspace_id = request.workspace_id
       left join alert_engagement_events engagement
         on engagement.alert_candidate_id = delivery.alert_candidate_id
        and engagement.watch_request_id = delivery.watch_request_id
       left join beta_application_attempts attempt
         on attempt.workspace_id = request.workspace_id
        and attempt.program_id = candidate.program_id
       where delivery.status = 'sent'
         and request.workspace_id is not null
         and delivery.sent_at >= ?
       group by delivery.id`,
    ).bind(since30Days).all(),
  ]);

  return {
    timeToFirstUsefulDecision: calculateElapsedHours(decisionRows.results || [], 'workspaceCreatedAt', 'firstDecisionAt'),
    relevantWindowReturn: calculateRelevantWindowReturn(relevantWindowRows.results || []),
  };
}

async function getReliabilityMetrics(env, since30Days) {
  const now = new Date().toISOString();
  const [freshness, auditRows, openingRows, latencyRows, candidateCounts, failures, deliveryCounts, discoveryPending, correctionRows] = await Promise.all([
    env.DB.prepare(
      `select
        count(*) as eligible,
        count(case
          when official_sources.last_checked_at is not null
            and coalesce(trim(official_sources.last_error_message), '') = ''
            and source_schedule_profiles.next_check_at > ?
          then 1 end) as fresh,
        count(case when source_schedule_profiles.next_check_at <= ? then 1 end) as due
       from official_sources
       inner join source_schedule_profiles
         on source_schedule_profiles.official_source_id = official_sources.id
       where official_sources.enabled = 1
         and source_schedule_profiles.current_phase in ('warmup', 'active')`,
    ).bind(now, now).first(),
    env.DB.prepare(
      `select status_correct as statusCorrect, deadline_correct as deadlineCorrect,
        eligibility_correct as eligibilityCorrect, url_correct as urlCorrect,
        freshness_correct as freshnessCorrect, alert_correct as alertCorrect
       from monitoring_audits
       where audit_type = 'information_accuracy' and created_at >= ?`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select detected from monitoring_audits
       where audit_type = 'known_opening' and created_at >= ?`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select candidate.id,
        coalesce(
          (
            select audit.detected_at
            from monitoring_audits audit
            where audit.alert_candidate_id = candidate.id
              and audit.detected = 1
              and audit.detected_at is not null
            order by audit.created_at asc
            limit 1
          ),
          source_check.created_at
        ) as detectedAt,
        candidate.created_at as candidateAt,
        min(delivery.sent_at) as sentAt,
        case when candidate.status in ('auto_ready', 'auto_sent') and candidate.reviewed_at is null then 'automatic' else 'manual' end as deliveryPath
       from alert_candidates candidate
       inner join source_checks source_check on source_check.id = candidate.source_check_id
       inner join alert_deliveries delivery
         on delivery.alert_candidate_id = candidate.id and delivery.status = 'sent'
       where candidate.created_at >= ?
       group by candidate.id`,
    ).bind(since30Days).all(),
    env.DB.prepare(
      `select
        count(*) as total,
        count(case when status not in ('auto_ready', 'auto_sent') then 1 end) as manualReview,
        count(case when status in ('auto_ready', 'auto_sent') then 1 end) as automatic
       from alert_candidates
       where created_at >= ?`,
    ).bind(since30Days).first(),
    env.DB.prepare(
      `select count(*) as count from official_sources
       where enabled = 1 and last_error_message is not null and trim(last_error_message) != ''`,
    ).first(),
    env.DB.prepare(
      `select
        count(*) as total,
        count(case when status = 'failed' then 1 end) as failed,
        count(case when status = 'sent' then 1 end) as sent
       from alert_deliveries
       where created_at >= ?`,
    ).bind(since30Days).first(),
    env.DB.prepare(
      `select count(*) as count from discovery_candidates where status = 'pending_review'`,
    ).first(),
    env.DB.prepare(
      `select reported_at as reportedAt, resolved_at as resolvedAt
       from monitoring_audits
       where audit_type = 'correction' and reported_at is not null and created_at >= ?`,
    ).bind(since30Days).all(),
  ]);

  return {
    sourceFreshness: {
      numerator: Number(freshness?.fresh || 0),
      denominator: Number(freshness?.eligible || 0),
      due: Number(freshness?.due || 0),
    },
    informationAccuracy: calculateAccuracyCoverage(auditRows.results || []),
    knownOpenings: calculateKnownOpeningCoverage(openingRows.results || []),
    notificationLatency: calculateNotificationLatency(latencyRows.results || []),
    correctionTime: calculateElapsedHours(correctionRows.results || [], 'reportedAt', 'resolvedAt'),
    corrections: {
      recorded: correctionRows.results?.length || 0,
      resolved: (correctionRows.results || []).filter((row) => row.resolvedAt).length,
    },
    alertCandidates: {
      total: Number(candidateCounts?.total || 0),
      manualReview: Number(candidateCounts?.manualReview || 0),
      automatic: Number(candidateCounts?.automatic || 0),
    },
    failedChecks: Number(failures?.count || 0),
    deliveries: {
      total: Number(deliveryCounts?.total || 0),
      sent: Number(deliveryCounts?.sent || 0),
      failed: Number(deliveryCounts?.failed || 0),
    },
    pendingDiscoveryReview: Number(discoveryPending?.count || 0),
  };
}

async function getOperationsMetrics(env, since7Days, since30Days) {
  const [programs, watchers, time7Days, time30Days] = await Promise.all([
    env.DB.prepare('select count(*) as count from official_sources where enabled = 1').first(),
    env.DB.prepare(
      `select count(distinct coalesce(
          case when watch_requests.workspace_id is not null and watch_requests.workspace_id != ''
            then 'workspace:' || watch_requests.workspace_id end,
          case when watch_requests.email is not null and watch_requests.email != ''
            then 'email:' || lower(watch_requests.email) end,
          case when watch_requests.phone is not null and watch_requests.phone != ''
            then 'phone:' || watch_requests.phone end,
          'request:' || watch_requests.id
        )) as students,
        count(distinct watch_request_programs.program_id) as programs
       from watch_request_programs
       inner join watch_requests on watch_requests.id = watch_request_programs.watch_request_id
       where watch_requests.status = 'active'
         and (watch_requests.unsubscribed_at is null or watch_requests.unsubscribed_at = '')
         and (
           watch_requests.workspace_id is null
           or not exists (
             select 1 from beta_program_watches preference
             where preference.workspace_id = watch_requests.workspace_id
               and preference.program_id = watch_request_programs.program_id
           )
           or exists (
             select 1 from beta_program_watches preference
             where preference.workspace_id = watch_requests.workspace_id
               and preference.program_id = watch_request_programs.program_id
               and preference.is_watching = 1
           )
         )`,
    ).first(),
    env.DB.prepare(
      `select category, sum(minutes) as minutes, count(*) as entries
       from operational_time_entries where period_date >= ? group by category`,
    ).bind(since7Days.slice(0, 10)).all(),
    env.DB.prepare(
      `select category, sum(minutes) as minutes, count(*) as entries
       from operational_time_entries where period_date >= ? group by category`,
    ).bind(since30Days.slice(0, 10)).all(),
  ]);

  return {
    monitoredPrograms: Number(programs?.count || 0),
    activeWatchers: Number(watchers?.students || 0),
    watchedPrograms: Number(watchers?.programs || 0),
    time7Days: normalizeTimeRows(time7Days.results),
    time30Days: normalizeTimeRows(time30Days.results),
  };
}

async function handleAlertEngagement(env, url) {
  const requestId = cleanString(url.searchParams.get('requestId'), 120);
  const candidateId = cleanString(url.searchParams.get('candidateId'), 120);
  const token = cleanString(url.searchParams.get('token'), 180);
  const action = cleanString(url.searchParams.get('action'), 80).toLowerCase();

  if (!requestId || !candidateId || !token || !ALERT_ENGAGEMENT_ACTIONS.has(action)) {
    return new Response(buildAlertEngagementPage(env, 'Feedback Link Expired', 'This alert feedback link is incomplete or no longer valid.'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const row = await env.DB.prepare(
    `select
      watch_requests.unsubscribe_token as unsubscribeToken,
      alert_candidates.id as candidateId,
      official_sources.url as sourceUrl,
      official_sources.program_name as programName
     from watch_requests
     inner join alert_candidates on alert_candidates.id = ?
     left join official_sources on official_sources.id = alert_candidates.official_source_id
     where watch_requests.id = ?
     limit 1`,
  )
    .bind(candidateId, requestId)
    .first();

  if (!row || !timingSafeEqual(token, row.unsubscribeToken)) {
    return new Response(buildAlertEngagementPage(env, 'Feedback Link Expired', 'This alert feedback link is incomplete or no longer valid.'), {
      status: 403,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  await env.DB.prepare(
    `insert into alert_engagement_events (
      id,
      alert_candidate_id,
      watch_request_id,
      action
    ) values (?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), candidateId, requestId, action)
    .run();

  if (action === 'source_clicked') {
    return new Response(null, {
      status: 302,
      headers: {
        location: row.sourceUrl || publicAppUrl(env),
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  }

  return new Response(
    buildAlertEngagementPage(
      env,
      'Thanks For The Feedback',
      `Your response for ${row.programName || 'this opportunity'} was recorded. It will help improve future ApplyFirst alerts.`,
    ),
    {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    },
  );
}

async function handleProactiveDeliveryEngagement(env, url) {
  const token = cleanString(url.searchParams.get('token'), 240);
  const itemId = cleanString(url.searchParams.get('itemId'), 120);
  const action = cleanString(url.searchParams.get('action'), 80).toLowerCase();

  if (!token || !itemId || !PROACTIVE_DELIVERY_ENGAGEMENT_ACTIONS.has(action)) {
    return new Response(
      buildAlertEngagementPage(env, 'Feedback Link Expired', 'This delivery link is incomplete or no longer valid.'),
      {
        status: 400,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      },
    );
  }

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `select
      batch.id as batchId,
      batch.entry_source as entrySource,
      item.id as itemId,
      item.program_id as programId,
      item.official_url as officialUrl,
      catalog.program_name as programName
     from proactive_delivery_batches batch
     inner join proactive_delivery_items item on item.batch_id = batch.id
     left join program_delivery_catalog catalog on catalog.program_id = item.program_id
     where batch.engagement_token_hash = ?
       and item.id = ?
       and batch.status = 'sent'
     limit 1`,
  ).bind(tokenHash, itemId).first();

  if (!row?.batchId) {
    return new Response(
      buildAlertEngagementPage(env, 'Feedback Link Expired', 'This delivery link is incomplete or no longer valid.'),
      {
        status: 403,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      },
    );
  }

  await env.DB.prepare(
    `insert into proactive_delivery_engagement_events (id, batch_id, item_id, action)
     values (?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), row.batchId, row.itemId, action).run();

  if (action === 'source_clicked') {
    return new Response(null, {
      status: 302,
      headers: {
        location: row.officialUrl || publicAppUrl(env),
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  }

  if (action === 'program_opened') {
    const appUrl = new URL(publicAppUrl(env));
    appUrl.searchParams.set('view', 'monitor');
    appUrl.searchParams.set('program', row.programId);
    appUrl.searchParams.set('entrySource', normalizeDeliveryEntrySource(row.entrySource));
    appUrl.searchParams.set('delivery', token);
    return new Response(null, {
      status: 302,
      headers: {
        location: appUrl.toString(),
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  }

  return new Response(
    buildAlertEngagementPage(
      env,
      'Thanks For The Feedback',
      `Your response for ${row.programName || 'this opportunity'} was recorded. It will help ApplyFirst send fewer, better-matched opportunities.`,
    ),
    {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    },
  );
}

async function saveWatchRequest(request, env, ctx) {
  const body = await readJson(request);
  const email = cleanString(body.email, 180).toLowerCase();
  const phone = normalizePhone(body.phoneNumber || body.phone);
  const preferredContactMethod = normalizeContactMethod(body.contactMethod || body.preferredContactMethod, email, phone);

  if (email && !email.includes('@')) {
    throw httpError(400, 'Use a valid email address or leave email blank.');
  }

  if (!email && !phone) {
    throw httpError(400, 'Add an email or phone number to receive opening alerts.');
  }

  const id = crypto.randomUUID();
  const unsubscribeToken = createSecureToken();
  const now = new Date().toISOString();
  const accessCode = normalizeAccessCode(body.accessCode || body.code);
  let workspaceId = null;

  if (BETA_WORKSPACE_CODE_PATTERN.test(accessCode)) {
    const accessCodeHash = await hashAccessCode(accessCode);
    const workspace = await env.DB.prepare(
      'select id from beta_access_workspaces where access_code_hash = ? limit 1',
    )
      .bind(accessCodeHash)
      .first();
    workspaceId = workspace?.id || null;
  }
  const watchedPrograms = normalizeWatchedPrograms(body.watchedPrograms);
  const watchedProgramIds = uniqueStrings([
    ...arrayify(body.watchedProgramIds),
    ...watchedPrograms.map((program) => program.id),
  ]).slice(0, 50);

  await env.DB.prepare(
    `insert into watch_requests (
      id,
      workspace_id,
      source,
      email,
      phone,
      preferred_contact_method,
      class_year,
      role_track,
      priority,
      send_timing,
      preference_summary,
      notification_mode,
      notification_consent_at,
      notification_consent_text,
      match_count,
      alert_ready_count,
      saved_count,
      needs_source_check,
      requested_at,
      unsubscribe_token,
      status,
      raw_payload_json
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      workspaceId,
      cleanString(body.source || 'applyfirst-watch-request', 80),
      email,
      phone,
      preferredContactMethod,
      cleanString(body.classYear, 80),
      cleanString(body.roleTrack || body.interest, 120),
      cleanString(body.priority || 'all', 80),
      cleanString(body.sendTiming, 80),
      cleanString(body.preferenceSummary, 260),
      cleanString(body.notificationMode || 'Beta Watch Request', 120),
      cleanString(body.notificationConsentAt || now, 80),
      cleanString(
        body.notificationConsentText ||
          'I agree to receive ApplyFirst beta alerts for source-confirmed programs that match My Focus. I can unsubscribe from any alert email.',
        260,
      ),
      numberOrZero(body.matchCount),
      numberOrZero(body.alertReadyCount),
      numberOrZero(body.savedCount),
      numberOrZero(body.needsSourceCheck),
      cleanString(body.requestedAt || body.savedAt || now, 80),
      unsubscribeToken,
      'active',
      JSON.stringify({
        matchingProgramIds: arrayify(body.matchingProgramIds).slice(0, 100),
        alertReadyProgramIds: arrayify(body.alertReadyProgramIds).slice(0, 100),
        savedProgramIds: arrayify(body.savedProgramIds).slice(0, 100),
        contactMethod: preferredContactMethod,
        phoneNumber: phone,
        alertScope: 'focus_matches',
        notificationConsentAt: cleanString(body.notificationConsentAt || now, 80),
      }),
    )
    .run();

  const programRows = watchedProgramIds.map((programId) => {
    const program = watchedPrograms.find((item) => item.id === programId) || { id: programId };
    return env.DB.prepare(
      `insert into watch_request_programs (
        id,
        watch_request_id,
        program_id,
        program_name,
        organization,
        official_url,
        readiness,
        reason
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      id,
      cleanString(program.id, 120),
      cleanString(program.name, 180),
      cleanString(program.organization, 160),
      cleanString(program.url || program.officialUrl, 500),
      cleanString(program.readiness, 120),
      cleanString(program.reason, 260),
    );
  });

  if (programRows.length) {
    await env.DB.batch(programRows);
  }

  if (workspaceId) {
    await env.DB.prepare(
      `update beta_program_watches
       set is_watching = 0, stopped_at = ?, updated_at = ?
       where workspace_id = ? and is_watching = 1`,
    )
      .bind(now, now, workspaceId)
      .run();

    if (watchedProgramIds.length) {
      await env.DB.batch(
        watchedProgramIds.map((programId) => env.DB.prepare(
          `insert into beta_program_watches (
            id, workspace_id, program_id, is_watching, started_at, stopped_at, updated_at
          ) values (?, ?, ?, 1, ?, null, ?)
          on conflict(workspace_id, program_id) do update set
            is_watching = 1,
            started_at = coalesce(beta_program_watches.started_at, excluded.started_at),
            stopped_at = null,
            updated_at = excluded.updated_at`,
        ).bind(crypto.randomUUID(), workspaceId, programId, now, now)),
      );
    }
  }

  if (shouldAutoAlertExistingOpenOnWatch(env) && watchedProgramIds.length) {
    const alreadyOpenAlertTask = alertExistingOpenProgramsForWatchRequest(env, id, watchedProgramIds).catch((error) => {
      console.error(
        JSON.stringify({
          event: 'already_open_alert_failed',
          watchRequestId: id,
          error: error.message,
        }),
      );
    });

    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(alreadyOpenAlertTask);
    } else {
      await alreadyOpenAlertTask;
    }
  }

  return {
    ok: true,
    id,
    status: 'active',
    programCount: programRows.length,
    message: 'Focus alerts saved. ApplyFirst will email high-confidence signals for matching programs and prioritize explicit Watches.',
  };
}

async function runMonitoring(env, options = {}) {
  const programIds = uniqueStrings(options.programIds || []);
  const defaultLimit = programIds.length || DEFAULT_MONITOR_LIMIT;
  const limit = Math.max(1, Math.min(Number(options.limit) || defaultLimit, 50));
  const dryRun = Boolean(options.dryRun);
  const generatedAt = new Date().toISOString();
  const sources = await getSourcesForMonitoring(env, {
    limit,
    now: generatedAt,
    force: Boolean(options.force),
    programIds,
  });

  const checks = [];

  for (const source of sources) {
    checks.push(await checkOfficialSource(env, source, { dryRun }));
  }

  return {
    ok: true,
    trigger: options.trigger || 'manual',
    force: Boolean(options.force),
    dryRun,
    writesSkipped: dryRun,
    requestedProgramIds: programIds,
    checked: checks.length,
    changed: checks.filter((check) => check.changed).length,
    alertCandidates: checks.filter((check) => check.newAlertCandidate).length,
    manualReview: checks.filter((check) => check.reviewDecision === 'Manual Review').length,
    generatedAt,
    checks,
  };
}

async function getSourcesForMonitoring(env, { limit, now, force, programIds = [] }) {
  const filters = ['official_sources.enabled = 1'];
  const bindings = [];
  const selectedProgramIds = uniqueStrings(programIds);
  const shouldUseDueFilter = !force && !selectedProgramIds.length;

  if (selectedProgramIds.length) {
    filters.push(`official_sources.program_id in (${selectedProgramIds.map(() => '?').join(', ')})`);
    bindings.push(...selectedProgramIds);
  }

  if (shouldUseDueFilter) {
    filters.push(`(
        source_schedule_profiles.next_check_at is null
        or source_schedule_profiles.next_check_at = ''
        or source_schedule_profiles.next_check_at <= ?
      )`);
    bindings.push(now);
  }

  const query = `select
      official_sources.*,
      source_schedule_profiles.cycle_frequency,
      source_schedule_profiles.expected_open_months_json,
      source_schedule_profiles.last_known_open_at,
      source_schedule_profiles.active_lead_days,
      source_schedule_profiles.active_check_interval_hours,
      source_schedule_profiles.warmup_check_interval_hours,
      source_schedule_profiles.dormant_check_interval_days,
      source_schedule_profiles.discovery_check_interval_hours,
      source_schedule_profiles.source_volatility,
      source_schedule_profiles.discovery_queries_json,
      source_schedule_profiles.current_phase,
      source_schedule_profiles.next_check_at,
      source_schedule_profiles.next_discovery_at,
      source_schedule_profiles.schedule_note,
      source_schedule_profiles.curated_status,
      source_schedule_profiles.curated_status_reviewed_at,
      source_schedule_profiles.curated_open_date,
      source_schedule_profiles.curated_deadline,
      coalesce(watched.active_watch_count, 0) as active_watch_count
    from official_sources
    left join source_schedule_profiles
      on source_schedule_profiles.official_source_id = official_sources.id
    left join (
      select
        watch_request_programs.program_id,
        count(distinct watch_requests.id) as active_watch_count
      from watch_request_programs
      inner join watch_requests
        on watch_requests.id = watch_request_programs.watch_request_id
      where watch_requests.status = 'active'
        and (
          watch_requests.workspace_id is null
          or not exists (
            select 1 from beta_program_watches preference
            where preference.workspace_id = watch_requests.workspace_id
              and preference.program_id = watch_request_programs.program_id
          )
          or exists (
            select 1 from beta_program_watches preference
            where preference.workspace_id = watch_requests.workspace_id
              and preference.program_id = watch_request_programs.program_id
              and preference.is_watching = 1
          )
        )
      group by watch_request_programs.program_id
    ) watched
      on watched.program_id = official_sources.program_id
    where ${filters.join('\n      and ')}
    order by
      coalesce(watched.active_watch_count, 0) desc,
      case source_schedule_profiles.current_phase
        when 'active' then 0
        when 'warmup' then 1
        when 'unknown' then 2
        when 'dormant' then 3
        else 4
      end,
      coalesce(source_schedule_profiles.next_check_at, '') asc,
      coalesce(official_sources.last_checked_at, '') asc,
      official_sources.program_name asc
    limit ?`;
  bindings.push(limit);

  const statement = env.DB.prepare(query);
  const result = await statement.bind(...bindings).all();

  return result.results || [];
}

async function checkOfficialSource(env, source, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const [previousSnapshot, previousAlertState] = await Promise.all([
    env.DB.prepare(
      `select id, content_hash
       from page_snapshots
       where official_source_id = ?
       order by fetched_at desc
       limit 1`,
    )
      .bind(source.id)
      .first(),
    getProgramAlertState(env, source.program_id),
  ]);
  const fetchedAt = new Date().toISOString();
  const snapshotId = crypto.randomUUID();
  const sourceCheckId = crypto.randomUUID();
  let httpStatus = null;
  let rawText = '';
  let normalizedText = '';
  let contentHash = '';
  let errorMessage = '';
  let timeoutId = null;

  try {
    const abortController = new AbortController();
    timeoutId = setTimeout(
      () => abortController.abort('Official source fetch timed out.'),
      Number(env.WATCH_FETCH_TIMEOUT_MS || 12_000),
    );
    const response = await fetch(source.url, {
      headers: {
        'user-agent': 'ApplyFirstBetaWatcher/0.1 (+https://applyfirst-careers.pages.dev)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
      },
      signal: abortController.signal,
    });

    httpStatus = response.status;

    if (!response.ok) {
      throw new Error(`Official source returned HTTP ${response.status}.`);
    }

    rawText = await readTextWithLimit(response, MAX_SOURCE_BYTES);
    normalizedText = normalizePageText(rawText).slice(0, MAX_STORED_TEXT);
    contentHash = await sha256Hex(normalizedText);
    clearTimeout(timeoutId);
    timeoutId = null;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    errorMessage = cleanString(error.message, 500);
    normalizedText = errorMessage;
    contentHash = await sha256Hex(`${source.url}:${errorMessage}`);
  }

  const changed = Boolean(previousSnapshot?.content_hash) && previousSnapshot.content_hash !== contentHash;
  const analysis = errorMessage
    ? classifyFetchFailure(source, errorMessage, new Date(fetchedAt))
    : classifySourceText(normalizedText, source);
  const detectedStatus = getDetectedProgramStatus(analysis);
  const openingDetected = analysis.reviewDecision === 'Alert Candidate' && analysis.suggestedStatus === 'open';
  const autoSendableOpening = isAutoSendableOpening(analysis);
  const previousStatus = previousAlertState?.status || '';
  const openTransition = autoSendableOpening && previousStatus !== 'open';
  const openingNeedsReview =
    openingDetected && !autoSendableOpening && !['open', 'open_review'].includes(previousStatus);
  const reviewCandidate =
    openingNeedsReview || (changed && analysis.reviewDecision === 'Deadline Candidate');
  const shouldCreateAlertCandidate = openTransition || reviewCandidate;
  let candidateId = '';
  let autoSendResult = null;
  const newAlertCandidate = shouldCreateAlertCandidate;
  const nextSchedule = calculateSourceScheduleAfterCheck({
    source,
    detectedStatus,
    analysis,
    checkedAt: fetchedAt,
    errorMessage,
  });

  if (dryRun) {
    return {
      programId: source.program_id,
      name: source.program_name,
      url: source.url,
      dryRun: true,
      writesSkipped: true,
      changed,
      result: analysis.result,
      sourceState: analysis.sourceState,
      sourceAction: analysis.sourceAction,
      reviewDecision: analysis.reviewDecision,
      detectedSignal: analysis.detectedSignal || '',
      newAlertCandidate,
      wouldCreateAlertCandidate: shouldCreateAlertCandidate,
      status: detectedStatus,
      autoAlerted: false,
      wouldAutoSend: openTransition && shouldAutoSendWatchedOpenAlerts(env),
      schedulePhase: nextSchedule.currentPhase,
      nextCheckAt: nextSchedule.nextCheckAt,
      nextDiscoveryAt: nextSchedule.nextDiscoveryAt,
      error: errorMessage || null,
    };
  }

  await env.DB.prepare(
    `insert into page_snapshots (
      id,
      official_source_id,
      fetched_at,
      http_status,
      content_hash,
      normalized_text,
      error_message
    ) values (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(snapshotId, source.id, fetchedAt, httpStatus, contentHash, normalizedText, errorMessage)
    .run();

  await env.DB.prepare(
    `insert into source_checks (
      id,
      program_id,
      official_source_id,
      page_snapshot_id,
      result,
      suggested_status,
      suggested_confidence,
      review_decision,
      changed,
      new_alert_candidate,
      note
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sourceCheckId,
      source.program_id,
      source.id,
      snapshotId,
      analysis.result,
      analysis.suggestedStatus,
      analysis.suggestedConfidence,
      analysis.reviewDecision,
      changed ? 1 : 0,
      newAlertCandidate ? 1 : 0,
      analysis.note,
    )
    .run();

  if (shouldCreateAlertCandidate) {
    candidateId = await createAlertCandidate(env, {
      source,
      sourceCheckId,
      analysis,
      status: openTransition && shouldAutoSendWatchedOpenAlerts(env) ? 'auto_ready' : 'pending_review',
    });

    if (openTransition && shouldAutoSendWatchedOpenAlerts(env)) {
      autoSendResult = await sendCandidateNotifications(env, candidateId, { trigger: 'auto' });
    }
  }

  await upsertProgramAlertState(env, {
    source,
    sourceCheckId,
    candidateId,
    detectedStatus,
    analysis,
    changed,
    checkedAt: fetchedAt,
    autoAlertedAt: hasSuccessfulDelivery(autoSendResult) ? new Date().toISOString() : '',
  });

  await env.DB.prepare(
    `update official_sources
     set last_checked_at = ?,
         last_http_status = ?,
         last_content_hash = ?,
         last_error_message = ?,
         updated_at = ?
     where id = ?`,
  )
    .bind(fetchedAt, httpStatus, contentHash, errorMessage, fetchedAt, source.id)
    .run();

  await upsertSourceScheduleAfterCheck(env, nextSchedule);

  return {
    programId: source.program_id,
    name: source.program_name,
    url: source.url,
    changed,
    result: analysis.result,
    sourceState: analysis.sourceState,
    sourceAction: analysis.sourceAction,
    reviewDecision: analysis.reviewDecision,
    detectedSignal: analysis.detectedSignal || '',
    newAlertCandidate,
    status: detectedStatus,
    autoAlerted: hasSuccessfulDelivery(autoSendResult),
    schedulePhase: nextSchedule.currentPhase,
    nextCheckAt: nextSchedule.nextCheckAt,
    nextDiscoveryAt: nextSchedule.nextDiscoveryAt,
    error: errorMessage || null,
  };
}

function getRunProgramIds(body) {
  return uniqueStrings([
    ...normalizeProgramIdInput(body.programId),
    ...normalizeProgramIdInput(body.programIds),
    ...normalizeProgramIdInput(body.opportunityId),
    ...normalizeProgramIdInput(body.opportunityIds),
  ]);
}

function normalizeProgramIdInput(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeProgramIdInput(item));
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim());
  }

  return value ? [value] : [];
}

async function getProgramAlertState(env, programId) {
  return env.DB.prepare(
    `select *
     from program_alert_states
     where program_id = ?
     limit 1`,
  )
    .bind(programId)
    .first();
}

function calculateSourceScheduleAfterCheck({ source, detectedStatus, analysis, checkedAt, errorMessage }) {
  const profile = normalizeSourceScheduleProfile(source);
  const checkedDate = new Date(checkedAt);
  const currentPhase = determineSchedulePhase(profile, detectedStatus, checkedDate);
  const intervalHours = getNextCheckIntervalHours(profile, {
    phase: currentPhase,
    detectedStatus,
    confidence: analysis.suggestedConfidence,
    hasError: Boolean(errorMessage),
    activeWatchCount: numberOrZero(source.active_watch_count),
  });
  const nextCheckAt = addHours(checkedDate, intervalHours).toISOString();
  const nextDiscoveryAt = getNextDiscoveryAt(profile, currentPhase, checkedDate);
  const scheduleNote = buildScheduleNote(profile, {
    phase: currentPhase,
    detectedStatus,
    intervalHours,
    activeWatchCount: numberOrZero(source.active_watch_count),
  });

  return {
    source,
    profile,
    checkedAt,
    currentPhase,
    nextCheckAt,
    nextDiscoveryAt,
    scheduleNote,
  };
}

async function upsertSourceScheduleAfterCheck(env, schedule) {
  const { source, profile, checkedAt, currentPhase, nextCheckAt, nextDiscoveryAt, scheduleNote } = schedule;

  await env.DB.prepare(
    `insert into source_schedule_profiles (
      official_source_id,
      program_id,
      cycle_frequency,
      expected_open_months_json,
      last_known_open_at,
      active_lead_days,
      active_check_interval_hours,
      warmup_check_interval_hours,
      dormant_check_interval_days,
      discovery_check_interval_hours,
      source_volatility,
      discovery_queries_json,
      current_phase,
      next_check_at,
      next_discovery_at,
      schedule_note,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(official_source_id) do update set
      program_id = excluded.program_id,
      cycle_frequency = excluded.cycle_frequency,
      expected_open_months_json = excluded.expected_open_months_json,
      last_known_open_at = excluded.last_known_open_at,
      active_lead_days = excluded.active_lead_days,
      active_check_interval_hours = excluded.active_check_interval_hours,
      warmup_check_interval_hours = excluded.warmup_check_interval_hours,
      dormant_check_interval_days = excluded.dormant_check_interval_days,
      discovery_check_interval_hours = excluded.discovery_check_interval_hours,
      source_volatility = excluded.source_volatility,
      discovery_queries_json = excluded.discovery_queries_json,
      current_phase = excluded.current_phase,
      next_check_at = excluded.next_check_at,
      next_discovery_at = excluded.next_discovery_at,
      schedule_note = excluded.schedule_note,
      updated_at = excluded.updated_at`,
  )
    .bind(
      source.id,
      source.program_id,
      profile.cycleFrequency,
      JSON.stringify(profile.expectedOpenMonths),
      profile.lastKnownOpenAt,
      profile.activeLeadDays,
      profile.activeCheckIntervalHours,
      profile.warmupCheckIntervalHours,
      profile.dormantCheckIntervalDays,
      profile.discoveryCheckIntervalHours,
      profile.sourceVolatility,
      JSON.stringify(profile.discoveryQueries),
      currentPhase,
      nextCheckAt,
      nextDiscoveryAt,
      scheduleNote,
      checkedAt,
      checkedAt,
    )
    .run();

  return {
    currentPhase,
    nextCheckAt,
    nextDiscoveryAt,
  };
}

async function getDiscoveryQueue(env, url) {
  const programIds = uniqueStrings([
    ...url.searchParams.getAll('programId').flatMap((value) => normalizeProgramIdInput(value)),
    ...url.searchParams.getAll('programIds').flatMap((value) => normalizeProgramIdInput(value)),
  ]);
  const defaultLimit = programIds.length || 25;
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || defaultLimit, 100));
  const force = url.searchParams.get('force') === 'true';
  const now = new Date().toISOString();
  const conditions = [
    'official_sources.enabled = 1',
    "source_schedule_profiles.source_volatility = 'moving_cycle_page'",
    "source_schedule_profiles.current_phase in ('warmup', 'active', 'unknown')",
  ];
  const bindings = [];

  if (programIds.length) {
    conditions.push(`official_sources.program_id in (${programIds.map(() => '?').join(', ')})`);
    bindings.push(...programIds);
  }

  if (!force) {
    conditions.push(`(
        source_schedule_profiles.next_discovery_at is null
        or source_schedule_profiles.next_discovery_at = ''
        or source_schedule_profiles.next_discovery_at <= ?
      )`);
    bindings.push(now);
  }

  bindings.push(limit);

  const rows = await env.DB.prepare(
    `select
      official_sources.program_id as programId,
      official_sources.program_name as programName,
      official_sources.organization,
      official_sources.url,
      official_sources.previous_url as previousUrl,
      source_schedule_profiles.cycle_frequency as cycleFrequency,
      source_schedule_profiles.expected_open_months_json as expectedOpenMonthsJson,
      source_schedule_profiles.source_volatility as sourceVolatility,
      source_schedule_profiles.current_phase as currentPhase,
      source_schedule_profiles.next_discovery_at as nextDiscoveryAt,
      source_schedule_profiles.discovery_queries_json as discoveryQueriesJson,
      source_schedule_profiles.schedule_note as scheduleNote,
      coalesce(candidates.pending_candidate_count, 0) as pendingCandidateCount,
      coalesce(watched.active_watch_count, 0) as activeWatchCount
    from source_schedule_profiles
    inner join official_sources
      on official_sources.id = source_schedule_profiles.official_source_id
    left join (
      select
        watch_request_programs.program_id,
        count(distinct watch_requests.id) as active_watch_count
      from watch_request_programs
      inner join watch_requests
        on watch_requests.id = watch_request_programs.watch_request_id
      where watch_requests.status = 'active'
        and (
          watch_requests.workspace_id is null
          or not exists (
            select 1 from beta_program_watches preference
            where preference.workspace_id = watch_requests.workspace_id
              and preference.program_id = watch_request_programs.program_id
          )
          or exists (
            select 1 from beta_program_watches preference
            where preference.workspace_id = watch_requests.workspace_id
              and preference.program_id = watch_request_programs.program_id
              and preference.is_watching = 1
          )
        )
      group by watch_request_programs.program_id
    ) watched
      on watched.program_id = official_sources.program_id
    left join (
      select
        program_id,
        count(*) as pending_candidate_count
      from discovery_candidates
      where status = 'pending_review'
      group by program_id
    ) candidates
      on candidates.program_id = official_sources.program_id
    where ${conditions.join('\n      and ')}
    order by
      coalesce(watched.active_watch_count, 0) desc,
      source_schedule_profiles.next_discovery_at asc,
      official_sources.program_name asc
    limit ?`,
  )
    .bind(...bindings)
    .all();

  return {
    ok: true,
    generatedAt: now,
    force,
    discoveryItems: (rows.results || []).map(formatDiscoveryQueueItem),
  };
}

function formatDiscoveryQueueItem(row) {
  const expectedOpenMonths = parseJsonArray(row.expectedOpenMonthsJson);
  const activeWatchCount = numberOrZero(row.activeWatchCount);
  const pendingCandidateCount = numberOrZero(row.pendingCandidateCount);
  const priorityScore =
    activeWatchCount * 30 +
    (row.currentPhase === 'active' ? 28 : row.currentPhase === 'warmup' ? 18 : 10) +
    (row.sourceVolatility === 'moving_cycle_page' ? 12 : 0) -
    Math.min(pendingCandidateCount * 8, 24);

  return {
    programId: row.programId,
    programName: row.programName,
    organization: row.organization,
    url: row.url,
    previousUrl: row.previousUrl,
    cycleFrequency: row.cycleFrequency,
    expectedOpenMonths,
    sourceVolatility: row.sourceVolatility,
    currentPhase: row.currentPhase,
    nextDiscoveryAt: row.nextDiscoveryAt,
    activeWatchCount,
    pendingCandidateCount,
    priorityScore,
    priorityLabel: priorityScore >= 50 ? 'Review First' : priorityScore >= 28 ? 'Review Soon' : 'Backlog',
    reason: buildDiscoveryReason(row, expectedOpenMonths, activeWatchCount, pendingCandidateCount),
    discoveryQueries: normalizeDiscoveryQueries(parseJsonArray(row.discoveryQueriesJson)),
    scheduleNote: row.scheduleNote,
  };
}

function buildDiscoveryReason(row, expectedOpenMonths, activeWatchCount, pendingCandidateCount) {
  const pieces = [];

  if (activeWatchCount > 0) {
    pieces.push(`${activeWatchCount} active watcher${activeWatchCount === 1 ? '' : 's'}`);
  }

  pieces.push(`${row.currentPhase || 'unknown'} phase`);

  if (expectedOpenMonths.length) {
    pieces.push(`expected month(s): ${expectedOpenMonths.join(', ')}`);
  }

  if (row.sourceVolatility === 'moving_cycle_page') {
    pieces.push('URL may change by cycle');
  }

  if (pendingCandidateCount > 0) {
    pieces.push(`${pendingCandidateCount} candidate URL${pendingCandidateCount === 1 ? '' : 's'} already pending`);
  }

  return pieces.join('; ');
}

function normalizeDiscoveryQueries(items) {
  return items
    .map((item) => {
      if (typeof item === 'string') {
        return {
          intent: 'search',
          query: cleanString(item, 300),
          why: 'Search for a current-cycle official page.',
        };
      }

      return {
        intent: cleanString(item.intent || 'search', 80),
        query: cleanString(item.query, 300),
        why: cleanString(item.why || 'Search for a current-cycle official page.', 220),
      };
    })
    .filter((item) => item.query);
}

async function runDiscoverySearch(env, body = {}) {
  const provider = normalizeDiscoverySearchProvider(body.provider || env.DISCOVERY_SEARCH_PROVIDER || 'brave');
  const apiKey = getDiscoverySearchApiKey(env, provider);
  const limit = boundedNumber(body.limit || env.DISCOVERY_SEARCH_LIMIT, DEFAULT_DISCOVERY_SEARCH_LIMIT, 1, 20);
  const maxQueriesPerProgram = boundedNumber(
    body.maxQueriesPerProgram || env.DISCOVERY_SEARCH_QUERIES_PER_PROGRAM,
    DEFAULT_DISCOVERY_QUERIES_PER_PROGRAM,
    1,
    8,
  );
  const maxResultsPerQuery = boundedNumber(
    body.maxResultsPerQuery || env.DISCOVERY_SEARCH_RESULTS_PER_QUERY,
    DEFAULT_DISCOVERY_RESULTS_PER_QUERY,
    1,
    10,
  );
  const country = cleanString(body.country || env.DISCOVERY_SEARCH_COUNTRY || 'US', 40);
  const force = Boolean(body.force);
  const dryRun = Boolean(body.dryRun);
  const trigger = cleanString(body.trigger || 'manual', 40);
  const programIds = getRunProgramIds(body);
  const generatedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  const queueUrl = new URL('https://applyfirst.local/watch/discovery');
  queueUrl.searchParams.set('limit', String(limit));
  if (force) {
    queueUrl.searchParams.set('force', 'true');
  }
  for (const programId of programIds) {
    queueUrl.searchParams.append('programId', programId);
  }

  const queue = await getDiscoveryQueue(env, queueUrl);
  const discoveryItems = queue.discoveryItems || [];

  if (!apiKey) {
    const response = {
      ok: false,
      runId,
      status: 'not_configured',
      provider,
      generatedAt,
      setup: buildDiscoverySearchSetup(provider),
      discoveryItems,
    };
    await recordDiscoverySearchRun(env, {
      id: runId,
      provider,
      trigger,
      status: 'not_configured',
      searchedPrograms: discoveryItems.length,
      summary: response,
    });
    return response;
  }

  let searchedQueries = 0;
  let foundResults = 0;
  let savedCandidates = 0;
  let updatedCandidates = 0;
  let errorCount = 0;
  const results = [];

  for (const item of discoveryItems) {
    const seenCandidateUrls = new Set();
    const programSummary = {
      programId: item.programId,
      programName: item.programName,
      currentOfficialUrl: item.url,
      queries: [],
      candidates: [],
    };

    for (const queryInfo of item.discoveryQueries.slice(0, maxQueriesPerProgram)) {
      searchedQueries += 1;

      try {
        const providerResults = await searchDiscoveryProvider(env, provider, apiKey, queryInfo.query, {
          country,
          maxResults: maxResultsPerQuery,
        });
        const evaluationSeenCandidateUrls = new Set(seenCandidateUrls);
        const evaluatedResults = providerResults.map((result) => {
          const evaluation = evaluateDiscoverySearchResult(item, result, evaluationSeenCandidateUrls);

          if (evaluation.keep && evaluation.candidateKey) {
            evaluationSeenCandidateUrls.add(evaluation.candidateKey);
          }

          return evaluation;
        });
        const keptResults = evaluatedResults.filter((evaluation) => evaluation.keep);
        foundResults += providerResults.length;

        for (const evaluation of keptResults.slice(0, maxResultsPerQuery)) {
          const result = evaluation.result;
          const candidateKey = comparableUrl(result.url);

          if (!candidateKey || seenCandidateUrls.has(candidateKey)) {
            continue;
          }

          seenCandidateUrls.add(candidateKey);

          const score = scoreDiscoverySearchResult(item, result, evaluation);
          const candidateInput = {
            programId: item.programId,
            candidateUrl: result.url,
            title: result.title,
            source: `${provider} search`,
            discoveryQuery: queryInfo.query,
            snippet: result.snippet,
            confidence: score.confidence,
            reason: score.reason,
          };

          if (dryRun) {
            programSummary.candidates.push({
              url: candidateInput.candidateUrl,
              title: candidateInput.title,
              confidence: candidateInput.confidence,
              reason: candidateInput.reason,
              matchType: score.matchType,
              signals: score.signals,
            });
            continue;
          }

          const saved = await upsertDiscoveryCandidate(env, candidateInput);
          if (saved.wasExisting) {
            updatedCandidates += 1;
          } else {
            savedCandidates += 1;
          }

          programSummary.candidates.push({
            id: saved.id,
            url: saved.candidate_url,
            title: saved.title,
            confidence: saved.confidence,
            status: saved.status,
            action: saved.wasExisting ? 'updated_existing' : 'created',
            reason: saved.reason,
            matchType: score.matchType,
            signals: score.signals,
          });
        }

        programSummary.queries.push({
          intent: queryInfo.intent,
          query: queryInfo.query,
          found: providerResults.length,
          kept: keptResults.length,
          ignored: evaluatedResults.filter((evaluation) => !evaluation.keep).length,
          ignoredSamples: summarizeDiscoveryIgnoredResults(evaluatedResults),
        });
      } catch (error) {
        errorCount += 1;
        programSummary.queries.push({
          intent: queryInfo.intent,
          query: queryInfo.query,
          error: cleanString(error.message, 240),
        });
      }
    }

    results.push(programSummary);
  }

  const status = errorCount ? (foundResults || savedCandidates ? 'completed_with_errors' : 'failed') : 'completed';
  const response = {
    ok: status !== 'failed',
    runId,
    status,
    provider,
    trigger,
    dryRun,
    force,
    generatedAt,
    searchedPrograms: discoveryItems.length,
    searchedQueries,
    foundResults,
    savedCandidates,
    updatedCandidates,
    errorCount,
    results,
  };

  await recordDiscoverySearchRun(env, {
    id: runId,
    provider,
    trigger,
    status,
    searchedPrograms: discoveryItems.length,
    searchedQueries,
    foundResults,
    savedCandidates,
    updatedCandidates,
    summary: response,
  });

  return response;
}

function normalizeDiscoverySearchProvider(value) {
  const provider = cleanString(value, 40).toLowerCase();

  if (DISCOVERY_SEARCH_PROVIDERS.has(provider)) {
    return provider;
  }

  throw httpError(400, 'Use discovery search provider brave or tavily.');
}

function getDiscoverySearchApiKey(env, provider) {
  if (provider === 'brave') {
    return env.BRAVE_SEARCH_API_KEY || env.DISCOVERY_SEARCH_API_KEY || '';
  }

  if (provider === 'tavily') {
    return env.TAVILY_API_KEY || env.DISCOVERY_SEARCH_API_KEY || '';
  }

  return env.DISCOVERY_SEARCH_API_KEY || '';
}

function buildDiscoverySearchSetup(provider) {
  const secretName = provider === 'tavily' ? 'TAVILY_API_KEY' : 'BRAVE_SEARCH_API_KEY';

  return {
    provider,
    secretName,
    steps: [
      `Set ${secretName} with wrangler secret put ${secretName} --config wrangler.watch.toml.`,
      'Set DISCOVERY_SEARCH_PROVIDER in wrangler.watch.toml if you want a provider other than brave.',
      'Redeploy the watch Worker, then run POST /watch/discovery/search with WATCH_ADMIN_TOKEN.',
    ],
  };
}

async function searchDiscoveryProvider(env, provider, apiKey, query, options) {
  if (provider === 'brave') {
    return searchBraveDiscovery(apiKey, query, options);
  }

  if (provider === 'tavily') {
    return searchTavilyDiscovery(apiKey, query, options);
  }

  throw httpError(400, 'Unsupported discovery search provider.');
}

async function searchBraveDiscovery(apiKey, query, options) {
  const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('count', String(options.maxResults));
  searchUrl.searchParams.set('country', cleanString(options.country || 'US', 8).toUpperCase());
  searchUrl.searchParams.set('search_lang', 'en');
  searchUrl.searchParams.set('safesearch', 'moderate');

  const response = await fetch(searchUrl, {
    headers: {
      accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    throw httpError(502, `Brave Search returned HTTP ${response.status}: ${await readProviderError(response)}`);
  }

  const data = await response.json();

  return (data.web?.results || [])
    .map((result) => ({
      title: cleanString(result.title, 220),
      url: normalizeUrl(result.url),
      snippet: cleanString([result.description, ...(result.extra_snippets || [])].filter(Boolean).join(' '), 900),
      providerScore: '',
    }))
    .filter((result) => result.url);
}

async function searchTavilyDiscovery(apiKey, query, options) {
  const requestBody = {
    query,
    search_depth: 'basic',
    topic: 'general',
    max_results: options.maxResults,
    include_answer: false,
    include_images: false,
    include_raw_content: false,
  };
  const country = normalizeTavilyCountry(options.country);

  if (country) {
    requestBody.country = country;
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw httpError(502, `Tavily Search returned HTTP ${response.status}: ${await readProviderError(response)}`);
  }

  const data = await response.json();

  return (data.results || [])
    .map((result) => ({
      title: cleanString(result.title, 220),
      url: normalizeUrl(result.url),
      snippet: cleanString(result.content, 900),
      providerScore: result.score ?? '',
    }))
    .filter((result) => result.url);
}

function normalizeTavilyCountry(value) {
  const country = cleanString(value, 40).toLowerCase();

  if (!country) {
    return '';
  }

  if (['us', 'usa', 'united states', 'united states of america'].includes(country)) {
    return 'united states';
  }

  if (['uk', 'gb', 'great britain', 'united kingdom'].includes(country)) {
    return 'united kingdom';
  }

  return country;
}

async function readProviderError(response) {
  try {
    return cleanString(await response.text(), 360);
  } catch {
    return 'No provider error body returned.';
  }
}

function isRelevantDiscoverySearchResult(item, result) {
  return evaluateDiscoverySearchResult(item, result).keep;
}

function evaluateDiscoverySearchResult(item, result, seenCandidateUrls = new Set()) {
  const candidateUrl = normalizeUrl(result.url);
  const candidateHost = getUrlHost(candidateUrl);

  if (!candidateUrl) {
    return buildDiscoveryEvaluation(result, {
      filter: 'invalid_url',
      reason: 'Result did not include a valid HTTP or HTTPS URL.',
    });
  }

  const candidateKey = comparableUrl(candidateUrl);

  if (!candidateKey) {
    return buildDiscoveryEvaluation(result, {
      filter: 'invalid_url',
      reason: 'Result URL could not be normalized for review.',
      candidateHost,
    });
  }

  if (seenCandidateUrls.has(candidateKey)) {
    return buildDiscoveryEvaluation(result, {
      filter: 'duplicate_url',
      reason: 'Same candidate URL already appeared in this search run.',
      candidateHost,
      candidateKey,
    });
  }

  if (isSameComparableUrl(candidateUrl, item.url)) {
    return buildDiscoveryEvaluation(result, {
      filter: 'current_source',
      reason: 'Same as the current official source, so there is no new URL to review.',
      candidateHost,
      candidateKey,
    });
  }

  if (LOW_SIGNAL_DISCOVERY_HOSTS.has(candidateHost)) {
    return buildDiscoveryEvaluation(result, {
      filter: 'low_signal_host',
      reason: `${candidateHost} is a broad listing, social, or source-repo host instead of an official program source.`,
      candidateHost,
      candidateKey,
    });
  }

  if (isLikelyRepostUrl(candidateUrl)) {
    return buildDiscoveryEvaluation(result, {
      filter: 'repost_or_news',
      reason: 'Looks like a blog, article, or news repost rather than a stable program source.',
      candidateHost,
      candidateKey,
    });
  }

  const text = buildDiscoverySearchText(result);
  const hostMatch = getDiscoveryHostMatch(item, candidateUrl);
  const hasContext = DISCOVERY_CONTEXT_PATTERN.test(text);

  if (hostMatch === 'known_official_host' || hostMatch === 'known_official_domain') {
    return buildDiscoveryEvaluation(result, {
      keep: true,
      filter: 'kept',
      reason:
        hostMatch === 'known_official_host'
          ? 'Kept because it is on the known official host.'
          : 'Kept because it is on the same official domain family.',
      candidateHost,
      candidateKey,
      hostMatch,
      signals: getDiscoverySignals(text),
      hasContext,
    });
  }

  if (hostMatch !== 'organization_host') {
    return buildDiscoveryEvaluation(result, {
      filter: 'unmatched_host',
      reason: 'Host does not match the known source, prior source, or recognizable organization/program tokens.',
      candidateHost,
      candidateKey,
      hostMatch,
    });
  }

  const tokens = significantDiscoveryTokens(`${item.programName} ${item.organization}`);
  const matchedTokens = tokens.filter((token) => text.includes(token)).length;
  const requiredTokens = Math.min(2, tokens.length || 2);

  if (matchedTokens < requiredTokens) {
    return buildDiscoveryEvaluation(result, {
      filter: 'weak_program_match',
      reason: `Only matched ${matchedTokens}/${requiredTokens} useful program or organization token${requiredTokens === 1 ? '' : 's'}.`,
      candidateHost,
      candidateKey,
      hostMatch,
      matchedTokens,
      requiredTokens,
    });
  }

  if (!hasContext) {
    return buildDiscoveryEvaluation(result, {
      filter: 'missing_timing_context',
      reason: 'Matched the organization, but did not mention application, deadline, program, or student timing context.',
      candidateHost,
      candidateKey,
      hostMatch,
      matchedTokens,
      requiredTokens,
    });
  }

  return buildDiscoveryEvaluation(result, {
    keep: true,
    filter: 'kept',
    reason: 'Kept because the host looks organization-owned and the result mentions program/timing context.',
    candidateHost,
    candidateKey,
    hostMatch,
    matchedTokens,
    requiredTokens,
    signals: getDiscoverySignals(text),
    hasContext,
  });
}

function buildDiscoveryEvaluation(result, options = {}) {
  return {
    keep: Boolean(options.keep),
    result,
    filter: cleanString(options.filter || 'unknown', 80),
    reason: cleanString(options.reason || 'Needs maintainer review.', 260),
    candidateHost: cleanString(options.candidateHost, 200),
    candidateKey: cleanString(options.candidateKey, 700),
    hostMatch: cleanString(options.hostMatch || 'unknown', 80),
    matchedTokens: numberOrZero(options.matchedTokens),
    requiredTokens: numberOrZero(options.requiredTokens),
    signals: Array.isArray(options.signals) ? options.signals : [],
    hasContext: Boolean(options.hasContext),
  };
}

function summarizeDiscoveryIgnoredResults(evaluatedResults) {
  return evaluatedResults
    .filter((evaluation) => !evaluation.keep)
    .slice(0, 4)
    .map((evaluation) => ({
      title: cleanString(evaluation.result?.title, 160),
      url: normalizeUrl(evaluation.result?.url),
      host: evaluation.candidateHost,
      filter: evaluation.filter,
      reason: evaluation.reason,
    }));
}

function scoreDiscoverySearchResult(item, result, evaluation = null) {
  const hostMatch = evaluation?.hostMatch || getDiscoveryHostMatch(item, result.url);
  const text = buildDiscoverySearchText(result);
  const signals = getDiscoverySignals(text);
  const matchType = formatDiscoveryHostMatch(hostMatch);

  if (hostMatch === 'known_official_host') {
    return {
      confidence: DISCOVERY_CONTEXT_PATTERN.test(text) ? 'high' : 'medium',
      reason: 'Search result is on the known official host and may point to a more specific current-cycle page.',
      matchType,
      signals,
    };
  }

  if (hostMatch === 'known_official_domain') {
    return {
      confidence: DISCOVERY_CONTEXT_PATTERN.test(text) ? 'high' : 'medium',
      reason: 'Search result is on the same official domain family as the known source.',
      matchType,
      signals,
    };
  }

  if (hostMatch === 'organization_host' && DISCOVERY_CONTEXT_PATTERN.test(text)) {
    return {
      confidence: 'medium',
      reason: 'Search result is on a likely organization-owned host, but needs maintainer confirmation.',
      matchType,
      signals,
    };
  }

  return {
    confidence: 'needs_review',
    reason: 'Search result may be relevant, but needs maintainer confirmation.',
    matchType,
    signals,
  };
}

function buildDiscoverySearchText(result) {
  return `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`.toLowerCase();
}

function getDiscoverySignals(text) {
  const normalized = cleanString(text, 1200).toLowerCase();
  const signals = [];

  if (/\b(apply|application|applications|submit your application)\b/i.test(normalized)) {
    signals.push('Application');
  }

  if (/\b(deadline|deadlines|due date)\b/i.test(normalized)) {
    signals.push('Deadline');
  }

  if (/\b(open|opens|opening|now accepting|currently accepting)\b/i.test(normalized)) {
    signals.push('Opening');
  }

  if (/\b(internship|fellowship|scholarship|conference|academy|program|cohort)\b/i.test(normalized)) {
    signals.push('Program Context');
  }

  return uniqueStrings(signals).slice(0, 4);
}

function formatDiscoveryHostMatch(hostMatch) {
  switch (hostMatch) {
    case 'known_official_host':
      return 'Known Official Host';
    case 'known_official_domain':
      return 'Official Domain Family';
    case 'organization_host':
      return 'Likely Organization Host';
    default:
      return 'Unmatched Host';
  }
}

function getDiscoveryHostMatch(item, candidateUrl) {
  const candidateHost = getUrlHost(candidateUrl);
  const currentHost = getUrlHost(item.url);
  const previousHost = getUrlHost(item.previousUrl);

  if (!candidateHost) {
    return 'unknown';
  }

  if (candidateHost === currentHost || candidateHost === previousHost) {
    return 'known_official_host';
  }

  const candidateRoot = getRootDomain(candidateHost);
  const currentRoot = getRootDomain(currentHost);
  const previousRoot = getRootDomain(previousHost);

  if (candidateRoot && (candidateRoot === currentRoot || candidateRoot === previousRoot)) {
    return 'known_official_domain';
  }

  const hostTokens = significantDiscoveryTokens(candidateHost);
  const orgTokens = significantDiscoveryTokens(`${item.organization} ${item.programName}`);

  if (orgTokens.some((token) => hostTokens.includes(token))) {
    return 'organization_host';
  }

  return 'unknown';
}

function comparableUrl(value) {
  const normalized = normalizeUrl(value);

  if (!normalized) {
    return '';
  }

  try {
    const url = new URL(normalized);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().toLowerCase();
  } catch {
    return '';
  }
}

function isSameComparableUrl(first, second) {
  const firstUrl = comparableUrl(first);
  const secondUrl = comparableUrl(second);

  return Boolean(firstUrl && secondUrl && firstUrl === secondUrl);
}

function getRootDomain(host) {
  const normalized = cleanString(host, 200).toLowerCase().replace(/^www\./, '');
  const parts = normalized.split('.').filter(Boolean);

  if (parts.length < 2) {
    return normalized;
  }

  return parts.slice(-2).join('.');
}

function isLikelyRepostUrl(value) {
  const url = cleanString(value, 700).toLowerCase();

  return /\/(blog|blogs|article|articles|news|post|posts)\//.test(url);
}

function significantDiscoveryTokens(value) {
  const stopWords = new Set([
    'and',
    'the',
    'for',
    'with',
    'program',
    'programs',
    'internship',
    'internships',
    'fellowship',
    'scholarship',
    'summer',
    'student',
    'students',
    'first',
    'year',
  ]);

  return uniqueStrings(
    cleanString(value, 300)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  ).slice(0, 8);
}

async function recordDiscoverySearchRun(env, run) {
  try {
    await env.DB.prepare(
      `insert into discovery_search_runs (
        id,
        provider,
        trigger,
        status,
        searched_programs,
        searched_queries,
        found_results,
        saved_candidates,
        error_message,
        raw_summary_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        run.id || crypto.randomUUID(),
        cleanString(run.provider || 'unknown', 40),
        cleanString(run.trigger || 'manual', 40),
        cleanString(run.status || 'unknown', 60),
        numberOrZero(run.searchedPrograms),
        numberOrZero(run.searchedQueries),
        numberOrZero(run.foundResults),
        numberOrZero(run.savedCandidates),
        cleanString(run.errorMessage, 400),
        cleanString(JSON.stringify(run.summary || {}), 5000),
      )
      .run();
  } catch (error) {
    console.log(
      JSON.stringify({
        event: 'discovery_search_run_log_failed',
        error: cleanString(error.message, 300),
      }),
    );
  }
}

async function getNewProgramCandidates(env, url) {
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 100, 200));
  const status = cleanString(url.searchParams.get('status') || 'all', 40).toLowerCase();

  if (status !== 'all' && !NEW_PROGRAM_CANDIDATE_STATUSES.has(status)) {
    throw httpError(400, 'Unknown new-program candidate status.');
  }

  const whereClause = status === 'all' ? '' : 'where status = ?';
  const bindings = status === 'all' ? [limit] : [status, limit];
  const rows = await env.DB.prepare(
    `${newProgramCandidateSelectFields()}
     from new_program_candidates
     ${whereClause}
     order by
       case status
         when 'candidate' then 0
         when 'verified' then 1
         when 'added' then 2
         when 'monitored' then 3
         else 4
       end,
       updated_at desc
     limit ?`,
  )
    .bind(...bindings)
    .all();

  const countRows = await env.DB.prepare(
    `select status, count(*) as total
     from new_program_candidates
     group by status`,
  ).all();
  const eventRows = await env.DB.prepare(
    `select
       id,
       candidate_id as candidateId,
       from_status as fromStatus,
       to_status as toStatus,
       note,
       actor,
       created_at as createdAt
     from new_program_candidate_events
     order by created_at desc
     limit 100`,
  ).all();
  const counts = Object.fromEntries([...NEW_PROGRAM_CANDIDATE_STATUSES].map((value) => [value, 0]));

  (countRows.results || []).forEach((row) => {
    if (NEW_PROGRAM_CANDIDATE_STATUSES.has(row.status)) {
      counts[row.status] = Number(row.total) || 0;
    }
  });

  return {
    ok: true,
    candidates: (rows.results || []).map(serializeNewProgramCandidate),
    counts,
    activeCount: counts.candidate + counts.verified + counts.added,
    events: eventRows.results || [],
  };
}

async function saveNewProgramCandidate(env, body = {}) {
  const input = await normalizeNewProgramCandidateInput(body);
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    `select id, status
     from new_program_candidates
     where dedupe_key = ?
     limit 1`,
  )
    .bind(input.dedupeKey)
    .first();

  let candidateId = existing?.id || crypto.randomUUID();
  let created = false;

  if (existing) {
    await env.DB.prepare(
      `update new_program_candidates
       set official_url = ?,
           opportunity_type = coalesce(nullif(?, ''), opportunity_type),
           roles_json = coalesce(nullif(?, ''), roles_json),
           class_years_json = coalesce(nullif(?, ''), class_years_json),
           location = coalesce(nullif(?, ''), location),
           format = coalesce(nullif(?, ''), format),
           duration = coalesce(nullif(?, ''), duration),
           application_status = coalesce(nullif(?, ''), application_status),
           deadline = coalesce(nullif(?, ''), deadline),
           evidence_date = coalesce(nullif(?, ''), evidence_date),
           evidence_note = ?,
           fit_reason = ?,
           duplicate_type = ?,
           duplicate_program_id = coalesce(nullif(?, ''), duplicate_program_id),
           confidence = ?,
           source = ?,
           last_seen_at = ?,
           updated_at = ?
       where id = ?`,
    )
      .bind(
        input.officialUrl,
        input.opportunityType,
        input.rolesJson,
        input.classYearsJson,
        input.location,
        input.format,
        input.duration,
        input.applicationStatus,
        input.deadline,
        input.evidenceDate,
        input.evidenceNote,
        input.fitReason,
        input.duplicateType,
        input.duplicateProgramId,
        input.confidence,
        input.source,
        now,
        now,
        candidateId,
      )
      .run();
  } else {
    const insertResult = await env.DB.prepare(
      `insert into new_program_candidates (
        id, dedupe_key, program_name, organization, official_url, opportunity_type,
        roles_json, class_years_json, location, format, duration, application_status,
        deadline, evidence_date, evidence_note, fit_reason, duplicate_type,
        duplicate_program_id, confidence, source, status, first_seen_at, last_seen_at,
        created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?)
      on conflict(dedupe_key) do nothing`,
    )
      .bind(
        candidateId,
        input.dedupeKey,
        input.programName,
        input.organization,
        input.officialUrl,
        input.opportunityType,
        input.rolesJson || '[]',
        input.classYearsJson || '[]',
        input.location,
        input.format,
        input.duration,
        input.applicationStatus,
        input.deadline,
        input.evidenceDate,
        input.evidenceNote,
        input.fitReason,
        input.duplicateType,
        input.duplicateProgramId,
        input.confidence,
        input.source,
        now,
        now,
        now,
        now,
      )
      .run();

    created = Boolean(insertResult.meta?.changes);

    if (!created) {
      const concurrentCandidate = await env.DB.prepare(
        `select id
         from new_program_candidates
         where dedupe_key = ?
         limit 1`,
      )
        .bind(input.dedupeKey)
        .first();
      candidateId = concurrentCandidate?.id || candidateId;
    }
  }

  await env.DB.prepare(
    `insert into new_program_candidate_events (
      id, candidate_id, from_status, to_status, note, actor, created_at
    )
    select ?, ?, null, 'candidate', ?, ?, ?
    where not exists (
      select 1
      from new_program_candidate_events
      where candidate_id = ?
        and from_status is null
        and to_status = 'candidate'
    )`,
  )
    .bind(
      crypto.randomUUID(),
      candidateId,
      'Research candidate added for maintainer review.',
      cleanString(body.createdBy || body.actor || 'maintainer', 120),
      now,
      candidateId,
    )
    .run();

  return {
    ok: true,
    created,
    deduplicated: !created,
    candidate: await getNewProgramCandidateById(env, candidateId),
  };
}

async function reviewNewProgramCandidate(env, candidateId, body = {}) {
  const requestedStatus = cleanString(body.status || body.decision, 40).toLowerCase();

  if (!NEW_PROGRAM_CANDIDATE_STATUSES.has(requestedStatus)) {
    throw httpError(400, 'Use status candidate, verified, added, monitored, or rejected.');
  }

  const candidate = await env.DB.prepare(
    `select *
     from new_program_candidates
     where id = ?
     limit 1`,
  )
    .bind(candidateId)
    .first();

  if (!candidate) {
    throw httpError(404, 'New-program candidate not found.');
  }

  if (candidate.status === requestedStatus) {
    return {
      ok: true,
      changed: false,
      candidate: await getNewProgramCandidateById(env, candidateId),
    };
  }

  if (!NEW_PROGRAM_TRANSITIONS[candidate.status]?.has(requestedStatus)) {
    throw httpError(409, `Cannot move a new-program candidate from ${candidate.status} to ${requestedStatus}.`);
  }

  const reviewNote = cleanString(body.reviewNote || body.note, 700);
  const reviewedBy = cleanString(body.reviewedBy || body.actor || 'maintainer', 120);
  const programId = cleanString(body.programId || candidate.program_id, 120).toLowerCase();
  const reviewedConfidence = normalizeDiscoveryConfidence(body.confidence || candidate.confidence);

  if (!reviewNote) {
    throw httpError(400, 'A review note is required for each stage change.');
  }

  if (requestedStatus === 'verified' && !['high', 'medium'].includes(reviewedConfidence)) {
    throw httpError(409, 'Set confidence to high or medium before verifying this candidate.');
  }

  if (['added', 'monitored'].includes(requestedStatus) && !isValidProgramId(programId)) {
    throw httpError(400, 'A lowercase library program ID is required before marking this candidate added.');
  }

  if (requestedStatus === 'monitored') {
    const officialSource = await env.DB.prepare(
      `select id
       from official_sources
       where program_id = ?
         and enabled = 1
       limit 1`,
    )
      .bind(programId)
      .first();

    if (!officialSource) {
      throw httpError(409, 'Add and enable this program in official_sources before marking it monitored.');
    }
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `update new_program_candidates
       set status = ?,
           program_id = case when ? != '' then ? else program_id end,
           confidence = ?,
           review_note = ?,
           reviewed_by = ?,
           verified_at = coalesce(?, verified_at),
           added_at = coalesce(?, added_at),
           monitored_at = coalesce(?, monitored_at),
           rejected_at = coalesce(?, rejected_at),
           updated_at = ?
       where id = ?`,
    ).bind(
      requestedStatus,
      programId,
      programId,
      reviewedConfidence,
      reviewNote,
      reviewedBy,
      requestedStatus === 'verified' ? now : null,
      requestedStatus === 'added' ? now : null,
      requestedStatus === 'monitored' ? now : null,
      requestedStatus === 'rejected' ? now : null,
      now,
      candidateId,
    ),
    env.DB.prepare(
      `insert into new_program_candidate_events (
        id, candidate_id, from_status, to_status, note, actor, created_at
      ) values (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      candidateId,
      candidate.status,
      requestedStatus,
      reviewNote,
      reviewedBy,
      now,
    ),
  ]);

  return {
    ok: true,
    changed: true,
    candidate: await getNewProgramCandidateById(env, candidateId),
  };
}

async function normalizeNewProgramCandidateInput(body) {
  const programName = cleanString(body.programName || body.name, 220);
  const organization = cleanString(body.organization || body.host, 180);
  const officialUrl = normalizeUrl(body.officialUrl || body.url);
  const opportunityType = cleanString(body.opportunityType || body.type, 80);
  const confidence = normalizeDiscoveryConfidence(body.confidence);
  const source = cleanString(body.source || 'maintainer_research', 60).toLowerCase();
  const duplicateType = cleanString(body.duplicateType || 'new_program', 60).toLowerCase();
  const evidenceNote = cleanString(body.evidenceNote || body.evidence, 1200);
  const fitReason = cleanString(body.fitReason || body.reason, 900);

  if (!programName || !organization) {
    throw httpError(400, 'Program name and organization are required.');
  }

  if (!officialUrl) {
    throw httpError(400, 'A valid official program URL is required.');
  }

  if (!evidenceNote || !fitReason) {
    throw httpError(400, 'Evidence and an ApplyFirst fit reason are required.');
  }

  if (opportunityType && !NEW_PROGRAM_OPPORTUNITY_TYPES.has(opportunityType)) {
    throw httpError(400, 'Use an ApplyFirst public opportunity type.');
  }

  if (!NEW_PROGRAM_CANDIDATE_SOURCES.has(source)) {
    throw httpError(400, 'Unknown new-program candidate source.');
  }

  if (!NEW_PROGRAM_DUPLICATE_TYPES.has(duplicateType)) {
    throw httpError(400, 'Unknown duplicate classification.');
  }

  const identity = `${normalizeCandidateIdentity(organization)}|${normalizeCandidateIdentity(programName)}`;
  const roles = normalizeCandidateStringList(body.roles || body.roleAreas);
  const classYears = normalizeCandidateStringList(body.classYears || body.eligibility);

  return {
    dedupeKey: await sha256Hex(`applyfirst-new-program:${identity}`),
    programName,
    organization,
    officialUrl,
    opportunityType,
    rolesJson: roles.length ? JSON.stringify(roles) : '',
    classYearsJson: classYears.length ? JSON.stringify(classYears) : '',
    location: cleanString(body.location, 180),
    format: cleanString(body.format, 120),
    duration: cleanString(body.duration, 120),
    applicationStatus: cleanString(body.applicationStatus, 120),
    deadline: cleanString(body.deadline, 120),
    evidenceDate: cleanString(body.evidenceDate, 40),
    evidenceNote,
    fitReason,
    duplicateType,
    duplicateProgramId: cleanString(body.duplicateProgramId, 120).toLowerCase(),
    confidence,
    source,
  };
}

function normalizeCandidateIdentity(value) {
  return cleanString(value, 300)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeCandidateStringList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return uniqueStrings(values);
}

function isValidProgramId(value) {
  return /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/.test(value);
}

function newProgramCandidateSelectFields() {
  return `select
    id,
    program_name as programName,
    organization,
    official_url as officialUrl,
    opportunity_type as opportunityType,
    roles_json as rolesJson,
    class_years_json as classYearsJson,
    location,
    format,
    duration,
    application_status as applicationStatus,
    deadline,
    evidence_date as evidenceDate,
    evidence_note as evidenceNote,
    fit_reason as fitReason,
    duplicate_type as duplicateType,
    duplicate_program_id as duplicateProgramId,
    confidence,
    source,
    status,
    program_id as programId,
    review_note as reviewNote,
    reviewed_by as reviewedBy,
    verified_at as verifiedAt,
    added_at as addedAt,
    monitored_at as monitoredAt,
    rejected_at as rejectedAt,
    first_seen_at as firstSeenAt,
    last_seen_at as lastSeenAt,
    created_at as createdAt,
    updated_at as updatedAt`;
}

async function getNewProgramCandidateById(env, candidateId) {
  const row = await env.DB.prepare(
    `${newProgramCandidateSelectFields()}
     from new_program_candidates
     where id = ?
     limit 1`,
  )
    .bind(candidateId)
    .first();

  if (!row) {
    throw httpError(404, 'New-program candidate not found.');
  }

  return serializeNewProgramCandidate(row);
}

function serializeNewProgramCandidate(row) {
  return {
    ...row,
    roles: parseJsonArray(row.rolesJson),
    classYears: parseJsonArray(row.classYearsJson),
  };
}

async function getDiscoveryCandidates(env, url) {
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 50, 100));
  const status = cleanString(url.searchParams.get('status') || 'pending_review', 80);
  const programId = cleanString(url.searchParams.get('programId'), 120);
  const conditions = [];
  const bindings = [];

  if (status !== 'all') {
    conditions.push('discovery_candidates.status = ?');
    bindings.push(status);
  }

  if (programId) {
    conditions.push('discovery_candidates.program_id = ?');
    bindings.push(programId);
  }

  bindings.push(limit);

  const rows = await env.DB.prepare(
    `select
      discovery_candidates.*,
      official_sources.program_name as programName,
      official_sources.organization,
      official_sources.url as currentOfficialUrl
    from discovery_candidates
    left join official_sources
      on official_sources.id = discovery_candidates.official_source_id
    ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
    order by
      case discovery_candidates.confidence
        when 'high' then 0
        when 'medium' then 1
        else 2
      end,
      discovery_candidates.created_at desc
    limit ?`,
  )
    .bind(...bindings)
    .all();

  return {
    ok: true,
    candidates: rows.results || [],
  };
}

async function saveDiscoveryCandidate(request, env) {
  const body = await readJson(request);
  const candidate = await upsertDiscoveryCandidate(env, {
    programId: body.programId,
    candidateUrl: body.url || body.candidateUrl,
    title: body.title,
    source: body.source || 'manual',
    discoveryQuery: body.query || body.discoveryQuery,
    snippet: body.snippet,
    confidence: body.confidence,
    reason: body.reason,
  });

  return {
    ok: true,
    candidate,
  };
}

async function upsertDiscoveryCandidate(env, input = {}) {
  const programId = cleanString(input.programId, 120);
  const candidateUrl = normalizeUrl(input.candidateUrl || input.url);

  if (!programId) {
    throw httpError(400, 'programId is required.');
  }

  if (!candidateUrl) {
    throw httpError(400, 'A valid candidate URL is required.');
  }

  const source = await env.DB.prepare(
    `select id, url
     from official_sources
     where program_id = ?
     order by updated_at desc
     limit 1`,
  )
    .bind(programId)
    .first();

  if (!source) {
    throw httpError(404, 'No official source exists for this program.');
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const confidence = normalizeDiscoveryConfidence(
    input.confidence || scoreDiscoveryCandidate(candidateUrl, source.url),
  );
  const existingCandidate = await env.DB.prepare(
    `select id, status
     from discovery_candidates
     where program_id = ?
       and candidate_url = ?
     limit 1`,
  )
    .bind(programId, candidateUrl)
    .first();

  await env.DB.prepare(
    `insert into discovery_candidates (
      id,
      program_id,
      official_source_id,
      candidate_url,
      title,
      source,
      discovery_query,
      snippet,
      confidence,
      status,
      reason,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(program_id, candidate_url) do update set
      title = coalesce(nullif(excluded.title, ''), discovery_candidates.title),
      source = coalesce(nullif(excluded.source, ''), discovery_candidates.source),
      discovery_query = coalesce(nullif(excluded.discovery_query, ''), discovery_candidates.discovery_query),
      snippet = coalesce(nullif(excluded.snippet, ''), discovery_candidates.snippet),
      confidence = excluded.confidence,
      reason = coalesce(nullif(excluded.reason, ''), discovery_candidates.reason),
      updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      programId,
      source.id,
      candidateUrl,
      cleanString(input.title, 220),
      cleanString(input.source || 'manual', 120),
      cleanString(input.discoveryQuery || input.query, 400),
      cleanString(input.snippet, 800),
      confidence,
      'pending_review',
      cleanString(input.reason || buildDiscoveryCandidateReason(candidateUrl, source.url), 260),
      now,
      now,
    )
    .run();

  const saved = await env.DB.prepare(
    `select *
     from discovery_candidates
     where program_id = ?
       and candidate_url = ?
     limit 1`,
  )
    .bind(programId, candidateUrl)
    .first();

  return {
    ...saved,
    wasExisting: Boolean(existingCandidate),
  };
}

async function reviewDiscoveryCandidate(env, candidateId, body) {
  const status = cleanString(body.status || body.decision, 80);
  const allowedStatuses = new Set(['accepted', 'rejected', 'needs_review', 'pending_review']);

  if (!allowedStatuses.has(status)) {
    throw httpError(400, 'Use status accepted, rejected, needs_review, or pending_review.');
  }

  const candidate = await env.DB.prepare(
    `select *
     from discovery_candidates
     where id = ?
     limit 1`,
  )
    .bind(candidateId)
    .first();

  if (!candidate) {
    throw httpError(404, 'Discovery candidate not found.');
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `update discovery_candidates
     set status = ?,
         review_note = ?,
         reviewed_by = ?,
         reviewed_at = ?,
         updated_at = ?
     where id = ?`,
  )
    .bind(
      status,
      cleanString(body.reviewNote || body.note, 500),
      cleanString(body.reviewedBy || 'maintainer', 120),
      now,
      now,
      candidateId,
    )
    .run();

  let officialSourceUpdated = false;

  if (status === 'accepted' && body.applyToOfficialSource !== false) {
    await env.DB.prepare(
      `update official_sources
       set previous_url = url,
           url = ?,
           last_checked_at = null,
           last_content_hash = null,
           last_error_message = null,
           updated_at = ?
       where id = ?`,
    )
      .bind(candidate.candidate_url, now, candidate.official_source_id)
      .run();

    await env.DB.prepare(
      `update source_schedule_profiles
       set current_phase = 'active',
           next_check_at = ?,
           next_discovery_at = null,
           schedule_note = ?,
           updated_at = ?
       where official_source_id = ?`,
    )
      .bind(now, 'Accepted discovery candidate; source queued for immediate verification.', now, candidate.official_source_id)
      .run();

    officialSourceUpdated = true;
  }

  return {
    ok: true,
    candidateId,
    status,
    officialSourceUpdated,
  };
}

function normalizeUrl(value) {
  const input = cleanString(value, 700);

  try {
    const url = new URL(input);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return '';
    }

    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeDiscoveryConfidence(value) {
  const normalized = cleanString(value, 40).toLowerCase();

  if (['high', 'medium', 'needs_review'].includes(normalized)) {
    return normalized;
  }

  return 'needs_review';
}

function scoreDiscoveryCandidate(candidateUrl, currentUrl) {
  const candidateHost = getUrlHost(candidateUrl);
  const currentHost = getUrlHost(currentUrl);
  const lowerCandidateUrl = candidateUrl.toLowerCase();

  if (candidateHost && currentHost && candidateHost === currentHost) {
    return 'high';
  }

  if (
    lowerCandidateUrl.includes('apply') ||
    lowerCandidateUrl.includes('application') ||
    lowerCandidateUrl.includes('deadline')
  ) {
    return 'medium';
  }

  return 'needs_review';
}

function buildDiscoveryCandidateReason(candidateUrl, currentUrl) {
  const candidateHost = getUrlHost(candidateUrl);
  const currentHost = getUrlHost(currentUrl);

  if (candidateHost && currentHost && candidateHost === currentHost) {
    return 'Same host as the known official source; likely current-cycle page if content matches.';
  }

  return 'Candidate URL needs source review before replacing the official source.';
}

function getUrlHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function createAlertCandidate(env, { source, sourceCheckId, analysis, status }) {
  const candidateId = crypto.randomUUID();

  await env.DB.prepare(
    `insert into alert_candidates (
      id,
      program_id,
      source_check_id,
      official_source_id,
      candidate_type,
      title,
      summary,
      status
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      candidateId,
      source.program_id,
      sourceCheckId,
      source.id,
      analysis.candidateType || 'source_change',
      `${source.program_name}: ${analysis.reviewDecision}`,
      analysis.note,
      status || 'pending_review',
    )
    .run();

  return candidateId;
}

async function upsertProgramAlertState(env, state) {
  const now = new Date().toISOString();
  const lastChangedAt = state.changed ? state.checkedAt : '';

  await env.DB.prepare(
    `insert into program_alert_states (
      program_id,
      official_source_id,
      status,
      confidence,
      review_decision,
      result,
      last_source_check_id,
      last_alert_candidate_id,
      last_changed_at,
      last_checked_at,
      auto_alerted_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(program_id) do update set
      official_source_id = excluded.official_source_id,
      status = excluded.status,
      confidence = excluded.confidence,
      review_decision = excluded.review_decision,
      result = excluded.result,
      last_source_check_id = excluded.last_source_check_id,
      last_alert_candidate_id = coalesce(nullif(excluded.last_alert_candidate_id, ''), program_alert_states.last_alert_candidate_id),
      last_changed_at = coalesce(nullif(excluded.last_changed_at, ''), program_alert_states.last_changed_at),
      last_checked_at = excluded.last_checked_at,
      auto_alerted_at = coalesce(nullif(excluded.auto_alerted_at, ''), program_alert_states.auto_alerted_at),
      updated_at = excluded.updated_at`,
  )
    .bind(
      state.source.program_id,
      state.source.id,
      state.detectedStatus,
      state.analysis.suggestedConfidence,
      state.analysis.reviewDecision,
      state.analysis.result,
      state.sourceCheckId,
      state.candidateId || '',
      lastChangedAt,
      state.checkedAt,
      state.autoAlertedAt || '',
      now,
      now,
    )
    .run();
}

async function alertExistingOpenProgramsForWatchRequest(env, watchRequestId, watchedProgramIds) {
  const uniqueProgramIds = uniqueStrings(watchedProgramIds).slice(0, 50);
  const deliveryResults = [];

  for (const programId of uniqueProgramIds) {
    const state = await env.DB.prepare(
      `select program_id, last_alert_candidate_id
       from program_alert_states
       where program_id = ?
         and status = 'open'
         and last_alert_candidate_id is not null
         and last_alert_candidate_id != ''
       limit 1`,
    )
      .bind(programId)
      .first();

    if (!state?.last_alert_candidate_id) {
      continue;
    }

    const result = await sendCandidateNotifications(env, state.last_alert_candidate_id, {
      trigger: 'already_open_on_watch',
      preferredWatchRequestId: watchRequestId,
    });
    deliveryResults.push(result);
  }

  return {
    ok: true,
    watchRequestId,
    checkedPrograms: uniqueProgramIds.length,
    alerts: deliveryResults,
  };
}

function getDetectedProgramStatus(analysis) {
  if (analysis.reviewDecision === 'Alert Candidate' && analysis.suggestedStatus === 'open') {
    return isAutoSendableOpening(analysis) ? 'open' : 'open_review';
  }

  if (analysis.reviewDecision === 'Deadline Candidate') {
    return 'deadline';
  }

  if (analysis.reviewDecision === 'Manual Review') {
    return 'needs_review';
  }

  if (analysis.suggestedStatus === 'expectedSoon') {
    return 'opening_soon';
  }

  if (analysis.reviewDecision === 'Prep Watch') {
    return 'prep';
  }

  return 'watching';
}

function normalizeSourceScheduleProfile(source) {
  return {
    cycleFrequency: cleanString(source.cycle_frequency || 'unknown', 40) || 'unknown',
    expectedOpenMonths: parseMonthArray(source.expected_open_months_json),
    lastKnownOpenAt: cleanString(source.last_known_open_at, 40),
    activeLeadDays: positiveNumber(source.active_lead_days, 90),
    activeCheckIntervalHours: positiveNumber(source.active_check_interval_hours, 24),
    warmupCheckIntervalHours: positiveNumber(source.warmup_check_interval_hours, 72),
    dormantCheckIntervalDays: positiveNumber(source.dormant_check_interval_days, 30),
    discoveryCheckIntervalHours: positiveNumber(source.discovery_check_interval_hours, 72),
    sourceVolatility: cleanString(source.source_volatility || 'stable', 60) || 'stable',
    discoveryQueries: parseJsonArray(source.discovery_queries_json),
  };
}

function determineSchedulePhase(profile, detectedStatus, now) {
  if (['open', 'deadline', 'open_review'].includes(detectedStatus)) {
    return 'active';
  }

  if (profile.cycleFrequency === 'rolling' || profile.cycleFrequency === 'ongoing') {
    return 'active';
  }

  if (!profile.expectedOpenMonths.length) {
    return 'unknown';
  }

  const currentMonth = now.getUTCMonth() + 1;
  const daysUntilExpectedOpening = getDaysUntilNextExpectedMonth(now, profile.expectedOpenMonths);

  if (profile.expectedOpenMonths.includes(currentMonth) || daysUntilExpectedOpening <= 31) {
    return 'active';
  }

  if (daysUntilExpectedOpening <= profile.activeLeadDays) {
    return 'warmup';
  }

  return 'dormant';
}

function getNextCheckIntervalHours(profile, { phase, detectedStatus, confidence, hasError, activeWatchCount }) {
  const hasActiveWatchers = activeWatchCount > 0;

  if (hasError) {
    return hasActiveWatchers ? 168 : profile.dormantCheckIntervalDays * 24;
  }

  if (detectedStatus === 'open' || detectedStatus === 'deadline') {
    return hasActiveWatchers ? profile.activeCheckIntervalHours : Math.max(profile.activeCheckIntervalHours, 72);
  }

  if (detectedStatus === 'open_review' || confidence === 'needsReview') {
    return hasActiveWatchers ? 72 : 168;
  }

  if (phase === 'active') {
    return hasActiveWatchers ? profile.activeCheckIntervalHours : Math.max(profile.activeCheckIntervalHours, 72);
  }

  if (phase === 'warmup') {
    return hasActiveWatchers ? profile.warmupCheckIntervalHours : Math.max(profile.warmupCheckIntervalHours, 168);
  }

  if (phase === 'unknown') {
    return hasActiveWatchers ? 168 : Math.max(profile.dormantCheckIntervalDays * 24, 720);
  }

  return profile.dormantCheckIntervalDays * 24;
}

function getNextDiscoveryAt(profile, phase, now) {
  if (profile.sourceVolatility !== 'moving_cycle_page') {
    return '';
  }

  if (!['active', 'warmup', 'unknown'].includes(phase)) {
    return '';
  }

  return addHours(now, profile.discoveryCheckIntervalHours).toISOString();
}

function getDaysUntilNextExpectedMonth(now, expectedMonths) {
  const currentYear = now.getUTCFullYear();
  const candidates = expectedMonths.flatMap((month) => [
    Date.UTC(currentYear, month - 1, 1),
    Date.UTC(currentYear + 1, month - 1, 1),
  ]);
  const next = candidates
    .filter((timestamp) => timestamp >= now.getTime())
    .sort((a, b) => a - b)[0];

  if (!next) {
    return 366;
  }

  return Math.ceil((next - now.getTime()) / 86_400_000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + Math.max(1, Number(hours) || 1) * 3_600_000);
}

function buildScheduleNote(profile, { phase, detectedStatus, intervalHours, activeWatchCount }) {
  const cadence =
    intervalHours >= 24
      ? `${Math.round(intervalHours / 24)} day${Math.round(intervalHours / 24) === 1 ? '' : 's'}`
      : `${intervalHours} hour${intervalHours === 1 ? '' : 's'}`;
  const months = profile.expectedOpenMonths.length ? profile.expectedOpenMonths.join(', ') : 'unknown';

  return `Phase: ${phase}. Status: ${detectedStatus}. Next check in ${cadence}. Expected month(s): ${months}. Active watchers: ${activeWatchCount}.`;
}

function parseMonthArray(value) {
  return parseJsonArray(value)
    .map((month) => Number(month))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
}

function positiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(Math.floor(number), max));
}

function isAutoSendableOpening(analysis) {
  return (
    analysis.reviewDecision === 'Alert Candidate' &&
    analysis.suggestedStatus === 'open' &&
    AUTO_SENDABLE_CONFIDENCES.has(analysis.suggestedConfidence) &&
    isDetectedSignalFreshEnough(analysis.detectedSignal)
  );
}

function isDetectedSignalFreshEnough(signal) {
  const signalDate = parseDetectedSignalDate(signal);

  if (!signalDate) {
    return true;
  }

  const today = new Date();
  const staleBufferMs = 14 * 86_400_000;

  return signalDate.getTime() >= today.getTime() - staleBufferMs;
}

function parseDetectedSignalDate(signal) {
  const value = cleanString(signal, 120);

  if (!value) {
    return null;
  }

  const match = value.match(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},\s*\d{4}\b/i,
  );

  if (!match) {
    return null;
  }

  const parsed = new Date(match[0]);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shouldAutoSendWatchedOpenAlerts(env) {
  return env.AUTO_SEND_WATCHED_OPEN_ALERTS === 'true' || env.AUTO_SEND_OPEN_ALERTS === 'true';
}

function shouldAutoAlertExistingOpenOnWatch(env) {
  return shouldAutoSendWatchedOpenAlerts(env) && env.AUTO_ALERT_EXISTING_OPEN_ON_WATCH !== 'false';
}

function hasSuccessfulDelivery(result) {
  return Boolean(
    result?.deliveries?.some((delivery) => ['sent', 'queued', 'already_sent'].includes(delivery.status)),
  );
}

async function getWatchStatus(env) {
  const now = new Date().toISOString();
  const [
    requests,
    activeRequests,
    unsubscribedRequests,
    programs,
    sources,
    inactiveSources,
    scheduledSources,
    dueSources,
    discoveryDue,
    pendingCandidates,
    autoReadyCandidates,
    pendingDiscoveryCandidates,
    deliveries,
    openPrograms,
    latestCheck,
  ] = await Promise.all([
    getCount(env, 'watch_requests'),
    getCount(env, 'watch_requests', "status = 'active' and (unsubscribed_at is null or unsubscribed_at = '')"),
    getCount(env, 'watch_requests', "status = 'unsubscribed' or unsubscribed_at is not null"),
    getCount(env, 'watch_request_programs'),
    getCount(env, 'official_sources', 'enabled = 1'),
    getCount(env, 'official_sources', 'enabled = 0'),
    getEnabledScheduleCount(env),
    getEnabledScheduleCount(env, `next_check_at is null or next_check_at = '' or next_check_at <= '${now}'`),
    getEnabledScheduleCount(
      env,
      `source_volatility = 'moving_cycle_page' and current_phase in ('warmup', 'active', 'unknown') and (next_discovery_at is null or next_discovery_at = '' or next_discovery_at <= '${now}')`,
    ),
    getCount(env, 'alert_candidates', "status = 'pending_review'"),
    getCount(env, 'alert_candidates', "status in ('auto_ready', 'auto_sent')"),
    getCount(env, 'discovery_candidates', "status = 'pending_review'"),
    getCount(env, 'alert_deliveries'),
    getCount(env, 'program_alert_states', "status = 'open'"),
    env.DB.prepare('select max(created_at) as latest from source_checks').first(),
  ]);

  return {
    ok: true,
    watchRequests: requests,
    activeWatchRequests: activeRequests,
    unsubscribedWatchRequests: unsubscribedRequests,
    watchedPrograms: programs,
    officialSources: sources,
    inactiveOfficialSources: inactiveSources,
    scheduledSources,
    dueSources,
    discoveryDue,
    pendingCandidates,
    automaticCandidates: autoReadyCandidates,
    pendingDiscoveryCandidates,
    openPrograms,
    alertDeliveries: deliveries,
    deliveryConfig: {
      email: Boolean(env.EMAIL && env.ALERT_FROM_EMAIL),
      sms: hasSmsDeliveryConfig(env),
      smsProvider: getSmsProvider(env),
    },
    lastCheckedAt: latestCheck?.latest || null,
  };
}

async function getPublicLibraryStatus(env) {
  const rows = await env.DB.prepare(
    `select
      official_sources.program_id as programId,
      program_alert_states.status,
      program_alert_states.confidence,
      coalesce(program_alert_states.last_checked_at, official_sources.last_checked_at) as lastCheckedAt,
      program_alert_states.updated_at as updatedAt
    from official_sources
    inner join program_alert_states
      on program_alert_states.program_id = official_sources.program_id
    where official_sources.enabled = 1
      and (
        (
          program_alert_states.confidence = 'high'
          and program_alert_states.status in ('open', 'deadline', 'opening_soon')
          and lower(coalesce(program_alert_states.review_decision, '')) != 'manual review'
        )
        or (
          program_alert_states.confidence in ('high', 'medium')
          and program_alert_states.status in ('watching', 'closed')
          and lower(coalesce(program_alert_states.review_decision, '')) = 'monitor only'
        )
      )
    order by official_sources.program_id asc`,
  ).all();
  const programs = (rows.results || []).map((row) => ({
    programId: cleanString(row.programId, 160),
    status: cleanString(row.status, 40),
    confidence: cleanString(row.confidence, 40),
    lastCheckedAt: cleanString(row.lastCheckedAt, 40),
    updatedAt: cleanString(row.updatedAt, 40),
  }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    programs,
  };
}

async function getEnabledScheduleCount(env, whereClause = '1 = 1') {
  const row = await env.DB.prepare(
    `select count(*) as count
     from source_schedule_profiles
     inner join official_sources
       on official_sources.id = source_schedule_profiles.official_source_id
     where official_sources.enabled = 1
       and (${whereClause})`,
  ).first();

  return Number(row?.count || 0);
}

async function getReviewHistory(env, url) {
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 8, 25));
  const [searchRuns, reviewedUrls, sourceChecks, deliveries] = await Promise.all([
    env.DB.prepare(
      `select
        id,
        provider,
        trigger,
        status,
        searched_programs as searchedPrograms,
        searched_queries as searchedQueries,
        found_results as foundResults,
        saved_candidates as savedCandidates,
        error_message as errorMessage,
        raw_summary_json as rawSummaryJson,
        created_at as createdAt
      from discovery_search_runs
      order by created_at desc
      limit ?`,
    )
      .bind(limit)
      .all(),
    env.DB.prepare(
      `select
        discovery_candidates.id,
        discovery_candidates.program_id as programId,
        official_sources.program_name as programName,
        discovery_candidates.candidate_url as candidateUrl,
        official_sources.url as currentOfficialUrl,
        discovery_candidates.title,
        discovery_candidates.confidence,
        discovery_candidates.status,
        discovery_candidates.reason,
        discovery_candidates.review_note as reviewNote,
        discovery_candidates.reviewed_by as reviewedBy,
        discovery_candidates.reviewed_at as reviewedAt,
        discovery_candidates.updated_at as updatedAt
      from discovery_candidates
      left join official_sources
        on official_sources.id = discovery_candidates.official_source_id
      where discovery_candidates.status != 'pending_review'
         or discovery_candidates.reviewed_at is not null
      order by coalesce(discovery_candidates.reviewed_at, discovery_candidates.updated_at) desc
      limit ?`,
    )
      .bind(limit)
      .all(),
    env.DB.prepare(
      `select
        source_checks.id,
        source_checks.program_id as programId,
        official_sources.program_name as programName,
        source_checks.result,
        source_checks.suggested_status as suggestedStatus,
        source_checks.suggested_confidence as suggestedConfidence,
        source_checks.review_decision as reviewDecision,
        source_checks.changed,
        source_checks.new_alert_candidate as newAlertCandidate,
        source_checks.note,
        source_checks.created_at as createdAt
      from source_checks
      left join official_sources
        on official_sources.id = source_checks.official_source_id
      order by source_checks.created_at desc
      limit ?`,
    )
      .bind(limit)
      .all(),
    env.DB.prepare(
      `select
        alert_deliveries.id,
        alert_deliveries.alert_candidate_id as alertCandidateId,
        alert_candidates.program_id as programId,
        official_sources.program_name as programName,
        alert_candidates.title as candidateTitle,
        alert_deliveries.channel,
        alert_deliveries.destination,
        alert_deliveries.status,
        alert_deliveries.error_message as errorMessage,
        alert_deliveries.sent_at as sentAt,
        alert_deliveries.created_at as createdAt
      from alert_deliveries
      left join alert_candidates
        on alert_candidates.id = alert_deliveries.alert_candidate_id
      left join official_sources
        on official_sources.id = alert_candidates.official_source_id
      order by alert_deliveries.created_at desc
      limit ?`,
    )
      .bind(limit)
      .all(),
  ]);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    limit,
    searchRuns: (searchRuns.results || []).map(formatDiscoverySearchRunHistory),
    reviewedUrls: reviewedUrls.results || [],
    sourceChecks: (sourceChecks.results || []).map((check) => ({
      ...check,
      changed: Boolean(check.changed),
      newAlertCandidate: Boolean(check.newAlertCandidate),
    })),
    alertDeliveries: (deliveries.results || []).map((delivery) => ({
      ...delivery,
      destination: maskAlertDestination(delivery.destination),
    })),
  };
}

function formatDiscoverySearchRunHistory(row) {
  const summary = parseJsonObject(row.rawSummaryJson);
  const results = Array.isArray(summary.results) ? summary.results : [];
  const keptCandidates = results.reduce((total, program) => total + (program.candidates?.length || 0), 0);
  const ignoredResults = results.reduce(
    (total, program) =>
      total + (program.queries || []).reduce((queryTotal, query) => queryTotal + numberOrZero(query.ignored), 0),
    0,
  );

  return {
    id: row.id,
    provider: row.provider,
    trigger: row.trigger,
    status: row.status,
    dryRun: Boolean(summary.dryRun),
    force: Boolean(summary.force),
    searchedPrograms: numberOrZero(row.searchedPrograms),
    searchedQueries: numberOrZero(row.searchedQueries),
    foundResults: numberOrZero(row.foundResults),
    savedCandidates: numberOrZero(row.savedCandidates),
    updatedCandidates: numberOrZero(summary.updatedCandidates),
    keptCandidates,
    ignoredResults,
    errorCount: numberOrZero(summary.errorCount),
    errorMessage: row.errorMessage || '',
    programNames: results.map((program) => cleanString(program.programName, 120)).filter(Boolean).slice(0, 4),
    createdAt: row.createdAt,
  };
}

function maskAlertDestination(value) {
  const destination = cleanString(value, 180);

  if (!destination) {
    return '';
  }

  if (destination.includes('@')) {
    const [name, domain] = destination.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }

  return `${destination.slice(0, 3)}***${destination.slice(-2)}`;
}

async function getReadinessQueue(env) {
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(
    `select
      official_sources.id as officialSourceId,
      official_sources.program_id as programId,
      official_sources.program_name as programName,
      official_sources.organization,
      official_sources.url,
      official_sources.previous_url as previousUrl,
      official_sources.last_checked_at as sourceLastCheckedAt,
      official_sources.last_http_status as lastHttpStatus,
      official_sources.last_error_message as lastErrorMessage,
      successful_fetch.last_successful_check_at as lastSuccessfulCheckAt,
      source_schedule_profiles.current_phase as schedulePhase,
      source_schedule_profiles.next_check_at as nextCheckAt,
      source_schedule_profiles.next_discovery_at as nextDiscoveryAt,
      source_schedule_profiles.source_volatility as sourceVolatility,
      source_schedule_profiles.curated_status_reviewed_at as lastVerifiedAt,
      program_alert_states.status as alertStatus,
      program_alert_states.confidence,
      program_alert_states.review_decision as reviewDecision,
      program_alert_states.result,
      program_alert_states.last_changed_at as lastChangedAt,
      program_alert_states.last_checked_at as programLastCheckedAt,
      coalesce(watched.active_watch_count, 0) as activeWatchCount,
      coalesce(alerts.pending_alert_count, 0) as pendingAlertCount,
      coalesce(alerts.auto_alert_count, 0) as automaticAlertCount,
      coalesce(discovery.pending_discovery_count, 0) as pendingDiscoveryCount,
      case
        when source_schedule_profiles.next_check_at is null
          or source_schedule_profiles.next_check_at = ''
          or source_schedule_profiles.next_check_at <= ?
          then 1
        else 0
      end as isDue,
      case
        when source_schedule_profiles.source_volatility = 'moving_cycle_page'
          and source_schedule_profiles.current_phase in ('warmup', 'active', 'unknown')
          and (
            source_schedule_profiles.next_discovery_at is null
            or source_schedule_profiles.next_discovery_at = ''
            or source_schedule_profiles.next_discovery_at <= ?
          )
          then 1
        else 0
      end as isDiscoveryDue
    from official_sources
    left join source_schedule_profiles
      on source_schedule_profiles.official_source_id = official_sources.id
    left join program_alert_states
      on program_alert_states.program_id = official_sources.program_id
    left join (
      select official_source_id, max(fetched_at) as last_successful_check_at
      from page_snapshots
      where coalesce(error_message, '') = ''
        and http_status >= 200
        and http_status < 400
      group by official_source_id
    ) successful_fetch
      on successful_fetch.official_source_id = official_sources.id
    left join (
      select
        watch_request_programs.program_id,
        count(distinct watch_request_programs.watch_request_id) as active_watch_count
      from watch_request_programs
      inner join watch_requests
        on watch_requests.id = watch_request_programs.watch_request_id
      where watch_requests.status = 'active'
        and (watch_requests.unsubscribed_at is null or watch_requests.unsubscribed_at = '')
        and (
          watch_requests.workspace_id is null
          or not exists (
            select 1 from beta_program_watches preference
            where preference.workspace_id = watch_requests.workspace_id
              and preference.program_id = watch_request_programs.program_id
          )
          or exists (
            select 1 from beta_program_watches preference
            where preference.workspace_id = watch_requests.workspace_id
              and preference.program_id = watch_request_programs.program_id
              and preference.is_watching = 1
          )
        )
      group by watch_request_programs.program_id
    ) watched
      on watched.program_id = official_sources.program_id
    left join (
      select
        program_id,
        sum(case when status = 'pending_review' then 1 else 0 end) as pending_alert_count,
        sum(case when status in ('auto_ready', 'auto_sent') then 1 else 0 end) as auto_alert_count
      from alert_candidates
      group by program_id
    ) alerts
      on alerts.program_id = official_sources.program_id
    left join (
      select
        program_id,
        count(*) as pending_discovery_count
      from discovery_candidates
      where status = 'pending_review'
      group by program_id
    ) discovery
      on discovery.program_id = official_sources.program_id
    where official_sources.enabled = 1
    order by
      coalesce(watched.active_watch_count, 0) desc,
      coalesce(alerts.pending_alert_count, 0) desc,
      coalesce(discovery.pending_discovery_count, 0) desc,
      official_sources.program_name asc
    limit 100`,
  )
    .bind(now, now)
    .all();

  const items = (rows.results || []).map((row) => buildReadinessItem(row));
  const groups = groupReadinessItems(items);

  return {
    ok: true,
    generatedAt: now,
    total: items.length,
    needsAttention: items.filter((item) => item.needsAttention).length,
    groups,
  };
}

function buildReadinessItem(row) {
  const state = inferReadinessState(row);
  const action = getReadinessAction(state, row);

  return {
    programId: row.programId,
    programName: row.programName,
    organization: row.organization || '',
    url: row.url || '',
    previousUrl: row.previousUrl || '',
    state,
    action,
    result: row.result || '',
    reviewDecision: row.reviewDecision || '',
    alertStatus: row.alertStatus || 'unknown',
    confidence: row.confidence || '',
    schedulePhase: row.schedulePhase || 'unknown',
    sourceVolatility: row.sourceVolatility || '',
    activeWatchCount: Number(row.activeWatchCount || 0),
    pendingAlertCount: Number(row.pendingAlertCount || 0),
    automaticAlertCount: Number(row.automaticAlertCount || 0),
    pendingDiscoveryCount: Number(row.pendingDiscoveryCount || 0),
    isDue: Boolean(row.isDue),
    isDiscoveryDue: Boolean(row.isDiscoveryDue),
    lastCheckedAt: row.programLastCheckedAt || row.sourceLastCheckedAt || '',
    nextCheckAt: row.nextCheckAt || '',
    nextDiscoveryAt: row.nextDiscoveryAt || '',
    lastHttpStatus: row.lastHttpStatus || null,
    lastErrorMessage: row.lastErrorMessage || '',
    lastVerifiedAt: row.lastVerifiedAt || '',
    lastSuccessfulCheckAt: row.lastSuccessfulCheckAt || '',
    needsAttention: isReadinessAttentionState(state),
  };
}

function inferReadinessState(row) {
  const result = cleanString(row.result, 120).toLowerCase();
  const reviewDecision = cleanString(row.reviewDecision, 120).toLowerCase();
  const alertStatus = cleanString(row.alertStatus, 80).toLowerCase();
  const schedulePhase = cleanString(row.schedulePhase, 80).toLowerCase();

  if (cleanString(row.lastErrorMessage, 500)) {
    return 'Fetch Error';
  }

  if (Number(row.pendingAlertCount || 0) > 0 || alertStatus === 'open_review') {
    return 'Alert Review';
  }

  if (Number(row.pendingDiscoveryCount || 0) > 0) {
    return 'Source Candidate Review';
  }

  if (alertStatus === 'open') {
    return 'Open';
  }

  if (alertStatus === 'deadline' || reviewDecision === 'deadline candidate') {
    return 'Deadline';
  }

  if (result === 'registration closed' || isKnownClosedReadinessRow(row)) {
    return 'Closed';
  }

  if (result === 'old-cycle signal') {
    return 'Old Cycle';
  }

  if (isBroadJobBoardUrl(row.url) && ['needs_review', 'watching', 'unknown', ''].includes(alertStatus)) {
    return 'Exact Posting Needed';
  }

  if (alertStatus === 'needs_review' || reviewDecision === 'manual review') {
    return 'Needs Review';
  }

  if (['opening_soon', 'prep'].includes(alertStatus) || ['warmup', 'active'].includes(schedulePhase)) {
    return 'Warmup';
  }

  return 'Monitor';
}

function isKnownClosedReadinessRow(row) {
  return cleanString(row.programId, 160) === 'jpmorgan-career-ed-you-watch';
}

function getReadinessAction(state, row) {
  switch (state) {
    case 'Alert Review':
      return 'Review pending alert candidates, dry run recipients, then send only if the official source is clear.';
    case 'Source Candidate Review':
      return 'Review discovered URLs and accept only an official current-cycle source.';
    case 'Fetch Error':
      return 'Open the source manually or choose a lighter URL before trusting automation.';
    case 'Exact Posting Needed':
      return 'Find the exact posting URL before alerting watched students.';
    case 'Needs Review':
      return 'Run a source dry run or inspect the official page before changing alert status.';
    case 'Open':
      return Number(row.activeWatchCount || 0)
        ? 'Open state is active; confirm whether watched students already received the alert.'
        : 'Open state is active, but no students are currently watching this program.';
    case 'Deadline':
      return 'Review the deadline and decide whether students need a reminder.';
    case 'Closed':
      return 'Keep monitoring for reopened registration; no student opening alert right now.';
    case 'Old Cycle':
      return 'Ignore as a fresh opening and wait for the next cycle or a new official page.';
    case 'Warmup':
      return 'Useful for preparation timing; keep checking as the expected opening window approaches.';
    default:
      return 'Keep monitoring on schedule.';
  }
}

function isReadinessAttentionState(state) {
  return ['Alert Review', 'Source Candidate Review', 'Fetch Error', 'Exact Posting Needed', 'Needs Review'].includes(state);
}

function groupReadinessItems(items) {
  const groupDefinitions = [
    { key: 'attention', label: 'Needs Attention', states: ['Alert Review', 'Source Candidate Review', 'Fetch Error', 'Exact Posting Needed', 'Needs Review'] },
    { key: 'ready', label: 'Open or Deadline', states: ['Open', 'Deadline'] },
    { key: 'closed', label: 'Closed or Old Cycle', states: ['Closed', 'Old Cycle'] },
    { key: 'watching', label: 'Warmup or Monitor', states: ['Warmup', 'Monitor'] },
  ];

  return groupDefinitions.map((group) => ({
    ...group,
    items: items
      .filter((item) => group.states.includes(item.state))
      .sort(compareReadinessItems),
  }));
}

function compareReadinessItems(left, right) {
  const attentionDelta = Number(right.needsAttention) - Number(left.needsAttention);

  if (attentionDelta) {
    return attentionDelta;
  }

  const watcherDelta = right.activeWatchCount - left.activeWatchCount;

  if (watcherDelta) {
    return watcherDelta;
  }

  const dueDelta = Number(right.isDue) - Number(left.isDue);

  if (dueDelta) {
    return dueDelta;
  }

  return left.programName.localeCompare(right.programName);
}

async function getPendingCandidates(env) {
  const [candidates, pendingTotal] = await Promise.all([
    env.DB.prepare(
    `select
      alert_candidates.id,
      alert_candidates.program_id as programId,
      official_sources.program_name as programName,
      official_sources.url,
      alert_candidates.candidate_type as candidateType,
      alert_candidates.title,
      alert_candidates.summary,
      alert_candidates.status,
      alert_candidates.created_at as createdAt
    from alert_candidates
    left join official_sources on official_sources.id = alert_candidates.official_source_id
    where alert_candidates.status = 'pending_review'
    order by alert_candidates.created_at desc
    limit 50`,
    ).all(),
    env.DB.prepare(
      `select count(*) as total
       from alert_candidates
       where status = 'pending_review'`,
    ).first(),
  ]);

  return {
    ok: true,
    totalPending: pendingTotal?.total ?? candidates.results?.length ?? 0,
    candidates: candidates.results || [],
  };
}

async function runProactiveDelivery(env, options = {}) {
  const dryRun = options.dryRun !== false;
  const force = Boolean(options.force);
  const generatedAt = new Date().toISOString();
  const periodKey = getIsoWeekKey(new Date(generatedAt));
  const digestDue = !options.scheduled || force || isWeeklyDeliveryWindow(env, new Date(generatedAt));

  if (options.scheduled && !shouldRunScheduledProactiveDelivery(env)) {
    return {
      ok: true,
      dryRun,
      status: 'disabled',
      periodKey,
      generatedAt,
      eligibleRecipients: 0,
      attemptedDeliveries: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const inputs = await getProactiveDeliveryInputs(env, cleanString(options.watchRequestId, 120));
  const results = [];
  let eligibleRecipients = 0;

  for (const recipient of inputs.recipients) {
    const relationshipByProgram = buildDeliveryRelationshipMap(recipient, inputs);
    const immediateCandidates = [];
    const digestCandidates = [];
    let suppressedPreviouslySent = false;
    let recipientHasEligibleDelivery = false;
    let recipientProducedResult = false;

    for (const program of inputs.programs) {
      const relationship = relationshipByProgram.get(program.programId) || createEmptyDeliveryRelationship();
      const match = matchProgramToFocus(recipient, program);
      const watched = relationship.isWatching === true;

      if (!watched && !match.matches) continue;

      const cycleKey = inferProgramCycleKey(program);
      const copyState = buildDeliveryCopyState(program, { now: generatedAt });
      const newlyVerified = isNewlyAvailableForProfile(program, recipient, generatedAt);
      const freshActionable = !watched && match.matches && isFreshActionableForProfile(
        program,
        recipient,
        generatedAt,
      );
      const deliveryClass = classifyDeliveryCandidate({
        status: program.status,
        confidence: program.confidence,
        verified: program.verified,
        watched,
        focusMatch: match.matches,
        freshActionable,
        currentOfficialStatus: copyState.currentStatusVerified,
        newlyVerified,
        hasPreparationBenefit:
          recipient.sendTiming === 'prepOpenDeadline' && Boolean(program.openDate || program.deadline),
      });

      // Watched act-now alerts keep using the existing immediate alert path.
      if (!deliveryClass || (deliveryClass === 'act_now' && watched)) continue;

      const eligibility = evaluateStudentDelivery({
        deliveryClass,
        relationship,
        programCycleKey: cycleKey,
        isFutureCycle: isProgramCycleInFuture(cycleKey, generatedAt),
        watchSpecific: false,
      });

      if (!eligibility.eligible) continue;

      const changeKey = cleanString(
        program.statusChangedAt || program.verifiedAt || program.updatedAt || 'verified',
        120,
      );
      const dedupeKey = buildDeliveryDedupeKey({
        watchRequestId: recipient.workspaceId || recipient.id,
        programId: program.programId,
        cycleKey,
        deliveryClass,
        changeKey,
      });
      const programCycle = `${program.programId}:${cycleKey || 'unspecified'}`;

      if (inputs.sentItemDedupeKeys.has(dedupeKey)) {
        suppressedPreviouslySent = true;
        continue;
      }

      const candidate = {
        ...program,
        deliveryClass,
        newlyVerified,
        cycleKey,
        dedupeKey,
        eligible: true,
        score: match.score + (watched ? 25 : 0),
        isWatching: watched,
        matchReason: watched
          ? 'You asked ApplyFirst to watch this program.'
          : buildStudentMatchReason(recipient, program, match),
        eligibilityUnclear: eligibility.eligibilityUnclear,
        currentOfficialStatus: copyState.currentStatusVerified,
        repeatCycle: watched && hasPriorApplicationInDifferentCycle(
          relationship.applicationAttempts,
          cycleKey,
        ),
        programCycle,
      };

      if (deliveryClass === 'act_now') {
        immediateCandidates.push(candidate);
      } else {
        digestCandidates.push(candidate);
      }
    }

    const immediateLimit = Math.max(1, Math.min(Number(env.PROACTIVE_IMMEDIATE_MAX_PER_RUN || 3), 5));
    const rankedImmediateCandidates = [...immediateCandidates]
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
      .slice(0, immediateLimit);

    for (const item of rankedImmediateCandidates) {
      const batchDedupeKey = `immediate:${item.dedupeKey}`;
      if (inputs.sentBatchDedupeKeys.has(batchDedupeKey)) {
        suppressedPreviouslySent = true;
        continue;
      }

      recipientHasEligibleDelivery = true;
      recipientProducedResult = true;

      if (dryRun) {
        results.push({
          watchRequestId: recipient.id,
          status: 'ready',
          deliveryClass: 'act_now',
          deliveryFormat: 'immediate',
          entrySource: 'focus_match_alert',
          items: [toPublicDeliveryPreview(item, recipient)],
        });
        continue;
      }

      const prepared = await createProactiveDeliveryBatch(env, {
        recipient,
        deliveryClass: 'act_now',
        deliveryFormat: 'immediate',
        entrySource: 'focus_match_alert',
        periodKey: item.cycleKey || periodKey,
        dedupeKey: batchDedupeKey,
        items: [item],
      });

      if (prepared.status === 'already_sent') {
        results.push({ watchRequestId: recipient.id, status: 'already_sent', items: [] });
        continue;
      }

      const delivery = await sendProactiveImmediateEmail(env, recipient, prepared, item);
      await updateProactiveDeliveryBatch(env, prepared.batchId, delivery);
      if (delivery.status === 'sent') {
        inputs.sentItemDedupeKeys.add(item.dedupeKey);
        inputs.sentBatchDedupeKeys.add(batchDedupeKey);
      }
      results.push({
        watchRequestId: recipient.id,
        status: delivery.status,
        deliveryClass: 'act_now',
        deliveryFormat: 'immediate',
        itemCount: 1,
        batchId: prepared.batchId,
      });
    }

    if (digestDue) {
      const items = selectDigestItems(digestCandidates, {
        limit: Number(env.PROACTIVE_DIGEST_MAX_ITEMS || 5),
        immediateProgramCycles: inputs.immediateProgramCyclesByRecipient.get(
          recipient.workspaceId || recipient.id,
        ) || [],
      });

      if (items.length) {
        const deliveryClass = items.every((item) => item.deliveryClass === 'prepare') ? 'prepare' : 'discover';
        const entrySource = deliveryClass === 'prepare' ? 'prepare_alert' : 'personalized_discovery_digest';
        const batchDedupeKey = `weekly:${recipient.workspaceId || recipient.id}:${periodKey}`;

        if (inputs.sentBatchDedupeKeys.has(batchDedupeKey)) {
          suppressedPreviouslySent = true;
        } else {
          recipientHasEligibleDelivery = true;
          recipientProducedResult = true;

          if (dryRun) {
            results.push({
              watchRequestId: recipient.id,
              status: 'ready',
              deliveryClass,
              deliveryFormat: 'digest',
              entrySource,
              items: items.map((item) => toPublicDeliveryPreview(item, recipient)),
            });
          } else {
            const prepared = await createProactiveDeliveryBatch(env, {
              recipient,
              deliveryClass,
              deliveryFormat: 'digest',
              entrySource,
              periodKey,
              dedupeKey: batchDedupeKey,
              items,
            });

            if (prepared.status === 'already_sent') {
              results.push({ watchRequestId: recipient.id, status: 'already_sent', items: [] });
            } else {
              const delivery = await sendProactiveDigestEmail(env, recipient, prepared, items);
              await updateProactiveDeliveryBatch(env, prepared.batchId, delivery);
              results.push({
                watchRequestId: recipient.id,
                status: delivery.status,
                deliveryClass,
                deliveryFormat: 'digest',
                itemCount: items.length,
                batchId: prepared.batchId,
              });
            }
          }
        }
      }
    }

    if (recipientHasEligibleDelivery) eligibleRecipients += 1;

    if (!recipientProducedResult) {
      results.push({
        watchRequestId: recipient.id,
        status: suppressedPreviouslySent
          ? 'already_sent'
          : !digestDue && digestCandidates.length
            ? 'not_due'
            : 'no_match',
        items: [],
      });
    }
  }

  const response = {
    ok: true,
    trigger: cleanString(options.trigger || 'manual', 80),
    dryRun,
    periodKey,
    generatedAt,
    eligibleRecipients,
    attemptedDeliveries: results.filter((result) => !['no_match', 'not_due', 'already_sent', 'ready'].includes(result.status)).length,
    sent: results.filter((result) => result.status === 'sent').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => ['no_match', 'not_due', 'already_sent'].includes(result.status)).length,
    results,
  };

  if (!dryRun) {
    await recordProactiveDeliveryRun(env, {
      trigger: response.trigger,
      periodKey,
      consideredRecipients: inputs.recipients.length,
      eligibleRecipients,
      attemptedDeliveries: response.attemptedDeliveries,
      sent: response.sent,
      failed: response.failed,
      noMatch: results.filter((result) => result.status === 'no_match').length,
      duplicateSuppressed: results.filter((result) => result.status === 'already_sent').length,
    }).catch((error) => logProactiveDeliveryError(error));
  }

  return response;
}

async function recordProactiveDeliveryRun(env, input) {
  await env.DB.prepare(
    `insert into proactive_delivery_runs (
      id, trigger, period_key, considered_recipient_count, eligible_recipient_count,
      attempted_delivery_count, sent_count, failed_count, no_match_count,
      duplicate_suppressed_count
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    cleanString(input.trigger, 120) || 'unknown',
    cleanString(input.periodKey, 40),
    Number(input.consideredRecipients || 0),
    Number(input.eligibleRecipients || 0),
    Number(input.attemptedDeliveries || 0),
    Number(input.sent || 0),
    Number(input.failed || 0),
    Number(input.noMatch || 0),
    Number(input.duplicateSuppressed || 0),
  ).run();
}

async function evaluateImmediateAlertEligibility(env, candidate, recipient) {
  if (!recipient.workspaceId) {
    return { eligible: true, suppressionReason: '', repeatCycle: false };
  }

  const [evidence, watch, attempts] = await Promise.all([
    env.DB.prepare(
      `select relevance, relevance_source as relevanceSource
       from beta_program_evidence
       where workspace_id = ? and program_id = ?
       limit 1`,
    ).bind(recipient.workspaceId, candidate.programId).first(),
    env.DB.prepare(
      `select is_watching as isWatching
       from beta_program_watches
       where workspace_id = ? and program_id = ?
       limit 1`,
    ).bind(recipient.workspaceId, candidate.programId).first(),
    env.DB.prepare(
      `select cycle_label as cycleLabel, outcome, applied_at as appliedAt
       from beta_application_attempts
       where workspace_id = ? and program_id = ?
       order by applied_at desc`,
    ).bind(recipient.workspaceId, candidate.programId).all(),
  ]);
  const cycleKey = inferProgramCycleKey(candidate);

  const evaluation = evaluateStudentDelivery({
    deliveryClass: 'act_now',
    relationship: {
      relevance: evidence?.relevance || '',
      relevanceSource: evidence?.relevanceSource || '',
      isWatching: watch ? Boolean(watch.isWatching) : true,
      applicationAttempts: attempts.results || [],
    },
    programCycleKey: cycleKey,
    isFutureCycle: isProgramCycleInFuture(cycleKey, new Date().toISOString()),
    watchSpecific: true,
  });

  return {
    ...evaluation,
    repeatCycle: hasPriorApplicationInDifferentCycle(attempts.results || [], cycleKey),
  };
}

async function prepareImmediateDeliveryBatch(env, candidate, recipient) {
  const cycleKey = inferProgramCycleKey(candidate);
  const detectedSignal = extractDetectedSignal(candidate.summary);
  const itemDedupeKey = buildDeliveryDedupeKey({
    watchRequestId: recipient.workspaceId || recipient.id,
    programId: candidate.programId,
    cycleKey,
    deliveryClass: 'act_now',
    changeKey: `${candidate.candidateType || 'opening'}:${detectedSignal || 'verified'}`,
  });

  return createProactiveDeliveryBatch(env, {
    recipient,
    deliveryClass: 'act_now',
    deliveryFormat: 'immediate',
    entrySource: 'watched_program_alert',
    periodKey: cycleKey || getIsoWeekKey(new Date()),
    dedupeKey: `immediate:${itemDedupeKey}`,
    items: [{
      programId: candidate.programId,
      programName: candidate.programName || candidate.title,
      organization: candidate.organization,
      deliveryClass: 'act_now',
      cycleKey,
      matchReason: candidate.repeatCycle === true
        ? 'You previously applied to this program and kept it on Watch.'
        : 'You asked ApplyFirst to watch this program.',
      score: 100,
      isWatching: true,
      status: candidate.currentStatus || (candidate.candidateType === 'deadline' ? 'deadline' : 'open'),
      deadline: candidate.deadline,
      officialUrl: candidate.url,
      verified: true,
      confidence: candidate.confidence,
      statusEvidenceType: candidate.statusEvidenceType,
      statusEvidenceAt: candidate.statusEvidenceAt,
      statusReviewDecision: candidate.statusReviewDecision,
      sourceError: candidate.sourceError,
      curatedStatus: candidate.curatedStatus,
      curatedStatusReviewedAt: candidate.curatedStatusReviewedAt,
      curatedDeadline: candidate.curatedDeadline,
      detectedSignal,
      repeatCycle: candidate.repeatCycle === true,
      dedupeKey: itemDedupeKey,
    }],
  });
}

async function getProactiveDeliveryInputs(env, preferredWatchRequestId = '') {
  const recipientWhere = preferredWatchRequestId ? 'and request.id = ?' : '';
  const recipientStatement = env.DB.prepare(
    `select
      request.id,
      request.workspace_id as workspaceId,
      request.email,
      request.class_year as classYear,
      request.role_track as roleTrack,
      request.priority,
      request.send_timing as sendTiming,
      request.unsubscribe_token as unsubscribeToken,
      request.created_at as createdAt
     from watch_requests request
     where request.status = 'active'
       and request.email is not null
       and request.email != ''
       and (request.unsubscribed_at is null or request.unsubscribed_at = '')
       ${recipientWhere}
       and (
         (
           request.workspace_id is not null
           and request.workspace_id != ''
           and not exists (
             select 1 from watch_requests newer
             where newer.workspace_id = request.workspace_id
               and newer.status = 'active'
               and (newer.unsubscribed_at is null or newer.unsubscribed_at = '')
               and (
                 newer.created_at > request.created_at
                 or (newer.created_at = request.created_at and newer.id > request.id)
               )
           )
         )
         or
         (
           (request.workspace_id is null or request.workspace_id = '')
           and not exists (
             select 1 from watch_requests newer
             where (newer.workspace_id is null or newer.workspace_id = '')
               and newer.status = 'active'
               and (newer.unsubscribed_at is null or newer.unsubscribed_at = '')
               and lower(trim(newer.email)) = lower(trim(request.email))
               and (
                 newer.created_at > request.created_at
                 or (newer.created_at = request.created_at and newer.id > request.id)
               )
           )
         )
       )
     order by request.created_at asc
     limit 250`,
  );
  const [
    recipientsResult,
    programsResult,
    evidenceResult,
    watchesResult,
    attemptsResult,
    sentItemsResult,
    sentBatchesResult,
    legacyImmediateResult,
  ] = await Promise.all([
    preferredWatchRequestId
      ? recipientStatement.bind(preferredWatchRequestId).all()
      : recipientStatement.all(),
    env.DB.prepare(
      `select
        catalog.program_id as programId,
        catalog.program_name as programName,
        catalog.organization,
        catalog.opportunity_type as opportunityType,
        catalog.class_years_json as classYears,
        catalog.role_tracks_json as roleTracks,
        catalog.timing,
        catalog.priority,
        case
          when state.last_checked_at is not null
            and (catalog.verified_at is null or state.last_checked_at > catalog.verified_at)
            then coalesce(state.confidence, catalog.confidence)
          else catalog.confidence
        end as confidence,
        case
          when state.last_checked_at is not null
            and (catalog.verified_at is null or state.last_checked_at > catalog.verified_at)
            then coalesce(state.status, catalog.current_status)
          else catalog.current_status
        end as status,
        catalog.open_date as openDate,
        catalog.deadline,
        catalog.short_description as shortDescription,
        catalog.eligibility_summary as eligibilitySummary,
        catalog.official_url as officialUrl,
        catalog.verified,
        catalog.verified_at as verifiedAt,
        case
          when state.last_checked_at is not null
            and (catalog.verified_at is null or state.last_checked_at > catalog.verified_at)
            then 'source_check'
          else 'curated_audit'
        end as statusEvidenceType,
        case
          when state.last_checked_at is not null
            and (catalog.verified_at is null or state.last_checked_at > catalog.verified_at)
            then state.last_checked_at
          else catalog.verified_at
        end as statusEvidenceAt,
        state.review_decision as statusReviewDecision,
        source.last_error_message as sourceError,
        schedule.curated_status as curatedStatus,
        schedule.curated_status_reviewed_at as curatedStatusReviewedAt,
        schedule.curated_open_date as curatedOpenDate,
        schedule.curated_deadline as curatedDeadline,
        case
          when state.last_checked_at is not null
            and (catalog.verified_at is null or state.last_checked_at > catalog.verified_at)
            then coalesce(state.last_changed_at, state.last_checked_at)
          else catalog.verified_at
        end as statusChangedAt,
        catalog.updated_at as updatedAt
       from program_delivery_catalog catalog
       inner join official_sources source
         on source.program_id = catalog.program_id and source.enabled = 1
       left join program_alert_states state on state.program_id = catalog.program_id
       left join source_schedule_profiles schedule on schedule.official_source_id = source.id
       where catalog.delivery_enabled = 1
         and catalog.verified = 1
         and catalog.monitoring_ready = 1
       group by catalog.program_id
       order by catalog.verified_at desc, catalog.program_name asc`,
    ).all(),
    env.DB.prepare(
      `select workspace_id as workspaceId, program_id as programId,
        relevance, relevance_source as relevanceSource, prior_awareness as priorAwareness
       from beta_program_evidence`,
    ).all(),
    env.DB.prepare(
      `select workspace_id as workspaceId, program_id as programId, is_watching as isWatching
       from beta_program_watches`,
    ).all(),
    env.DB.prepare(
      `select workspace_id as workspaceId, program_id as programId,
        cycle_label as cycleLabel, outcome, applied_at as appliedAt
       from beta_application_attempts
       order by applied_at desc`,
    ).all(),
    env.DB.prepare(
      `select
        batch.workspace_id as workspaceId,
        batch.watch_request_id as watchRequestId,
        item.program_id as programId,
        item.cycle_key as cycleKey,
        item.delivery_class as deliveryClass,
        item.dedupe_key as dedupeKey,
        batch.delivery_format as deliveryFormat
       from proactive_delivery_items item
       inner join proactive_delivery_batches batch on batch.id = item.batch_id
       where batch.status = 'sent'`,
    ).all(),
    env.DB.prepare(
      `select dedupe_key as dedupeKey
       from proactive_delivery_batches
       where status = 'sent'`,
    ).all(),
    env.DB.prepare(
      `select
        request.workspace_id as workspaceId,
        delivery.watch_request_id as watchRequestId,
        candidate.program_id as programId
       from alert_deliveries delivery
       inner join alert_candidates candidate on candidate.id = delivery.alert_candidate_id
       inner join watch_requests request on request.id = delivery.watch_request_id
       where delivery.status in ('sent', 'queued')`,
    ).all(),
  ]);

  const immediateProgramCyclesByRecipient = new Map();
  const programs = (programsResult.results || []).map((row) => ({
    ...row,
    classYears: parseJsonArray(row.classYears),
    roleTracks: parseJsonArray(row.roleTracks),
    verified: Boolean(row.verified),
  }));
  const programById = new Map(programs.map((program) => [program.programId, program]));
  for (const row of sentItemsResult.results || []) {
    if (row.deliveryFormat !== 'immediate') continue;
    const recipientKey = row.workspaceId || row.watchRequestId;
    if (!immediateProgramCyclesByRecipient.has(recipientKey)) {
      immediateProgramCyclesByRecipient.set(recipientKey, new Set());
    }
    immediateProgramCyclesByRecipient.get(recipientKey).add(
      `${row.programId}:${cleanString(row.cycleKey, 80) || 'unspecified'}`,
    );
  }

  for (const row of legacyImmediateResult.results || []) {
    const recipientKey = row.workspaceId || row.watchRequestId;
    const cycleKey = inferProgramCycleKey(programById.get(row.programId) || {});
    if (!immediateProgramCyclesByRecipient.has(recipientKey)) {
      immediateProgramCyclesByRecipient.set(recipientKey, new Set());
    }
    immediateProgramCyclesByRecipient.get(recipientKey).add(
      `${row.programId}:${cycleKey || 'unspecified'}`,
    );
  }

  const recipientByEmail = new Map();
  for (const row of recipientsResult.results || []) {
    const emailKey = cleanString(row.email, 320).toLowerCase();
    if (!emailKey) continue;
    const current = recipientByEmail.get(emailKey);
    const rowCreatedAt = Date.parse(row.createdAt || '') || 0;
    const currentCreatedAt = Date.parse(current?.createdAt || '') || 0;
    if (
      !current ||
      rowCreatedAt > currentCreatedAt ||
      (rowCreatedAt === currentCreatedAt && row.workspaceId && !current.workspaceId)
    ) {
      recipientByEmail.set(emailKey, { ...row });
    }
  }

  return {
    recipients: [...recipientByEmail.values()],
    programs,
    evidence: evidenceResult.results || [],
    watches: watchesResult.results || [],
    attempts: attemptsResult.results || [],
    sentItemDedupeKeys: new Set((sentItemsResult.results || []).map((row) => row.dedupeKey)),
    sentBatchDedupeKeys: new Set((sentBatchesResult.results || []).map((row) => row.dedupeKey)),
    immediateProgramCyclesByRecipient,
  };
}

function buildDeliveryRelationshipMap(recipient, inputs) {
  const relationships = new Map();
  if (!recipient.workspaceId) return relationships;

  const ensure = (programId) => {
    if (!relationships.has(programId)) relationships.set(programId, createEmptyDeliveryRelationship());
    return relationships.get(programId);
  };

  for (const evidence of inputs.evidence) {
    if (evidence.workspaceId !== recipient.workspaceId) continue;
    Object.assign(ensure(evidence.programId), {
      relevance: evidence.relevance,
      relevanceSource: evidence.relevanceSource,
      priorAwareness: evidence.priorAwareness,
    });
  }

  for (const watch of inputs.watches) {
    if (watch.workspaceId !== recipient.workspaceId) continue;
    ensure(watch.programId).isWatching = Boolean(watch.isWatching);
  }

  for (const attempt of inputs.attempts) {
    if (attempt.workspaceId !== recipient.workspaceId) continue;
    ensure(attempt.programId).applicationAttempts.push(attempt);
  }

  return relationships;
}

function createEmptyDeliveryRelationship() {
  return {
    relevance: '',
    relevanceSource: '',
    priorAwareness: '',
    isWatching: false,
    applicationAttempts: [],
  };
}

function isNewlyAvailableForProfile(program, recipient, nowIso) {
  const verifiedAt = Date.parse(program.verifiedAt || '');
  const requestCreatedAt = Date.parse(recipient.createdAt || '');
  const now = Date.parse(nowIso);
  const discoveryWindowMs = 45 * 24 * 60 * 60 * 1000;
  const newProfileWindowMs = 8 * 24 * 60 * 60 * 1000;
  return (
    (Number.isFinite(verifiedAt) && now - verifiedAt <= discoveryWindowMs) ||
    (Number.isFinite(requestCreatedAt) && now - requestCreatedAt <= newProfileWindowMs)
  );
}

function isProgramCycleInFuture(cycleKey, nowIso) {
  const year = cleanString(cycleKey, 80).match(/\b(20\d{2})\b/)?.[1];
  if (!year) return undefined;
  return Number(year) > new Date(nowIso).getUTCFullYear();
}

function isWeeklyDeliveryWindow(env, date) {
  const weekday = Math.max(0, Math.min(Number(env.PROACTIVE_DIGEST_WEEKDAY_UTC ?? 1), 6));
  const hour = Math.max(0, Math.min(Number(env.PROACTIVE_DIGEST_HOUR_UTC ?? 16), 23));
  return date.getUTCDay() === weekday && date.getUTCHours() === hour;
}

function getIsoWeekKey(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target - yearStart) / 86_400_000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function createProactiveDeliveryBatch(env, input) {
  const existing = await env.DB.prepare(
    `select id, status, updated_at as updatedAt
     from proactive_delivery_batches
     where dedupe_key = ?
     limit 1`,
  ).bind(input.dedupeKey).first();

  const batchDisposition = getDeliveryBatchDisposition(existing, Date.now());
  if (batchDisposition === 'suppress_sent' || batchDisposition === 'suppress_in_flight') {
    return { status: 'already_sent', batchId: existing.id };
  }

  const batchId = existing?.id || crypto.randomUUID();
  const engagementToken = createSecureToken();
  const engagementTokenHash = await sha256Hex(engagementToken);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `insert into proactive_delivery_batches (
      id, watch_request_id, workspace_id, delivery_class, delivery_format,
      entry_source, channel, status, period_key, dedupe_key,
      engagement_token_hash, eligible_item_count, attempted_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, 'email', 'planned', ?, ?, ?, ?, ?, ?)
    on conflict(dedupe_key) do update set
      engagement_token_hash = excluded.engagement_token_hash,
      status = 'planned',
      eligible_item_count = excluded.eligible_item_count,
      attempted_at = excluded.attempted_at,
      error_message = null,
      updated_at = excluded.updated_at`,
  ).bind(
    batchId,
    input.recipient.id,
    input.recipient.workspaceId,
    input.deliveryClass,
    input.deliveryFormat,
    input.entrySource,
    input.periodKey,
    input.dedupeKey,
    engagementTokenHash,
    input.items.length,
    now,
    now,
  ).run();

  await env.DB.prepare(
    `delete from proactive_delivery_items where batch_id = ?`,
  ).bind(batchId).run();

  const itemRows = [];
  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index];
    const itemId = crypto.randomUUID();
    await env.DB.prepare(
      `insert or ignore into proactive_delivery_items (
        id, batch_id, program_id, delivery_class, cycle_key, match_reason,
        match_score, status_snapshot, deadline_snapshot, official_url,
        next_step, dedupe_key, position
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      itemId,
      batchId,
      item.programId,
      item.deliveryClass,
      item.cycleKey || null,
      cleanString(item.matchReason, 240),
      Math.round(Number(item.score || 0)),
      cleanString(item.status, 80),
      cleanString(item.deadline, 240),
      cleanString(item.officialUrl, 500),
      buildDeliveryNextStep(item, input.recipient),
      item.dedupeKey,
      index + 1,
    ).run();
    const savedItem = await env.DB.prepare(
      `select id from proactive_delivery_items where dedupe_key = ? limit 1`,
    ).bind(item.dedupeKey).first();
    itemRows.push({ ...item, itemId: savedItem?.id || itemId });
  }

  return { status: 'planned', batchId, engagementToken, items: itemRows };
}

async function updateProactiveDeliveryBatch(env, batchId, delivery) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `update proactive_delivery_batches
     set status = ?, provider_message_id = ?, error_message = ?,
       sent_at = ?, updated_at = ?
     where id = ?`,
  ).bind(
    delivery.status,
    delivery.providerMessageId || '',
    delivery.errorMessage || '',
    delivery.status === 'sent' ? now : null,
    now,
    batchId,
  ).run();
}

async function sendProactiveImmediateEmail(env, recipient, prepared, item) {
  if (!env.EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      status: 'failed',
      errorMessage: 'Cloudflare Email binding or ALERT_FROM_EMAIL is not configured.',
    };
  }

  const proactiveItem = prepared.items?.[0] || item;
  return sendEmailAlert(
    env,
    {
      id: `focus-${prepared.batchId}`,
      programId: proactiveItem.programId,
      programName: proactiveItem.programName,
      organization: proactiveItem.organization,
      candidateType: proactiveItem.status === 'deadline' ? 'deadline' : 'opening',
      confidence: 'high',
      currentStatus: proactiveItem.status,
      deadline: proactiveItem.deadline,
      classYears: proactiveItem.classYears,
      url: proactiveItem.officialUrl,
      verified: proactiveItem.verified,
      statusEvidenceType: proactiveItem.statusEvidenceType,
      statusEvidenceAt: proactiveItem.statusEvidenceAt,
      statusReviewDecision: proactiveItem.statusReviewDecision,
      sourceError: proactiveItem.sourceError,
      curatedStatus: proactiveItem.curatedStatus,
      curatedStatusReviewedAt: proactiveItem.curatedStatusReviewedAt,
      curatedDeadline: proactiveItem.curatedDeadline,
      repeatCycle: proactiveItem.repeatCycle === true,
      summary: `Source-confirmed update for a program that ${proactiveItem.matchReason || 'matches My Focus'}.`,
    },
    recipient,
    recipient.email,
    prepared,
  );
}

async function sendProactiveDigestEmail(env, recipient, prepared, items) {
  if (!env.EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      status: 'failed',
      errorMessage: 'Cloudflare Email binding or ALERT_FROM_EMAIL is not configured.',
    };
  }

  const unsubscribeToken = await getOrCreateUnsubscribeToken(env, recipient);
  const message = buildProactiveDigestMessage(
    env,
    { ...recipient, unsubscribeToken },
    prepared,
    prepared.items || items,
  );

  try {
    const response = await env.EMAIL.send({
      to: recipient.email,
      from: { email: env.ALERT_FROM_EMAIL, name: env.ALERT_FROM_NAME || 'ApplyFirst' },
      replyTo: env.ALERT_REPLY_TO || env.ALERT_FROM_EMAIL,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.unsubscribeUrl
        ? {
            'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : undefined,
    });
    return { status: 'sent', providerMessageId: response?.messageId || '' };
  } catch (error) {
    return {
      status: 'failed',
      errorMessage: `${error.code ? `${error.code}: ` : ''}${error.message}`,
    };
  }
}

function toPublicDeliveryPreview(item, recipient = {}) {
  const copyState = buildDeliveryCopyState(item);
  return {
    programId: item.programId,
    programName: item.programName,
    organization: item.organization,
    deliveryClass: item.deliveryClass,
    status: item.status,
    deadline: item.deadline,
    matchReason: item.matchReason,
    cycleKey: item.cycleKey,
    copyState: copyState.stateKey,
    purposeLabel: copyState.purposeLabel,
    trustLine: copyState.trustLine,
    timingLabel: copyState.timingLabel,
    timingValue: copyState.timingValue,
    nextStep: buildDeliveryNextStep(item, recipient),
  };
}

function buildDeliveryNextStep(item, recipient = {}) {
  const copyState = buildDeliveryCopyState(item);
  const eligibility = buildDeliveryEligibilityState(item, recipient);

  if (['current_open', 'current_open_with_deadline'].includes(copyState.stateKey)) {
    if (item.repeatCycle === true) {
      return eligibility.hasKnownPartialMatch
        ? 'Applications are open again. Check the remaining requirements and apply again if it fits.'
        : 'Applications are open again. Review the official requirements and apply again if it fits.';
    }
    return eligibility.hasKnownPartialMatch
      ? 'Applications are open now. Check the remaining requirements and apply if it fits.'
      : 'Applications are open now. Review the official requirements and apply if it fits.';
  }
  if (copyState.stateKey === 'current_deadline') {
    return 'Review the official deadline and confirm the application is still accepting submissions.';
  }
  if (copyState.stateKey === 'expected_cycle') {
    return "Watch it in ApplyFirst and we'll keep monitoring for the next verified opening.";
  }
  if (copyState.stateKey === 'source_unavailable') {
    return 'ApplyFirst is rechecking the official source. Avoid relying on an older application window.';
  }
  if (item.newToApplyFirst === true) {
    return 'New to ApplyFirst. See whether this is worth following.';
  }
  if (item.isWatching === true) {
    return 'ApplyFirst will keep monitoring this program for meaningful future changes.';
  }
  return 'See whether this is worth following.';
}

function formatDeliveryPurpose(item = {}) {
  return buildDeliveryCopyState(item).purposeLabel;
}

function buildDigestFocusSummary(recipient = {}) {
  const focusDescription = buildFocusDescription(recipient);
  if (!focusDescription) return 'Picked from your selected preferences.';
  if (focusDescription.startsWith('students ')) return `Picked for ${focusDescription}.`;
  return `Picked for ${withIndefiniteArticle(focusDescription)}.`;
}

function buildDigestDescription(item = {}) {
  let description = cleanString(item.shortDescription, 1200).replace(/\s+/g, ' ').trim();
  if (!description) return '';

  const programName = cleanString(item.programName, 240);
  const organization = cleanString(item.organization, 240);
  const removablePrefixes = [
    organization && programName ? `${organization} ${programName} is ` : '',
    programName ? `${programName} is ` : '',
  ].filter(Boolean).sort((left, right) => right.length - left.length);

  const matchingPrefix = removablePrefixes.find((prefix) => (
    description.toLowerCase().startsWith(prefix.toLowerCase())
  ));
  if (matchingPrefix) {
    description = description.slice(matchingPrefix.length);
    description = description ? description[0].toUpperCase() + description.slice(1) : '';
  }

  const sentences = description.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  let summary = cleanString(sentences[0], 600).trim();
  const secondSentence = cleanString(sentences[1], 600).trim();
  if (summary.length < 80 && secondSentence && `${summary} ${secondSentence}`.length <= 180) {
    summary = `${summary} ${secondSentence}`;
  }

  return shortenDigestDescription(summary, 200);
}

function shortenDigestDescription(value, limit) {
  const normalized = cleanString(value, 1200).trim();
  if (normalized.length <= limit) return normalized;

  const clipped = normalized.slice(0, limit - 1);
  const clauseBoundary = Math.max(
    clipped.lastIndexOf(', '),
    clipped.lastIndexOf('; '),
    clipped.lastIndexOf(': '),
  );
  if (clauseBoundary >= 90) {
    return `${clipped.slice(0, clauseBoundary).replace(/[,;:]$/, '')}.`;
  }

  const wordBoundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, wordBoundary > 90 ? wordBoundary : limit - 4).trim()}...`;
}

function buildDigestMatchLabel(recipient = {}, item = {}) {
  if (item.isWatching === true) return 'On your watch list';

  const match = matchProgramToFocus(recipient, item);
  const rawClassYear = cleanString(recipient.classYear, 80);
  const rawRoleTrack = cleanString(recipient.roleTrack, 120);
  const classYearIsSpecific = Boolean(rawClassYear) && !/^all(?: class years?)?$/i.test(rawClassYear);
  const roleTrackIsSpecific = Boolean(rawRoleTrack) && !/^all(?: role tracks?)?$/i.test(rawRoleTrack);
  const parts = [];

  if (classYearIsSpecific && match.classMatch) parts.push(capitalizeFirst(rawClassYear));
  if (roleTrackIsSpecific && match.roleMatch) {
    parts.push(`${capitalizeFirst(formatFocusRoleTrack(rawRoleTrack))} interests`);
  }

  return parts.length ? parts.join(' · ') : 'Matches your selected preferences';
}

function withIndefiniteArticle(value) {
  return `${/^[aeiou]/i.test(value) ? 'an' : 'a'} ${value}`;
}

function capitalizeFirst(value) {
  const normalized = cleanString(value, 160);
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : '';
}

function buildDeliveryEligibilityState(item = {}, recipient = {}) {
  const classYear = cleanString(recipient.classYear, 80);
  const hasSpecificClassYear = Boolean(classYear) && !/^all(?: class years?)?$/i.test(classYear);
  const programClassYears = normalizeDeliveryEligibilityList(item.classYears);
  const includesAllClassYears = programClassYears.some((value) => (
    /^all(?: class years?)?$/i.test(value)
  ));
  const classYearMatches = hasSpecificClassYear && (
    includesAllClassYears || programClassYears.some((value) => (
      value.toLowerCase() === classYear.toLowerCase()
    ))
  );

  if (classYearMatches) {
    return {
      note: 'Your class year matches. Confirm the remaining requirements on the official source.',
      hasKnownPartialMatch: true,
    };
  }

  return {
    note: 'Confirm eligibility on the official program page.',
    hasKnownPartialMatch: false,
  };
}

function buildDeliveryEligibilityNote(item = {}, recipient = {}) {
  return buildDeliveryEligibilityState(item, recipient).note;
}

function buildDigestEligibilityNote(item = {}, recipient = {}) {
  return buildDeliveryEligibilityState(item, recipient).hasKnownPartialMatch
    ? 'Your class year matches'
    : 'Confirm on the official program page';
}

function shouldShowDigestEligibility(copyState = {}) {
  return [
    'current_open',
    'current_open_with_deadline',
    'current_deadline',
  ].includes(copyState.stateKey);
}

function normalizeDeliveryEligibilityList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item, 120)).filter(Boolean);
  }

  const raw = cleanString(value, 1200);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => cleanString(item, 120)).filter(Boolean)
      : [];
  } catch {
    return raw.split(',').map((item) => cleanString(item, 120)).filter(Boolean);
  }
}

function getSecondaryDeliveryCtaLabel(item = {}) {
  const stateKey = buildDeliveryCopyState(item).stateKey;
  return ['current_open', 'current_open_with_deadline', 'current_deadline'].includes(stateKey)
    ? 'View in ApplyFirst'
    : 'Watch in ApplyFirst';
}

async function sendCandidateNotifications(env, candidateId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const preferredWatchRequestId = cleanString(options.preferredWatchRequestId, 120);
  const candidate = await env.DB.prepare(
    `select
      alert_candidates.id,
      alert_candidates.program_id as programId,
      alert_candidates.candidate_type as candidateType,
      alert_candidates.title,
      alert_candidates.summary,
      alert_candidates.status,
      source_checks.suggested_confidence as confidence,
      source_checks.review_decision as statusReviewDecision,
      source_checks.created_at as statusEvidenceAt,
      source_checks.note as sourceCheckNote,
      program_alert_states.status as currentStatus,
      official_sources.program_name as programName,
      official_sources.organization,
      official_sources.url,
      official_sources.last_error_message as sourceError,
      source_schedule_profiles.curated_open_date as openDate,
      source_schedule_profiles.curated_deadline as deadline,
      source_schedule_profiles.curated_status as curatedStatus,
      source_schedule_profiles.curated_status_reviewed_at as curatedStatusReviewedAt,
      source_schedule_profiles.curated_deadline as curatedDeadline,
      'source_check' as statusEvidenceType
    from alert_candidates
    left join official_sources on official_sources.id = alert_candidates.official_source_id
    left join source_checks on source_checks.id = alert_candidates.source_check_id
    left join program_alert_states on program_alert_states.program_id = alert_candidates.program_id
    left join source_schedule_profiles on source_schedule_profiles.official_source_id = alert_candidates.official_source_id
    where alert_candidates.id = ?
    limit 1`,
  )
    .bind(candidateId)
    .first();

  if (!candidate) {
    throw httpError(404, 'Alert candidate not found.');
  }

  const recipients = await env.DB.prepare(
    `select distinct
      watch_requests.id,
      watch_requests.workspace_id as workspaceId,
      watch_requests.email,
      watch_requests.phone,
      watch_requests.preferred_contact_method as preferredContactMethod,
      watch_requests.unsubscribe_token as unsubscribeToken,
      watch_requests.raw_payload_json as rawPayloadJson
    from watch_requests
    inner join watch_request_programs
      on watch_request_programs.watch_request_id = watch_requests.id
    where watch_requests.status = 'active'
      and (watch_requests.unsubscribed_at is null or watch_requests.unsubscribed_at = '')
      and watch_request_programs.program_id = ?
      and (? = '' or watch_requests.id = ?)
      and (
        watch_requests.workspace_id is null
        or not exists (
          select 1 from beta_program_watches preference
          where preference.workspace_id = watch_requests.workspace_id
            and preference.program_id = watch_request_programs.program_id
        )
        or exists (
          select 1 from beta_program_watches preference
          where preference.workspace_id = watch_requests.workspace_id
            and preference.program_id = watch_request_programs.program_id
            and preference.is_watching = 1
        )
      )
    order by case when watch_requests.id = ? then 0 else 1 end,
      watch_requests.created_at asc
    limit 100`,
  )
    .bind(
      candidate.programId,
      preferredWatchRequestId,
      preferredWatchRequestId,
      preferredWatchRequestId,
    )
    .all();

  const deliveryResults = [];
  const seenDestinations = new Set();

  for (const recipient of recipients.results || []) {
    const rawPayload = parseJsonObject(recipient.rawPayloadJson);
    const contactMethod = normalizeContactMethod(
      recipient.preferredContactMethod || rawPayload.contactMethod,
      recipient.email,
      recipient.phone || rawPayload.phoneNumber,
    );

    if (['email', 'both'].includes(contactMethod) && recipient.email) {
      const deliveryKey = `email:${recipient.email.toLowerCase()}`;

      if (seenDestinations.has(deliveryKey)) {
        deliveryResults.push({
          channel: 'email',
          destination: recipient.email,
          status: 'skipped_duplicate',
        });
        continue;
      }

      seenDestinations.add(deliveryKey);

      const eligibility = await evaluateImmediateAlertEligibility(env, candidate, recipient);
      if (!eligibility.eligible) {
        deliveryResults.push({
          channel: 'email',
          destination: recipient.email,
          status: 'skipped_state',
          reason: eligibility.suppressionReason,
        });
        continue;
      }

      deliveryResults.push(
        await deliverAlert(env, {
          candidate: { ...candidate, repeatCycle: eligibility.repeatCycle },
          recipient,
          channel: 'email',
          destination: recipient.email,
          dryRun,
        }),
      );
    }

    const phone = normalizePhone(recipient.phone || rawPayload.phoneNumber);

    if (['phone', 'both'].includes(contactMethod) && phone) {
      if (env.SMS_ALERTS_ENABLED !== 'true') {
        deliveryResults.push({
          channel: 'phone',
          destination: phone,
          status: 'not_available',
        });
        continue;
      }

      const deliveryKey = `phone:${phone}`;

      if (seenDestinations.has(deliveryKey)) {
        deliveryResults.push({
          channel: 'phone',
          destination: phone,
          status: 'skipped_duplicate',
        });
        continue;
      }

      seenDestinations.add(deliveryKey);

      deliveryResults.push(
        await deliverAlert(env, {
          candidate,
          recipient,
          channel: 'phone',
          destination: phone,
          dryRun,
        }),
      );
    }
  }

  if (!dryRun && deliveryResults.some((result) => result.status === 'sent' || result.status === 'queued')) {
    const now = new Date().toISOString();
    const sentStatus = ['auto', 'already_open_on_watch'].includes(options.trigger) ? 'auto_sent' : 'sent';
    await env.DB.prepare(
      `update alert_candidates
       set status = ?,
           updated_at = ?
       where id = ?`,
    )
      .bind(sentStatus, now, candidate.id)
      .run();
  }

  return {
    ok: true,
    candidateId,
    dryRun,
    recipients: recipients.results?.length || 0,
    deliveries: deliveryResults,
  };
}

async function deliverAlert(env, { candidate, recipient, channel, destination, dryRun }) {
  const existingDelivery = await env.DB.prepare(
    `select id, status
     from alert_deliveries
     where alert_candidate_id = ?
       and watch_request_id = ?
       and channel = ?
     limit 1`,
  )
    .bind(candidate.id, recipient.id, channel)
    .first();

  if (existingDelivery && ['sent', 'queued'].includes(existingDelivery.status)) {
    return {
      channel,
      destination,
      status: 'already_sent',
      deliveryId: existingDelivery.id,
    };
  }

  if (dryRun) {
    return {
      channel,
      destination,
      status: 'ready',
    };
  }

  const proactiveContext = channel === 'email'
    ? await prepareImmediateDeliveryBatch(env, candidate, recipient)
    : null;

  if (proactiveContext?.status === 'already_sent') {
    return {
      channel,
      destination,
      status: 'already_sent',
      deliveryId: proactiveContext.batchId,
    };
  }

  const delivery = channel === 'phone'
    ? await sendPhoneAlert(env, candidate, recipient, destination)
    : await sendEmailAlert(env, candidate, recipient, destination, proactiveContext);

  if (proactiveContext?.batchId) {
    await updateProactiveDeliveryBatch(env, proactiveContext.batchId, delivery);
  }

  await recordAlertDelivery(env, {
    candidateId: candidate.id,
    watchRequestId: recipient.id,
    channel,
    destination,
    status: delivery.status,
    providerMessageId: delivery.providerMessageId,
    errorMessage: delivery.errorMessage,
  });

  return {
    channel,
    destination,
    ...delivery,
  };
}

async function sendEmailAlert(env, candidate, recipient, destination, proactiveContext = null) {
  if (!env.EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      status: 'not_configured',
      errorMessage: 'Cloudflare Email binding or ALERT_FROM_EMAIL is not configured.',
    };
  }

  const unsubscribeToken = await getOrCreateUnsubscribeToken(env, recipient);
  const message = buildAlertMessage(
    env,
    candidate,
    { ...recipient, unsubscribeToken },
    proactiveContext,
  );

  try {
    const response = await env.EMAIL.send({
      to: destination,
      from: { email: env.ALERT_FROM_EMAIL, name: env.ALERT_FROM_NAME || 'ApplyFirst' },
      replyTo: env.ALERT_REPLY_TO || env.ALERT_FROM_EMAIL,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.unsubscribeUrl
        ? {
            'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : undefined,
    });

    return {
      status: 'sent',
      providerMessageId: response?.messageId || '',
    };
  } catch (error) {
    return {
      status: 'failed',
      errorMessage: `${error.code ? `${error.code}: ` : ''}${error.message}`,
    };
  }
}

async function sendPhoneAlert(env, candidate, recipient, destination) {
  const provider = getSmsProvider(env);

  if ((!provider || provider === 'twilio') && hasTwilioSmsConfig(env)) {
    return sendTwilioSmsAlert(env, candidate, recipient, destination);
  }

  if ((!provider || provider === 'webhook') && env.SMS_WEBHOOK_URL) {
    return sendSmsWebhookAlert(env, candidate, recipient, destination);
  }

  return {
    status: 'not_configured',
    errorMessage:
      'SMS is not configured. Add Twilio secrets or SMS_WEBHOOK_URL before enabling text alerts.',
  };
}

function getSmsProvider(env) {
  return cleanString(env.SMS_PROVIDER || '', 40).toLowerCase();
}

function hasSmsDeliveryConfig(env) {
  const provider = getSmsProvider(env);

  if (provider === 'webhook') {
    return Boolean(env.SMS_WEBHOOK_URL);
  }

  if (provider === 'twilio') {
    return hasTwilioSmsConfig(env);
  }

  return hasTwilioSmsConfig(env) || Boolean(env.SMS_WEBHOOK_URL);
}

function hasTwilioSmsConfig(env) {
  return Boolean(
    env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_PHONE),
  );
}

async function sendTwilioSmsAlert(env, candidate, recipient, destination) {
  const accountSid = cleanString(env.TWILIO_ACCOUNT_SID, 160);
  const authToken = cleanString(env.TWILIO_AUTH_TOKEN, 240);
  const messagingServiceSid = cleanString(env.TWILIO_MESSAGING_SERVICE_SID, 160);
  const fromPhone = normalizePhone(env.TWILIO_FROM_PHONE);

  if (!accountSid || !authToken || (!messagingServiceSid && !fromPhone)) {
    return {
      status: 'not_configured',
      errorMessage:
        'Twilio SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_PHONE.',
    };
  }

  const unsubscribeToken = await getOrCreateUnsubscribeToken(env, recipient);
  const unsubscribeUrl = buildUnsubscribeUrl(env, { ...recipient, unsubscribeToken });
  const message = buildSmsMessage(candidate, unsubscribeUrl);
  const form = new URLSearchParams();

  form.set('To', destination);
  form.set('Body', message);

  if (messagingServiceSid) {
    form.set('MessagingServiceSid', messagingServiceSid);
  } else {
    form.set('From', fromPhone);
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: form.toString(),
    });
    const responseText = await response.text();
    const responseBody = parseJsonObject(responseText);

    if (!response.ok) {
      const twilioMessage = responseBody.message || responseBody.more_info || responseText;
      throw new Error(
        `Twilio SMS returned HTTP ${response.status}${twilioMessage ? `: ${cleanString(twilioMessage, 240)}` : ''}.`,
      );
    }

    return {
      status: 'queued',
      providerMessageId: responseBody.sid || '',
    };
  } catch (error) {
    return {
      status: 'failed',
      errorMessage: error.message,
    };
  }
}

async function sendSmsWebhookAlert(env, candidate, recipient, destination) {
  const unsubscribeToken = await getOrCreateUnsubscribeToken(env, recipient);
  const unsubscribeUrl = buildUnsubscribeUrl(env, { ...recipient, unsubscribeToken });
  const message = buildSmsMessage(candidate, unsubscribeUrl);
  const headers = { 'content-type': 'application/json' };

  if (env.SMS_WEBHOOK_TOKEN) {
    headers.authorization = `Bearer ${env.SMS_WEBHOOK_TOKEN}`;
  }

  try {
    const response = await fetch(env.SMS_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: destination,
        body: message,
        programId: candidate.programId,
        programName: candidate.programName,
        sourceUrl: candidate.url,
      }),
    });

    if (!response.ok) {
      throw new Error(`SMS webhook returned HTTP ${response.status}.`);
    }

    return {
      status: 'queued',
      providerMessageId: response.headers.get('x-message-id') || '',
    };
  } catch (error) {
    return {
      status: 'failed',
      errorMessage: error.message,
    };
  }
}

async function recordAlertDelivery(env, delivery) {
  await env.DB.prepare(
    `insert into alert_deliveries (
      id,
      alert_candidate_id,
      watch_request_id,
      channel,
      destination,
      status,
      provider_message_id,
      error_message,
      sent_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(alert_candidate_id, watch_request_id, channel) do update set
      status = excluded.status,
      provider_message_id = excluded.provider_message_id,
      error_message = excluded.error_message,
      sent_at = excluded.sent_at`,
  )
    .bind(
      crypto.randomUUID(),
      delivery.candidateId,
      delivery.watchRequestId,
      delivery.channel,
      delivery.destination,
      delivery.status,
      delivery.providerMessageId || '',
      delivery.errorMessage || '',
      ['sent', 'queued'].includes(delivery.status) ? new Date().toISOString() : null,
    )
    .run();
}

async function handleUnsubscribe(request, url, env) {
  const token = cleanString(url.searchParams.get('token'), 180);
  const requestId = cleanString(url.searchParams.get('requestId'), 120);

  if (!token && !requestId) {
    return new Response('Missing unsubscribe token.', {
      status: 400,
      headers: { ...corsHeaders(env), 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const result = await unsubscribeWatchRequest(env, {
    token,
    requestId,
    reason: request.method === 'POST' ? 'list_unsubscribe_post' : 'email_unsubscribe_link',
  });

  return new Response(renderUnsubscribePage(result), {
    status: 200,
    headers: {
      ...corsHeaders(env),
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function unsubscribeWatchRequest(env, { token, requestId, reason }) {
  const now = new Date().toISOString();
  const statement = token
    ? env.DB.prepare(
        `update watch_requests
         set status = 'unsubscribed',
             unsubscribed_at = ?,
             unsubscribe_reason = ?,
             updated_at = ?
         where unsubscribe_token = ?`,
      ).bind(now, reason, now, token)
    : env.DB.prepare(
        `update watch_requests
         set status = 'unsubscribed',
             unsubscribed_at = ?,
             unsubscribe_reason = ?,
             updated_at = ?
         where id = ?`,
      ).bind(now, reason, now, requestId);
  const result = await statement.run();
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);

  return {
    ok: changes > 0,
    unsubscribedAt: now,
  };
}

function renderUnsubscribePage(result) {
  const title = result.ok ? 'You Are Unsubscribed' : 'This Link Is No Longer Active';
  const message = result.ok
    ? 'ApplyFirst will stop sending alerts for this watch setup.'
    : 'This watch setup may already be unsubscribed, removed, or using an older link.';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)} | ApplyFirst</title>
    <style>
      body{margin:0;background:#f6f8fb;color:#17212f;font-family:Inter,Arial,sans-serif}
      main{min-height:100vh;display:grid;place-items:center;padding:24px}
      section{max-width:560px;background:#fff;border:1px solid #dce5ee;border-radius:16px;padding:28px;box-shadow:0 18px 42px rgba(23,33,47,.08)}
      span{display:inline-flex;margin-bottom:14px;color:#0f7f96;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      h1{margin:0 0 10px;font-size:30px;line-height:1.15}
      p{margin:0;color:#425066;line-height:1.6}
      a{display:inline-flex;margin-top:22px;color:#0f7f96;font-weight:800;text-decoration:none}
    </style>
  </head>
  <body>
    <main>
      <section>
        <span>ApplyFirst Alerts</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <a href="https://applyfirst-careers.pages.dev/">Return To ApplyFirst</a>
      </section>
    </main>
  </body>
</html>`;
}

function buildAlertEngagementPage(env, title, message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)} | ApplyFirst</title>
    <style>
      body{margin:0;background:#f6f8fb;color:#17212f;font-family:Inter,Arial,sans-serif}
      main{min-height:100vh;display:grid;place-items:center;padding:24px}
      section{max-width:560px;background:#fff;border:1px solid #dce5ee;border-radius:16px;padding:28px;box-shadow:0 18px 42px rgba(23,33,47,.08)}
      span{display:inline-flex;margin-bottom:14px;color:#0f7f96;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      h1{margin:0 0 10px;font-size:30px;line-height:1.15}
      p{margin:0;color:#425066;line-height:1.6}
      a{display:inline-flex;margin-top:22px;color:#0f7f96;font-weight:800;text-decoration:none}
    </style>
  </head>
  <body>
    <main>
      <section>
        <span>ApplyFirst Beta</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <a href="${escapeHtml(publicAppUrl(env))}">Return To ApplyFirst</a>
      </section>
    </main>
  </body>
</html>`;
}

async function getCount(env, tableName, whereClause = '') {
  const row = await env.DB.prepare(`select count(*) as count from ${tableName} ${whereClause ? `where ${whereClause}` : ''}`).first();
  return Number(row?.count || 0);
}

async function readJson(request, fallback) {
  try {
    return await request.json();
  } catch {
    if (fallback !== undefined) {
      return fallback;
    }
    throw httpError(400, 'Expected a JSON request body.');
  }
}

async function readTextWithLimit(response, maxBytes) {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let output = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (totalBytes + value.byteLength > maxBytes) {
      const remainingBytes = maxBytes - totalBytes;

      if (remainingBytes > 0) {
        output += decoder.decode(value.slice(0, remainingBytes), { stream: true });
      }

      await reader.cancel('ApplyFirst source byte limit reached.');
      return `${output}${decoder.decode()} ${SOURCE_TRUNCATION_NOTICE}`;
    }

    totalBytes += value.byteLength;
    output += decoder.decode(value, { stream: true });
  }

  return `${output}${decoder.decode()}`;
}

function extractSourceStatusSignals(sourceText, referenceDate = new Date()) {
  const currentYear = referenceDate.getUTCFullYear();
  const cycleYearSignals = findCycleYearSignals(sourceText);
  const cycleYears = uniqueStrings(cycleYearSignals.map((signal) => String(signal.year))).map((year) => Number(year));
  const hasCurrentOrFutureCycleYear = cycleYears.some((year) => year >= currentYear);
  const hasOnlyPastCycleYears = cycleYears.length > 0 && !hasCurrentOrFutureCycleYear;
  const hasOpenLanguage =
    /\b(apply now|applications? (are )?open|now accepting|currently accepting|accepting applications|submit your application|register now|registration (is )?open)\b/i.test(
      sourceText,
    );
  const hasClosedLanguage =
    /\b(registration (is )?(currently )?closed|applications? (are )?(currently )?closed|application cycle (is )?closed|no longer accepting|deadline has passed|submissions? (are )?closed)\b/i.test(
      sourceText,
    );
  const hasWarmupLanguage =
    /\b(open soon|coming soon|check back|next cycle|next application cycle|will open|opens on|opens in|interest form|join (our )?(mailing list|waitlist)|get notified)\b/i.test(
      sourceText,
    );

  return {
    cycleYears,
    cycleYearSignals: cycleYearSignals.slice(0, 6),
    hasCurrentOrFutureCycleYear,
    hasOnlyPastCycleYears,
    hasOpenLanguage,
    hasClosedLanguage,
    hasWarmupLanguage,
  };
}

function findCycleYearSignals(sourceText) {
  const matches = [...sourceText.matchAll(/\b20\d{2}\b/g)];
  const signals = [];
  const lower = sourceText.toLowerCase();
  const cycleContextPattern =
    /\b(apply|application|applications|deadline|deadlines|cohort|cycle|summer|spring|fall|winter|event|events|date|dates|program|fellowship|scholarship|academy|internship|winternship|registration)\b/i;

  for (const match of matches) {
    const year = Number(match[0]);
    const start = Math.max(match.index - 100, 0);
    const end = Math.min(match.index + match[0].length + 100, sourceText.length);
    const context = lower.slice(start, end).replace(/\s+/g, ' ').trim();

    if (!cycleContextPattern.test(context)) {
      continue;
    }

    signals.push({
      year,
      context: cleanString(context, 220),
    });
  }

  return signals;
}

function classifySourceText(sourceText, source, referenceDate = new Date()) {
  const pageAnalysis = classifySourcePageText(sourceText, source, referenceDate);
  return reconcileWithCuratedSourceStatus(pageAnalysis, sourceText, source, referenceDate);
}

function classifySourcePageText(sourceText, source, referenceDate = new Date()) {
  const normalized = sourceText.trim().replace(/\s+/g, ' ');
  const sourceSignals = extractSourceStatusSignals(normalized);
  const openWindow = findDateSignal(
    normalized,
    ['open', 'opens', 'applications open', 'apply by', 'will open', 'opens on', 'opens in'],
    false,
    referenceDate,
  );
  const deadline = findDateSignal(
    normalized,
    ['deadline', 'due', 'apply by', 'submit by', 'submit your application by', 'closes', 'close'],
    true,
    referenceDate,
  );
  const saysNotOpenYet =
    /\b(not yet open|not open yet|applications? (is |are )?not open|not currently accepting|not accepting applications|no longer taking applications|not currently open)\b/i.test(
      normalized,
    );
  const hasInformationalOpenMention =
    /\b(when|once|if|before|until)\s+applications?\s+(are\s+)?open\b/i.test(normalized) ||
    /\b(first|be first)\s+to\s+know\s+when\s+applications?\s+(are\s+)?open\b/i.test(normalized);
  const saysOpen =
    /\b(apply now|applications? (is |are )?open|applications? will close|now accepting|currently accepting|accepting applications|submit your application|register now|registration (is )?open|registration has opened|registrations? (are )?open)\b/i.test(
      normalized,
    ) &&
    !saysNotOpenYet &&
    !hasInformationalOpenMention;
  const saysClosed =
    /\b(registration (is )?(currently )?closed|registration has closed|registrations? (is |are )?(currently )?closed|currently closed|applications? (is |are )?(currently )?closed|application cycle (is )?closed|cycle (is )?closed|no longer accepting|deadline has passed|submissions? (is |are )?closed)\b/i.test(
      normalized,
    );
  const saysSoon = /\b(open soon|coming soon|applications? (are )?coming soon|will be back soon|check back|next cycle|next application cycle|will open|opens on|opens in)\b/i.test(
    normalized,
  );
  const hasInterestForm =
    /\b(expression of interest|register your interest|express interest|interest form|list of interested candidates|join (our )?(mailing list|waitlist)|notify me|get notified|notified as soon as (the )?(role|roles|application|applications) (go|goes) live|sign up for updates|stay informed)\b/i.test(
      normalized,
    );
  const saysReopenLater =
    /\b(applications? (will )?re-?open (at a later date|later)|applications? reopen later|sign up to be notified about upcoming sessions)\b/i.test(
      normalized,
    );
  const saysRolling =
    /\b(rolling basis|rolling applications|reviewed on a rolling basis|accepted on a rolling basis|ongoing applications?)\b/i.test(
      normalized,
    );
  const suggestsNextCycle = /\b(next cycle|future cycle|reopen|reopens|opens again|fall|spring|summer \d{4})\b/i.test(
    normalized,
  );
  const mentionsEligibility =
    /\b(freshman|first-year|sophomore|underclass|student|eligible|eligibility|class year)\b/i.test(normalized);
  const detectedDate = deadline || openWindow;
  const deadlineHasPassed = isDateBeforeReference(deadline, referenceDate);
  const staleDateSignal = isStaleDateSignal(detectedDate, referenceDate) || sourceSignals.hasOnlyPastCycleYears;
  const exactPostingNeeded = isExactPostingNeededSource(source, normalized);
  const analysisOptions = {
    sourceSignals,
  };

  if ((saysClosed || saysNotOpenYet) && saysOpen) {
    return buildAnalysis('Conflicting source signals', 'verifyManually', 'needsReview', 'Manual Review', '', source, normalized, deadline || openWindow, {
      ...analysisOptions,
      sourceState: 'Needs Review',
      sourceAction: 'Open the source manually because the page contains both open and closed language.',
    });
  }

  if (saysClosed) {
    return buildAnalysis('Registration closed', suggestsNextCycle || saysSoon ? 'expectedSoon' : 'watching', mentionsEligibility ? 'medium' : 'needsReview', 'Monitor Only', '', source, normalized, deadline || openWindow, {
      ...analysisOptions,
      sourceState: 'Closed',
      sourceAction: 'Keep monitoring the official source; do not send a student opening alert.',
    });
  }

  if (deadlineHasPassed && (saysOpen || deadline)) {
    return buildAnalysis('Deadline passed', 'watching', mentionsEligibility ? 'high' : 'medium', 'Monitor Only', '', source, normalized, deadline, {
      ...analysisOptions,
      sourceState: 'Closed',
      sourceAction: 'The detected application deadline has passed; keep watching for the next cycle.',
    });
  }

  if (hasKnownClosedFallback(source, normalized) && !saysOpen && !deadline && !openWindow) {
    return buildAnalysis('Registration closed', 'watching', 'medium', 'Monitor Only', '', source, normalized, deadline || openWindow, {
      ...analysisOptions,
      sourceState: 'Closed',
      sourceAction: 'Known official page is currently closed; keep watching for reopened registration language.',
    });
  }

  if (exactPostingNeeded) {
    return buildAnalysis('Exact posting needed', 'verifyManually', 'medium', 'Manual Review', '', source, normalized, deadline || openWindow, {
      ...analysisOptions,
      sourceState: 'Exact Posting Needed',
      sourceAction: 'Find or accept the specific posting URL before sending alerts to watched students.',
    });
  }

  if (hasInterestForm) {
    return buildAnalysis('Interest form only', 'watching', mentionsEligibility || openWindow ? 'medium' : 'needsReview', 'Monitor Only', '', source, normalized, openWindow, {
      ...analysisOptions,
      sourceState: 'Monitor',
      sourceAction: 'Keep watching; an interest form is useful but is not an application opening.',
    });
  }

  if (saysReopenLater) {
    return buildAnalysis('Applications will reopen later', 'watching', mentionsEligibility ? 'medium' : 'needsReview', 'Monitor Only', '', source, normalized, deadline || openWindow, {
      ...analysisOptions,
      sourceState: 'Monitor',
      sourceAction: 'Keep watching for the announced reopening; do not send an opening alert yet.',
    });
  }

  if (sourceSignals.hasOnlyPastCycleYears && !saysOpen && !deadline && !openWindow) {
    return buildAnalysis('Old-cycle signal', 'watching', mentionsEligibility ? 'medium' : 'needsReview', 'Monitor Only', '', source, normalized, '', {
      ...analysisOptions,
      sourceState: 'Old Cycle',
      sourceAction: 'The program page is useful context, but keep watching for a current application cycle.',
    });
  }

  if ((saysNotOpenYet || saysSoon) && !/\bapplications? will close\b/i.test(normalized)) {
    return buildAnalysis('Dates updated', 'expectedSoon', mentionsEligibility || openWindow ? 'medium' : 'needsReview', 'Prep Watch', 'prep_window', source, normalized, openWindow || deadline, {
      ...analysisOptions,
      sourceState: 'Warmup',
      sourceAction: 'Use this for preparation timing, not an opening alert yet.',
    });
  }

  if (staleDateSignal && (saysOpen || deadline || openWindow)) {
    return buildAnalysis('Old-cycle signal', suggestsNextCycle ? 'expectedSoon' : 'watching', mentionsEligibility ? 'medium' : 'needsReview', saysOpen ? 'Manual Review' : 'Monitor Only', '', source, normalized, detectedDate, {
      ...analysisOptions,
      sourceState: 'Old Cycle',
      sourceAction: 'Keep monitoring for the next cycle; do not treat this as a fresh opening.',
    });
  }

  if (saysRolling && saysOpen) {
    return buildAnalysis('Application opened', 'open', mentionsEligibility || deadline ? 'high' : 'medium', 'Alert Candidate', 'opening', source, normalized, deadline, {
      ...analysisOptions,
      sourceState: 'Open',
      sourceAction: 'Create an alert candidate; auto-send only when the signal is high-confidence and fresh.',
    });
  }

  if (saysOpen) {
    return buildAnalysis('Application opened', 'open', mentionsEligibility || openWindow || deadline ? 'high' : 'medium', 'Alert Candidate', 'opening', source, normalized, deadline || openWindow, {
      ...analysisOptions,
      sourceState: 'Open',
      sourceAction: 'Create an alert candidate; auto-send only when the signal is high-confidence and fresh.',
    });
  }

  if (deadline && !saysClosed) {
    return buildAnalysis('Dates updated', 'deadlineSoon', mentionsEligibility ? 'high' : 'medium', 'Deadline Candidate', 'deadline', source, normalized, deadline, {
      ...analysisOptions,
      sourceState: 'Deadline',
      sourceAction: 'Review the deadline before sending a reminder or updating the public card.',
    });
  }

  if (openWindow || saysRolling) {
    return buildAnalysis('Dates updated', saysRolling ? 'watching' : 'expectedSoon', mentionsEligibility || openWindow ? 'medium' : 'needsReview', 'Prep Watch', 'prep_window', source, normalized, openWindow, {
      ...analysisOptions,
      sourceState: 'Warmup',
      sourceAction: 'Track this as prep timing until the page confirms applications are open.',
    });
  }

  if (mentionsEligibility) {
    return buildAnalysis('Eligibility changed', 'verifyManually', 'medium', 'Manual Review', 'eligibility', source, normalized, '', {
      ...analysisOptions,
      sourceState: 'Needs Review',
      sourceAction: 'Review eligibility changes manually before changing the opportunity record.',
    });
  }

  return buildAnalysis('Needs follow-up', 'verifyManually', 'needsReview', 'Manual Review', '', source, normalized, '', {
    ...analysisOptions,
    sourceState: 'Needs Review',
    sourceAction: 'Open the official source manually because the fetched page did not expose enough timing signal.',
  });
}

function reconcileWithCuratedSourceStatus(analysis, sourceText, source, referenceDate) {
  const curatedStatus = cleanString(source.curated_status, 40);
  const reviewedAt = Date.parse(cleanString(source.curated_status_reviewed_at, 40));

  if (!curatedStatus || !Number.isFinite(reviewedAt)) {
    return analysis;
  }

  const normalized = sourceText.trim().replace(/\s+/g, ' ');
  const curatedDeadline = cleanString(source.curated_deadline, 240);
  const curatedSignal = findDateSignal(curatedDeadline, [], false, referenceDate);
  const curatedDeadlinePassed = isDateBeforeReference(curatedSignal, referenceDate);
  const temporalExpiry = getCuratedTemporalExpiry(source, referenceDate);
  const curatedDeadlineDate = parseDateSignal(curatedSignal, referenceDate);
  const reviewAgeMs = referenceDate.getTime() - reviewedAt;
  const reviewIsFresh = reviewAgeMs <= 45 * 24 * 60 * 60 * 1000;
  const reviewCoversActiveDeadline = Boolean(
    curatedDeadlineDate && curatedDeadlineDate.getTime() >= startOfUtcDay(referenceDate).getTime(),
  );

  if (
    temporalExpiry &&
    !hasIndependentCurrentTemporalSignal(analysis, referenceDate) &&
    !isExplicitNonActionableAnalysis(analysis)
  ) {
    return buildExpiredCuratedTemporalAnalysis(source, normalized, temporalExpiry, {
      sourceState: 'Monitor',
      sourceAction: 'The audited timing window has passed. Keep monitoring until the official source confirms a new current cycle.',
    });
  }

  if (!reviewIsFresh && !reviewCoversActiveDeadline) {
    return analysis;
  }

  const explicitClosedResult = [
    'Registration closed',
    'Deadline passed',
    'Applications will reopen later',
    'Interest form only',
  ].includes(analysis.result);

  if (curatedStatus === 'open') {
    if (explicitClosedResult || curatedDeadlinePassed) {
      return analysis;
    }

    return buildAnalysis(
      'Application opened',
      'open',
      'high',
      'Alert Candidate',
      'opening',
      source,
      normalized,
      curatedSignal || analysis.detectedSignal,
      {
        sourceSignals: analysis.sourceSignals,
        sourceState: 'Open',
        sourceAction: 'Use the recent official-page audit while continuing to monitor for a closing signal.',
      },
    );
  }

  if (curatedStatus === 'deadline') {
    if (explicitClosedResult || curatedDeadlinePassed) {
      return analysis;
    }

    return buildAnalysis(
      'Dates updated',
      'deadlineSoon',
      'high',
      'Deadline Candidate',
      'deadline',
      source,
      normalized,
      curatedSignal || analysis.detectedSignal,
      {
        sourceSignals: analysis.sourceSignals,
        sourceState: 'Deadline',
        sourceAction: 'Use the audited deadline and continue checking the official source for closure or replacement dates.',
      },
    );
  }

  if (curatedStatus === 'opening_soon') {
    if (analysis.reviewDecision === 'Alert Candidate' && analysis.suggestedConfidence === 'high') {
      return analysis;
    }

    if (explicitClosedResult && analysis.suggestedStatus !== 'expectedSoon') {
      return analysis;
    }

    return buildAnalysis(
      'Dates updated',
      'expectedSoon',
      'high',
      'Prep Watch',
      'prep_window',
      source,
      normalized,
      curatedSignal || analysis.detectedSignal,
      {
        sourceSignals: analysis.sourceSignals,
        sourceState: 'Warmup',
        sourceAction: 'Keep checking during the audited opening window; do not alert until the source clearly opens.',
      },
    );
  }

  if (curatedStatus === 'watching' && ['Alert Candidate', 'Deadline Candidate'].includes(analysis.reviewDecision)) {
    return buildAnalysis(
      'Source conflicts with recent audit',
      'verifyManually',
      'needsReview',
      'Manual Review',
      '',
      source,
      normalized,
      analysis.detectedSignal,
      {
        sourceSignals: analysis.sourceSignals,
        sourceState: 'Needs Review',
        sourceAction: 'Review the apparent opening manually because a recent official-page audit marked this cycle closed or watch-only.',
      },
    );
  }

  if (curatedStatus === 'needs_review') {
    return buildAnalysis(
      'Curated review required',
      'verifyManually',
      'needsReview',
      'Manual Review',
      '',
      source,
      normalized,
      analysis.detectedSignal,
      {
        sourceSignals: analysis.sourceSignals,
        sourceState: 'Needs Review',
        sourceAction: 'Keep this source in review until a maintainer confirms one unambiguous current-cycle application.',
      },
    );
  }

  return analysis;
}

function classifyFetchFailure(source, errorMessage, referenceDate = new Date()) {
  const temporalExpiry = getCuratedTemporalExpiry(source, referenceDate);

  if (temporalExpiry) {
    return buildExpiredCuratedTemporalAnalysis(source, errorMessage, temporalExpiry, {
      sourceState: 'Fetch Error',
      sourceAction: 'The audited timing window passed, so students see Monitoring while maintainers resolve the fetch error.',
    });
  }

  return {
    result: 'Needs follow-up',
    suggestedStatus: 'verifyManually',
    suggestedConfidence: 'needsReview',
    reviewDecision: 'Manual Review',
    candidateType: '',
    sourceState: 'Fetch Error',
    sourceAction: 'Open the official source manually or choose a lighter source URL before trusting alerts.',
    note: `Fetch failed for ${source.program_name}. ${errorMessage}`,
  };
}

function getCuratedTemporalExpiry(source, referenceDate = new Date()) {
  const curatedStatus = cleanString(source.curated_status, 40);
  const expirySource = ['open', 'deadline'].includes(curatedStatus)
    ? cleanString(source.curated_deadline, 240)
    : curatedStatus === 'opening_soon'
      ? cleanString(source.curated_open_date, 240)
      : '';
  const expirySignal = findDateSignal(expirySource, [], false, referenceDate);

  if (!expirySignal || !isDateBeforeReference(expirySignal, referenceDate)) {
    return null;
  }

  return {
    curatedStatus,
    expirySignal,
    result: curatedStatus === 'opening_soon' ? 'Audited opening window passed' : 'Deadline passed',
  };
}

function buildExpiredCuratedTemporalAnalysis(source, sourceText, temporalExpiry, options = {}) {
  return buildAnalysis(
    temporalExpiry.result,
    'watching',
    'medium',
    'Monitor Only',
    '',
    source,
    sourceText,
    temporalExpiry.expirySignal,
    options,
  );
}

function hasIndependentCurrentTemporalSignal(analysis, referenceDate) {
  if (
    analysis.reviewDecision === 'Alert Candidate' &&
    analysis.suggestedStatus === 'open' &&
    analysis.suggestedConfidence === 'high'
  ) {
    return !analysis.detectedSignal || !isDateBeforeReference(analysis.detectedSignal, referenceDate);
  }

  if (
    analysis.reviewDecision === 'Deadline Candidate' ||
    (analysis.reviewDecision === 'Prep Watch' && analysis.suggestedStatus === 'expectedSoon')
  ) {
    return Boolean(
      analysis.detectedSignal && !isDateBeforeReference(analysis.detectedSignal, referenceDate),
    );
  }

  return false;
}

function isExplicitNonActionableAnalysis(analysis) {
  return [
    'Registration closed',
    'Deadline passed',
    'Applications will reopen later',
    'Interest form only',
    'Old-cycle signal',
  ].includes(analysis.result);
}

function buildAnalysis(result, suggestedStatus, suggestedConfidence, reviewDecision, candidateType, source, sourceText, detectedSignal, options = {}) {
  const signalCopy = detectedSignal ? ` Detected signal: ${detectedSignal}.` : '';
  const excerpt = sourceText.slice(0, 220);
  const sourceState = options.sourceState || inferSourceState(result, suggestedStatus, reviewDecision);
  const sourceAction = options.sourceAction || getSourceAction(sourceState);

  return {
    result,
    suggestedStatus,
    suggestedConfidence,
    reviewDecision,
    candidateType,
    sourceState,
    sourceAction,
    detectedSignal,
    sourceSignals: options.sourceSignals || null,
    note: `${source.program_name}: ${result}. ${reviewDecision} created from official source monitoring.${signalCopy} Review before sending any student alert. Excerpt: ${excerpt}${sourceText.length > 220 ? '...' : ''}`,
  };
}

function inferSourceState(result, suggestedStatus, reviewDecision) {
  if (result === 'Application opened' && suggestedStatus === 'open') {
    return 'Open';
  }

  if (result === 'Registration closed') {
    return 'Closed';
  }

  if (result === 'Old-cycle signal') {
    return 'Old Cycle';
  }

  if (result === 'Exact posting needed') {
    return 'Exact Posting Needed';
  }

  if (reviewDecision === 'Deadline Candidate') {
    return 'Deadline';
  }

  if (reviewDecision === 'Prep Watch') {
    return 'Warmup';
  }

  if (reviewDecision === 'Monitor Only') {
    return 'Monitor';
  }

  return 'Needs Review';
}

function getSourceAction(sourceState) {
  switch (sourceState) {
    case 'Open':
      return 'Create an alert candidate; auto-send only when the signal is high-confidence and fresh.';
    case 'Closed':
      return 'Keep monitoring the official source; do not send a student opening alert.';
    case 'Old Cycle':
      return 'Keep monitoring for the next cycle; do not treat this as a fresh opening.';
    case 'Exact Posting Needed':
      return 'Find or accept the specific posting URL before sending alerts to watched students.';
    case 'Deadline':
      return 'Review the deadline before sending a reminder or updating the public card.';
    case 'Warmup':
      return 'Use this for preparation timing, not an opening alert yet.';
    case 'Monitor':
      return 'Keep watching; this source is useful but not alert-ready.';
    case 'Fetch Error':
      return 'Open the official source manually or choose a lighter source URL before trusting alerts.';
    default:
      return 'Open the official source manually because the fetched page did not expose enough timing signal.';
  }
}

function isExactPostingNeededSource(source, normalizedText) {
  if (!isBroadJobBoardUrl(source.url)) {
    return false;
  }

  if (!hasProgramTitleSignal(source, normalizedText)) {
    return false;
  }

  return /\b(current openings|open positions|job openings|current jobs|view openings|apply|application|internship|winternship|fellowship)\b/i.test(
    normalizedText,
  );
}

function hasKnownClosedFallback(source, normalizedText) {
  const programId = cleanString(source.program_id, 160);

  if (programId !== 'jpmorgan-career-ed-you-watch') {
    return false;
  }

  const searchableText = normalizeSignalMatchText(`${source.url} ${source.program_name} ${normalizedText}`);

  return (
    searchableText.includes('career edyou') ||
    searchableText.includes('career ed you') ||
    (searchableText.includes('jpmorgan') && searchableText.includes('sophomore'))
  );
}

function isBroadJobBoardUrl(value) {
  const host = getUrlHost(value);

  if (!host || !JOB_BOARD_HOSTS.has(host)) {
    return false;
  }

  try {
    const url = new URL(value);
    const pathParts = url.pathname.split('/').filter(Boolean);
    return pathParts.length <= 1;
  } catch {
    return true;
  }
}

function hasProgramTitleSignal(source, normalizedText) {
  const title = cleanString(source.program_name, 180);

  if (!title) {
    return false;
  }

  const normalizedTitle = normalizeSignalMatchText(title);
  const normalizedSource = normalizeSignalMatchText(normalizedText);

  if (normalizedTitle && normalizedSource.includes(normalizedTitle)) {
    return true;
  }

  const tokens = significantDiscoveryTokens(title).filter((token) => token.length >= 4);
  const matchedTokens = tokens.filter((token) => normalizedSource.includes(token)).length;

  return tokens.length > 0 && matchedTokens >= Math.min(2, tokens.length);
}

function normalizeSignalMatchText(value) {
  return cleanString(value, MAX_STORED_TEXT)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findDateSignal(sourceText, nearbyWords, requireNearby = false, referenceDate = new Date()) {
  const datePattern =
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi;
  const matches = [...sourceText.matchAll(datePattern)];

  if (!matches.length) {
    return '';
  }

  const lower = sourceText.toLowerCase();
  const nearbyMatches = matches.filter((match) => {
    const start = Math.max(match.index - 90, 0);
    const end = Math.min(match.index + match[0].length + 90, sourceText.length);
    const context = lower.slice(start, end);
    return nearbyWords.some((word) => context.includes(word));
  });
  const candidates = nearbyMatches.length ? nearbyMatches : requireNearby ? [] : matches;

  if (!candidates.length) {
    return '';
  }

  const referenceDay = startOfUtcDay(referenceDate);
  const datedCandidates = candidates
    .map((match) => ({ match, date: parseDateSignal(match[0], referenceDate) }))
    .filter((candidate) => candidate.date);

  if (!datedCandidates.length) {
    return candidates[0][0];
  }

  const futureCandidate = datedCandidates
    .filter((candidate) => candidate.date.getTime() >= referenceDay.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  if (futureCandidate) {
    return futureCandidate.match[0];
  }

  return datedCandidates.sort((a, b) => b.date.getTime() - a.date.getTime())[0].match[0];
}

function startOfUtcDay(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isDateBeforeReference(signal, referenceDate = new Date()) {
  const parsedDate = parseDateSignal(signal, referenceDate);
  return Boolean(parsedDate && parsedDate.getTime() < startOfUtcDay(referenceDate).getTime());
}

function isStaleDateSignal(signal, referenceDate = new Date()) {
  const parsedDate = parseDateSignal(signal, referenceDate);

  if (!parsedDate) {
    return false;
  }

  const staleCutoff = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
  );
  staleCutoff.setUTCDate(staleCutoff.getUTCDate() - 45);

  return parsedDate.getTime() < staleCutoff.getTime();
}

function parseDateSignal(signal, referenceDate) {
  if (!signal) {
    return null;
  }

  const normalized = signal.toLowerCase().replace(/\./g, '');
  const monthNumbers = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };
  const monthDateMatch = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/,
  );

  if (monthDateMatch) {
    const month = monthNumbers[monthDateMatch[1]];
    const day = Number(monthDateMatch[2]);
    const year = monthDateMatch[3] ? Number(monthDateMatch[3]) : referenceDate.getUTCFullYear();

    if (Number.isInteger(month) && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day));
    }
  }

  const numericDateMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);

  if (numericDateMatch) {
    const month = Number(numericDateMatch[1]) - 1;
    const day = Number(numericDateMatch[2]);
    let year = numericDateMatch[3] ? Number(numericDateMatch[3]) : referenceDate.getUTCFullYear();

    if (year < 100) {
      year += 2000;
    }

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day));
    }
  }

  return null;
}

function normalizePageText(sourceText) {
  return sourceText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeWatchedPrograms(value) {
  return arrayify(value)
    .map((program) => {
      if (typeof program === 'string') {
        return { id: program, name: program };
      }

      return {
        id: cleanString(program.id || program.programId, 120),
        name: cleanString(program.name, 180),
        organization: cleanString(program.organization, 160),
        url: cleanString(program.url || program.officialUrl, 500),
        readiness: cleanString(program.readiness, 120),
        reason: cleanString(program.reason, 260),
      };
    })
    .filter((program) => program.id || program.name);
}

function arrayify(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => cleanString(value, 120)).filter(Boolean))];
}

function cleanString(value, maxLength) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().slice(0, maxLength);
}

function sanitizeClientErrorField(value, maxLength) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/\bAF-[A-Z0-9][A-Z0-9-]{4,58}[A-Z0-9]\b/gi, '[invite-code]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/https?:\/\/[^\s)\]}>'"]+/gi, '[url]')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeClientErrorStatus(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePhone(value) {
  const phone = cleanString(value, 40).replace(/[^\d+]/g, '');
  const digits = phone.replace(/\D/g, '');

  if (phone.startsWith('+')) {
    return phone;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return phone;
}

function normalizeContactMethod(value, email, phone) {
  const normalized = cleanString(value, 20).toLowerCase();

  if (['email', 'phone', 'both'].includes(normalized)) {
    return normalized;
  }

  if (email && phone) {
    return 'email';
  }

  return phone ? 'phone' : 'email';
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeAccessCode(value) {
  return cleanString(value, 80).toUpperCase().replace(/\s+/g, '');
}

async function hashAccessCode(value) {
  return sha256Hex(`applyfirst-beta-workspace:${normalizeAccessCode(value)}`);
}

function createAccessCodeLabel(value) {
  const accessCode = normalizeAccessCode(value);

  if (!accessCode) {
    return '';
  }

  return `...${accessCode.slice(-4)}`;
}

function normalizeEventTimestamp(value) {
  const timestamp = cleanString(value, 80);
  const parsed = Date.parse(timestamp);

  if (!timestamp || !Number.isFinite(parsed)) {
    return new Date().toISOString();
  }

  const now = Date.now();
  const bounded = Math.min(Math.max(parsed, now - 7 * 24 * 60 * 60 * 1000), now + 5 * 60 * 1000);
  return new Date(bounded).toISOString();
}

function normalizeProductEventContext(value) {
  const context = value && typeof value === 'object' ? value : {};
  const unsupportedFields = Object.keys(context).filter((field) => !PRODUCT_EVENT_CONTEXT_FIELDS.has(field));

  if (unsupportedFields.length) {
    throw httpError(400, 'Unsupported product event context field.');
  }

  const providedEntrySource = cleanString(context.entrySource, 80).toLowerCase();
  const entrySource = providedEntrySource
    ? normalizeDeliveryEntrySource(providedEntrySource, '')
    : '';

  if (providedEntrySource && !entrySource) {
    throw httpError(400, 'Unsupported delivery entry source.');
  }

  const deliveryToken = cleanString(context.deliveryToken, 240);
  if (deliveryToken && !/^[A-Za-z0-9_-]{32,240}$/.test(deliveryToken)) {
    throw httpError(400, 'Invalid delivery context token.');
  }

  return {
    view: cleanString(context.view, 40),
    source: cleanString(context.source, 80),
    status: cleanString(context.status, 60),
    resultCount: normalizeMetricNumber(context.resultCount),
    queryLength: normalizeMetricNumber(context.queryLength),
    entrySource,
    deliveryToken,
  };
}

async function resolveProductEventContext(env, workspaceId, programId, context) {
  const resolved = { ...context };
  const token = cleanString(resolved.deliveryToken, 240);
  delete resolved.deliveryToken;

  if (!token) {
    return resolved;
  }

  if (!programId) {
    throw httpError(400, 'Delivery context requires a program event.');
  }

  const tokenHash = await sha256Hex(token);
  const delivery = await env.DB.prepare(
    `select
      batch.id as batchId,
      batch.entry_source as entrySource
     from proactive_delivery_batches batch
     inner join proactive_delivery_items item on item.batch_id = batch.id
     where batch.engagement_token_hash = ?
       and batch.workspace_id = ?
       and item.program_id = ?
       and batch.status = 'sent'
     limit 1`,
  )
    .bind(tokenHash, workspaceId, programId)
    .first();

  if (!delivery?.batchId) {
    throw httpError(400, 'Delivery context is invalid or expired.');
  }

  resolved.entrySource = normalizeDeliveryEntrySource(delivery.entrySource);
  resolved.deliveryBatchId = cleanString(delivery.batchId, 120);
  return resolved;
}

function normalizeOptionalEnum(value, allowedValues, label) {
  const normalized = cleanString(value, 80).toLowerCase();

  if (!normalized) {
    return '';
  }

  if (!allowedValues.has(normalized)) {
    throw httpError(400, `Choose a supported ${label}.`);
  }

  return normalized;
}

function normalizeRequiredEnum(value, allowedValues, label) {
  const normalized = normalizeOptionalEnum(value, allowedValues, label);

  if (!normalized) {
    throw httpError(400, `Choose a supported ${label}.`);
  }

  return normalized;
}

function normalizeNullableBoolean(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value === true || value === 1 || value === '1' || value === 'true') {
    return 1;
  }

  if (value === false || value === 0 || value === '0' || value === 'false') {
    return 0;
  }

  throw httpError(400, 'Use true, false, or leave this audit field blank.');
}

function normalizeOptionalTimestamp(value) {
  const normalized = cleanString(value, 80);

  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(normalized);

  if (!Number.isFinite(timestamp)) {
    throw httpError(400, 'Use a valid date and time.');
  }

  return new Date(timestamp).toISOString();
}

function buildApplicationAttemptKey(cycleLabel, appliedAt) {
  const normalizedCycle = cleanString(cycleLabel, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const appliedYear = /^\d{4}/.test(cleanString(appliedAt, 80))
    ? cleanString(appliedAt, 80).slice(0, 4)
    : '';

  return `ordinary:${normalizedCycle || (appliedYear ? `year-${appliedYear}` : 'unspecified')}`;
}

function normalizeDateOnly(value) {
  const normalized = cleanString(value, 20);

  if (!normalized) {
    return '';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(Date.parse(`${normalized}T00:00:00Z`))) {
    throw httpError(400, 'Use a valid date in YYYY-MM-DD format.');
  }

  return normalized;
}

function isEligibleActivation({ relevance }) {
  return PROGRAM_RELEVANCE_VALUES.has(relevance);
}

function calculateTimingEvidence(rows, actionRows = rows) {
  const uniqueRows = dedupeRows(rows, (row) => `${row.workspaceId}:${row.programId}`);
  const leadDays = [];
  let relevantWithoutDeadline = 0;

  for (const row of uniqueRows) {
    const deadlineAt = parseTimestamp(row.deadlineAt);
    const firstRelevantAt = parseTimestamp(row.firstRelevantAt);

    if (!deadlineAt) {
      relevantWithoutDeadline += 1;
    } else if (firstRelevantAt && deadlineAt >= firstRelevantAt) {
      leadDays.push((deadlineAt - firstRelevantAt) / (24 * 60 * 60 * 1000));
    }

  }

  const actionsByPair = new Map();
  for (const row of actionRows) {
    if (!EXTERNAL_ACTION_VALUES.has(cleanString(row.actionState, 80))) continue;
    const key = `${row.workspaceId}:${row.programId}`;
    const actionAt = parseTimestamp(row.actionAt);
    const deadlineAt = parseTimestamp(row.deadlineAt);
    if (!actionAt || !deadlineAt) continue;
    const existing = actionsByPair.get(key);
    actionsByPair.set(key, {
      workspaceId: row.workspaceId,
      deadlineAt,
      earliestActionAt: existing ? Math.min(existing.earliestActionAt, actionAt) : actionAt,
    });
  }
  const timelyRows = [...actionsByPair.values()].filter((row) => row.earliestActionAt <= row.deadlineAt);
  const timelyStudents = new Set(timelyRows.map((row) => row.workspaceId));

  return {
    discoveryLeadTime: summarizeNumericValues(leadDays, relevantWithoutDeadline),
    timelyExternalAction: {
      students: timelyStudents.size,
      programPairs: timelyRows.length,
      denominator: actionsByPair.size,
      status: actionsByPair.size ? 'available' : 'not_available',
    },
  };
}

function calculateElapsedHours(rows, startKey, endKey) {
  const values = rows
    .map((row) => {
      const start = parseTimestamp(row[startKey]);
      const end = parseTimestamp(row[endKey]);
      return start && end && end >= start ? (end - start) / (60 * 60 * 1000) : null;
    })
    .filter((value) => value !== null);

  return summarizeNumericValues(values, rows.length - values.length);
}

function calculateRelevantWindowReturn(rows, now = Date.now()) {
  const responseWindowMs = 48 * 60 * 60 * 1000;
  const eligibleRows = rows.filter((row) => {
    const sentAt = parseTimestamp(row.sentAt);
    return sentAt && now - sentAt >= responseWindowMs;
  });
  const returnedStudents = new Set();
  const sourceClickStudents = new Set();
  const feedbackStudents = new Set();
  const actionStudents = new Set();
  const eligibleStudents = new Set();

  for (const row of eligibleRows) {
    eligibleStudents.add(row.workspaceId);
    if (Number(row.returned)) returnedStudents.add(row.workspaceId);
    if (Number(row.sourceClicked)) sourceClickStudents.add(row.workspaceId);
    if (Number(row.feedbackGiven)) feedbackStudents.add(row.workspaceId);
    if (Number(row.externalAction)) actionStudents.add(row.workspaceId);
  }

  return {
    status: eligibleRows.length ? 'available' : 'not_available',
    observationWindowHours: 48,
    eligibleStudents: eligibleStudents.size,
    eligibleAlerts: eligibleRows.length,
    returnedStudents: returnedStudents.size,
    sourceClickStudents: sourceClickStudents.size,
    feedbackStudents: feedbackStudents.size,
    externalActionStudents: actionStudents.size,
    immatureAlerts: rows.length - eligibleRows.length,
  };
}

function calculateAccuracyCoverage(rows) {
  const fields = ['statusCorrect', 'deadlineCorrect', 'eligibilityCorrect', 'urlCorrect', 'freshnessCorrect', 'alertCorrect'];
  const byField = {};
  let numerator = 0;
  let denominator = 0;

  for (const field of fields) {
    const observed = rows.filter((row) => row[field] !== null && row[field] !== undefined);
    const correct = observed.filter((row) => Number(row[field]) === 1).length;
    byField[field] = { numerator: correct, denominator: observed.length };
    numerator += correct;
    denominator += observed.length;
  }

  return { numerator, denominator, auditedRecords: rows.length, byField };
}

function calculateKnownOpeningCoverage(rows) {
  const observed = rows.filter((row) => row.detected !== null && row.detected !== undefined);

  return {
    numerator: observed.filter((row) => Number(row.detected) === 1).length,
    denominator: observed.length,
    unaudited: rows.length - observed.length,
  };
}

function calculateNotificationLatency(rows) {
  const groups = { all: [], automatic: [], manual: [] };

  for (const row of rows) {
    const detectedAt = parseTimestamp(row.detectedAt);
    const sentAt = parseTimestamp(row.sentAt);

    if (!detectedAt || !sentAt || sentAt < detectedAt) {
      continue;
    }

    const hours = (sentAt - detectedAt) / (60 * 60 * 1000);
    groups.all.push(hours);
    groups[row.deliveryPath === 'automatic' ? 'automatic' : 'manual'].push(hours);
  }

  return {
    all: summarizeNumericValues(groups.all, rows.length - groups.all.length),
    automatic: summarizeNumericValues(groups.automatic, 0),
    manual: summarizeNumericValues(groups.manual, 0),
  };
}

function summarizeNumericValues(values, unavailableCount = 0) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);

  if (!sorted.length) {
    return { status: 'not_available', count: 0, unavailableCount, median: null, min: null, max: null };
  }

  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;

  return {
    status: 'available',
    count: sorted.length,
    unavailableCount,
    median: roundMetric(median),
    min: roundMetric(sorted[0]),
    max: roundMetric(sorted.at(-1)),
  };
}

function parseTimestamp(value) {
  const timestamp = Date.parse(cleanString(value, 80));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function roundMetric(value) {
  return Math.round(value * 10) / 10;
}

function dedupeRows(rows, keyForRow) {
  const rowsByKey = new Map();
  for (const row of rows) rowsByKey.set(keyForRow(row), row);
  return [...rowsByKey.values()];
}

function normalizeGroupedRows(rows) {
  return (rows || []).map((row) => ({
    label: cleanString(row.label, 120),
    students: Number(row.students || 0),
    records: Number(row.records || 0),
  }));
}

function normalizeSegmentRows(rows) {
  return (rows || []).map((row) => ({
    label: cleanString(row.label, 160),
    students: Number(row.students || 0),
  }));
}

function normalizeTimeRows(rows) {
  const entries = Object.fromEntries(
    (rows || []).map((row) => [cleanString(row.category, 80), Number(row.minutes || 0)]),
  );
  const entryCount = (rows || []).reduce((sum, row) => sum + Number(row.entries || 0), 0);

  return {
    monitoringReview: entries.monitoring_review || 0,
    dataCorrection: entries.data_correction || 0,
    userSupport: entries.user_support || 0,
    total: Object.values(entries).reduce((sum, minutes) => sum + minutes, 0),
    entryCount,
    status: entryCount ? 'available' : 'not_available',
  };
}

function normalizeMetricNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(Math.round(number), 10_000)) : null;
}

function normalizeCountRows(rows, key) {
  return (rows || []).map((row) => ({
    [key]: cleanString(row[key], 120),
    participants: Number(row.participants || 0),
    events: Number(row.events || row.responses || 0),
  }));
}

function normalizeWorkspaceState(value) {
  const state = value && typeof value === 'object' ? value : {};
  const alertPrefs = state.alertPrefs && typeof state.alertPrefs === 'object' ? state.alertPrefs : {};
  const betaAlertSetup = state.betaAlertSetup && typeof state.betaAlertSetup === 'object' ? state.betaAlertSetup : null;
  const waitlistIntent = state.waitlistIntent && typeof state.waitlistIntent === 'object' ? state.waitlistIntent : null;
  const onboardingProgress = state.onboardingProgress && typeof state.onboardingProgress === 'object' ? state.onboardingProgress : {};
  const betaOutcome = state.betaOutcome && typeof state.betaOutcome === 'object' ? state.betaOutcome : null;

  return {
    savedIds: uniqueStrings(arrayify(state.savedIds)).slice(0, 100),
    watchIntentProgramIds: uniqueStrings(arrayify(state.watchIntentProgramIds)).slice(0, 100),
    alertPrefs: {
      classYear: cleanString(alertPrefs.classYear, 80),
      roleTrack: cleanString(alertPrefs.roleTrack, 120),
      priority: cleanString(alertPrefs.priority || 'all', 80),
      notificationMode: cleanString(alertPrefs.notificationMode || 'waitlist', 80),
      sendTiming: cleanString(alertPrefs.sendTiming, 80),
    },
    betaAlertSetup: betaAlertSetup
      ? {
          classYear: cleanString(betaAlertSetup.classYear, 80),
          roleTrack: cleanString(betaAlertSetup.roleTrack, 120),
          priority: cleanString(betaAlertSetup.priority || 'all', 80),
          sendTiming: cleanString(betaAlertSetup.sendTiming, 80),
          email: cleanString(betaAlertSetup.email, 180).toLowerCase(),
          phoneNumber: normalizePhone(betaAlertSetup.phoneNumber),
          contactMethod: cleanString(betaAlertSetup.contactMethod || 'email', 20),
          captureStatus: cleanString(betaAlertSetup.captureStatus, 120),
          savedAt: cleanString(betaAlertSetup.savedAt, 80),
          watchedProgramIds: uniqueStrings(arrayify(betaAlertSetup.watchedProgramIds)).slice(0, 100),
        }
      : null,
    waitlistIntent: waitlistIntent
      ? {
          email: cleanString(waitlistIntent.email, 180).toLowerCase(),
          classYear: cleanString(waitlistIntent.classYear, 120),
          interest: cleanString(waitlistIntent.interest, 160),
          school: cleanString(waitlistIntent.school, 160),
          note: cleanString(waitlistIntent.note, 800),
          captureStatus: cleanString(waitlistIntent.captureStatus, 120),
          savedAt: cleanString(waitlistIntent.savedAt, 80),
        }
      : null,
    onboardingProgress: {
      browsed: Boolean(onboardingProgress.browsed),
      saved: Boolean(onboardingProgress.saved),
      focused: Boolean(onboardingProgress.focused),
      alerted: Boolean(onboardingProgress.alerted),
      improved: Boolean(onboardingProgress.improved),
      dismissed: Boolean(onboardingProgress.dismissed),
    },
    betaOutcome: betaOutcome && PRODUCT_OUTCOMES.has(cleanString(betaOutcome.outcome, 80))
      ? {
          outcome: cleanString(betaOutcome.outcome, 80),
          updatedAt: cleanString(betaOutcome.updatedAt, 80),
        }
      : null,
    savedAt: cleanString(state.savedAt, 80) || new Date().toISOString(),
  };
}

function buildAlertMessage(env, candidate, recipient, proactiveContext = null) {
  const programName = candidate.programName || candidate.title || 'Tracked Program';
  const sourceUrl = candidate.url || publicAppUrl(env);
  const unsubscribeUrl = buildUnsubscribeUrl(env, recipient);
  const proactiveItem = proactiveContext?.items?.[0];
  const proactiveLinks = proactiveContext?.engagementToken && proactiveItem
    ? buildProactiveDeliveryLinks(env, proactiveContext, proactiveItem)
    : null;
  const trackedSourceUrl = proactiveLinks?.source || buildAlertEngagementUrl(env, candidate, recipient, 'source_clicked') || sourceUrl;
  const programUrl = proactiveLinks?.program || `${publicAppUrl(env)}/?view=monitor&program=${encodeURIComponent(candidate.programId)}`;
  const feedbackUrls = proactiveLinks || {
    useful: buildAlertEngagementUrl(env, candidate, recipient, 'useful'),
    notRelevant: buildAlertEngagementUrl(env, candidate, recipient, 'not_relevant'),
    alreadyKnew: buildAlertEngagementUrl(env, candidate, recipient, 'already_knew'),
    inaccurate: buildAlertEngagementUrl(env, candidate, recipient, 'inaccurate'),
  };
  const alertCopy = buildStudentAlertCopy(candidate, recipient);
  const matchExplanation = alertCopy.repeatCycle
    ? 'You previously applied to this program and kept it on Watch.'
    : proactiveItem?.matchReason || 'You asked ApplyFirst to watch this program.';
  const subject = alertCopy.subject;
  const text = [
    alertCopy.header,
    '',
    alertCopy.summary,
    '',
    'Why you are seeing this:',
    matchExplanation,
    alertCopy.eligibilityNote,
    '',
    `Applications: ${alertCopy.applicationStatus}`,
    `${alertCopy.timingLabel}: ${alertCopy.timingValue}`,
    `Trust: ${alertCopy.trustLine}`,
    '',
    `Official source: ${trackedSourceUrl}`,
    `View in ApplyFirst: ${programUrl}`,
    '',
    `Beta alert: ${alertCopy.betaNote}`,
    '',
    'Was this alert useful?',
    feedbackUrls.useful ? `Useful: ${feedbackUrls.useful}` : '',
    feedbackUrls.notRelevant ? `Not relevant: ${feedbackUrls.notRelevant}` : '',
    feedbackUrls.alreadyKnew ? `Already knew: ${feedbackUrls.alreadyKnew}` : '',
    feedbackUrls.inaccurate ? `Information looks wrong: ${feedbackUrls.inaccurate}` : '',
    '',
    `Unsubscribe from ApplyFirst alerts: ${unsubscribeUrl}`,
  ].join('\n');
  const html = `
    <div style="margin:0;padding:0;background:#f6f8fb">
      <div style="max-width:620px;margin:0 auto;padding:28px 18px;font-family:Inter,Arial,sans-serif;color:#17212f;line-height:1.55">
        <div style="background:#ffffff;border:1px solid #dce5ee;border-radius:14px;padding:24px;box-shadow:0 12px 30px rgba(23,33,47,0.06)">
          <p style="margin:0 0 10px;color:#0f7f96;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase">ApplyFirst ${escapeHtml(alertCopy.label)}</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.22;color:#111827">${escapeHtml(alertCopy.headline)}</h1>
          <p style="margin:0 0 18px;color:#425066;font-size:15px">${escapeHtml(alertCopy.summary)}</p>
          <div style="margin:0 0 20px;padding:14px 16px;border-radius:10px;background:#f7fbfc;border:1px solid #dcebf0">
            <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:800">Why you are seeing this</p>
            <p style="margin:0 0 10px;color:#425066;font-size:14px">${escapeHtml(matchExplanation)}</p>
            <p style="margin:0 0 10px;color:#5b6472;font-size:13px">${escapeHtml(alertCopy.eligibilityNote)}</p>
            <p style="margin:0 0 4px;color:#425066;font-size:14px"><strong style="color:#17212f">Applications:</strong> ${escapeHtml(alertCopy.applicationStatus)}</p>
            <p style="margin:0 0 4px;color:#425066;font-size:14px"><strong style="color:#17212f">${escapeHtml(alertCopy.timingLabel)}:</strong> ${escapeHtml(alertCopy.timingValue)}</p>
            <p style="margin:0;color:#5b6472;font-size:12px;font-weight:700">${escapeHtml(alertCopy.trustLine)}</p>
          </div>
          <p style="margin:0 0 20px">
            <a href="${escapeHtml(trackedSourceUrl)}" style="display:inline-block;background:#17212f;color:#ffffff;text-decoration:none;border-radius:8px;padding:11px 18px;font-size:14px;font-weight:800">View Official Source</a>
            <a href="${escapeHtml(programUrl)}" style="display:inline-block;margin-left:10px;color:#0f7f96;text-decoration:none;font-size:13px;font-weight:800">View in ApplyFirst</a>
          </p>
          <p style="margin:0 0 14px;color:#5b6472;font-size:13px"><strong style="color:#17212f">Beta alert:</strong> ${escapeHtml(alertCopy.betaNote)}</p>
          ${feedbackUrls.useful ? `
          <div style="margin:0 0 18px;padding-top:16px;border-top:1px solid #e5e7eb">
            <p style="margin:0 0 9px;color:#17212f;font-size:13px;font-weight:800">Was this alert useful?</p>
            <p style="margin:0;color:#5b6472;font-size:12px;line-height:1.8">
              <a href="${escapeHtml(feedbackUrls.useful)}" style="color:#0f7f96">Useful</a>
              &nbsp;·&nbsp;
              <a href="${escapeHtml(feedbackUrls.notRelevant)}" style="color:#0f7f96">Not relevant</a>
              &nbsp;·&nbsp;
              <a href="${escapeHtml(feedbackUrls.alreadyKnew)}" style="color:#0f7f96">Already knew</a>
              &nbsp;·&nbsp;
              <a href="${escapeHtml(feedbackUrls.inaccurate)}" style="color:#0f7f96">Information looks wrong</a>
            </p>
          </div>` : ''}
          <p style="margin:0;color:#6b7280;font-size:12px">You are receiving this through your ApplyFirst alert setup. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#2563eb">Unsubscribe from ApplyFirst alerts</a>.</p>
        </div>
      </div>
    </div>
  `;

  return {
    subject,
    text,
    html,
    unsubscribeUrl,
  };
}

function buildProactiveDigestMessage(env, recipient, prepared, items) {
  const subject = `${items.length} ${items.length === 1 ? 'opportunity' : 'opportunities'} worth a look this week`;
  const focusSummary = buildDigestFocusSummary(recipient);
  const unsubscribeUrl = buildUnsubscribeUrl(env, recipient);
  const textItems = items.flatMap((item, index) => {
    const links = buildProactiveDeliveryLinks(env, prepared, item);
    const shortDescription = buildDigestDescription(item);
    const copyState = buildDeliveryCopyState(item);
    const matchLabel = buildDigestMatchLabel(recipient, item);
    const eligibilityNote = shouldShowDigestEligibility(copyState)
      ? buildDigestEligibilityNote(item, recipient)
      : '';
    return [
      `${index + 1}. ${copyState.purposeLabel}: ${item.programName}${item.organization ? ` — ${item.organization}` : ''}`,
      shortDescription,
      `Why it fits: ${matchLabel}`,
      eligibilityNote ? `Eligibility: ${eligibilityNote}` : '',
      `${copyState.timingLabel}: ${copyState.timingValue}`,
      `Next step: ${buildDeliveryNextStep(item, recipient)}`,
      `Official source: ${links.source}`,
      `${getSecondaryDeliveryCtaLabel(item)}: ${links.program}`,
      `Good match? Yes ${links.useful} | No ${links.notRelevant} | Already knew ${links.alreadyKnew}`,
      `Report incorrect info: ${links.inaccurate}`,
      '',
    ];
  });
  const text = [
    subject,
    '',
    focusSummary,
    '',
    ...textItems,
    `Unsubscribe from ApplyFirst alerts: ${unsubscribeUrl}`,
  ].join('\n');
  const htmlItems = items.map((item) => {
    const links = buildProactiveDeliveryLinks(env, prepared, item);
    const shortDescription = buildDigestDescription(item);
    const copyState = buildDeliveryCopyState(item);
    const matchLabel = buildDigestMatchLabel(recipient, item);
    const eligibilityNote = shouldShowDigestEligibility(copyState)
      ? buildDigestEligibilityNote(item, recipient)
      : '';
    const secondaryCtaLabel = getSecondaryDeliveryCtaLabel(item);
    return `
      <div style="padding:18px 0;border-top:1px solid #e5e7eb">
        <p style="margin:0 0 4px;color:#0f7f96;font-size:12px;font-weight:800;text-transform:uppercase">${escapeHtml(copyState.purposeLabel)}</p>
        <h2 style="margin:0 0 4px;color:#111827;font-size:19px;line-height:1.3">${escapeHtml(item.programName)}</h2>
        ${item.organization ? `<p style="margin:0 0 10px;color:#5b6472;font-size:13px">${escapeHtml(item.organization)}</p>` : ''}
        ${shortDescription ? `<p style="margin:0 0 8px;color:#425066;font-size:14px">${escapeHtml(shortDescription)}</p>` : ''}
        <p style="margin:0 0 5px;color:#425066;font-size:14px"><strong style="color:#17212f">Why it fits:</strong> ${escapeHtml(matchLabel)}</p>
        ${eligibilityNote ? `<p style="margin:0 0 5px;color:#5b6472;font-size:13px"><strong style="color:#425066">Eligibility:</strong> ${escapeHtml(eligibilityNote)}</p>` : ''}
        <p style="margin:0 0 12px;color:#425066;font-size:14px"><strong style="color:#17212f">${escapeHtml(copyState.timingLabel)}:</strong> ${escapeHtml(copyState.timingValue)}</p>
        <p style="margin:0 0 14px;color:#425066;font-size:14px">${escapeHtml(buildDeliveryNextStep(item, recipient))}</p>
        <p style="margin:0 0 12px">
          <a href="${escapeHtml(links.source)}" style="display:inline-block;background:#17212f;color:#ffffff;text-decoration:none;border-radius:8px;padding:10px 15px;font-size:13px;font-weight:800">View Official Source</a>
          <a href="${escapeHtml(links.program)}" style="display:inline-block;margin-left:8px;color:#0f7f96;text-decoration:none;font-size:13px;font-weight:800">${escapeHtml(secondaryCtaLabel)}</a>
        </p>
        <p style="margin:0 0 4px;color:#6b7280;font-size:12px">
          <strong style="color:#425066">Good match?</strong>
          &nbsp;<a href="${escapeHtml(links.useful)}" style="color:#0f7f96">Yes</a>
          &nbsp;·&nbsp;<a href="${escapeHtml(links.notRelevant)}" style="color:#0f7f96">No</a>
          &nbsp;·&nbsp;<a href="${escapeHtml(links.alreadyKnew)}" style="color:#0f7f96">Already knew</a>
        </p>
        <p style="margin:0;color:#8a94a3;font-size:11px"><a href="${escapeHtml(links.inaccurate)}" style="color:#6b7280">Report incorrect info</a></p>
      </div>`;
  }).join('');
  const html = `
    <div style="margin:0;padding:0;background:#f6f8fb">
      <div style="max-width:620px;margin:0 auto;padding:28px 18px;font-family:Inter,Arial,sans-serif;color:#17212f;line-height:1.55">
        <div style="background:#ffffff;border:1px solid #dce5ee;border-radius:14px;padding:24px;box-shadow:0 12px 30px rgba(23,33,47,0.06)">
          <p style="margin:0 0 8px;color:#0f7f96;font-size:12px;font-weight:800;text-transform:uppercase">ApplyFirst Weekly Update</p>
          <h1 style="margin:0 0 10px;font-size:24px;line-height:1.22;color:#111827">${escapeHtml(subject)}</h1>
          <p style="margin:0 0 4px;color:#425066;font-size:14px">${escapeHtml(focusSummary)}</p>
          ${htmlItems}
          <p style="margin:16px 0 0;color:#6b7280;font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#2563eb">Unsubscribe from ApplyFirst alerts</a>.</p>
        </div>
      </div>
    </div>`;

  return { subject, text, html, unsubscribeUrl };
}

function buildProactiveDeliveryLinks(env, prepared, item) {
  const baseUrl = `${watchWorkerUrl(env)}/delivery/engagement`;
  const makeUrl = (action) => {
    const url = new URL(baseUrl);
    url.searchParams.set('token', prepared.engagementToken);
    url.searchParams.set('itemId', item.itemId);
    url.searchParams.set('action', action);
    return url.toString();
  };

  return {
    source: makeUrl('source_clicked'),
    program: makeUrl('program_opened'),
    useful: makeUrl('useful'),
    notRelevant: makeUrl('not_relevant'),
    alreadyKnew: makeUrl('already_knew'),
    inaccurate: makeUrl('inaccurate'),
  };
}

function buildStudentAlertCopy(candidate, recipient = {}) {
  const programName = candidate.programName || candidate.title || 'This program';
  const detectedSignal = extractDetectedSignal(candidate.summary || candidate.sourceCheckNote);
  const copyState = buildDeliveryCopyState({
    ...candidate,
    status: candidate.currentStatus || candidate.status,
    officialUrl: candidate.url || candidate.officialUrl,
    detectedSignal,
    verified: candidate.verified !== false,
  });
  const verifiedOpen = ['current_open', 'current_open_with_deadline'].includes(copyState.stateKey);
  const verifiedDeadline = copyState.stateKey === 'current_deadline';
  const repeatCycle = candidate.repeatCycle === true && verifiedOpen;
  const label = verifiedOpen ? 'Opening Signal' : verifiedDeadline ? 'Deadline Signal' : 'Monitoring Update';
  const headline = repeatCycle
    ? `${programName} applications are open again`
    : verifiedOpen
      ? `${programName} is now open`
      : verifiedDeadline
        ? `${programName} has a verified deadline`
        : `${programName} has a monitoring update`;
  const headlineSuffix = repeatCycle
    ? 'applications are open again'
    : verifiedOpen
      ? 'is now open'
      : verifiedDeadline
        ? 'has a verified deadline'
        : 'has a monitoring update';
  const summary = repeatCycle
    ? 'A new application cycle is now open. ApplyFirst detected the current opening on the official source.'
    : verifiedOpen
      ? 'Applications are now open. ApplyFirst detected the current opening on the official source.'
      : verifiedDeadline
        ? 'ApplyFirst detected a current application deadline on the official source. Confirm that submissions are still being accepted.'
        : copyState.stateKey === 'expected_cycle'
          ? 'ApplyFirst has expected cycle timing for this program, but applications are not confirmed open.'
          : copyState.stateKey === 'source_unavailable'
            ? 'ApplyFirst could not confirm current timing from the official source and is continuing to monitor it.'
            : 'The official program source is confirmed, but current application timing is not.';

  return {
    label,
    header: `ApplyFirst ${label.toLowerCase()}`,
    headline,
    headlineSuffix,
    subject: headline,
    summary,
    applicationStatus: verifiedOpen ? 'Open' : 'Confirm current status on the official source',
    timingLabel: copyState.timingLabel,
    timingValue: copyState.timingValue,
    trustLine: copyState.trustLine,
    eligibilityNote: buildDeliveryEligibilityNote(candidate, recipient),
    repeatCycle,
    betaNote: verifiedOpen
      ? 'Current status verified on the official source. Confirm final eligibility and requirements before applying.'
      : verifiedDeadline
        ? 'Current deadline verified on the official source. Confirm application status and eligibility before applying.'
        : copyState.sourceConfirmed
          ? 'Official program source confirmed. Current application timing still needs confirmation.'
          : 'Official source confirmation is still in progress. Check the linked source before acting.',
  };
}

function extractDetectedSignal(summary) {
  const match = cleanString(summary, 1200).match(/Detected signal:\s*([^.]*)\./i);

  if (!match) {
    return '';
  }

  return cleanString(match[1], 120);
}

function buildSmsMessage(candidate, unsubscribeUrl = '') {
  const programName = candidate.programName || candidate.title || 'Tracked program';
  const sourceUrl = candidate.url || '';
  const alertCopy = buildStudentAlertCopy(candidate);

  return [
    `ApplyFirst: ${programName} ${alertCopy.headlineSuffix}.`,
    `Verify on the official source: ${sourceUrl}`,
    unsubscribeUrl ? `Manage alerts: ${unsubscribeUrl}` : '',
    'Reply STOP to opt out.',
  ]
    .filter(Boolean)
    .join(' ');
}

async function getOrCreateUnsubscribeToken(env, recipient) {
  const existingToken = cleanString(recipient.unsubscribeToken, 180);

  if (existingToken) {
    return existingToken;
  }

  const token = createSecureToken();

  try {
    await env.DB.prepare(
      `update watch_requests
       set unsubscribe_token = ?,
           updated_at = ?
       where id = ?
         and (unsubscribe_token is null or unsubscribe_token = '')`,
    )
      .bind(token, new Date().toISOString(), recipient.id)
      .run();

    const row = await env.DB.prepare(
      `select unsubscribe_token
       from watch_requests
       where id = ?
       limit 1`,
    )
      .bind(recipient.id)
      .first();

    return cleanString(row?.unsubscribe_token || token, 180);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'unsubscribe_token_create_failed',
        watchRequestId: recipient.id,
        error: error.message,
      }),
    );
    return '';
  }
}

function buildUnsubscribeUrl(env, recipient) {
  const token = cleanString(recipient.unsubscribeToken, 180);
  const baseUrl = `${watchWorkerUrl(env)}/watch/unsubscribe`;

  if (token) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }

  return `${baseUrl}?requestId=${encodeURIComponent(recipient.id)}`;
}

function buildAlertEngagementUrl(env, candidate, recipient, action) {
  const token = cleanString(recipient.unsubscribeToken, 180);
  const requestId = cleanString(recipient.id, 120);
  const candidateId = cleanString(candidate.id, 120);

  if (!token || !requestId || !candidateId || !ALERT_ENGAGEMENT_ACTIONS.has(action)) {
    return '';
  }

  const url = new URL(`${watchWorkerUrl(env)}/watch/engagement`);
  url.searchParams.set('requestId', requestId);
  url.searchParams.set('candidateId', candidateId);
  url.searchParams.set('token', token);
  url.searchParams.set('action', action);
  return url.toString();
}

function publicAppUrl(env) {
  return (env.PUBLIC_APP_URL || 'https://applyfirst-careers.pages.dev').replace(/\/$/, '');
}

function watchWorkerUrl(env) {
  return (env.WATCH_WORKER_PUBLIC_URL || env.PUBLIC_APP_URL || 'https://applyfirst-careers.pages.dev').replace(/\/$/, '');
}

function escapeHtml(value) {
  return cleanString(value, 2000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function requireDatabase(env) {
  if (!env.DB) {
    throw httpError(500, 'D1 binding DB is missing.');
  }
}

async function requireAdminToken(request, env) {
  if (!env.WATCH_ADMIN_TOKEN) {
    throw httpError(503, 'WATCH_ADMIN_TOKEN is not configured.');
  }

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token || !timingSafeEqual(token, env.WATCH_ADMIN_TOKEN)) {
    throw httpError(401, 'Admin token required.');
  }
}

function timingSafeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(String(left || ''));
  const rightBytes = encoder.encode(String(right || ''));
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return diff === 0;
}

function createSecureToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(env, body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      ...corsHeaders(env),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

export {
  buildApplicationAttemptKey,
  buildAlertMessage,
  buildReadinessItem,
  buildProactiveDigestMessage,
  calculateAccuracyCoverage,
  calculateKnownOpeningCoverage,
  calculateNotificationLatency,
  calculateRelevantWindowReturn,
  calculateTimingEvidence,
  classifyFetchFailure,
  classifySourceText,
  getCuratedTemporalExpiry,
  isEligibleActivation,
  runProactiveDelivery,
  shouldRunScheduledProactiveDelivery,
};
