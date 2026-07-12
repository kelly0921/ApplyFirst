const waitlistEndpoint = process.env.VITE_WAITLIST_ENDPOINT;
const contributionEndpoint = process.env.VITE_CONTRIBUTION_ENDPOINT;

const samples = [
  {
    label: 'waitlist',
    endpoint: waitlistEndpoint,
    body: {
      source: 'applyfirst-waitlist-smoke',
      email: 'applyfirst-smoke@example.com',
      classYear: 'Freshman',
      interest: 'Software Engineering',
      school: 'Smoke test',
      note: 'Smoke test for beta waitlist capture.',
      preferenceSummary: 'Freshman / Software Engineering / Recommended / Openings & Deadlines',
      notificationMode: 'Smoke test',
      savedAt: new Date().toISOString(),
      captureStatus: 'Smoke test',
    },
  },
  {
    label: 'contribution',
    endpoint: contributionEndpoint,
    body: {
      source: 'applyfirst-contribution-smoke',
      type: 'feedback',
      issueType: 'Beta feedback',
      programId: '',
      note: 'Smoke test for beta contribution capture.',
      status: 'Smoke test',
      createdAt: new Date().toISOString(),
    },
  },
];

async function postSample({ label, endpoint, body }) {
  if (!endpoint) {
    return {
      label,
      ok: false,
      status: 'missing',
      message: `Set VITE_${label === 'waitlist' ? 'WAITLIST' : 'CONTRIBUTION'}_ENDPOINT before running this smoke test.`,
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return {
      label,
      ok: response.ok,
      status: response.status,
      message: response.ok ? 'Capture endpoint accepted sample payload.' : 'Capture endpoint returned a non-2xx status.',
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 'error',
      message: error.message,
    };
  }
}

const results = await Promise.all(samples.map(postSample));
console.log(JSON.stringify(results, null, 2));

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}
