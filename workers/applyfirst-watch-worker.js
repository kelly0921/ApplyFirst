const MAX_SOURCE_BYTES = 250_000;
const MAX_STORED_TEXT = 80_000;
const DEFAULT_MONITOR_LIMIT = 12;

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

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const candidateSendMatch = url.pathname.match(/^\/watch\/candidates\/([^/]+)\/send$/);

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

    if (request.method === 'POST' && candidateSendMatch) {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      return jsonResponse(env, await sendCandidateNotifications(env, candidateSendMatch[1], body));
    }

    if (request.method === 'POST' && url.pathname === '/watch') {
      return jsonResponse(env, await saveWatchRequest(request, env), { status: 201 });
    }

    if (request.method === 'POST' && url.pathname === '/watch/run') {
      await requireAdminToken(request, env);
      const body = await readJson(request, {});
      const result = await runMonitoring(env, {
        limit: Number(body.limit || env.WATCH_RUN_LIMIT || DEFAULT_MONITOR_LIMIT),
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

async function saveWatchRequest(request, env) {
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

  return {
    ok: true,
    id,
    status: 'active',
    programCount: programRows.length,
    message: 'Watch request saved. ApplyFirst will check official sources into the beta review queue.',
  };
}

async function runMonitoring(env, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_MONITOR_LIMIT, 50));
  const sources = await env.DB.prepare(
    `select *
     from official_sources
     where enabled = 1
     order by coalesce(last_checked_at, '') asc, program_name asc
     limit ?`,
  )
    .bind(limit)
    .all();

  const checks = [];

  for (const source of sources.results || []) {
    checks.push(await checkOfficialSource(env, source));
  }

  return {
    ok: true,
    trigger: options.trigger || 'manual',
    checked: checks.length,
    changed: checks.filter((check) => check.changed).length,
    alertCandidates: checks.filter((check) => check.newAlertCandidate).length,
    manualReview: checks.filter((check) => check.reviewDecision === 'Manual Review').length,
    generatedAt: new Date().toISOString(),
    checks,
  };
}

async function checkOfficialSource(env, source) {
  const previousSnapshot = await env.DB.prepare(
    `select id, content_hash
     from page_snapshots
     where official_source_id = ?
     order by fetched_at desc
     limit 1`,
  )
    .bind(source.id)
    .first();
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
  const newAlertCandidate =
    changed && ['Alert Candidate', 'Deadline Candidate'].includes(analysis.reviewDecision);

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

  if (newAlertCandidate) {
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
        'pending_review',
      )
      .run();

    if (env.AUTO_SEND_OPEN_ALERTS === 'true' && analysis.reviewDecision === 'Alert Candidate') {
      await sendCandidateNotifications(env, candidateId, { trigger: 'auto' });
    }
  }

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

  return {
    programId: source.program_id,
    name: source.program_name,
    url: source.url,
    changed,
    result: analysis.result,
    reviewDecision: analysis.reviewDecision,
    newAlertCandidate,
    error: errorMessage || null,
  };
}

async function getWatchStatus(env) {
  const [requests, programs, sources, pendingCandidates, deliveries, latestCheck] = await Promise.all([
    getCount(env, 'watch_requests'),
    getCount(env, 'watch_request_programs'),
    getCount(env, 'official_sources'),
    getCount(env, 'alert_candidates', "status = 'pending_review'"),
    getCount(env, 'alert_deliveries'),
    env.DB.prepare('select max(created_at) as latest from source_checks').first(),
  ]);

  return {
    ok: true,
    watchRequests: requests,
    watchedPrograms: programs,
    officialSources: sources,
    pendingCandidates,
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
    order by watch_requests.created_at asc
    limit 100`,
  )
    .bind(candidate.programId)
    .all();

  const deliveryResults = [];

  for (const recipient of recipients.results || []) {
    const rawPayload = parseJsonObject(recipient.rawPayloadJson);
    const contactMethod = normalizeContactMethod(
      recipient.preferredContactMethod || rawPayload.contactMethod,
      recipient.email,
      recipient.phone || rawPayload.phoneNumber,
    );

    if (['email', 'both'].includes(contactMethod) && recipient.email) {
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
    await env.DB.prepare(
      `update alert_candidates
       set status = ?,
           updated_at = ?
       where id = ?`,
    )
      .bind(options.trigger === 'auto' ? 'auto_sent' : 'sent', now, candidate.id)
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
  const subject = `${programName} may be open`;
  const text = [
    `${programName} has a new ApplyFirst opening signal.`,
    '',
    'What changed:',
    candidate.summary || candidate.title || 'ApplyFirst found a source update worth reviewing.',
    '',
    `Official source: ${sourceUrl}`,
    '',
    'ApplyFirst sends beta alerts only for programs you asked us to watch.',
    `Unsubscribe from this watch setup: ${unsubscribeUrl}`,
  ].join('\n');
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#17212f">
      <p style="margin:0 0 12px;color:#2563eb;font-weight:700">ApplyFirst opening signal</p>
      <h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(programName)} may be open</h1>
      <p style="margin:0 0 16px">${escapeHtml(candidate.summary || candidate.title || 'ApplyFirst found a source update worth reviewing.')}</p>
      <p style="margin:0 0 18px"><a href="${escapeHtml(sourceUrl)}">Check the official source</a></p>
      <p style="margin:0;color:#5b6472;font-size:13px">You are receiving this because you asked ApplyFirst to watch this program. <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from this watch setup</a>.</p>
    </div>
  `;

  return {
    subject,
    text,
    html,
    unsubscribeUrl,
  };
}

function buildSmsMessage(candidate) {
  const programName = candidate.programName || candidate.title || 'Tracked program';
  const sourceUrl = candidate.url || '';

  return `ApplyFirst: ${programName} has a new opening signal. Check the official source: ${sourceUrl}`;
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
