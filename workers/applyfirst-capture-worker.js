const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
};

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

      if (request.method === 'POST' && url.pathname === '/waitlist') {
        const payload = await readJson(request);
        const row = await saveWaitlistRequest(env, payload);
        const ownerNotification = await sendOwnerWaitlistNotification(env, row);

        return jsonResponse(request, env, {
          ok: true,
          id: row.id,
          ownerNotification,
        });
      }

      if (request.method === 'POST' && url.pathname === '/contribution') {
        const payload = await readJson(request);
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

async function saveWaitlistRequest(env, payload) {
  assertDatabase(env);

  const row = {
    source: cleanString(payload.source, 80) || 'applyfirst-waitlist',
    email: cleanEmail(payload.email),
    classYear: cleanString(payload.classYear ?? payload.class_year, 120),
    interest: cleanString(payload.interest, 160),
    school: cleanString(payload.school, 160),
    note: cleanString(payload.note, 2000),
    preferenceSummary: cleanString(payload.preferenceSummary ?? payload.preference_summary, 500),
    notificationMode: cleanString(payload.notificationMode ?? payload.notification_mode, 120),
    savedAt: cleanString(payload.savedAt ?? payload.saved_at, 80) || new Date().toISOString(),
  };

  if (!row.email) {
    const error = new Error('Email is required for waitlist requests.');
    error.status = 400;
    throw error;
  }

  const result = await env.DB.prepare(
    `INSERT INTO waitlist_requests (
      source,
      email,
      class_year,
      interest,
      school,
      note,
      preference_summary,
      notification_mode,
      saved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.source,
      row.email,
      row.classYear,
      row.interest,
      row.school,
      row.note,
      row.preferenceSummary,
      row.notificationMode,
      row.savedAt,
    )
    .run();

  return {
    ...row,
    id: result.meta?.last_row_id ?? null,
    createdAt: new Date().toISOString(),
  };
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
  const subject = `New ApplyFirst Signup: ${row.email}`;
  const text = [
    `New ApplyFirst ${signupType}`,
    '',
    `Email: ${row.email}`,
    `Class Year: ${row.classYear || 'Not provided'}`,
    `Interest: ${row.interest || 'Not provided'}`,
    `School: ${row.school || 'Not provided'}`,
    `Preference: ${row.preferenceSummary || 'Not provided'}`,
    `Signup Type: ${row.notificationMode || signupType}`,
    `Submitted: ${submittedAt}`,
    `Source: ${row.source}`,
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
        ${emailRow('Email', row.email)}
        ${emailRow('Class Year', row.classYear || 'Not provided')}
        ${emailRow('Interest', row.interest || 'Not provided')}
        ${emailRow('School', row.school || 'Not provided')}
        ${emailRow('Preference', row.preferenceSummary || 'Not provided')}
        ${emailRow('Signup Type', row.notificationMode || signupType)}
        ${emailRow('Submitted', submittedAt)}
        ${emailRow('Source', row.source)}
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
