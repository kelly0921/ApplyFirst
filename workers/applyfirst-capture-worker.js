const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
};
const PUBLIC_WAITLIST_CLASS_YEARS = new Set([
  'High school',
  'Freshman',
  'Sophomore',
  'Junior',
  'Senior',
  'Graduate student',
  'Recent graduate',
  'Other / not sure',
]);
const PUBLIC_WAITLIST_INTERESTS = new Set([
  'Software Engineering',
  'Product Management',
  'Design',
  'Quant / Finance',
  'Access & Prep',
  'Not sure yet',
]);
const PUBLIC_WAITLIST_CONSENT_TEXT =
  'By joining, you agree to receive ApplyFirst beta access and opportunity updates by email. Unsubscribe anytime.';
const WAITLIST_CONFIRMATION_TTL_MS = 48 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse(request, env, {
          ok: true,
          service: 'applyfirst-capture',
        });
      }

      if (request.method === 'GET' && url.pathname === '/waitlist/confirm') {
        const confirmation = await confirmWaitlistEmail(env, url.searchParams.get('token'));
        return waitlistConfirmationRedirect(env, confirmation.state);
      }

      if (request.method === 'POST' && url.pathname === '/waitlist') {
        const payload = await readJson(request);
        await verifyTurnstile(request, env, payload.turnstileToken, 'waitlist');
        const confirmationRequired = shouldRequireWaitlistEmailConfirmation(env, payload);
        if (confirmationRequired) {
          assertWaitlistConfirmationConfigured(env);
        }
        const confirmation = confirmationRequired ? await createWaitlistConfirmation() : null;
        const row = await saveWaitlistRequest(env, payload, confirmation);

        if (confirmationRequired) {
          await sendWaitlistConfirmationEmail(env, request, row, confirmation.token);
          await markWaitlistConfirmationSent(env, row.id);
          console.log(JSON.stringify({ event: 'waitlist_confirmation_sent', waitlistRequestId: row.id }));

          return jsonResponse(request, env, {
            ok: true,
            id: row.id,
            confirmationRequired: true,
          });
        }

        const ownerNotification = await sendOwnerWaitlistNotification(env, row);

        return jsonResponse(request, env, {
          ok: true,
          id: row.id,
          ownerNotification,
        });
      }

      if (request.method === 'POST' && url.pathname === '/contribution') {
        const payload = await readJson(request);
        await verifyTurnstile(request, env, payload.turnstileToken, 'contribution');
        const row = await saveContributionRequest(env, payload);

        return jsonResponse(request, env, {
          ok: true,
          id: row.id,
        });
      }

      return jsonResponse(
        request,
        env,
        {
          ok: false,
          error: 'Route not found.',
        },
        404,
      );
    } catch (error) {
      const status = error.status || 500;

      return jsonResponse(
        request,
        env,
        {
          ok: false,
          error: status >= 500 ? 'ApplyFirst capture worker failed.' : error.message,
        },
        status,
      );
    }
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowOrigin = env.CORS_ORIGIN || origin || '*';

  return {
    ...DEFAULT_CORS_HEADERS,
    'Access-Control-Allow-Origin': allowOrigin,
  };
}

function jsonResponse(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

async function verifyTurnstile(request, env, token, expectedAction) {
  const expectedHostnames = new Set(
    String(env.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );

  if (
    !env.TURNSTILE_SECRET ||
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > 2048 ||
    expectedHostnames.size === 0
  ) {
    throw forbiddenVerificationError();
  }

  let result;

  try {
    const verificationResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') || '',
      }),
    });

    if (!verificationResponse.ok) {
      throw new Error(`Turnstile siteverify returned HTTP ${verificationResponse.status}.`);
    }

    result = await verificationResponse.json();
  } catch {
    throw forbiddenVerificationError();
  }

  if (
    result.success !== true ||
    result.action !== expectedAction ||
    !expectedHostnames.has(String(result.hostname || '').toLowerCase())
  ) {
    throw forbiddenVerificationError();
  }
}

function forbiddenVerificationError() {
  const error = new Error('Verification failed. Refresh and try again.');
  error.status = 403;
  return error;
}

async function saveWaitlistRequest(env, payload, confirmation = null) {
  assertDatabase(env);

  const source = cleanString(payload.source, 80) || 'applyfirst-waitlist';
  const requestedReferralSource = payload.referralSource ?? payload.referral_source;
  const referralSource = ['APIA Scholars', 'Kelly’s LinkedIn', 'Friend or classmate', 'Other'].includes(requestedReferralSource)
    ? requestedReferralSource
    : null;
  const referralDetail = ['Friend or classmate', 'Other'].includes(referralSource)
    ? cleanString(payload.referralDetail ?? payload.referral_detail, 160)
    : null;
  const row = {
    source,
    referralSource,
    referralDetail,
    firstName: cleanString(payload.firstName ?? payload.first_name, 80),
    lastName: cleanString(payload.lastName ?? payload.last_name, 80),
    email: cleanEmail(payload.email),
    classYear: cleanString(payload.classYear ?? payload.class_year, 120),
    interest: cleanString(payload.interest, 160),
    school: cleanString(payload.school, 160),
    note: cleanString(payload.note, 2000),
    preferenceSummary: cleanString(payload.preferenceSummary ?? payload.preference_summary, 500),
    notificationMode: cleanString(payload.notificationMode ?? payload.notification_mode, 120),
    emailConsentAt: source === 'applyfirst-waitlist'
      ? new Date().toISOString()
      : cleanString(payload.emailConsentAt ?? payload.email_consent_at, 80),
    emailConsentText: source === 'applyfirst-waitlist'
      ? PUBLIC_WAITLIST_CONSENT_TEXT
      : cleanString(payload.emailConsentText ?? payload.email_consent_text, 500),
    emailConfirmationRequired: confirmation ? 1 : 0,
    emailConfirmationTokenHash: confirmation?.tokenHash || null,
    emailConfirmationExpiresAt: confirmation?.expiresAt || null,
    savedAt: cleanString(payload.savedAt ?? payload.saved_at, 80) || new Date().toISOString(),
  };

  if (!row.email) {
    const error = new Error('Email is required for waitlist requests.');
    error.status = 400;
    throw error;
  }

  if (row.source === 'applyfirst-waitlist' && (!row.firstName || !row.lastName)) {
    const error = new Error('First and last name are required for waitlist requests.');
    error.status = 400;
    throw error;
  }

  if (
    row.source === 'applyfirst-waitlist' &&
    (!PUBLIC_WAITLIST_CLASS_YEARS.has(row.classYear) || !PUBLIC_WAITLIST_INTERESTS.has(row.interest))
  ) {
    const error = new Error('Select a valid class year and primary interest.');
    error.status = 400;
    throw error;
  }

  const result = await env.DB.prepare(
    `INSERT INTO waitlist_requests (
      source,
      referral_source,
      referral_detail,
      first_name,
      last_name,
      email,
      class_year,
      interest,
      school,
      note,
      preference_summary,
      notification_mode,
      email_consent_at,
      email_consent_text,
      email_confirmation_required,
      email_confirmation_token_hash,
      email_confirmation_expires_at,
      saved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.source,
      row.referralSource,
      row.referralDetail,
      row.firstName,
      row.lastName,
      row.email,
      row.classYear,
      row.interest,
      row.school,
      row.note,
      row.preferenceSummary,
      row.notificationMode,
      row.emailConsentAt,
      row.emailConsentText,
      row.emailConfirmationRequired,
      row.emailConfirmationTokenHash,
      row.emailConfirmationExpiresAt,
      row.savedAt,
    )
    .run();

  return {
    ...row,
    id: result.meta?.last_row_id ?? null,
    createdAt: new Date().toISOString(),
  };
}

function shouldRequireWaitlistEmailConfirmation(env, payload) {
  const source = cleanString(payload.source, 80) || 'applyfirst-waitlist';
  return source === 'applyfirst-waitlist' && env.ENABLE_WAITLIST_EMAIL_CONFIRMATION === 'true';
}

function assertWaitlistConfirmationConfigured(env) {
  if (!env.EMAIL || !env.CAPTURE_FROM_EMAIL) {
    const error = new Error('Waitlist email confirmation is temporarily unavailable.');
    error.status = 503;
    throw error;
  }
}

async function createWaitlistConfirmation() {
  const token = createSecureToken();
  return {
    token,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + WAITLIST_CONFIRMATION_TTL_MS).toISOString(),
  };
}

async function markWaitlistConfirmationSent(env, waitlistRequestId) {
  await env.DB.prepare(
    `UPDATE waitlist_requests
     SET email_confirmation_sent_at = ?
     WHERE id = ?`,
  )
    .bind(new Date().toISOString(), waitlistRequestId)
    .run();
}

async function confirmWaitlistEmail(env, tokenValue) {
  assertDatabase(env);
  const token = cleanString(tokenValue, 160);
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return { state: 'invalid' };
  }

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT
      id,
      source,
      referral_source AS referralSource,
      referral_detail AS referralDetail,
      first_name AS firstName,
      last_name AS lastName,
      email,
      class_year AS classYear,
      interest,
      school,
      note,
      preference_summary AS preferenceSummary,
      notification_mode AS notificationMode,
      email_confirmation_expires_at AS emailConfirmationExpiresAt,
      email_confirmed_at AS emailConfirmedAt,
      saved_at AS savedAt,
      created_at AS createdAt
     FROM waitlist_requests
     WHERE email_confirmation_required = 1
       AND email_confirmation_token_hash = ?
     LIMIT 1`,
  )
    .bind(tokenHash)
    .first();

  if (!row) {
    return { state: 'invalid' };
  }

  if (row.emailConfirmedAt) {
    return { state: 'confirmed' };
  }

  if (!row.emailConfirmationExpiresAt || Date.parse(row.emailConfirmationExpiresAt) <= Date.now()) {
    return { state: 'expired' };
  }

  const confirmedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE waitlist_requests
     SET email_confirmed_at = ?
     WHERE id = ?
       AND email_confirmed_at IS NULL
       AND email_confirmation_token_hash = ?`,
  )
    .bind(confirmedAt, row.id, tokenHash)
    .run();

  if (Number(result.meta?.changes || 0) > 0) {
    const ownerNotification = await sendOwnerWaitlistNotification(env, {
      ...row,
      emailConfirmedAt: confirmedAt,
    });
    if (ownerNotification.status === 'failed') {
      console.error(JSON.stringify({
        event: 'confirmed_waitlist_owner_notification_failed',
        waitlistRequestId: row.id,
        error: ownerNotification.errorMessage,
      }));
    }
    console.log(JSON.stringify({ event: 'waitlist_email_confirmed', waitlistRequestId: row.id }));
  }

  return { state: 'confirmed' };
}

function waitlistConfirmationRedirect(env, state) {
  const target = getPublicAppUrl(env);
  target.searchParams.set('waitlist', state);
  target.hash = 'waitlist';

  return new Response(null, {
    status: 303,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

async function sendWaitlistConfirmationEmail(env, request, row, token) {
  const workerUrl = new URL(request.url);
  workerUrl.pathname = '/waitlist/confirm';
  workerUrl.search = '';
  workerUrl.hash = '';
  workerUrl.searchParams.set('token', token);

  const privacyUrl = getPublicAppUrl(env);
  privacyUrl.search = '';
  privacyUrl.searchParams.set('view', 'privacy');
  privacyUrl.hash = '';

  const studentName = row.firstName || 'there';
  const subject = 'Confirm your ApplyFirst waitlist email';
  const text = [
    `Hi ${studentName},`,
    '',
    'Confirm your email to finish joining the ApplyFirst waitlist.',
    '',
    workerUrl.toString(),
    '',
    'This link expires in 48 hours. If you did not request ApplyFirst access, you can ignore this email.',
    '',
    `Privacy & Data Use: ${privacyUrl.toString()}`,
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #18201d; line-height: 1.5; max-width: 620px;">
      <div style="display: inline-block; margin-bottom: 12px; padding: 4px 10px; border-radius: 999px; background: #e9f6f2; color: #176b5a; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase;">
        ApplyFirst Waitlist
      </div>
      <h1 style="margin: 0 0 10px; font-size: 24px; line-height: 1.25;">Confirm your email</h1>
      <p style="margin: 0 0 18px; color: #52645d;">Hi ${escapeHtml(studentName)}, confirm your email to finish joining the ApplyFirst waitlist.</p>
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(workerUrl.toString())}" style="display: inline-block; border-radius: 8px; background: #0f7f96; color: #ffffff; padding: 11px 18px; font-weight: 700; text-decoration: none;">Confirm Email</a>
      </p>
      <p style="margin: 0 0 8px; color: #52645d; font-size: 13px;">This link expires in 48 hours. If you did not request ApplyFirst access, you can ignore this email.</p>
      <p style="margin: 0; font-size: 13px;"><a href="${escapeHtml(privacyUrl.toString())}" style="color: #0f6577;">Privacy &amp; Data Use</a></p>
    </div>
  `;

  try {
    return await env.EMAIL.send({
      to: row.email,
      from: {
        email: env.CAPTURE_FROM_EMAIL,
        name: env.CAPTURE_FROM_NAME || 'ApplyFirst',
      },
      replyTo: env.CAPTURE_REPLY_TO || env.CAPTURE_FROM_EMAIL,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'waitlist_confirmation_email_failed',
      waitlistRequestId: row.id,
      error: error.message,
    }));
    const serviceError = new Error('We could not send the confirmation email. Please try again.');
    serviceError.status = 503;
    throw serviceError;
  }
}

function getPublicAppUrl(env) {
  try {
    const url = new URL(env.PUBLIC_APP_URL || 'https://applyfirst-careers.pages.dev');
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Unsupported protocol.');
    }
    return url;
  } catch {
    return new URL('https://applyfirst-careers.pages.dev');
  }
}

function createSecureToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function saveContributionRequest(env, payload) {
  assertDatabase(env);

  const row = {
    source: cleanString(payload.source, 80) || 'applyfirst-contribution',
    type: cleanString(payload.type, 80),
    name: cleanString(payload.name, 240),
    url: cleanString(payload.url, 1000),
    track: cleanString(payload.track, 120),
    programId: cleanString(payload.programId ?? payload.program_id, 160),
    issueType: cleanString(payload.issueType ?? payload.issue_type, 160),
    reason: cleanString(payload.reason, 2000),
    note: cleanString(payload.note, 2000),
    status: cleanString(payload.status, 120),
    createdAt: cleanString(payload.createdAt ?? payload.created_at, 80) || new Date().toISOString(),
  };

  if (!row.type) {
    const error = new Error('Contribution type is required.');
    error.status = 400;
    throw error;
  }

  const result = await env.DB.prepare(
    `INSERT INTO contribution_requests (
      source,
      type,
      name,
      url,
      track,
      program_id,
      issue_type,
      reason,
      note,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.source,
      row.type,
      row.name,
      row.url,
      row.track,
      row.programId,
      row.issueType,
      row.reason,
      row.note,
      row.status,
      row.createdAt,
    )
    .run();

  return {
    ...row,
    id: result.meta?.last_row_id ?? null,
  };
}

async function sendOwnerWaitlistNotification(env, row) {
  if (env.ENABLE_OWNER_WAITLIST_NOTIFICATIONS === 'false') {
    return { status: 'disabled' };
  }

  if (!env.EMAIL || !env.OWNER_NOTIFY_EMAIL || !env.CAPTURE_FROM_EMAIL) {
    return { status: 'not_configured' };
  }

  const signupType = getSignupType(row);
  const submittedAt = row.savedAt || row.createdAt || 'Unknown';
  const studentNote = row.note || 'No note provided.';
  const studentName = [row.firstName, row.lastName].filter(Boolean).join(' ');
  const subject = `New ApplyFirst Signup: ${studentName || row.email}`;
  const text = [
    `New ApplyFirst ${signupType}`,
    '',
    `Name: ${studentName || 'Not provided'}`,
    `Email: ${row.email}`,
    `Class Year: ${row.classYear || 'Not provided'}`,
    `Interest: ${row.interest || 'Not provided'}`,
    `School: ${row.school || 'Not provided'}`,
    `Preference: ${row.preferenceSummary || 'Not provided'}`,
    `Signup Type: ${row.notificationMode || signupType}`,
    `Submitted: ${submittedAt}`,
    `Source: ${row.source}`,
    `Referral: ${row.referralSource || 'Not provided'}`,
    ...(row.referralDetail ? [`Referral Detail: ${row.referralDetail}`] : []),
    '',
    'Student Note:',
    studentNote,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #18201d; line-height: 1.5; max-width: 680px;">
      <div style="display: inline-block; margin-bottom: 10px; padding: 4px 10px; border-radius: 999px; background: #e9f6f2; color: #176b5a; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase;">
        ${escapeHtml(signupType)}
      </div>
      <h2 style="margin: 0 0 4px; font-size: 22px; line-height: 1.25;">New ApplyFirst signup</h2>
      <p style="margin: 0 0 18px; color: #52645d;">A student submitted interest through the beta capture flow.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px; border-top: 1px solid #dce8e4;">
        ${emailRow('Name', studentName || 'Not provided')}
        ${emailRow('Email', row.email)}
        ${emailRow('Class Year', row.classYear || 'Not provided')}
        ${emailRow('Interest', row.interest || 'Not provided')}
        ${emailRow('School', row.school || 'Not provided')}
        ${emailRow('Preference', row.preferenceSummary || 'Not provided')}
        ${emailRow('Signup Type', row.notificationMode || signupType)}
        ${emailRow('Submitted', submittedAt)}
        ${emailRow('Source', row.source)}
        ${emailRow('Referral', row.referralSource || 'Not provided')}
        ${row.referralDetail ? emailRow('Referral Detail', row.referralDetail) : ''}
      </table>
      <div style="margin-top: 20px; padding: 14px 16px; border: 1px solid #dce8e4; border-radius: 12px; background: #fbfdfc;">
        <h3 style="margin: 0 0 8px; font-size: 14px; line-height: 1.3; color: #52645d; text-transform: uppercase; letter-spacing: 0.03em;">Student Note</h3>
        <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(studentNote)}</p>
      </div>
    </div>
  `;

  try {
    const result = await env.EMAIL.send({
      to: env.OWNER_NOTIFY_EMAIL,
      from: {
        email: env.CAPTURE_FROM_EMAIL,
        name: env.CAPTURE_FROM_NAME || 'ApplyFirst',
      },
      replyTo: row.email || env.CAPTURE_REPLY_TO || env.CAPTURE_FROM_EMAIL,
      subject,
      text,
      html,
    });

    return {
      status: 'sent',
      providerMessageId: result?.messageId || result?.id || '',
    };
  } catch (error) {
    return {
      status: 'failed',
      errorMessage: error.message,
    };
  }
}

function emailRow(label, value) {
  return `
    <tr>
      <th style="text-align: left; vertical-align: top; padding: 10px 12px 10px 0; color: #52645d; width: 150px; border-bottom: 1px solid #edf3f1; font-size: 13px; font-weight: 700;">${escapeHtml(label)}</th>
      <td style="padding: 10px 0; border-bottom: 1px solid #edf3f1; font-size: 14px;">${escapeHtml(value)}</td>
    </tr>
  `;
}

function getSignupType(row) {
  const source = `${row.source} ${row.notificationMode}`.toLowerCase();

  if (source.includes('alert')) {
    return 'Beta Alert Opt-In';
  }

  if (source.includes('focus') || source.includes('contact')) {
    return 'My Focus Contact';
  }

  return 'Waitlist Request';
}

function assertDatabase(env) {
  if (!env.DB) {
    const error = new Error('D1 database binding is not configured.');
    error.status = 500;
    throw error;
  }
}

function cleanString(value, maxLength = 500) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().slice(0, maxLength);
}

function cleanEmail(value) {
  const email = cleanString(value, 254).toLowerCase();

  return email.includes('@') ? email : '';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
