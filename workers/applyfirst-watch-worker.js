const MAX_SOURCE_BYTES = 250_000;
const MAX_STORED_TEXT = 80_000;
const DEFAULT_MONITOR_LIMIT = 12;
const DEFAULT_DISCOVERY_SEARCH_LIMIT = 5;
const DEFAULT_DISCOVERY_QUERIES_PER_PROGRAM = 3;
const DEFAULT_DISCOVERY_RESULTS_PER_QUERY = 5;
const AUTO_SENDABLE_CONFIDENCES = new Set(['high']);
const DISCOVERY_SEARCH_PROVIDERS = new Set(['brave', 'tavily']);
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
  },
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const candidateSendMatch = url.pathname.match(/^\/watch\/candidates\/([^/]+)\/send$/);
  const discoveryCandidateReviewMatch = url.pathname.match(/^\/watch\/discovery\/candidates\/([^/]+)\/review$/);

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

    if (request.method === 'GET' && url.pathname === '/watch/unsubscribe') {
      return handleUnsubscribe(url, env);
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
        trigger: 'manual',
      });
      return jsonResponse(env, result);
    }

    return jsonResponse(env, { ok: false, error: 'Not found.' }, { status: 404 });
  } catch (error) {
    const status = error.status || 500;
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
  const now = new Date().toISOString();
  const watchedPrograms = normalizeWatchedPrograms(body.watchedPrograms);
  const watchedProgramIds = uniqueStrings([
    ...arrayify(body.watchedProgramIds),
    ...watchedPrograms.map((program) => program.id),
    ...arrayify(body.savedProgramIds),
  ]).slice(0, 50);

  await env.DB.prepare(
    `insert into watch_requests (
      id,
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
      status,
      raw_payload_json
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
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
          'I agree to receive ApplyFirst beta opening alerts for programs I choose to watch.',
        260,
      ),
      numberOrZero(body.matchCount),
      numberOrZero(body.alertReadyCount),
      numberOrZero(body.savedCount),
      numberOrZero(body.needsSourceCheck),
      cleanString(body.requestedAt || body.savedAt || now, 80),
      'active',
      JSON.stringify({
        matchingProgramIds: arrayify(body.matchingProgramIds).slice(0, 100),
        alertReadyProgramIds: arrayify(body.alertReadyProgramIds).slice(0, 100),
        savedProgramIds: arrayify(body.savedProgramIds).slice(0, 100),
        contactMethod: preferredContactMethod,
        phoneNumber: phone,
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
    message: 'Watch request saved. ApplyFirst will check official sources and email high-confidence opening signals.',
  };
}

async function runMonitoring(env, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_MONITOR_LIMIT, 50));
  const generatedAt = new Date().toISOString();
  const sources = await getSourcesForMonitoring(env, {
    limit,
    now: generatedAt,
    force: Boolean(options.force),
  });

  const checks = [];

  for (const source of sources) {
    checks.push(await checkOfficialSource(env, source));
  }

  return {
    ok: true,
    trigger: options.trigger || 'manual',
    force: Boolean(options.force),
    checked: checks.length,
    changed: checks.filter((check) => check.changed).length,
    alertCandidates: checks.filter((check) => check.newAlertCandidate).length,
    manualReview: checks.filter((check) => check.reviewDecision === 'Manual Review').length,
    generatedAt,
    checks,
  };
}

async function getSourcesForMonitoring(env, { limit, now, force }) {
  const dueFilter = force
    ? ''
    : `and (
        source_schedule_profiles.next_check_at is null
        or source_schedule_profiles.next_check_at = ''
        or source_schedule_profiles.next_check_at <= ?
      )`;
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
      group by watch_request_programs.program_id
    ) watched
      on watched.program_id = official_sources.program_id
    where official_sources.enabled = 1
      ${dueFilter}
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
  const statement = env.DB.prepare(query);
  const result = force ? await statement.bind(limit).all() : await statement.bind(now, limit).all();

  return result.results || [];
}

async function checkOfficialSource(env, source) {
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
    ? {
        result: 'Needs follow-up',
        suggestedStatus: 'verifyManually',
        suggestedConfidence: 'needsReview',
        reviewDecision: 'Manual Review',
        candidateType: '',
        note: `Fetch failed for ${source.program_name}. ${errorMessage}`,
      }
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

  const nextSchedule = await upsertSourceScheduleAfterCheck(env, {
    source,
    detectedStatus,
    analysis,
    checkedAt: fetchedAt,
    errorMessage,
  });

  return {
    programId: source.program_id,
    name: source.program_name,
    url: source.url,
    changed,
    result: analysis.result,
    reviewDecision: analysis.reviewDecision,
    newAlertCandidate,
    status: detectedStatus,
    autoAlerted: hasSuccessfulDelivery(autoSendResult),
    schedulePhase: nextSchedule.currentPhase,
    nextCheckAt: nextSchedule.nextCheckAt,
    nextDiscoveryAt: nextSchedule.nextDiscoveryAt,
    error: errorMessage || null,
  };
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

async function upsertSourceScheduleAfterCheck(env, { source, detectedStatus, analysis, checkedAt, errorMessage }) {
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
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 25, 100));
  const force = url.searchParams.get('force') === 'true';
  const programId = cleanString(url.searchParams.get('programId'), 120);
  const now = new Date().toISOString();
  const conditions = [
    'official_sources.enabled = 1',
    "source_schedule_profiles.source_volatility = 'moving_cycle_page'",
    "source_schedule_profiles.current_phase in ('warmup', 'active', 'unknown')",
  ];
  const bindings = [];

  if (programId) {
    conditions.push('official_sources.program_id = ?');
    bindings.push(programId);
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
  const programId = cleanString(body.programId, 120);
  const generatedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  const queueUrl = new URL('https://applyfirst.local/watch/discovery');
  queueUrl.searchParams.set('limit', String(limit));
  if (force) {
    queueUrl.searchParams.set('force', 'true');
  }
  if (programId) {
    queueUrl.searchParams.set('programId', programId);
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
        const keptResults = providerResults.filter((result) => isRelevantDiscoverySearchResult(item, result));
        foundResults += providerResults.length;

        for (const result of keptResults.slice(0, maxResultsPerQuery)) {
          const candidateKey = comparableUrl(result.url);

          if (!candidateKey || seenCandidateUrls.has(candidateKey)) {
            continue;
          }

          seenCandidateUrls.add(candidateKey);

          const score = scoreDiscoverySearchResult(item, result);
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
          });
        }

        programSummary.queries.push({
          intent: queryInfo.intent,
          query: queryInfo.query,
          found: providerResults.length,
          kept: keptResults.length,
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
  const candidateUrl = normalizeUrl(result.url);
  const candidateHost = getUrlHost(candidateUrl);

  if (
    !candidateUrl ||
    isSameComparableUrl(candidateUrl, item.url) ||
    LOW_SIGNAL_DISCOVERY_HOSTS.has(candidateHost) ||
    isLikelyRepostUrl(candidateUrl)
  ) {
    return false;
  }

  const text = buildDiscoverySearchText(result);
  const hostMatch = getDiscoveryHostMatch(item, candidateUrl);

  if (hostMatch === 'known_official_host' || hostMatch === 'known_official_domain') {
    return true;
  }

  if (hostMatch !== 'organization_host') {
    return false;
  }

  const tokens = significantDiscoveryTokens(`${item.programName} ${item.organization}`);
  const matchedTokens = tokens.filter((token) => text.includes(token)).length;

  return matchedTokens >= Math.min(2, tokens.length || 2) && DISCOVERY_CONTEXT_PATTERN.test(text);
}

function scoreDiscoverySearchResult(item, result) {
  const hostMatch = getDiscoveryHostMatch(item, result.url);
  const text = buildDiscoverySearchText(result);

  if (hostMatch === 'known_official_host') {
    return {
      confidence: DISCOVERY_CONTEXT_PATTERN.test(text) ? 'high' : 'medium',
      reason: 'Search result is on the known official host and may point to a more specific current-cycle page.',
    };
  }

  if (hostMatch === 'known_official_domain') {
    return {
      confidence: DISCOVERY_CONTEXT_PATTERN.test(text) ? 'high' : 'medium',
      reason: 'Search result is on the same official domain family as the known source.',
    };
  }

  if (hostMatch === 'organization_host' && DISCOVERY_CONTEXT_PATTERN.test(text)) {
    return {
      confidence: 'medium',
      reason: 'Search result is on a likely organization-owned host, but needs maintainer confirmation.',
    };
  }

  return {
    confidence: 'needs_review',
    reason: 'Search result may be relevant, but needs maintainer confirmation.',
  };
}

function buildDiscoverySearchText(result) {
  return `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`.toLowerCase();
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
    programs,
    sources,
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
    getCount(env, 'watch_request_programs'),
    getCount(env, 'official_sources'),
    getCount(env, 'source_schedule_profiles'),
    getCount(env, 'source_schedule_profiles', `next_check_at is null or next_check_at = '' or next_check_at <= '${now}'`),
    getCount(
      env,
      'source_schedule_profiles',
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
    watchedPrograms: programs,
    officialSources: sources,
    scheduledSources,
    dueSources,
    discoveryDue,
    pendingCandidates,
    automaticCandidates: autoReadyCandidates,
    pendingDiscoveryCandidates,
    openPrograms,
    alertDeliveries: deliveries,
    lastCheckedAt: latestCheck?.latest || null,
  };
}

async function getPendingCandidates(env) {
  const candidates = await env.DB.prepare(
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
  ).all();

  return {
    ok: true,
    candidates: candidates.results || [],
  };
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
      official_sources.program_name as programName,
      official_sources.organization,
      official_sources.url
    from alert_candidates
    left join official_sources on official_sources.id = alert_candidates.official_source_id
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
      watch_requests.email,
      watch_requests.phone,
      watch_requests.preferred_contact_method as preferredContactMethod,
      watch_requests.raw_payload_json as rawPayloadJson
    from watch_requests
    inner join watch_request_programs
      on watch_request_programs.watch_request_id = watch_requests.id
    where watch_requests.status = 'active'
      and watch_request_programs.program_id = ?
    order by case when watch_requests.id = ? then 0 else 1 end,
      watch_requests.created_at asc
    limit 100`,
  )
    .bind(candidate.programId, preferredWatchRequestId)
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

      deliveryResults.push(
        await deliverAlert(env, {
          candidate,
          recipient,
          channel: 'email',
          destination: recipient.email,
          dryRun,
        }),
      );
    }

    const phone = normalizePhone(recipient.phone || rawPayload.phoneNumber);

    if (['phone', 'both'].includes(contactMethod) && phone) {
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

  const delivery = channel === 'phone'
    ? await sendPhoneAlert(env, candidate, destination)
    : await sendEmailAlert(env, candidate, recipient, destination);

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

async function sendEmailAlert(env, candidate, recipient, destination) {
  if (!env.EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      status: 'not_configured',
      errorMessage: 'Cloudflare Email binding or ALERT_FROM_EMAIL is not configured.',
    };
  }

  const message = buildAlertMessage(env, candidate, recipient);

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

async function sendPhoneAlert(env, candidate, destination) {
  if (!env.SMS_WEBHOOK_URL) {
    return {
      status: 'not_configured',
      errorMessage: 'SMS_WEBHOOK_URL is not configured.',
    };
  }

  const message = buildSmsMessage(candidate);
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

async function handleUnsubscribe(url, env) {
  const requestId = cleanString(url.searchParams.get('requestId'), 120);

  if (!requestId) {
    return new Response('Missing unsubscribe request id.', {
      status: 400,
      headers: { ...corsHeaders(env), 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  await env.DB.prepare(
    `update watch_requests
     set status = 'unsubscribed',
         updated_at = ?
     where id = ?`,
  )
    .bind(new Date().toISOString(), requestId)
    .run();

  return new Response('You have been unsubscribed from this ApplyFirst watch setup.', {
    status: 200,
    headers: { ...corsHeaders(env), 'content-type': 'text/plain; charset=utf-8' },
  });
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
  const contentLength = Number(response.headers.get('content-length') || 0);

  if (contentLength > maxBytes) {
    throw new Error(`Source page is larger than ${maxBytes} bytes.`);
  }

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

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      throw new Error(`Source page exceeded ${maxBytes} bytes.`);
    }

    output += decoder.decode(value, { stream: true });
  }

  return `${output}${decoder.decode()}`;
}

function classifySourceText(sourceText, source) {
  const normalized = sourceText.trim().replace(/\s+/g, ' ');
  const openWindow = findDateSignal(normalized, ['open', 'opens', 'applications open', 'apply by', 'will open', 'opens on', 'opens in']);
  const deadline = findDateSignal(
    normalized,
    ['deadline', 'due', 'apply by', 'submit by', 'submit your application by', 'closes', 'close'],
    true,
  );
  const saysNotOpenYet =
    /\b(not yet open|not open yet|applications? (are )?not open|not currently accepting|not accepting applications|no longer taking applications)\b/i.test(
      normalized,
    );
  const saysOpen =
    /\b(apply now|applications? (are )?open|now accepting|currently accepting|accepting applications|submit your application)\b/i.test(
      normalized,
    ) && !saysNotOpenYet;
  const saysClosed = /\b(closed|applications? (are )?closed|no longer accepting|deadline has passed)\b/i.test(normalized);
  const saysSoon = /\b(open soon|coming soon|check back|next cycle|next application cycle|will open|opens on|opens in)\b/i.test(
    normalized,
  );
  const hasInterestForm =
    /\b(interest form|join (our )?(mailing list|waitlist)|notify me|get notified|sign up for updates|stay informed)\b/i.test(
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

  if (saysRolling && saysOpen) {
    return buildAnalysis('Application opened', 'open', mentionsEligibility || deadline ? 'high' : 'medium', 'Alert Candidate', 'opening', source, normalized, deadline);
  }

  if (saysOpen) {
    return buildAnalysis('Application opened', 'open', mentionsEligibility || openWindow || deadline ? 'high' : 'medium', 'Alert Candidate', 'opening', source, normalized, deadline || openWindow);
  }

  if (deadline && !saysClosed) {
    return buildAnalysis('Dates updated', 'deadlineSoon', mentionsEligibility ? 'high' : 'medium', 'Deadline Candidate', 'deadline', source, normalized, deadline);
  }

  if (saysClosed) {
    return buildAnalysis('No material change', suggestsNextCycle ? 'expectedSoon' : 'watching', mentionsEligibility ? 'medium' : 'needsReview', 'Monitor Only', '', source, normalized, deadline || openWindow);
  }

  if (hasInterestForm) {
    return buildAnalysis('Needs follow-up', 'watching', mentionsEligibility || openWindow ? 'medium' : 'needsReview', 'Monitor Only', '', source, normalized, openWindow);
  }

  if (saysNotOpenYet || saysSoon || openWindow || saysRolling) {
    return buildAnalysis('Dates updated', saysRolling ? 'watching' : 'expectedSoon', mentionsEligibility || openWindow ? 'medium' : 'needsReview', 'Prep Watch', 'prep_window', source, normalized, openWindow);
  }

  if (mentionsEligibility) {
    return buildAnalysis('Eligibility changed', 'verifyManually', 'medium', 'Manual Review', 'eligibility', source, normalized, '');
  }

  return buildAnalysis('Needs follow-up', 'verifyManually', 'needsReview', 'Manual Review', '', source, normalized, '');
}

function buildAnalysis(result, suggestedStatus, suggestedConfidence, reviewDecision, candidateType, source, sourceText, detectedSignal) {
  const signalCopy = detectedSignal ? ` Detected signal: ${detectedSignal}.` : '';
  const excerpt = sourceText.slice(0, 220);

  return {
    result,
    suggestedStatus,
    suggestedConfidence,
    reviewDecision,
    candidateType,
    detectedSignal,
    note: `${source.program_name}: ${result}. ${reviewDecision} created from official source monitoring.${signalCopy} Review before sending any student alert. Excerpt: ${excerpt}${sourceText.length > 220 ? '...' : ''}`,
  };
}

function findDateSignal(sourceText, nearbyWords, requireNearby = false) {
  const datePattern =
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi;
  const matches = [...sourceText.matchAll(datePattern)];

  if (!matches.length) {
    return '';
  }

  const lower = sourceText.toLowerCase();
  const nearbyMatch = matches.find((match) => {
    const start = Math.max(match.index - 90, 0);
    const end = Math.min(match.index + match[0].length + 90, sourceText.length);
    const context = lower.slice(start, end);
    return nearbyWords.some((word) => context.includes(word));
  });

  if (nearbyMatch) {
    return nearbyMatch[0];
  }

  return requireNearby ? '' : matches[0][0];
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

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePhone(value) {
  return cleanString(value, 40).replace(/[^\d+]/g, '');
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

function buildAlertMessage(env, candidate, recipient) {
  const programName = candidate.programName || candidate.title || 'Tracked Program';
  const sourceUrl = candidate.url || publicAppUrl(env);
  const unsubscribeUrl = `${watchWorkerUrl(env)}/watch/unsubscribe?requestId=${encodeURIComponent(recipient.id)}`;
  const alertCopy = buildStudentAlertCopy(candidate);
  const subject = alertCopy.subject;
  const text = [
    alertCopy.header,
    '',
    alertCopy.summary,
    '',
    'What to do next:',
    `1. Open the official source: ${sourceUrl}`,
    '2. Confirm eligibility, deadline, and required materials.',
    '3. Apply early if this program fits your goals.',
    '',
    `Beta note: ${alertCopy.betaNote}`,
    '',
    'Why you received this:',
    'You asked ApplyFirst to watch this program for opening signals.',
    `Unsubscribe from this watch setup: ${unsubscribeUrl}`,
  ].join('\n');
  const html = `
    <div style="margin:0;padding:0;background:#f6f8fb">
      <div style="max-width:620px;margin:0 auto;padding:28px 18px;font-family:Inter,Arial,sans-serif;color:#17212f;line-height:1.55">
        <div style="background:#ffffff;border:1px solid #dce5ee;border-radius:14px;padding:24px;box-shadow:0 12px 30px rgba(23,33,47,0.06)">
          <p style="margin:0 0 10px;color:#0f7f96;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase">ApplyFirst ${escapeHtml(alertCopy.label)}</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.22;color:#111827">${escapeHtml(programName)} ${escapeHtml(alertCopy.headlineSuffix)}</h1>
          <p style="margin:0 0 18px;color:#425066;font-size:15px">${escapeHtml(alertCopy.summary)}</p>
          <div style="margin:0 0 20px;padding:14px 16px;border-radius:10px;background:#f7fbfc;border:1px solid #dcebf0">
            <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:800">What to do next</p>
            <ol style="margin:0;padding-left:20px;color:#425066;font-size:14px">
              <li style="margin:0 0 4px">Open the official source.</li>
              <li style="margin:0 0 4px">Confirm eligibility, deadline, and required materials.</li>
              <li style="margin:0">Apply early if this program fits your goals.</li>
            </ol>
          </div>
          <p style="margin:0 0 20px">
            <a href="${escapeHtml(sourceUrl)}" style="display:inline-block;background:#17212f;color:#ffffff;text-decoration:none;border-radius:999px;padding:11px 18px;font-size:14px;font-weight:800">Check Official Source</a>
          </p>
          <p style="margin:0 0 14px;color:#5b6472;font-size:13px"><strong style="color:#17212f">Beta note:</strong> ${escapeHtml(alertCopy.betaNote)}</p>
          <p style="margin:0;color:#6b7280;font-size:12px">You are receiving this because you asked ApplyFirst to watch this program. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#2563eb">Unsubscribe from this watch setup</a>.</p>
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

function buildStudentAlertCopy(candidate) {
  const programName = candidate.programName || candidate.title || 'This program';
  const detectedSignal = extractDetectedSignal(candidate.summary);
  const isDeadline = candidate.candidateType === 'deadline' || /deadline/i.test(candidate.title || '');
  const label = isDeadline ? 'Deadline Signal' : 'Opening Signal';
  const headlineSuffix = isDeadline ? 'has a timing update' : 'may be open';
  const subject = isDeadline ? `${programName} has a timing update` : `${programName} may be open`;
  const summary = detectedSignal
    ? `ApplyFirst found a ${isDeadline ? 'timing' : 'possible opening'} signal on the official source: ${detectedSignal}.`
    : `ApplyFirst found language on the official source that looks relevant to the ${isDeadline ? 'application timeline' : 'application opening'}.`;

  return {
    label,
    header: `ApplyFirst ${label.toLowerCase()}`,
    headlineSuffix,
    subject,
    summary,
    betaNote:
      'This is an automated beta alert from official-source monitoring. Always verify final dates, eligibility, and requirements on the official page before applying.',
  };
}

function extractDetectedSignal(summary) {
  const match = cleanString(summary, 1200).match(/Detected signal:\s*([^.]*)\./i);

  if (!match) {
    return '';
  }

  return cleanString(match[1], 120);
}

function buildSmsMessage(candidate) {
  const programName = candidate.programName || candidate.title || 'Tracked program';
  const sourceUrl = candidate.url || '';

  return `ApplyFirst: ${programName} may have an opening signal. Verify details on the official source: ${sourceUrl}`;
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

  if (header !== `Bearer ${env.WATCH_ADMIN_TOKEN}`) {
    throw httpError(401, 'Admin token required.');
  }
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
