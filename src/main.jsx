import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import programsScreenshot from '../docs/assets/screenshots/applyfirst-programs-desktop.png';
import programStatusMixScreenshot from '../docs/assets/screenshots/applyfirst-program-status-mix-desktop.png';
import { createSourceAnalysis, getSourceReviewDecision } from './monitoring';
import {
  confidenceLabels,
  filterOptions,
  getMonitorSignal,
  getMonitoringReadiness,
  getOpportunityTracks,
  getSourceUpdatePlan,
  getVerificationPriority,
  getVerificationState,
  opportunities,
  priorityLabels,
  statusLabels,
  verificationLabels,
} from './opportunities';

const quickViews = [
  { id: 'all', label: 'All' },
  { id: 'Freshman', label: 'Freshman' },
  { id: 'Sophomore', label: 'Sophomore' },
  { id: 'All class years', label: 'All Years' },
];

const appViews = ['monitor', 'alerts', 'contribute', 'maintainer'];

const savedStorageKey = 'applyfirst-shortlist';
const alertStorageKey = 'applyfirst-alert-preview';
const verificationStorageKey = 'applyfirst-verification-edits';
const sourceCheckLogStorageKey = 'applyfirst-source-check-log';
const waitlistStorageKey = 'applyfirst-waitlist-intent';
const contributionStorageKey = 'applyfirst-student-contributions';
const accessStorageKey = 'applyfirst-beta-access';
const accessCodeStorageKey = 'applyfirst-beta-access-code';
const onboardingStorageKey = 'applyfirst-onboarding-progress';
const betaAlertSetupStorageKey = 'applyfirst-beta-alert-setup';
const betaOutcomeStorageKey = 'applyfirst-beta-outcome';
const analyticsSessionStorageKey = 'applyfirst-analytics-session';
const inviteCodes = ['APPLYFIRST', 'APPLYFIRST2026', 'EARLYACCESS'];
const betaWorkspaceInviteCodePattern = /^AF-[A-Z0-9][A-Z0-9-]{4,58}[A-Z0-9]$/;
const phaseOneTarget = 25;
const waitlistEndpoint = import.meta.env.VITE_WAITLIST_ENDPOINT ?? '';
const contributionEndpoint = import.meta.env.VITE_CONTRIBUTION_ENDPOINT ?? '';
const alertEndpoint = import.meta.env.VITE_ALERT_ENDPOINT ?? waitlistEndpoint;
const watchEndpoint = import.meta.env.VITE_WATCH_ENDPOINT ?? '';
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
const textAlertsEnabled = import.meta.env.VITE_TEXT_ALERTS_ENABLED === 'true';
const defaultAlertPrefs = {
  classYear: '',
  roleTrack: '',
  priority: 'all',
  notificationMode: 'waitlist',
  sendTiming: '',
};
const defaultOnboardingProgress = {
  browsed: false,
  saved: false,
  focused: false,
  alerted: false,
  improved: false,
  dismissed: false,
};
const libraryPriorityLabels = {
  recommended: 'Recommended Programs',
  foundation: 'Prep Resources',
};
const librarySortOptions = [
  { value: 'actSoon', label: 'Act Soon' },
  { value: 'recentlyVerified', label: 'Recently Verified' },
  { value: 'alphabetical', label: 'A-Z' },
];
const opportunityStatusSortOrder = {
  deadlineSoon: 0,
  open: 1,
  expectedSoon: 2,
  watching: 3,
  verifyManually: 4,
};
const publicMonitorStatusMap = {
  open: 'open',
  deadline: 'deadlineSoon',
  opening_soon: 'expectedSoon',
  watching: 'watching',
  closed: 'watching',
};
const landingProofSummary = `${opportunities.length}+ Special Programs`;
const landingSourceCheckedCount = opportunities.filter((opportunity) => getVerificationState(opportunity) === 'verified').length;
const landingImpactStats = [
  { value: `${opportunities.length}+`, label: 'Special Programs' },
  { value: `${landingSourceCheckedCount}`, label: 'Source-Checked' },
  { value: 'Beta', label: 'Opening Alerts' },
];

function inferClassYearPreference(value = '') {
  const normalizedValue = value.toLowerCase();

  if (normalizedValue.includes('fresh') || normalizedValue.includes('first')) {
    return 'Freshman';
  }

  if (normalizedValue.includes('soph')) {
    return 'Sophomore';
  }

  return 'All class years';
}

function inferRoleTrackPreference(value = '') {
  const normalizedValue = value.toLowerCase();

  if (normalizedValue.match(/\bpm\b|product/)) {
    return 'Product Management';
  }

  if (normalizedValue.match(/quant|trading|finance|fintech/)) {
    return 'Quant / Finance';
  }

  if (normalizedValue.match(/fellowship|scholarship|conference|funding|community|access|prep/)) {
    return 'Access & Prep';
  }

  return 'Software Engineering';
}

function createAlertPrefsFromIntent(intent, basePrefs = defaultAlertPrefs) {
  if (!intent) {
    return basePrefs;
  }

  return {
    ...basePrefs,
    classYear: intent.classYear ? inferClassYearPreference(intent.classYear) : basePrefs.classYear,
    roleTrack: intent.interest ? inferRoleTrackPreference(intent.interest) : basePrefs.roleTrack,
  };
}

function getDefaultClassYearForOpportunity(opportunity) {
  if (opportunity.classYears.includes('Freshman')) {
    return 'Freshman';
  }

  if (opportunity.classYears.includes('Sophomore')) {
    return 'Sophomore';
  }

  return 'All class years';
}

function isPreferenceUnset(value) {
  return !value;
}

function getInitialView() {
  try {
    const requestedView = new URLSearchParams(window.location.search).get('view');
    return appViews.includes(requestedView) ? requestedView : 'monitor';
  } catch {
    return 'monitor';
  }
}

function getInitialSearchQuery() {
  try {
    return new URLSearchParams(window.location.search).get('q')?.trim() ?? '';
  } catch {
    return '';
  }
}

function getInitialSelectedId() {
  try {
    const requestedProgram = new URLSearchParams(window.location.search).get('program')?.trim();

    return opportunities.some((opportunity) => opportunity.id === requestedProgram) ? requestedProgram : '';
  } catch {
    return '';
  }
}

function isReviewToolsRequested() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('reviewTools') || params.has('maintainer') || params.get('view') === 'maintainer';
  } catch {
    return false;
  }
}

function isCleanCaptureMode() {
  try {
    return new URLSearchParams(window.location.search).get('capture') === 'clean';
  } catch {
    return false;
  }
}

const notificationModeLabels = {
  local: 'Local Preview',
  waitlist: 'Email Waitlist',
  saved: 'Saved Program Updates',
};

const sendTimingLabels = {
  openOnly: 'Openings Only',
  openAndDeadline: 'Openings & Deadlines',
  prepOpenDeadline: 'Prep, Openings & Deadlines',
};

const feedbackIssueTypes = [
  'Opening Date Looks Wrong',
  'Deadline Looks Wrong',
  'Eligibility Looks Wrong',
  'Broken or Wrong Link',
  'Program Status Looks Outdated',
  'Missing Program',
  'Should Have Alerts',
  'Confusing Label or Type',
  'Duplicate Program',
  'Other Feedback',
];

const programRelevanceOptions = [
  { value: 'this_cycle', label: 'Yes, this cycle' },
  { value: 'future_cycle', label: 'Yes, a future cycle' },
  { value: 'not_a_fit', label: 'Not a fit' },
  { value: 'not_eligible', label: 'Not eligible' },
  { value: 'eligibility_unclear', label: "Not sure if I'm eligible" },
];

const eligibilityUnclearOptions = [
  { value: 'class_year', label: 'Graduation Year or Class Year' },
  { value: 'major_or_field', label: 'Major or Field' },
  { value: 'location', label: 'Location' },
  { value: 'work_authorization', label: 'Work Authorization' },
  { value: 'experience_requirements', label: 'Experience Requirements' },
  { value: 'other', label: 'Other' },
];

const applicationOutcomeOptions = [
  { value: 'pending', label: 'Still waiting' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'not_selected', label: 'Not selected' },
  { value: 'withdrew', label: 'Withdrew' },
  { value: 'did_not_complete', label: 'Did not complete' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const testerSegmentOptions = [
  { value: 'unknown', label: 'Not Classified' },
  { value: 'rsa_assisted', label: 'RSA-Assisted' },
  { value: 'independent_waitlist', label: 'Independent / Waitlist' },
  { value: 'other', label: 'Other Beta Group' },
];

const betaReadyExamples = [
  'INSIGHT',
  'Futureforce Tech Launchpad',
  'Women in Trading Technology',
  'The New Technologists',
];

const hostQualifiedTitleIds = new Set([
  'palantir-american-tech-fellowship',
  'jane-street-fttp-watch',
  'virtu-womens-winternship-watch',
  'hackny-public-interest-lab',
  'codepath-career-ready-courses',
  'forage-virtual-experience',
  'jane-street-see-watch',
  'jpmorgan-career-ed-you-watch',
  'bloomberg-nextgen-leadership-summit',
  'jane-street-bridge-watch',
  'jane-street-preview-watch',
  'jane-street-qtc-watch',
  'jane-street-wise-watch',
  'jane-street-amp-watch',
  'capital-one-tech-summit',
  'capital-one-product-summit',
  'capital-one-analyst-early-internship',
  'develop-for-good-student-projects',
  'duolingo-thrive-program-watch',
  'citadel-datathon-watch',
  'citadel-trading-invitational-watch',
  'citadel-conference-travel-grant',
  'break-through-tech-ai-program',
  'break-through-tech-sprinternship',
  'two-sigma-freshman-swe-watch',
  'rewriting-the-code-community',
  'colorstack-membership',
]);

function normalizeTitlePart(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getOpportunityDisplayTitle(opportunity) {
  if (!opportunity) {
    return '';
  }

  const title = opportunity.name;
  const normalizedTitle = normalizeTitlePart(title);
  const normalizedOrganization = normalizeTitlePart(opportunity.organization);

  if (
    hostQualifiedTitleIds.has(opportunity.id) &&
    normalizedOrganization &&
    !normalizedTitle.includes(normalizedOrganization)
  ) {
    return `${opportunity.organization} ${title}`;
  }

  return title;
}

function getOpportunityDisplaySubtitle(opportunity) {
  const title = getOpportunityDisplayTitle(opportunity);
  const normalizedTitle = normalizeTitlePart(title);
  const normalizedOrganization = normalizeTitlePart(opportunity.organization);

  return normalizedOrganization && normalizedTitle.includes(normalizedOrganization)
    ? opportunity.category
    : opportunity.organization;
}

async function postJson(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Endpoint returned an error.');
  }

  return response;
}

async function fetchJson(endpoint) {
  const response = await fetch(endpoint);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Endpoint returned HTTP ${response.status}.`);
  }

  return payload;
}

function getAnalyticsSessionId() {
  try {
    const existing = window.sessionStorage.getItem(analyticsSessionStorageKey);

    if (existing) {
      return existing;
    }

    const sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(analyticsSessionStorageKey, sessionId);
    return sessionId;
  } catch {
    return crypto.randomUUID();
  }
}

function sendProductEvent(workerBaseUrl, accessCode, sessionId, eventName, details = {}) {
  if (!workerBaseUrl || !isWorkspaceInviteCode(accessCode)) {
    return Promise.resolve();
  }

  return postJson(`${workerBaseUrl}/analytics/events`, {
    accessCode,
    sessionId,
    eventId: crypto.randomUUID(),
    eventName,
    occurredAt: new Date().toISOString(),
    programId: details.programId || '',
    outcome: details.outcome || '',
    context: details.context || {},
  }).catch(() => {
    // Product analytics should never interrupt the student workflow.
  });
}

let turnstileScriptPromise;
const turnstileScriptSelector = 'script[data-applyfirst-turnstile]';
const turnstileReadyCallback = '__applyFirstTurnstileReady';
const turnstileLoadTimeoutMs = 15_000;

function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile requires a browser.'));
  }

  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(turnstileScriptSelector);
      existingScript?.remove();

      const script = document.createElement('script');
      let settled = false;

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        delete window[turnstileReadyCallback];
      };
      const fail = (message) => {
        if (settled) return;
        settled = true;
        cleanup();
        script.remove();
        turnstileScriptPromise = undefined;
        reject(new Error(message));
      };
      const timeoutId = window.setTimeout(() => {
        fail('Turnstile took too long to initialize.');
      }, turnstileLoadTimeoutMs);

      window[turnstileReadyCallback] = () => {
        if (settled) return;
        if (!window.turnstile) {
          fail('Turnstile did not initialize.');
          return;
        }

        settled = true;
        cleanup();
        resolve(window.turnstile);
      };

      script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${turnstileReadyCallback}`;
      script.async = true;
      script.defer = true;
      script.dataset.applyfirstTurnstile = 'true';
      script.addEventListener('error', () => fail('Turnstile could not load.'), { once: true });
      document.head.appendChild(script);
    });
  }

  return turnstileScriptPromise;
}

function getTurnstileErrorMessage(errorCode) {
  if (errorCode === '110600' || errorCode === '110620') {
    return 'Verification timed out. Try again when you are ready to submit.';
  }

  if (errorCode === '110200') {
    return 'Verification only works on the main ApplyFirst site. Open applyfirst-careers.pages.dev and try again.';
  }

  if (errorCode.startsWith('2005')) {
    return 'Verification was blocked by this browser. Try again or check your content-blocking settings.';
  }

  if (errorCode.startsWith('300') || errorCode.startsWith('600')) {
    return 'The security check was interrupted. Try again or open ApplyFirst in another browser.';
  }

  if (['110100', '110110', '400020', '400021', '400070'].includes(errorCode)) {
    return 'Verification is temporarily unavailable. Please try again later.';
  }

  return 'Verification could not load. Check your connection and try again.';
}

function TurnstileVerification({ action, onTokenChange, resetKey = 0 }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbackRef = useRef(onTokenChange);
  const [loadState, setLoadState] = useState(turnstileSiteKey ? 'loading' : 'missing');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [errorCode, setErrorCode] = useState('');

  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (!turnstileSiteKey || !containerRef.current) {
      return undefined;
    }

    let cancelled = false;
    setLoadState('loading');
    setErrorCode('');
    callbackRef.current('');

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: turnstileSiteKey,
          action,
          theme: 'light',
          size: 'flexible',
          retry: 'auto',
          'retry-interval': 5000,
          callback: (token) => {
            setLoadState('ready');
            setErrorCode('');
            callbackRef.current(token);
          },
          'expired-callback': () => {
            setLoadState('expired');
            callbackRef.current('');
          },
          'error-callback': (code) => {
            setLoadState('error');
            setErrorCode(String(code || ''));
            callbackRef.current('');
            return true;
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState('error');
          callbackRef.current('');
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action, retryAttempt]);

  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      setLoadState('loading');
      callbackRef.current('');
    }
  }, [resetKey]);

  if (!turnstileSiteKey) {
    return <p className="form-helper form-error">Verification is unavailable. Please try again later.</p>;
  }

  return (
    <div className="turnstile-verification" aria-live="polite">
      <div ref={containerRef} className="turnstile-widget" />
      {loadState === 'error' ? (
        <div className="turnstile-recovery" data-error-code={errorCode || undefined}>
          <p className="form-helper form-error">{getTurnstileErrorMessage(errorCode)}</p>
          <button className="turnstile-retry-button" type="button" onClick={() => setRetryAttempt((attempt) => attempt + 1)}>
            Try Again
          </button>
        </div>
      ) : null}
      {loadState === 'expired' ? <p className="form-helper">Verification expired. Please complete it again.</p> : null}
    </div>
  );
}

function normalizeInviteCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function isWorkspaceInviteCode(value) {
  return betaWorkspaceInviteCodePattern.test(normalizeInviteCode(value));
}

function isAcceptedInviteCode(value) {
  const normalizedCode = normalizeInviteCode(value);
  return inviteCodes.includes(normalizedCode) || isWorkspaceInviteCode(normalizedCode);
}

function normalizeStoredIds(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))] : [];
}

function normalizeCycleLabel(value) {
  return cleanText(value).toLowerCase();
}

function getApplicationCycleLabel(opportunity, appliedAt) {
  if (opportunity?.applicationCycleUnspecified === true) return '';

  const explicitCycle = cleanText(opportunity?.applicationCycleLabel);

  if (explicitCycle) return explicitCycle;

  const date = new Date(appliedAt);
  return Number.isNaN(date.getTime()) ? '' : String(date.getUTCFullYear());
}

function getSortableDate(value = '') {
  const normalized = String(value).replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  const isoMatch = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const monthMatch = normalized.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,)?\s+20\d{2}\b/i,
  );
  const parsed = Date.parse(isoMatch?.[0] ?? monthMatch?.[0] ?? '');

  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function compareOpportunityNames(a, b) {
  return a.name.localeCompare(b.name);
}

function compareOpportunityDates(a, b, direction = 'asc') {
  const first = getSortableDate(a);
  const second = getSortableDate(b);

  if (first === second) {
    return 0;
  }

  if (!Number.isFinite(first)) {
    return 1;
  }

  if (!Number.isFinite(second)) {
    return -1;
  }

  return direction === 'desc' ? second - first : first - second;
}

function compareOpportunities(a, b, sortMode) {
  if (sortMode === 'alphabetical') {
    return compareOpportunityNames(a, b);
  }

  if (sortMode === 'recentlyVerified') {
    const checkedDifference = compareOpportunityDates(a.lastChecked, b.lastChecked, 'desc');

    if (checkedDifference !== 0) {
      return checkedDifference;
    }

    const verificationDifference =
      Number(getVerificationState(b) === 'verified') - Number(getVerificationState(a) === 'verified');
    return verificationDifference || compareOpportunityNames(a, b);
  }

  const statusDifference =
    (opportunityStatusSortOrder[a.status] ?? Number.MAX_SAFE_INTEGER) -
    (opportunityStatusSortOrder[b.status] ?? Number.MAX_SAFE_INTEGER);

  if (statusDifference !== 0) {
    return statusDifference;
  }

  const verificationDifference =
    Number(getVerificationState(b) === 'verified') - Number(getVerificationState(a) === 'verified');

  if (verificationDifference !== 0) {
    return verificationDifference;
  }

  const timingDifference = compareOpportunityDates(a.deadline || a.openDate, b.deadline || b.openDate);

  return timingDifference || compareOpportunityNames(a, b);
}

function getLiveOpportunityUpdate(opportunity, liveStatus) {
  const status = publicMonitorStatusMap[liveStatus?.status];
  const checkedAt = String(liveStatus?.lastCheckedAt ?? '');
  const checkedDate = checkedAt.slice(0, 10);
  const isPositiveSignal = ['open', 'deadline', 'opening_soon'].includes(liveStatus?.status);
  const isConservativeSignal = ['watching', 'closed'].includes(liveStatus?.status);
  const hasAcceptedConfidence = isPositiveSignal
    ? liveStatus?.confidence === 'high'
    : isConservativeSignal && ['high', 'medium'].includes(liveStatus?.confidence);

  if (!status || !hasAcceptedConfidence) {
    return null;
  }

  if (
    opportunity.statusReviewedAt &&
    checkedAt &&
    Date.parse(checkedAt) <= Date.parse(opportunity.statusReviewedAt)
  ) {
    return null;
  }

  if (opportunity.lastChecked && checkedDate && checkedDate < opportunity.lastChecked) {
    return null;
  }

  return {
    status,
    confidence: liveStatus.confidence,
    ...(checkedDate ? { lastChecked: checkedDate } : {}),
  };
}

function App() {
  const cleanCaptureMode = isCleanCaptureMode();
  const activeWaitlistEndpoint = cleanCaptureMode ? '' : waitlistEndpoint;
  const activeContributionEndpoint = cleanCaptureMode ? '' : contributionEndpoint;
  const activeAlertEndpoint = cleanCaptureMode ? '' : alertEndpoint;
  const activeWatchEndpoint = cleanCaptureMode ? '' : watchEndpoint;
  const [activeView, setActiveView] = useState(() => getInitialView());
  const [hasAccess, setHasAccess] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return true;
      }

      return window.localStorage.getItem(accessStorageKey) === 'granted';
    } catch {
      return false;
    }
  });
  const [activeAccessCode, setActiveAccessCode] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return '';
      }

      return normalizeInviteCode(window.localStorage.getItem(accessCodeStorageKey));
    } catch {
      return '';
    }
  });
  const [query, setQuery] = useState(() => getInitialSearchQuery());
  const [category, setCategory] = useState('all');
  const [roleTrack, setRoleTrack] = useState('all');
  const [priority, setPriority] = useState('all');
  const [verification, setVerification] = useState('all');
  const [classYear, setClassYear] = useState('all');
  const [timing, setTiming] = useState('all');
  const [status, setStatus] = useState('all');
  const [libraryScope, setLibraryScope] = useState('all');
  const [sortMode, setSortMode] = useState('actSoon');
  const [liveProgramStatuses, setLiveProgramStatuses] = useState({});
  const [selectedId, setSelectedId] = useState(() => getInitialSelectedId());
  const [showInternalTools, setShowInternalTools] = useState(() => isReviewToolsRequested());
  const [maintainerToken, setMaintainerToken] = useState('');
  const [verificationEdits, setVerificationEdits] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return {};
      }

      return JSON.parse(window.localStorage.getItem(verificationStorageKey)) ?? {};
    } catch {
      return {};
    }
  });
  const [sourceCheckLog, setSourceCheckLog] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return {};
      }

      return JSON.parse(window.localStorage.getItem(sourceCheckLogStorageKey)) ?? {};
    } catch {
      return {};
    }
  });
  const [alertPrefs, setAlertPrefs] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return defaultAlertPrefs;
      }

      const storedPrefs = JSON.parse(window.localStorage.getItem(alertStorageKey));

      if (storedPrefs) {
        return {
          ...defaultAlertPrefs,
          ...storedPrefs,
        };
      }

      const storedIntent = JSON.parse(window.localStorage.getItem(waitlistStorageKey));

      if (storedIntent) {
        return createAlertPrefsFromIntent(storedIntent);
      }

      return {
        ...defaultAlertPrefs,
      };
    } catch {
      return defaultAlertPrefs;
    }
  });
  const [waitlistIntent, setWaitlistIntent] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return null;
      }

      return JSON.parse(window.localStorage.getItem(waitlistStorageKey)) ?? null;
    } catch {
      return null;
    }
  });
  const [studentContributions, setStudentContributions] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return [];
      }

      return JSON.parse(window.localStorage.getItem(contributionStorageKey)) ?? [];
    } catch {
      return [];
    }
  });
  const [savedIds, setSavedIds] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return [];
      }

      return JSON.parse(window.localStorage.getItem(savedStorageKey)) ?? [];
    } catch {
      return [];
    }
  });
  const [onboardingProgress, setOnboardingProgress] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return defaultOnboardingProgress;
      }

      return {
        ...defaultOnboardingProgress,
        ...(JSON.parse(window.localStorage.getItem(onboardingStorageKey)) ?? {}),
      };
    } catch {
      return defaultOnboardingProgress;
    }
  });
  const [betaAlertSetup, setBetaAlertSetup] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return null;
      }

      return JSON.parse(window.localStorage.getItem(betaAlertSetupStorageKey)) ?? null;
    } catch {
      return null;
    }
  });
  const [betaOutcome, setBetaOutcome] = useState(() => {
    try {
      if (cleanCaptureMode) {
        return null;
      }

      return JSON.parse(window.localStorage.getItem(betaOutcomeStorageKey)) ?? null;
    } catch {
      return null;
    }
  });
  const [programEvidence, setProgramEvidence] = useState({});
  const [programEvidenceState, setProgramEvidenceState] = useState('idle');
  const [applicationAttempts, setApplicationAttempts] = useState([]);
  const [applicationAttemptsState, setApplicationAttemptsState] = useState('idle');
  const [applicationMutationState, setApplicationMutationState] = useState({});
  const [programWatchState, setProgramWatchState] = useState('idle');
  const [watchIntentProgramIds, setWatchIntentProgramIds] = useState([]);
  const [lastSavedId, setLastSavedId] = useState(null);
  const [workspaceSyncState, setWorkspaceSyncState] = useState('idle');
  const lastWorkspaceSnapshotRef = useRef('');
  const analyticsSessionIdRef = useRef(cleanCaptureMode ? '' : getAnalyticsSessionId());
  const analyticsSessionTrackedRef = useRef(false);
  const viewedProgramIdsRef = useRef(new Set());
  const lastTrackedSearchRef = useRef('');
  const applicationAttemptInFlightRef = useRef(new Set());
  const ordinaryApplicationAttemptKeysRef = useRef(new Set());
  const applicationAttemptInteractionAtRef = useRef(new Map());

  const opportunityRecords = useMemo(
    () =>
      opportunities.map((opportunity) => {
        const liveUpdate = getLiveOpportunityUpdate(opportunity, liveProgramStatuses[opportunity.id]);

        return {
          ...opportunity,
          ...(liveUpdate ?? {}),
          ...(verificationEdits[opportunity.id] ?? {}),
          hasLocalVerificationEdit: Boolean(verificationEdits[opportunity.id]),
        };
      }),
    [liveProgramStatuses, verificationEdits],
  );

  useEffect(() => {
    const workerBaseUrl = getWorkerBaseUrl(activeWatchEndpoint);

    if (!workerBaseUrl || cleanCaptureMode) {
      return undefined;
    }

    let cancelled = false;

    const refreshLibraryStatus = () => {
      fetchJson(`${workerBaseUrl}/library/status`)
        .then((payload) => {
          if (cancelled || !Array.isArray(payload.programs)) {
            return;
          }

          setLiveProgramStatuses(
            Object.fromEntries(
              payload.programs
                .filter((program) => program?.programId)
                .map((program) => [program.programId, program]),
            ),
          );
        })
        .catch(() => {
          // Keep the curated library available when the live status feed is temporarily unavailable.
        });
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshLibraryStatus();
      }
    };

    refreshLibraryStatus();
    const refreshTimer = window.setInterval(refreshLibraryStatus, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [activeWatchEndpoint, cleanCaptureMode]);

  const verificationQueueItems = useMemo(
    () =>
      opportunityRecords
        .filter((item) => !getMonitoringReadiness(item).alertable)
        .map((item) => ({
          opportunity: item,
          priority: getVerificationPriority(item),
          readiness: getMonitoringReadiness(item),
        }))
        .sort((a, b) => b.priority.score - a.priority.score || a.opportunity.name.localeCompare(b.opportunity.name)),
    [opportunityRecords],
  );

  const applicationAttemptsByProgram = useMemo(
    () => applicationAttempts.reduce((grouped, attempt) => ({
      ...grouped,
      [attempt.programId]: [...(grouped[attempt.programId] ?? []), attempt],
    }), {}),
    [applicationAttempts],
  );
  const activeSavedIdSet = useMemo(() => new Set(savedIds), [savedIds]);
  const historyProgramIdSet = useMemo(
    () => new Set(applicationAttempts.map((attempt) => attempt.programId)),
    [applicationAttempts],
  );
  const activeWatchIntentIdSet = useMemo(
    () => new Set(watchIntentProgramIds),
    [watchIntentProgramIds],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return opportunityRecords.filter((opportunity) => {
      const searchText = [
        opportunity.name,
        opportunity.organization,
        opportunity.category,
        opportunity.why,
        opportunity.prep,
        opportunity.funding,
        opportunity.location,
        getMonitorSignal(opportunity).priorityLabel,
        getMonitorSignal(opportunity).alertReadinessLabel,
        getMonitorSignal(opportunity).sourceSignal.label,
        verificationLabels[getVerificationState(opportunity)],
        ...getOpportunityTracks(opportunity),
        ...opportunity.tags,
        ...opportunity.classYears,
      ]
        .join(' ')
        .toLowerCase();

      return (
        (!normalizedQuery || searchText.includes(normalizedQuery)) &&
        (libraryScope === 'all' ||
          (libraryScope === 'saved' && activeSavedIdSet.has(opportunity.id)) ||
          (libraryScope === 'history' && historyProgramIdSet.has(opportunity.id))) &&
        (roleTrack === 'all' || getOpportunityTracks(opportunity).includes(roleTrack)) &&
        (priority === 'all' ||
          (priority === 'recommended'
            ? ['high', 'watch'].includes(getMonitorSignal(opportunity).priority)
            : getMonitorSignal(opportunity).priority === priority)) &&
        (!showInternalTools || verification === 'all' || getVerificationState(opportunity) === verification) &&
        (category === 'all' || opportunity.category === category) &&
        (classYear === 'all' || opportunity.classYears.includes(classYear)) &&
        (timing === 'all' || opportunity.timing === timing) &&
        (status === 'all' || opportunity.status === status)
      );
    });
  }, [activeSavedIdSet, category, classYear, historyProgramIdSet, libraryScope, opportunityRecords, priority, query, roleTrack, showInternalTools, status, timing, verification]);

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => compareOpportunities(a, b, sortMode)),
    [filtered, sortMode],
  );

  const selectedOpportunity = sortedFiltered.find((item) => item.id === selectedId) ?? sortedFiltered[0] ?? null;
  const activeSavedIds = [...activeSavedIdSet];
  const savedOpportunities = opportunityRecords.filter((item) => activeSavedIdSet.has(item.id));
  const watchIntentOpportunities = opportunityRecords.filter((item) => activeWatchIntentIdSet.has(item.id));
  const alertPreviewMatches = useMemo(
    () =>
      opportunityRecords.filter((opportunity) => {
        const tracks = getOpportunityTracks(opportunity);
        const signal = getMonitorSignal(opportunity);

        return (
          (isPreferenceUnset(alertPrefs.classYear) ||
            alertPrefs.classYear === 'all' ||
            opportunity.classYears.includes(alertPrefs.classYear)) &&
          (isPreferenceUnset(alertPrefs.roleTrack) || alertPrefs.roleTrack === 'all' || tracks.includes(alertPrefs.roleTrack)) &&
          (isPreferenceUnset(alertPrefs.priority) || alertPrefs.priority === 'all' || signal.priority === alertPrefs.priority)
        );
      }),
    [alertPrefs, opportunityRecords],
  );
  const alertablePreviewCount = alertPreviewMatches.filter((item) => getMonitoringReadiness(item).alertable).length;
  const alertStrategy = useMemo(
    () => getAlertStrategy(alertPrefs, alertPreviewMatches, alertablePreviewCount),
    [alertPrefs, alertPreviewMatches, alertablePreviewCount],
  );
  const verifiedCount = opportunityRecords.filter((item) => item.confidence === 'high').length;
  const readinessPercent = Math.min(Math.round((opportunityRecords.length / phaseOneTarget) * 100), 100);
  const alertableCount = opportunityRecords.filter((item) => getMonitoringReadiness(item).alertable).length;
  const readySoonCount = opportunityRecords.filter((item) =>
    ['open', 'expectedSoon', 'deadlineSoon'].includes(item.status),
  ).length;
  const showReviewToolsToggle =
    showInternalTools ||
    isReviewToolsRequested();

  const guideProgress = {
    ...onboardingProgress,
    saved: onboardingProgress.saved || savedIds.length > 0,
    focused:
      onboardingProgress.focused ||
      [alertPrefs.classYear, alertPrefs.roleTrack, alertPrefs.sendTiming].every(Boolean),
    alerted: onboardingProgress.alerted || Boolean(betaAlertSetup),
    improved: onboardingProgress.improved || studentContributions.length > 0,
  };
  const onboardingComplete = ['browsed', 'saved', 'focused', 'alerted', 'improved'].every((step) => guideProgress[step]);
  const showFirstSessionGuide = !onboardingProgress.dismissed && !onboardingComplete;
  const canSyncWorkspace = hasAccess && isWorkspaceInviteCode(activeAccessCode) && Boolean(getWorkerBaseUrl(activeWatchEndpoint));
  const trackProductEvent = (eventName, details = {}) =>
    sendProductEvent(
      getWorkerBaseUrl(activeWatchEndpoint),
      activeAccessCode,
      analyticsSessionIdRef.current,
      eventName,
      details,
    );

  const hydrateWorkspaceState = (state = {}) => {
    setSavedIds(normalizeStoredIds(state.savedIds));
    setWatchIntentProgramIds(normalizeStoredIds(state.watchIntentProgramIds).slice(0, 10));
    setAlertPrefs({
      ...defaultAlertPrefs,
      ...(state.alertPrefs && typeof state.alertPrefs === 'object' ? state.alertPrefs : {}),
    });
    setBetaAlertSetup(state.betaAlertSetup && typeof state.betaAlertSetup === 'object' ? state.betaAlertSetup : null);
    setWaitlistIntent(state.waitlistIntent && typeof state.waitlistIntent === 'object' ? state.waitlistIntent : null);
    setOnboardingProgress({
      ...defaultOnboardingProgress,
      ...(state.onboardingProgress && typeof state.onboardingProgress === 'object' ? state.onboardingProgress : {}),
    });
    setBetaOutcome(state.betaOutcome && typeof state.betaOutcome === 'object' ? state.betaOutcome : null);
  };

  const createWorkspaceState = () => ({
    savedIds,
    watchIntentProgramIds,
    alertPrefs,
    betaAlertSetup,
    waitlistIntent,
    onboardingProgress,
    betaOutcome,
  });

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    window.localStorage.setItem(savedStorageKey, JSON.stringify(savedIds));
  }, [cleanCaptureMode, savedIds]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    window.localStorage.setItem(alertStorageKey, JSON.stringify(alertPrefs));
  }, [alertPrefs, cleanCaptureMode]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    window.localStorage.setItem(verificationStorageKey, JSON.stringify(verificationEdits));
  }, [cleanCaptureMode, verificationEdits]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    window.localStorage.setItem(sourceCheckLogStorageKey, JSON.stringify(sourceCheckLog));
  }, [cleanCaptureMode, sourceCheckLog]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    if (waitlistIntent) {
      window.localStorage.setItem(waitlistStorageKey, JSON.stringify(waitlistIntent));
    } else {
      window.localStorage.removeItem(waitlistStorageKey);
    }
  }, [cleanCaptureMode, waitlistIntent]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    window.localStorage.setItem(contributionStorageKey, JSON.stringify(studentContributions));
  }, [cleanCaptureMode, studentContributions]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    window.localStorage.setItem(onboardingStorageKey, JSON.stringify(onboardingProgress));
  }, [cleanCaptureMode, onboardingProgress]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    if (betaAlertSetup) {
      window.localStorage.setItem(betaAlertSetupStorageKey, JSON.stringify(betaAlertSetup));
    } else {
      window.localStorage.removeItem(betaAlertSetupStorageKey);
    }
  }, [betaAlertSetup, cleanCaptureMode]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    if (betaOutcome) {
      window.localStorage.setItem(betaOutcomeStorageKey, JSON.stringify(betaOutcome));
    } else {
      window.localStorage.removeItem(betaOutcomeStorageKey);
    }
  }, [betaOutcome, cleanCaptureMode]);

  useEffect(() => {
    if (cleanCaptureMode) {
      return;
    }

    if (!hasAccess || !activeAccessCode) {
      setWorkspaceSyncState('idle');
      return;
    }

    if (!isWorkspaceInviteCode(activeAccessCode) || !activeWatchEndpoint) {
      setWorkspaceSyncState('local');
      return;
    }

    let cancelled = false;
    setWorkspaceSyncState('loading');

    fetchJson(`${getWorkerBaseUrl(activeWatchEndpoint)}/workspace?code=${encodeURIComponent(activeAccessCode)}`)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        if (payload.exists) {
          hydrateWorkspaceState(payload.state);
        }
        setWorkspaceSyncState(payload.exists ? 'loaded' : 'new');
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaceSyncState('local');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeAccessCode, activeWatchEndpoint, cleanCaptureMode, hasAccess]);

  useEffect(() => {
    if (
      cleanCaptureMode ||
      !canSyncWorkspace ||
      !['loaded', 'synced'].includes(workspaceSyncState) ||
      programEvidenceState !== 'idle'
    ) {
      return;
    }

    let cancelled = false;
    setProgramEvidenceState('loading');
    fetchJson(
      `${getWorkerBaseUrl(activeWatchEndpoint)}/analytics/program-evidence?code=${encodeURIComponent(activeAccessCode)}`,
    )
      .then((payload) => {
        if (cancelled) return;
        setProgramEvidence(
          Object.fromEntries((payload.evidence ?? []).map((item) => [item.programId, item])),
        );
        setProgramEvidenceState('loaded');
      })
      .catch(() => {
        if (!cancelled) setProgramEvidenceState('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [activeAccessCode, activeWatchEndpoint, canSyncWorkspace, cleanCaptureMode, programEvidenceState, workspaceSyncState]);

  useEffect(() => {
    if (
      cleanCaptureMode ||
      !canSyncWorkspace ||
      !['loaded', 'synced'].includes(workspaceSyncState) ||
      applicationAttemptsState !== 'idle'
    ) {
      return;
    }

    let cancelled = false;
    setApplicationAttemptsState('loading');
    fetchJson(
      `${getWorkerBaseUrl(activeWatchEndpoint)}/analytics/application-attempts?code=${encodeURIComponent(activeAccessCode)}`,
    )
      .then((payload) => {
        if (cancelled) return;
        setApplicationAttempts(Array.isArray(payload.attempts) ? payload.attempts : []);
        setApplicationAttemptsState('loaded');
      })
      .catch(() => {
        if (!cancelled) setApplicationAttemptsState('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeAccessCode,
    activeWatchEndpoint,
    applicationAttemptsState,
    canSyncWorkspace,
    cleanCaptureMode,
    workspaceSyncState,
  ]);

  useEffect(() => {
    if (
      cleanCaptureMode ||
      !canSyncWorkspace ||
      !['loaded', 'synced'].includes(workspaceSyncState) ||
      programWatchState !== 'idle'
    ) {
      return;
    }

    let cancelled = false;
    setProgramWatchState('loading');
    fetchJson(
      `${getWorkerBaseUrl(activeWatchEndpoint)}/analytics/program-watches?code=${encodeURIComponent(activeAccessCode)}`,
    )
      .then((payload) => {
        if (cancelled) return;
        const watches = Array.isArray(payload.watches) ? payload.watches : [];
        if (watches.length) {
          setWatchIntentProgramIds(watches.filter((watch) => watch.isWatching).map((watch) => watch.programId).slice(0, 50));
        }
        setProgramWatchState('loaded');
      })
      .catch(() => {
        if (!cancelled) setProgramWatchState('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [activeAccessCode, activeWatchEndpoint, canSyncWorkspace, cleanCaptureMode, programWatchState, workspaceSyncState]);

  useEffect(() => {
    if (cleanCaptureMode || !canSyncWorkspace || !['loaded', 'new', 'synced', 'syncError'].includes(workspaceSyncState)) {
      return;
    }

    const workspaceState = createWorkspaceState();
    const workspaceSnapshot = JSON.stringify(workspaceState);

    if (workspaceSnapshot === lastWorkspaceSnapshotRef.current && workspaceSyncState === 'synced') {
      return;
    }

    const timer = window.setTimeout(() => {
      setWorkspaceSyncState('syncing');
      postJson(`${getWorkerBaseUrl(activeWatchEndpoint)}/workspace`, {
        accessCode: activeAccessCode,
        state: {
          ...workspaceState,
          savedAt: new Date().toISOString(),
        },
      })
        .then(() => {
          lastWorkspaceSnapshotRef.current = workspaceSnapshot;
          setWorkspaceSyncState('synced');
        })
        .catch(() => setWorkspaceSyncState('syncError'));
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    activeAccessCode,
    activeWatchEndpoint,
    alertPrefs,
    betaAlertSetup,
    betaOutcome,
    canSyncWorkspace,
    cleanCaptureMode,
    onboardingProgress,
    savedIds,
    waitlistIntent,
    watchIntentProgramIds,
    workspaceSyncState,
  ]);

  useEffect(() => {
    if (!showInternalTools && activeView === 'maintainer') {
      setActiveView('monitor');
    }
  }, [activeView, showInternalTools]);

  useEffect(() => {
    if (
      cleanCaptureMode ||
      analyticsSessionTrackedRef.current ||
      !canSyncWorkspace ||
      !['loaded', 'synced'].includes(workspaceSyncState)
    ) {
      return;
    }

    analyticsSessionTrackedRef.current = true;
    trackProductEvent('session_started', {
      context: { view: activeView, source: 'beta_workspace' },
    });
  }, [activeView, canSyncWorkspace, cleanCaptureMode, workspaceSyncState]);

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (
      cleanCaptureMode ||
      !canSyncWorkspace ||
      !['loaded', 'synced'].includes(workspaceSyncState) ||
      normalizedQuery.length < 2 ||
      normalizedQuery === lastTrackedSearchRef.current
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      lastTrackedSearchRef.current = normalizedQuery;
      trackProductEvent('search_used', {
        context: {
          view: 'programs',
          queryLength: normalizedQuery.length,
          resultCount: filtered.length,
        },
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [canSyncWorkspace, cleanCaptureMode, filtered.length, query, workspaceSyncState]);

  const markOnboardingStep = (step) => {
    setOnboardingProgress((currentProgress) =>
      currentProgress[step]
        ? currentProgress
        : {
            ...currentProgress,
            [step]: true,
          },
    );
  };

  const browseProgramsFromGuide = () => {
    markOnboardingStep('browsed');
    window.requestAnimationFrame(() => {
      document.getElementById('library')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const saveBetaAlertSetup = (setup) => {
    setBetaAlertSetup({
      ...setup,
      savedAt: new Date().toISOString(),
    });
    markOnboardingStep('focused');
    markOnboardingStep('alerted');
    trackProductEvent('focus_saved', {
      context: { view: 'my_focus', source: 'alert_setup' },
    });
    trackProductEvent('alerts_enabled', {
      context: { view: 'my_focus', source: setup.contactMethod || 'email' },
    });
  };

  const saveBetaOutcome = (outcome) => {
    const nextOutcome = {
      outcome,
      updatedAt: new Date().toISOString(),
    };

    setBetaOutcome(nextOutcome);
    trackProductEvent('outcome_reported', {
      outcome,
      context: { view: 'my_focus', source: 'beta_check_in' },
    });
  };

  const saveProgramEvidenceForOpportunity = async (programId, updates) => {
    const opportunity = opportunityRecords.find((item) => item.id === programId);
    const nextEvidence = {
      ...(programEvidence[programId] ?? {}),
      ...updates,
      programId,
      updatedAt: new Date().toISOString(),
      relevanceSource: updates.relevance ? 'explicit' : programEvidence[programId]?.relevanceSource,
      relevanceUpdatedAt: updates.relevance ? new Date().toISOString() : programEvidence[programId]?.relevanceUpdatedAt,
      saveState: 'saving',
    };

    setProgramEvidence((current) => ({ ...current, [programId]: nextEvidence }));

    if (!canSyncWorkspace || !opportunity) {
      setProgramEvidence((current) => ({
        ...current,
        [programId]: { ...nextEvidence, saveState: 'local' },
      }));
      return true;
    }

    try {
      await postJson(`${getWorkerBaseUrl(activeWatchEndpoint)}/analytics/program-evidence`, {
        accessCode: activeAccessCode,
        programId,
        relevance: nextEvidence.relevance,
        priorAwareness: nextEvidence.priorAwareness,
        eligibilityUnclearReason: nextEvidence.eligibilityUnclearReason,
        classYear: alertPrefs.classYear,
        roleTrack: alertPrefs.roleTrack,
        opportunityCategory: opportunity.category,
      });
      setProgramEvidence((current) => ({
        ...current,
        [programId]: {
          ...nextEvidence,
          relevanceSource: nextEvidence.relevance ? 'explicit' : nextEvidence.relevanceSource,
          relevanceUpdatedAt: nextEvidence.relevance ? new Date().toISOString() : nextEvidence.relevanceUpdatedAt,
          saveState: 'saved',
        },
      }));
      return true;
    } catch {
      setProgramEvidence((current) => ({
        ...current,
        [programId]: { ...nextEvidence, saveState: 'error' },
      }));
      return false;
    }
  };

  const resetFilters = () => {
    setQuery('');
    setRoleTrack('all');
    setPriority('all');
    setVerification('all');
    setCategory('all');
    setClassYear('all');
    setTiming('all');
    setStatus('all');
    setLibraryScope('all');
    setSortMode('actSoon');
  };

  const focusOpportunity = (id) => {
    resetFilters();
    setSelectedId(id);
    markOnboardingStep('browsed');
  };

  const selectOpportunity = (id) => {
    setLastSavedId(null);
    setSelectedId(id);
    markOnboardingStep('browsed');

    if (!viewedProgramIdsRef.current.has(id)) {
      viewedProgramIdsRef.current.add(id);
      trackProductEvent('program_viewed', {
        programId: id,
        context: { view: 'programs', source: 'library_list' },
      });
    }
  };

  const toggleSaved = (id) => {
    const alreadySaved = savedIds.includes(id);
    if (!alreadySaved) {
      markOnboardingStep('saved');
    }
    setLastSavedId(alreadySaved ? null : id);

    setSavedIds((currentIds) => {
      const currentlySaved = currentIds.includes(id);
      return currentlySaved ? currentIds.filter((savedId) => savedId !== id) : [...currentIds, id];
    });

    trackProductEvent(alreadySaved ? 'program_unsaved' : 'program_saved', {
      programId: id,
      context: { view: 'programs', source: 'bookmark' },
    });
  };

  const setOpportunityWatching = async (id, watching) => {
    const opportunity = opportunityRecords.find((item) => item.id === id);
    const previousIds = watchIntentProgramIds;

    setWatchIntentProgramIds((currentIds) => (
      watching
        ? [id, ...currentIds.filter((programId) => programId !== id)].slice(0, 50)
        : currentIds.filter((programId) => programId !== id)
    ));
    setProgramWatchState('saving');

    if (canSyncWorkspace && opportunity) {
      try {
        await postJson(`${getWorkerBaseUrl(activeWatchEndpoint)}/analytics/program-watches`, {
          accessCode: activeAccessCode,
          programId: id,
          programName: opportunity.name,
          organization: opportunity.organization,
          officialUrl: opportunity.applicationUrl || opportunity.url,
          readiness: getMonitoringReadiness(opportunity).label,
          watching,
        });
        setProgramWatchState('saved');
      } catch {
        setWatchIntentProgramIds(previousIds);
        setProgramWatchState('error');
        return false;
      }
    } else {
      setProgramWatchState('local');
    }

    trackProductEvent(watching ? 'watch_started' : 'watch_stopped', {
      programId: id,
      context: { view: 'programs', source: 'program_detail' },
    });
    return true;
  };

  const startAlertsForOpportunity = (id) => {
    const opportunity = opportunityRecords.find((item) => item.id === id);

    if (!opportunity) {
      setActiveView('alerts');
      return;
    }

    setSelectedId(id);
    markOnboardingStep('browsed');
    markOnboardingStep('focused');

    setOpportunityWatching(id, true);
    setAlertPrefs((currentPrefs) => {
      const tracks = getOpportunityTracks(opportunity);

      return {
        ...currentPrefs,
        classYear: isPreferenceUnset(currentPrefs.classYear)
          ? getDefaultClassYearForOpportunity(opportunity)
          : currentPrefs.classYear,
        roleTrack: isPreferenceUnset(currentPrefs.roleTrack) ? tracks[0] : currentPrefs.roleTrack,
        sendTiming: isPreferenceUnset(currentPrefs.sendTiming) ? 'openOnly' : currentPrefs.sendTiming,
      };
    });
    setActiveView('alerts');
    window.setTimeout(() => {
      document.getElementById('watch-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const markOpportunityApplied = async (id, { allowDuplicate = false } = {}) => {
    const interactionAt = Date.now();
    const previousInteractionAt = applicationAttemptInteractionAtRef.current.get(id) ?? 0;
    if (interactionAt - previousInteractionAt < 1_000) return false;
    if (applicationAttemptInFlightRef.current.has(id)) return false;
    applicationAttemptInteractionAtRef.current.set(id, interactionAt);

    const now = new Date().toISOString();
    const opportunity = opportunityRecords.find((item) => item.id === id);
    const cycleLabel = getApplicationCycleLabel(opportunity, now);
    const ordinaryAttemptKey = `${id}:${normalizeCycleLabel(cycleLabel) || 'unspecified'}`;
    const existingAttempt = !allowDuplicate
      ? applicationAttempts.find((attempt) => (
        attempt.programId === id && normalizeCycleLabel(attempt.cycleLabel) === normalizeCycleLabel(cycleLabel)
      ))
      : null;

    if (!allowDuplicate && (existingAttempt || ordinaryApplicationAttemptKeysRef.current.has(ordinaryAttemptKey))) {
      return true;
    }

    applicationAttemptInFlightRef.current.add(id);
    if (!allowDuplicate) ordinaryApplicationAttemptKeysRef.current.add(ordinaryAttemptKey);
    setApplicationMutationState((current) => ({ ...current, [id]: 'saving' }));

    try {
      let created = true;
      let attempt = {
        id: crypto.randomUUID(),
        programId: id,
        appliedAt: now,
        cycleLabel,
        outcome: 'pending',
        outcomeUpdatedAt: null,
        source: allowDuplicate ? 'local_additional' : 'local',
        createdAt: now,
        updatedAt: now,
      };

      if (canSyncWorkspace) {
        const response = await postJson(
          `${getWorkerBaseUrl(activeWatchEndpoint)}/analytics/application-attempts`,
          {
            accessCode: activeAccessCode,
            programId: id,
            appliedAt: now,
            cycleLabel,
            cycleUnspecified: !cycleLabel,
            outcome: 'pending',
            allowDuplicate,
          },
        );
        attempt = response.attempt;
        created = response.created !== false;
      }

      setApplicationAttempts((current) => (
        current.some((item) => item.id === attempt.id) ? current : [attempt, ...current]
      ));
      setProgramEvidence((current) => {
        const existing = current[id] ?? {};
        if (existing.relevanceSource === 'explicit') return current;
        return {
          ...current,
          [id]: {
            ...existing,
            programId: id,
            relevance: 'this_cycle',
            relevanceSource: 'inferred_applied',
            relevanceUpdatedAt: now,
            updatedAt: now,
          },
        };
      });
      setApplicationMutationState((current) => ({ ...current, [id]: 'saved' }));
      if (created) {
        trackProductEvent('application_recorded', {
          programId: id,
          context: { view: 'programs', source: allowDuplicate ? 'add_another_application' : 'mark_applied' },
        });
      }
      return true;
    } catch {
      if (!allowDuplicate) ordinaryApplicationAttemptKeysRef.current.delete(ordinaryAttemptKey);
      setApplicationMutationState((current) => ({ ...current, [id]: 'error' }));
      return false;
    } finally {
      applicationAttemptInFlightRef.current.delete(id);
    }
  };

  const updateApplicationOutcome = async (attemptId, programId, outcome) => {
    setApplicationMutationState((current) => ({ ...current, [attemptId]: 'saving' }));

    try {
      if (canSyncWorkspace) {
        await postJson(
          `${getWorkerBaseUrl(activeWatchEndpoint)}/analytics/application-attempts/${encodeURIComponent(attemptId)}/outcome`,
          { accessCode: activeAccessCode, outcome },
        );
      }
      const now = new Date().toISOString();
      setApplicationAttempts((current) => current.map((attempt) => (
        attempt.id === attemptId
          ? { ...attempt, outcome, outcomeUpdatedAt: outcome === 'pending' ? null : now, updatedAt: now }
          : attempt
      )));
      setApplicationMutationState((current) => ({ ...current, [attemptId]: 'saved' }));
      trackProductEvent('application_outcome_updated', {
        programId,
        context: { view: 'programs', source: outcome },
      });
      return true;
    } catch {
      setApplicationMutationState((current) => ({ ...current, [attemptId]: 'error' }));
      return false;
    }
  };

  const saveVerificationEdit = (id, updates) => {
    setVerificationEdits((currentEdits) => ({
      ...currentEdits,
      [id]: {
        ...(currentEdits[id] ?? {}),
        ...updates,
      },
    }));
  };

  const resetVerificationEdit = (id) => {
    setVerificationEdits((currentEdits) => {
      const nextEdits = { ...currentEdits };
      delete nextEdits[id];
      return nextEdits;
    });
  };

  const addSourceCheckLogEntry = (id, entry) => {
    const logEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
    };

    setSourceCheckLog((currentLog) => ({
      ...currentLog,
      [id]: [logEntry, ...(currentLog[id] ?? [])].slice(0, 6),
    }));
  };

  const saveWaitlistIntent = (intent) => {
    const savedIntent = {
      ...intent,
      savedAt: new Date().toISOString(),
    };

    setWaitlistIntent(savedIntent);
    setAlertPrefs((currentPrefs) => createAlertPrefsFromIntent(savedIntent, currentPrefs));
  };

  const resetWaitlistIntent = () => {
    setWaitlistIntent(null);
    setAlertPrefs(defaultAlertPrefs);
  };

  const addStudentContribution = async (type, draft, verification = {}) => {
    const contribution = {
      ...draft,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      savedAt: new Date().toISOString(),
      status: activeContributionEndpoint ? 'Submitting' : 'Saved Locally',
    };

    if (activeContributionEndpoint) {
      if (!verification.turnstileToken) {
        return 'verificationRequired';
      }

      try {
        const response = await fetch(activeContributionEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'applyfirst-contribution',
            ...contribution,
            turnstileToken: verification.turnstileToken,
          }),
        });

        if (!response.ok) {
          throw new Error('Contribution endpoint returned an error.');
        }

        setStudentContributions((currentContributions) =>
          [{ ...contribution, status: 'Submitted for Review' }, ...currentContributions].slice(0, 12),
        );
        markOnboardingStep('improved');
        trackProductEvent('contribution_submitted', {
          programId: cleanText(contribution.programId || ''),
          context: { view: 'suggest_updates', source: type },
        });
        return 'submitted';
      } catch {
        setStudentContributions((currentContributions) =>
          [{ ...contribution, status: 'Saved Locally After Endpoint Issue' }, ...currentContributions].slice(0, 12),
        );
        markOnboardingStep('improved');
        return 'localFallback';
      }
    }

    setStudentContributions((currentContributions) => [contribution, ...currentContributions].slice(0, 12));
    markOnboardingStep('improved');
    return 'savedLocal';
  };

  const grantAccess = (accessCode = '') => {
    const normalizedAccessCode = normalizeInviteCode(accessCode);
    let previousAccessCode = '';

    try {
      previousAccessCode = normalizeInviteCode(window.localStorage.getItem(accessCodeStorageKey));
      window.localStorage.setItem(accessStorageKey, 'granted');
      if (normalizedAccessCode) {
        window.localStorage.setItem(accessCodeStorageKey, normalizedAccessCode);
      } else {
        window.localStorage.removeItem(accessCodeStorageKey);
      }
    } catch {
      // Access still works for the current session if local storage is unavailable.
    }
    lastWorkspaceSnapshotRef.current = '';
    analyticsSessionTrackedRef.current = false;
    viewedProgramIdsRef.current = new Set();
    lastTrackedSearchRef.current = '';
    if (normalizedAccessCode && previousAccessCode !== normalizedAccessCode) {
      setSavedIds([]);
      setWatchIntentProgramIds([]);
      setAlertPrefs({ ...defaultAlertPrefs });
      setBetaAlertSetup(null);
      setWaitlistIntent(null);
      setOnboardingProgress({ ...defaultOnboardingProgress });
      setBetaOutcome(null);
      setProgramEvidence({});
      setProgramEvidenceState('idle');
      setApplicationAttempts([]);
      setApplicationAttemptsState('idle');
      setApplicationMutationState({});
      setProgramWatchState('idle');
    }
    setActiveAccessCode(normalizedAccessCode);
    setHasAccess(true);
    setActiveView('monitor');
  };

  const returnToLanding = () => {
    try {
      window.localStorage.removeItem(accessStorageKey);
      window.localStorage.removeItem(accessCodeStorageKey);
    } catch {
      // Returning to the landing page still works for the current session if local storage is unavailable.
    }
    lastWorkspaceSnapshotRef.current = '';
    analyticsSessionTrackedRef.current = false;
    viewedProgramIdsRef.current = new Set();
    lastTrackedSearchRef.current = '';
    setActiveAccessCode('');
    setHasAccess(false);
    setActiveView('monitor');
  };

  if (!hasAccess) {
    return (
      <LandingPage
        alertPrefs={alertPrefs}
        alertStrategy={alertStrategy}
        waitlistIntent={waitlistIntent}
        waitlistEndpoint={activeWaitlistEndpoint}
        onWaitlistSave={saveWaitlistIntent}
        onWaitlistReset={resetWaitlistIntent}
        onGrantAccess={grantAccess}
      />
    );
  }

  return (
    <div className="app-shell">
      {cleanCaptureMode ? null : (
        <Header
          activeView={activeView}
          onViewChange={setActiveView}
          showInternalTools={showInternalTools}
          showReviewToolsToggle={showReviewToolsToggle}
          onToggleInternalTools={() => setShowInternalTools((current) => !current)}
          onReturnToLanding={returnToLanding}
        />
      )}
      <main className="workspace">
        {activeView === 'maintainer' && showInternalTools ? (
          <MaintainerReviewConsole
            watchEndpoint={activeWatchEndpoint}
            adminToken={maintainerToken}
            onAdminTokenChange={setMaintainerToken}
          />
        ) : activeView === 'alerts' ? (
          <section className="settings-view student-alerts-view" aria-label="My Focus settings">
            <section className="alert-hero" aria-label="ApplyFirst watch overview">
              <div>
                <span>My Focus</span>
                <h1 className="page-hero-title">Choose What ApplyFirst Watches.</h1>
                <p>Set your focus, save targets, and add contact info so alerts arrive when openings are ready.</p>
              </div>
            </section>
            <AlertSetupPanel
              alertPrefs={alertPrefs}
              setAlertPrefs={setAlertPrefs}
              onFocusChange={() => markOnboardingStep('focused')}
              matchCount={alertPreviewMatches.length}
              alertMatches={alertPreviewMatches}
              savedOpportunities={savedOpportunities}
              watchIntentOpportunities={watchIntentOpportunities}
              alertStrategy={alertStrategy}
              betaAlertSetup={betaAlertSetup}
              onBetaAlertSetupSave={saveBetaAlertSetup}
              onAddSuggestedProgram={startAlertsForOpportunity}
              waitlistIntent={waitlistIntent}
              alertEndpoint={activeAlertEndpoint}
              watchEndpoint={activeWatchEndpoint}
              accessCode={activeAccessCode}
            />
          </section>
        ) : activeView === 'contribute' ? (
          <ContributeView
            contributions={studentContributions}
            opportunities={opportunityRecords}
            captureEndpoint={activeContributionEndpoint}
            onSubmit={addStudentContribution}
          />
        ) : (
          <section className="opportunity-library-view" aria-label="ApplyFirst opportunity library">
            <section className="library-summary" aria-label="ApplyFirst overview">
              <div className="library-summary-copy">
                <span>Opportunity Library</span>
                <h1 className="page-hero-title">
                  <span className="headline-line">Find Early Programs</span>
                  <span className="headline-line headline-highlight">Before They Get Crowded.</span>
                </h1>
                <p>Compare early programs, fellowships, funding, communities, and timing in one place.</p>
                <label className="global-search hero-search">
                  <span className="sr-only">Search Programs</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      if (event.target.value.trim()) {
                        markOnboardingStep('browsed');
                      }
                    }}
                    placeholder="Search program, role, timing, or source..."
                  />
                </label>
              </div>
              <aside className="library-stats" aria-label="Current library status">
                <div className="library-stat-heading">
                  <span>Library Snapshot</span>
                  <p>Beta Library</p>
                </div>
                <dl className="library-stat-grid">
                  <div>
                    <dt>{opportunityRecords.length}</dt>
                    <dd>Curated Programs</dd>
                  </div>
                  <div>
                    <dt>{readySoonCount}</dt>
                    <dd>Ready Soon</dd>
                  </div>
                  <div>
                    <dt>{activeSavedIds.length}</dt>
                    <dd>Saved By You</dd>
                  </div>
                  <div>
                    <dt>{verifiedCount}</dt>
                    <dd>Source Confirmed</dd>
                  </div>
                </dl>
              </aside>
            </section>

            <section className="library-controls" aria-label="Search and filter opportunities">
              <div className="view-controls" aria-label="Class-year view">
                <span>Class-Year View</span>
                <div className="segmented-control">
                  {quickViews.map((view) => (
                    <button
                      key={view.id}
                      className={classYear === view.id ? 'active' : ''}
                      type="button"
                      onClick={() => setClassYear(view.id)}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              </div>
              <FilterStack
                showInternalTools={showInternalTools}
                category={category}
                setCategory={setCategory}
                roleTrack={roleTrack}
                setRoleTrack={setRoleTrack}
                priority={priority}
                setPriority={setPriority}
                verification={verification}
                setVerification={setVerification}
                timing={timing}
                setTiming={setTiming}
                status={status}
                setStatus={setStatus}
                resetFilters={resetFilters}
              />
            </section>

            {showFirstSessionGuide ? (
              <FirstSessionGuide
                progress={guideProgress}
                savedCount={activeSavedIds.length}
                onBrowse={browseProgramsFromGuide}
                onFocusSetup={() => setActiveView('alerts')}
                onImproveLibrary={() => setActiveView('contribute')}
                onDismiss={() => markOnboardingStep('dismissed')}
              />
            ) : null}

            {showInternalTools ? <VerificationQueuePanel queueItems={verificationQueueItems} onSelect={focusOpportunity} /> : null}

            <section className="library-workspace" id="library" aria-label="Opportunity library workspace">
              <section className="results-board">
                <div className="board-toolbar">
                  <div>
                    <span>{libraryScope === 'saved' ? 'Saved Programs' : libraryScope === 'history' ? 'Application History' : 'Library Results'}</span>
                    <strong>{filtered.length} {filtered.length === 1 ? 'program' : 'programs'}</strong>
                  </div>
                  <div className="board-toolbar-actions">
                    <label className="library-sort-control">
                      <span className="sr-only">Sort Programs</span>
                      <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                        {librarySortOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="result-view-switch" aria-label="Program list view">
                      <button
                        className={libraryScope === 'all' ? 'active' : ''}
                        type="button"
                        aria-pressed={libraryScope === 'all'}
                        onClick={() => setLibraryScope('all')}
                      >
                        All
                      </button>
                      <button
                        className={libraryScope === 'saved' ? 'active' : ''}
                        type="button"
                        aria-pressed={libraryScope === 'saved'}
                        onClick={() => setLibraryScope('saved')}
                        disabled={!activeSavedIds.length && libraryScope !== 'saved'}
                      >
                        Saved
                        <span>{activeSavedIds.length}</span>
                      </button>
                      <button
                        className={libraryScope === 'history' ? 'active' : ''}
                        type="button"
                        aria-pressed={libraryScope === 'history'}
                        onClick={() => setLibraryScope('history')}
                        disabled={!historyProgramIdSet.size && libraryScope !== 'history'}
                      >
                        History
                        <span>{historyProgramIdSet.size}</span>
                      </button>
                    </div>
                    <button type="button" onClick={resetFilters}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="record-table" role="list">
                  {sortedFiltered.length ? (
                    sortedFiltered.map((opportunity) => (
                        <OpportunityRecord
                          key={opportunity.id}
                          opportunity={opportunity}
                          selected={selectedOpportunity?.id === opportunity.id}
                          saved={savedIds.includes(opportunity.id)}
                          progress={getProgramBoardState(
                            programEvidence[opportunity.id],
                            applicationAttemptsByProgram[opportunity.id],
                          )}
                          onSelect={() => selectOpportunity(opportunity.id)}
                          onSave={() => toggleSaved(opportunity.id)}
                        />
                    ))
                  ) : (
                    <EmptyState onReset={resetFilters} />
                  )}
                </div>
              </section>

              <aside className="opportunity-detail-column" aria-label="Selected program details">
                <OpportunityDetail
                  opportunity={selectedOpportunity}
                  saved={selectedOpportunity ? savedIds.includes(selectedOpportunity.id) : false}
                  watched={selectedOpportunity ? activeWatchIntentIdSet.has(selectedOpportunity.id) : false}
                  onSave={() => selectedOpportunity && toggleSaved(selectedOpportunity.id)}
                  onToggleWatch={() => selectedOpportunity && setOpportunityWatching(
                    selectedOpportunity.id,
                    !activeWatchIntentIdSet.has(selectedOpportunity.id),
                  )}
                  justSaved={Boolean(
                    selectedOpportunity && selectedOpportunity.id === lastSavedId && savedIds.includes(selectedOpportunity.id),
                  )}
                  onOfficialSourceClick={() => {
                    if (selectedOpportunity) {
                      trackProductEvent('official_source_clicked', {
                        programId: selectedOpportunity.id,
                        context: {
                          view: 'programs',
                          source: selectedOpportunity.status === 'open' ? 'apply_now' : 'official_source',
                          status: selectedOpportunity.status,
                        },
                      });
                    }
                  }}
                  onImproveLibrary={() => setActiveView('contribute')}
                  programEvidence={selectedOpportunity ? programEvidence[selectedOpportunity.id] : null}
                  applicationAttempts={selectedOpportunity ? applicationAttemptsByProgram[selectedOpportunity.id] ?? [] : []}
                  applicationMutationState={applicationMutationState}
                  onMarkApplied={(options) => selectedOpportunity && markOpportunityApplied(selectedOpportunity.id, options)}
                  onApplicationOutcomeChange={(attemptId, outcome) => selectedOpportunity && updateApplicationOutcome(
                    attemptId,
                    selectedOpportunity.id,
                    outcome,
                  )}
                  onProgramEvidenceSave={(updates) =>
                    selectedOpportunity && saveProgramEvidenceForOpportunity(selectedOpportunity.id, updates)
                  }
                  onVerificationSave={saveVerificationEdit}
                  onVerificationReset={resetVerificationEdit}
                  sourceCheckEntries={selectedOpportunity ? sourceCheckLog[selectedOpportunity.id] ?? [] : []}
                  onSourceCheckSave={addSourceCheckLogEntry}
                  showInternalTools={showInternalTools}
                />
              </aside>
            </section>

            {showInternalTools ? (
              <section className="library-support-row" aria-label="Saved Programs and Beta Coverage">
                <Shortlist items={savedOpportunities} onSelect={focusOpportunity} />
                <ReadinessPanel
                  readinessPercent={readinessPercent}
                  recordCount={opportunityRecords.length}
                  verifiedCount={verifiedCount}
                  target={phaseOneTarget}
                />
                {cleanCaptureMode ? null : (
                  <ReviewModeControl
                    enabled={showInternalTools}
                    onToggle={() => setShowInternalTools((current) => !current)}
                  />
                )}
              </section>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}

function LandingPage({
  alertPrefs,
  alertStrategy,
  waitlistIntent,
  waitlistEndpoint,
  onWaitlistSave,
  onWaitlistReset,
  onGrantAccess,
}) {
  const [inviteCode, setInviteCode] = useState('');
  const [accessError, setAccessError] = useState('');

  const submitInviteCode = (event) => {
    event.preventDefault();
    const normalizedCode = normalizeInviteCode(inviteCode);

    if (isAcceptedInviteCode(normalizedCode)) {
      setAccessError('');
      onGrantAccess(isWorkspaceInviteCode(normalizedCode) ? normalizedCode : '');
      return;
    }

    setAccessError('Use a beta code like AF-NAME-1234, or a current prototype access code.');
  };

  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <div className="brand" aria-label="ApplyFirst">
          <ApplyFirstMark />
          <span className="brand-copy">
            <strong>ApplyFirst</strong>
            <em>Find Early. Apply First.</em>
          </span>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-label="ApplyFirst private beta">
          <div className="landing-copy">
            <span>For Openings Students Usually Catch Too Late</span>
            <h1 className="landing-headline page-hero-title">
              <span className="landing-headline-text">Track Early Programs</span>
              <span className="landing-headline-text landing-headline-accent">Before They Open</span>
            </h1>
            <p>
              Save high-signal programs, watch opening windows, and get reviewed alerts before deadlines get crowded.
            </p>
            <div className="landing-impact-panel" aria-label="ApplyFirst beta impact">
              <div className="landing-impact-grid">
                {landingImpactStats.map((stat) => (
                  <span key={stat.label}>
                    <strong>{stat.value}</strong>
                    <em>{stat.label}</em>
                  </span>
                ))}
              </div>
            </div>
            <div className="landing-actions">
              <a className="button primary" href="#waitlist">
                Join the Waitlist
              </a>
            </div>
          </div>

          <aside className="landing-panel" aria-label="Private Beta Access">
            <div className="landing-panel-kicker">
              <span>Private Beta</span>
              <strong>Invite Only</strong>
            </div>
            <h2>Enter Invite Code</h2>
            <form className="invite-form beta-access-form" onSubmit={submitInviteCode}>
              <label>
                Invite Code
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="AF-NAME-1234"
                  autoComplete="off"
                />
              </label>
              {accessError ? <p className="form-error">{accessError}</p> : null}
              <button type="submit">Open ApplyFirst</button>
            </form>
            <a className="panel-waitlist-link" href="#waitlist">
              Need access? Join the waitlist
            </a>
          </aside>
        </section>

        <HowItWorksSection />

        <ProductPreviewSection />

        <CareerAgencySection />

        <WaitlistPanel
          context="landing"
          alertPrefs={alertPrefs}
          alertStrategy={alertStrategy}
          waitlistIntent={waitlistIntent}
          captureEndpoint={waitlistEndpoint}
          onSave={onWaitlistSave}
          onReset={onWaitlistReset}
        />
      </main>
    </div>
  );
}

function ProductPreviewSection() {
  return (
    <section className="product-preview" aria-label="ApplyFirst product preview">
      <div className="product-preview-heading">
        <span>Product Preview</span>
        <h2>From Scattered Links to One Watchlist.</h2>
        <p>Compare programs, timing, saved targets, and source confidence in one view.</p>
      </div>
      <div className="product-preview-layout">
        <div className="product-preview-gallery">
          <figure className="product-preview-main">
            <img
              src={programsScreenshot}
              alt="ApplyFirst Programs page with search, filters, library snapshot, opportunity list, and selected program details."
            />
            <figcaption>
              <strong>Program Library</strong>
              <span>Search, filter, compare, and save high-signal student opportunities.</span>
            </figcaption>
          </figure>
          <figure className="product-preview-status">
            <img
              src={programStatusMixScreenshot}
              alt="ApplyFirst program rows showing Open Now, Watching, Deadline Soon, and Opening Soon status examples."
            />
            <figcaption>
              <strong>Status Signals</strong>
              <span>See what is open, what to watch, and what has a deadline approaching.</span>
            </figcaption>
          </figure>
        </div>
        <div className="signal-stack" aria-label="ApplyFirst signal examples">
          <article>
            <span className="signal-icon">01</span>
            <div>
              <strong>Source Check</strong>
              <p>Official page, prior URL, timing notes, and verification status stay together.</p>
            </div>
          </article>
          <article>
            <span className="signal-icon">02</span>
            <div>
              <strong>Timing Signal</strong>
              <p>Opening windows, deadlines, and prep reminders become easier to watch.</p>
            </div>
          </article>
          <article>
            <span className="signal-icon">03</span>
            <div>
              <strong>Student Action</strong>
              <p>Save programs now; future alerts only go out when signals are trustworthy.</p>
            </div>
          </article>
        </div>
      </div>
      <BetaExampleStrip />
    </section>
  );
}

function BetaExampleStrip() {
  return (
    <section className="beta-example-strip" aria-label="Trusted beta examples">
      <div>
        <span>Beyond Internship Boards</span>
        <p>Discovery programs, fellowships, funding, prep programs, and alternative paths worth tracking early.</p>
      </div>
      <div className="beta-example-list">
        {betaReadyExamples.slice(0, 4).map((program) => (
          <em key={program}>{program}</em>
        ))}
      </div>
    </section>
  );
}

function CareerAgencySection() {
  const agencySignals = [
    {
      title: 'Apply Earlier',
      text: 'Many programs review as applications arrive or close once spots fill, so timing alerts help students move early.',
    },
    {
      title: 'Built For Your Stage',
      text: 'Many programs are designed before students have traditional internship experience.',
    },
    {
      title: 'Build Proof',
      text: 'Turn programs, fellowships, and prep into projects, resume signal, peers, and clearer stories.',
    },
    {
      title: 'Choose Better',
      text: 'Use early exposure to learn what kind of work and environment you actually want.',
    },
  ];

  return (
    <section className="career-agency" aria-label="Why early career programs matter">
      <div className="career-agency-copy">
        <span>Why It Matters</span>
        <h2>Explore Early. Build Leverage.</h2>
      </div>
      <div className="agency-map" aria-label="Early career program benefits">
        {agencySignals.map((signal) => (
          <article key={signal.title}>
            <span aria-hidden="true" />
            <strong>{signal.title}</strong>
            <p>{signal.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      label: '1',
      title: 'Find',
      text: 'Search programs by year, role, timing, and source status.',
    },
    {
      label: '2',
      title: 'Save',
      text: 'Build one focused list instead of checking scattered links.',
    },
    {
      label: '3',
      title: 'Set Focus',
      text: 'Tell ApplyFirst which openings and deadlines matter to you.',
    },
    {
      label: '4',
      title: 'Get Alerts',
      text: 'Receive reviewed opening signals when a watched program is ready.',
    },
  ];

  return (
    <section className="how-it-works" aria-label="How ApplyFirst works">
      <div className="how-it-works-copy">
        <span>How It Works</span>
        <h2>Less Checking. Earlier Action.</h2>
        <p>ApplyFirst turns scattered lists, old spreadsheets, and official pages into one watchlist students can act on earlier.</p>
      </div>
      <div className="how-it-works-steps">
        {steps.map((step) => (
          <article key={step.label}>
            <span>{step.label}</span>
            <strong>{step.title}</strong>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FirstSessionGuide({ progress, savedCount, onBrowse, onFocusSetup, onImproveLibrary, onDismiss }) {
  const steps = [
    {
      id: 'browsed',
      label: '1',
      title: 'Find a Program',
      text: 'Search or open a listing.',
      actionLabel: 'Search',
      onAction: onBrowse,
    },
    {
      id: 'saved',
      label: '2',
      title: 'Save One',
      text: savedCount ? `${savedCount} saved` : 'Bookmark one item.',
      actionLabel: savedCount ? 'Saved' : 'Bookmark',
    },
    {
      id: 'focused',
      label: '3',
      title: 'Set Focus',
      text: progress.focused ? 'Focus set.' : 'Add year, role, timing.',
      actionLabel: 'Set focus',
      onAction: onFocusSetup,
    },
    {
      id: 'alerted',
      label: '4',
      title: 'Enable Alerts',
      text: 'Add email or phone.',
      actionLabel: 'Get alerts',
      onAction: onFocusSetup,
    },
    {
      id: 'improved',
      label: '5',
      title: 'Suggest Updates',
      text: 'Report stale info',
      actionLabel: 'Suggest',
      onAction: onImproveLibrary,
    },
  ];
  const completedCount = steps.filter((step) => progress[step.id]).length;
  const getStepContent = (step) => (
    <>
      <span className="first-session-number">{step.label}</span>
      <span className="first-session-step-copy">
        <strong>{step.title}</strong>
        <em>{step.text}</em>
      </span>
    </>
  );

  return (
    <section className="first-session-guide" aria-label="First ApplyFirst session guide">
      <div className="first-session-heading">
        <span>Start Here</span>
        <h2>First Visit Checklist</h2>
        <p>Complete the core flow once.</p>
        <div
          className="first-session-progress"
          style={{ '--progress': `${(completedCount / steps.length) * 100}%` }}
          aria-label={`${completedCount} of ${steps.length} onboarding steps complete`}
        />
      </div>
      <ol className="first-session-steps">
        {steps.map((step) => (
          <li key={step.id} className={progress[step.id] ? 'complete' : ''}>
            {step.onAction ? (
              <button type="button" onClick={step.onAction} title={step.text}>
                {getStepContent(step)}
              </button>
            ) : (
              <span className="first-session-step-static" title={step.text}>
                {getStepContent(step)}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="first-session-actions">
        <strong>{completedCount}/{steps.length} complete</strong>
        <button type="button" onClick={onDismiss}>
          Hide
        </button>
      </div>
    </section>
  );
}

function Header({
  activeView,
  onViewChange,
  showInternalTools,
  showReviewToolsToggle,
  onToggleInternalTools,
  onReturnToLanding,
}) {
  return (
    <header className="site-header">
      <button className="brand" type="button" onClick={() => onViewChange('monitor')} aria-label="ApplyFirst home">
        <ApplyFirstMark />
        <span className="brand-copy">
          <strong>ApplyFirst</strong>
          <em>Find Early. Apply First.</em>
        </span>
      </button>
      <nav aria-label="Page links">
        <div className="nav-tabs" role="group" aria-label="Primary views">
          <button
            className={activeView === 'monitor' ? 'active' : ''}
            type="button"
            onClick={() => onViewChange('monitor')}
          >
            Programs
          </button>
          <button
            className={activeView === 'alerts' ? 'active' : ''}
            type="button"
            onClick={() => onViewChange('alerts')}
          >
            My Focus
          </button>
          <button
            className={activeView === 'contribute' ? 'active' : ''}
            type="button"
            onClick={() => onViewChange('contribute')}
          >
            Suggest Updates
          </button>
          {showInternalTools ? (
            <button
              className={activeView === 'maintainer' ? 'active' : ''}
              type="button"
              onClick={() => onViewChange('maintainer')}
            >
              Review
            </button>
          ) : null}
        </div>
        <div className="nav-status" aria-label="Workspace status">
          {showInternalTools ? <span className="internal-status">Maintainer</span> : null}
          {showReviewToolsToggle ? (
            <button className="internal-tools-toggle" type="button" onClick={onToggleInternalTools}>
              {showInternalTools ? 'Hide Review' : 'Review Tools'}
            </button>
          ) : null}
          <button type="button" onClick={onReturnToLanding}>
            About
          </button>
        </div>
      </nav>
    </header>
  );
}

function ApplyFirstMark() {
  return (
    <svg className="brand-mark" aria-hidden="true" viewBox="0 0 86 86" focusable="false">
      <path className="brand-mark-a" d="M8 63L38 12C40.2 8.2 45.8 8.2 48 12L78 63H60L54.6 53H31.4L26 63H8Z" />
      <path className="brand-mark-counter" d="M37 41H49L43 29L37 41Z" />
      <path className="brand-mark-underline" d="M30 70H56" />
    </svg>
  );
}

function ReviewModeControl({ enabled, onToggle }) {
  return (
    <section className="review-mode-control" aria-label="Maintainer mode control">
      <div>
        <span>Maintainer</span>
        <h2>Maintainer Mode</h2>
        <p>Shows source review, check logs, and local edit tools.</p>
      </div>
      <button className={enabled ? 'active' : ''} type="button" onClick={onToggle} aria-pressed={enabled}>
        {enabled ? 'On' : 'Off'}
      </button>
    </section>
  );
}

function MaintainerReviewConsole({ watchEndpoint, adminToken, onAdminTokenChange }) {
  const [status, setStatus] = useState(null);
  const [readinessQueue, setReadinessQueue] = useState(null);
  const [reviewHistory, setReviewHistory] = useState(null);
  const [discoveryCandidates, setDiscoveryCandidates] = useState([]);
  const [alertCandidates, setAlertCandidates] = useState([]);
  const [alertCandidateTotal, setAlertCandidateTotal] = useState(0);
  const [betaMetrics, setBetaMetrics] = useState(null);
  const [betaParticipants, setBetaParticipants] = useState(null);
  const [betaParticipantsLoading, setBetaParticipantsLoading] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [sourceRunResult, setSourceRunResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [readinessActionByProgramId, setReadinessActionByProgramId] = useState({});
  const [alertActionByCandidateId, setAlertActionByCandidateId] = useState({});
  const [alertResultByCandidateId, setAlertResultByCandidateId] = useState({});
  const [showAllAlertCandidates, setShowAllAlertCandidates] = useState(false);
  const [showMaintainerTools, setShowMaintainerTools] = useState(false);
  const [activeMaintainerSection, setActiveMaintainerSection] = useState('review');
  const [actionMessage, setActionMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [sourceRunDraft, setSourceRunDraft] = useState({
    programIds: '',
  });
  const [searchDraft, setSearchDraft] = useState({
    limit: '5',
    programIds: '',
    maxQueriesPerProgram: '3',
    maxResultsPerQuery: '5',
    force: false,
  });
  const workerBaseUrl = getWorkerBaseUrl(watchEndpoint);
  const canLoad = Boolean(workerBaseUrl && adminToken.trim());
  const pendingAlertTotal = alertCandidateTotal || alertCandidates.length;
  const visibleAlertCandidates = showAllAlertCandidates ? alertCandidates : alertCandidates.slice(0, 6);
  const hiddenAlertCandidateCount = Math.max(alertCandidates.length - visibleAlertCandidates.length, 0);
  const reviewEvents = reviewHistory ? buildReviewHistoryEvents(reviewHistory) : [];
  const readinessAttentionTotal = readinessQueue?.needsAttention ?? 0;
  const maintainerActionTotal = readinessAttentionTotal + discoveryCandidates.length + pendingAlertTotal;

  const updateSearchDraft = (field, value) => {
    setSearchDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const updateSourceRunDraft = (field, value) => {
    setSourceRunDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const callAdminEndpoint = async (path, options = {}) => {
    const payload = await fetchMaintainerJson({
      workerBaseUrl,
      adminToken,
      path,
      method: options.method ?? 'GET',
      body: options.body,
    });

    return payload;
  };

  const loadQueues = async ({ quiet = false, showLoading = true } = {}) => {
    if (showLoading) {
      setLoading(true);
    }
    setErrorMessage('');
    if (!quiet) {
      setActionMessage('');
    }

    try {
      const [statusPayload, readinessPayload, historyPayload, discoveryPayload, alertPayload, metricsPayload, participantsPayload] = await Promise.all([
        callAdminEndpoint('/watch/status'),
        callAdminEndpoint('/watch/readiness'),
        callAdminEndpoint('/watch/history'),
        callAdminEndpoint('/watch/discovery/candidates?status=pending_review'),
        callAdminEndpoint('/watch/candidates'),
        callAdminEndpoint('/analytics/summary'),
        callAdminEndpoint('/analytics/participants?limit=50'),
      ]);

      setStatus(statusPayload);
      setReadinessQueue(readinessPayload);
      setReviewHistory(historyPayload);
      setDiscoveryCandidates(discoveryPayload.candidates ?? []);
      setAlertCandidates(alertPayload.candidates ?? []);
      setAlertCandidateTotal(alertPayload.totalPending ?? alertPayload.candidates?.length ?? 0);
      setBetaMetrics(metricsPayload);
      setBetaParticipants(participantsPayload);
      setLastRefreshedAt(new Date().toISOString());
      if (!quiet) {
        setActionMessage('Review queue refreshed.');
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const loadParticipantPage = async (offset) => {
    setBetaParticipantsLoading(true);
    setErrorMessage('');

    try {
      const payload = await callAdminEndpoint(`/analytics/participants?limit=50&offset=${Math.max(0, offset)}`);
      setBetaParticipants(payload);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBetaParticipantsLoading(false);
    }
  };

  const updateParticipantSegment = async (workspaceId, testerSegment) => {
    setBetaParticipantsLoading(true);
    setErrorMessage('');

    try {
      await callAdminEndpoint('/analytics/participants/segment', {
        method: 'POST',
        body: { workspaceId, testerSegment },
      });
      setBetaParticipants((current) => current ? {
        ...current,
        participants: (current.participants ?? []).map((participant) => (
          participant.workspaceId === workspaceId
            ? { ...participant, testerSegment }
            : participant
        )),
      } : current);
      setActionMessage('Tester segment updated.');
      const metricsPayload = await callAdminEndpoint('/analytics/summary');
      setBetaMetrics(metricsPayload);
    } catch (error) {
      setErrorMessage(error.message);
      throw error;
    } finally {
      setBetaParticipantsLoading(false);
    }
  };

  const runSourceDryRun = async (programIdsOverride = null, actionProgramId = '') => {
    const programIds = programIdsOverride ?? parseProgramIds(sourceRunDraft.programIds);
    const scopedProgramId = actionProgramId || '';

    if (!programIds.length) {
      setErrorMessage('Add at least one program ID before running a source check.');
      return;
    }

    if (scopedProgramId) {
      setReadinessActionByProgramId((currentActions) => ({
        ...currentActions,
        [scopedProgramId]: 'source',
      }));
    } else {
      setLoading(true);
    }
    setErrorMessage('');
    setActionMessage('');

    try {
      const payload = await callAdminEndpoint('/watch/run', {
        method: 'POST',
        body: {
          programIds,
          dryRun: true,
        },
      });

      setSourceRunResult(payload);
      setActionMessage(`Source dry run checked ${payload.checked ?? 0} program${payload.checked === 1 ? '' : 's'}.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      if (scopedProgramId) {
        setReadinessActionByProgramId((currentActions) => {
          const nextActions = { ...currentActions };
          delete nextActions[scopedProgramId];
          return nextActions;
        });
      } else {
        setLoading(false);
      }
    }
  };

  const runDiscoverySearch = async (dryRun, programIdsOverride = [], actionProgramId = '') => {
    const targetedProgramIds = programIdsOverride.length ? programIdsOverride.filter(Boolean) : parseProgramIds(searchDraft.programIds);
    const targetLabel =
      targetedProgramIds.length === 1 ? targetedProgramIds[0] : `${targetedProgramIds.length} targeted programs`;
    const scopedProgramId = actionProgramId || '';
    if (scopedProgramId) {
      setReadinessActionByProgramId((currentActions) => ({
        ...currentActions,
        [scopedProgramId]: 'url',
      }));
    } else {
      setLoading(true);
    }
    setErrorMessage('');
    setActionMessage('');

    try {
      const payload = await callAdminEndpoint('/watch/discovery/search', {
        method: 'POST',
        body: {
          limit: targetedProgramIds.length || Number(searchDraft.limit) || 5,
          maxQueriesPerProgram: Number(searchDraft.maxQueriesPerProgram) || 3,
          maxResultsPerQuery: Number(searchDraft.maxResultsPerQuery) || 5,
          force: targetedProgramIds.length ? true : Boolean(searchDraft.force),
          dryRun,
          programIds: targetedProgramIds,
        },
      });

      setSearchResult(payload);
      setActionMessage(
        dryRun && targetedProgramIds.length
          ? `Discovery dry run completed for ${targetLabel}.`
          : dryRun
            ? 'Discovery dry run completed.'
            : targetedProgramIds.length
              ? `Discovery saved ${payload.savedCandidates ?? 0} new and updated ${payload.updatedCandidates ?? 0} existing candidate${payload.updatedCandidates === 1 ? '' : 's'} for ${targetLabel}.`
              : `Discovery saved ${payload.savedCandidates ?? 0} new and updated ${payload.updatedCandidates ?? 0} existing candidate${payload.updatedCandidates === 1 ? '' : 's'}.`,
      );

      if (!dryRun) {
        await loadQueues({ quiet: true, showLoading: !scopedProgramId });
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      if (scopedProgramId) {
        setReadinessActionByProgramId((currentActions) => {
          const nextActions = { ...currentActions };
          delete nextActions[scopedProgramId];
          return nextActions;
        });
      } else {
        setLoading(false);
      }
    }
  };

  const reviewDiscoveryCandidate = async (candidate, statusValue) => {
    if (
      statusValue === 'accepted' &&
      !window.confirm(
        `Accept this URL for ${candidate.programName || candidate.program_id}? This will replace the monitored source and queue an immediate source check.`,
      )
    ) {
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setActionMessage('');

    try {
      await callAdminEndpoint(`/watch/discovery/candidates/${candidate.id}/review`, {
        method: 'POST',
        body: {
          status: statusValue,
          applyToOfficialSource: statusValue === 'accepted',
          reviewedBy: 'applyfirst-maintainer-console',
          reviewNote:
            statusValue === 'accepted'
              ? 'Accepted in maintainer console; source queued for verification.'
              : 'Rejected in maintainer console.',
        },
      });
      setActionMessage(`${candidate.programName || candidate.program_id} marked ${formatDisplayLabel(statusValue)}.`);
      await loadQueues({ quiet: true });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const sendAlertCandidate = async (candidate, dryRun) => {
    if (!dryRun && !window.confirm(`Send this alert to opted-in students watching ${candidate.programName}?`)) {
      return;
    }

    const actionLabel = dryRun ? 'dryRun' : 'send';
    setAlertActionByCandidateId((currentActions) => ({
      ...currentActions,
      [candidate.id]: actionLabel,
    }));
    setAlertResultByCandidateId((currentResults) => {
      const nextResults = { ...currentResults };
      delete nextResults[candidate.id];
      return nextResults;
    });
    setErrorMessage('');
    setActionMessage('');

    try {
      const payload = await callAdminEndpoint(`/watch/candidates/${candidate.id}/send`, {
        method: 'POST',
        body: { dryRun },
      });
      const sentCount = (payload.deliveries ?? []).filter((delivery) =>
        ['sent', 'queued', 'already_sent', 'ready'].includes(delivery.status),
      ).length;
      const failedCount = (payload.deliveries ?? []).filter((delivery) => delivery.status === 'failed').length;
      setAlertResultByCandidateId((currentResults) => ({
        ...currentResults,
        [candidate.id]: {
          tone: failedCount ? 'warning' : 'success',
          title: dryRun
            ? `${payload.recipients ?? sentCount} recipient${(payload.recipients ?? sentCount) === 1 ? '' : 's'} matched this alert.`
            : `${sentCount} delivery ${sentCount === 1 ? 'was' : 'attempts were'} recorded.`,
          detail: dryRun
            ? 'Preview only. No email was sent.'
            : failedCount
              ? `${failedCount} delivery ${failedCount === 1 ? 'needs' : 'need'} review.`
              : 'Email delivery was sent or already recorded.',
          deliveries: payload.deliveries ?? [],
          dryRun,
          generatedAt: new Date().toISOString(),
        },
      }));
      setActionMessage(
        dryRun
          ? `Dry run ready for ${sentCount} recipient${sentCount === 1 ? '' : 's'}.`
          : `Alert send attempted for ${sentCount} recipient${sentCount === 1 ? '' : 's'}.`,
      );
      if (!dryRun) {
        await loadQueues({ quiet: true, showLoading: false });
      }
    } catch (error) {
      setErrorMessage(error.message);
      setAlertResultByCandidateId((currentResults) => ({
        ...currentResults,
        [candidate.id]: {
          tone: 'error',
          title: 'Alert action failed.',
          detail: error.message,
          deliveries: [],
          dryRun,
          generatedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setAlertActionByCandidateId((currentActions) => {
        const nextActions = { ...currentActions };
        delete nextActions[candidate.id];
        return nextActions;
      });
    }
  };

  const dismissAlertCandidateResult = (candidateId) => {
    setAlertResultByCandidateId((currentResults) => {
      const nextResults = { ...currentResults };
      delete nextResults[candidateId];
      return nextResults;
    });
  };

  const recordMonitoringAudit = async (audit) => {
    setErrorMessage('');
    await callAdminEndpoint('/analytics/monitoring-audits', { method: 'POST', body: audit });
    setActionMessage('Monitoring evidence saved.');
    await loadQueues({ quiet: true, showLoading: false });
  };

  const recordOperationalTime = async (entry) => {
    setErrorMessage('');
    await callAdminEndpoint('/analytics/operations', { method: 'POST', body: entry });
    setActionMessage('Operational time saved.');
    await loadQueues({ quiet: true, showLoading: false });
  };

  return (
    <section className="maintainer-review-view" aria-label="ApplyFirst maintainer review">
      <section className="maintainer-hero">
        <div>
          <span>Maintainer Review</span>
          <h1 className="page-hero-title">Review Sources And Alerts.</h1>
          <p>Resolve source issues, URL changes, and alerts before students see them.</p>
        </div>
        <form
          className="maintainer-access-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (canLoad && !loading) {
              loadQueues();
            }
          }}
        >
          <label>
            <span>Admin Token</span>
            <input
              type="password"
              value={adminToken}
              onChange={(event) => onAdminTokenChange(event.target.value)}
              placeholder="Paste token for this session"
              autoComplete="off"
            />
          </label>
          <div className="maintainer-connection-state">
            <strong>{workerBaseUrl ? 'Watch Worker Connected' : 'Worker Not Configured'}</strong>
            <span>{lastRefreshedAt ? `Updated ${formatDateTime(lastRefreshedAt)}` : 'Enter token and press Enter'}</span>
          </div>
          <button type="submit" disabled={!canLoad || loading}>
            {loading ? 'Loading...' : status ? 'Refresh Queue' : 'Load Queue'}
          </button>
        </form>
      </section>

      {errorMessage ? <p className="maintainer-message error">{errorMessage}</p> : null}
      {actionMessage ? <p className="maintainer-message">{actionMessage}</p> : null}

      {!status ? (
        <MaintainerEmptyState />
      ) : (
        <>
          <MaintainerReviewSummary
            status={status}
            readinessCount={readinessAttentionTotal}
            discoveryCount={discoveryCandidates.length}
            alertCount={pendingAlertTotal}
            lastRefreshedAt={lastRefreshedAt}
          />

          <nav className="maintainer-section-tabs" aria-label="Maintainer workspaces">
            <button
              className={activeMaintainerSection === 'review' ? 'active' : ''}
              type="button"
              onClick={() => setActiveMaintainerSection('review')}
              aria-pressed={activeMaintainerSection === 'review'}
            >
              <span>Review</span>
              <strong>{maintainerActionTotal}</strong>
            </button>
            <button
              className={activeMaintainerSection === 'insights' ? 'active' : ''}
              type="button"
              onClick={() => setActiveMaintainerSection('insights')}
              aria-pressed={activeMaintainerSection === 'insights'}
            >
              <span>Beta Metrics</span>
            </button>
            <button
              className={activeMaintainerSection === 'activity' ? 'active' : ''}
              type="button"
              onClick={() => setActiveMaintainerSection('activity')}
              aria-pressed={activeMaintainerSection === 'activity'}
            >
              <span>History</span>
              <strong>{reviewEvents.length}</strong>
            </button>
          </nav>

          {activeMaintainerSection === 'review' ? (
            <section className="maintainer-section-stack" aria-label="Review queues">
              {readinessQueue ? (
                <MonitoringReadinessQueue
                  queue={readinessQueue}
                  onCheckSource={(programId) => runSourceDryRun([programId], programId)}
                  onFindUrl={(programId) => {
                    updateSearchDraft('programIds', programId);
                    runDiscoverySearch(true, [programId], programId);
                  }}
                  readinessActions={readinessActionByProgramId}
                  loading={loading}
                  canLoad={canLoad}
                />
              ) : null}

              {discoveryCandidates.length ? (
                <DiscoveryCandidateReviewPanel
                  candidates={discoveryCandidates}
                  loading={loading}
                  onReviewCandidate={reviewDiscoveryCandidate}
                />
              ) : null}

              {pendingAlertTotal ? (
                <section className="maintainer-panel">
                  <div className="maintainer-panel-heading">
                    <div>
                      <span>Alert Review</span>
                      <h2>{pendingAlertTotal} Alert{pendingAlertTotal === 1 ? ' Needs' : 's Need'} Review</h2>
                    </div>
                    <p>Verify the source, preview recipients, then send.</p>
                  </div>
                  {pendingAlertTotal > alertCandidates.length ? (
                    <p className="maintainer-queue-note">
                      Showing the newest {alertCandidates.length} loaded alerts. Use the Worker API for deeper paging when the queue grows.
                    </p>
                  ) : null}
                  <div className="maintainer-card-list maintainer-alert-list">
                    {visibleAlertCandidates.map((candidate) => {
                      const activeAction = alertActionByCandidateId[candidate.id];
                      const actionResult = alertResultByCandidateId[candidate.id];
                      const isDryRunning = activeAction === 'dryRun';
                      const isSending = activeAction === 'send';

                      return (
                        <article className={`maintainer-candidate-card ${activeAction ? 'is-busy' : ''}`} key={candidate.id}>
                          <div className="maintainer-card-header">
                            <div>
                              <span>{formatDisplayLabel(candidate.candidateType)}</span>
                              <h3>{candidate.programName || candidate.program_id}</h3>
                            </div>
                            {candidate.url ? (
                              <a href={candidate.url} target="_blank" rel="noreferrer">Official Source</a>
                            ) : null}
                          </div>
                          <p className="maintainer-card-note">{candidate.summary || candidate.title}</p>
                          <div className="maintainer-actions">
                            <button className="maintainer-primary-action" type="button" onClick={() => sendAlertCandidate(candidate, true)} disabled={loading || Boolean(activeAction)}>
                              {isDryRunning ? 'Checking...' : 'Preview Recipients'}
                            </button>
                            <button className="maintainer-danger-action" type="button" onClick={() => sendAlertCandidate(candidate, false)} disabled={loading || Boolean(activeAction)}>
                              {isSending ? 'Sending...' : 'Send This Alert'}
                            </button>
                          </div>
                          {actionResult ? (
                            <AlertCandidateActionResult
                              result={actionResult}
                              onDismiss={() => dismissAlertCandidateResult(candidate.id)}
                            />
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  {hiddenAlertCandidateCount ? (
                    <button className="maintainer-show-more" type="button" onClick={() => setShowAllAlertCandidates(true)}>
                      Show {hiddenAlertCandidateCount} More Pending Alert{hiddenAlertCandidateCount === 1 ? '' : 's'}
                    </button>
                  ) : showAllAlertCandidates && alertCandidates.length > 6 ? (
                    <button className="maintainer-show-more" type="button" onClick={() => setShowAllAlertCandidates(false)}>
                      Show Fewer Pending Alerts
                    </button>
                  ) : null}
                </section>
              ) : null}

              <section className="maintainer-panel maintainer-tools-panel">
                <div className="maintainer-tools-heading">
                  <div>
                    <span>Manual Tools</span>
                    <h2>Check A Specific Program</h2>
                    <p>Run a source check or search for a current URL.</p>
                  </div>
                  <button type="button" onClick={() => setShowMaintainerTools((isVisible) => !isVisible)}>
                    {showMaintainerTools ? 'Hide Tools' : 'Open Tools'}
                  </button>
                </div>
                {showMaintainerTools ? (
                  <section className="maintainer-ops-grid">
                <section className="maintainer-utility-panel">
                  <div className="maintainer-panel-heading">
                    <div>
                      <span>Source Checks</span>
                      <h2>Test Saved Pages</h2>
                    </div>
                    <p>Dry run one or more program IDs before trusting a watched page.</p>
                  </div>
                  <div className="source-run-form">
                    <label>
                      <span>Program IDs</span>
                      <textarea
                        value={sourceRunDraft.programIds}
                        onChange={(event) => updateSourceRunDraft('programIds', event.target.value)}
                        placeholder="swe-scholarships, virtu-womens-winternship-watch"
                      />
                    </label>
                    <button type="button" onClick={() => runSourceDryRun()} disabled={!canLoad || loading}>
                      Run Dry Check
                    </button>
                  </div>
                  {sourceRunResult ? <SourceRunSummary result={sourceRunResult} /> : null}
                </section>

                <section className="maintainer-utility-panel">
                  <div className="maintainer-panel-heading">
                    <div>
                      <span>Source URLs</span>
                      <h2>Find Updated Pages</h2>
                    </div>
                    <p>Search official pages for specific programs and save candidates for review.</p>
                  </div>
                  <div className="maintainer-search-form">
                    <label>
                      <span>Programs</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={searchDraft.limit}
                        onChange={(event) => updateSearchDraft('limit', event.target.value)}
                      />
                    </label>
                    <label className="maintainer-wide-field">
                      <span>Target Program IDs</span>
                      <input
                        type="text"
                        value={searchDraft.programIds}
                        onChange={(event) => updateSearchDraft('programIds', event.target.value)}
                        placeholder="Optional: virtu-womens-winternship-watch"
                      />
                    </label>
                    <label>
                      <span>Queries</span>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        value={searchDraft.maxQueriesPerProgram}
                        onChange={(event) => updateSearchDraft('maxQueriesPerProgram', event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Results</span>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={searchDraft.maxResultsPerQuery}
                        onChange={(event) => updateSearchDraft('maxResultsPerQuery', event.target.value)}
                      />
                    </label>
                    <label className="maintainer-checkbox">
                      <input
                        type="checkbox"
                        checked={searchDraft.force}
                        onChange={(event) => updateSearchDraft('force', event.target.checked)}
                      />
                      <span>Force search</span>
                    </label>
                  </div>
                  <div className="maintainer-actions">
                    <button type="button" onClick={() => runDiscoverySearch(true)} disabled={!canLoad || loading}>
                      Dry Run Search
                    </button>
                    <button type="button" onClick={() => runDiscoverySearch(false)} disabled={!canLoad || loading}>
                      Save Candidates
                    </button>
                  </div>
                  {searchResult ? <DiscoverySearchSummary result={searchResult} /> : null}
                </section>
                  </section>
                ) : null}
              </section>
            </section>
          ) : null}

          {activeMaintainerSection === 'insights' && betaMetrics ? (
            <BetaMetricsPanel
              metrics={betaMetrics}
              participants={betaParticipants}
              participantsLoading={betaParticipantsLoading}
              onParticipantPageChange={loadParticipantPage}
              onParticipantSegmentChange={updateParticipantSegment}
              onRecordAudit={recordMonitoringAudit}
              onRecordTime={recordOperationalTime}
            />
          ) : null}

          {activeMaintainerSection === 'activity' && reviewHistory ? (
            <ReviewHistoryPanel history={reviewHistory} events={reviewEvents} />
          ) : null}
        </>
      )}
    </section>
  );
}

function BetaMetricsPanel({
  metrics,
  participants,
  participantsLoading,
  onParticipantPageChange,
  onParticipantSegmentChange,
  onRecordAudit,
  onRecordTime,
}) {
  const funnel = Object.fromEntries((metrics.funnel ?? []).map((item) => [item.eventName, item.participants]));
  const outcomes = Object.fromEntries((metrics.outcomes ?? []).map((item) => [item.outcome, item.participants]));
  const engagement = Object.fromEntries(
    (metrics.alertEngagement ?? []).map((item) => [item.action, item]),
  );
  const studentValue = metrics.studentValue ?? {};
  const independent = metrics.independentUsability ?? {};
  const reliability = metrics.reliability ?? {};
  const operations = metrics.operations ?? {};
  const invitations = metrics.invitations ?? {};
  const waitlist = metrics.waitlist ?? {};
  const lifecycle = metrics.programLifecycle ?? {};
  const lifecycleApplications = lifecycle.applications ?? {};
  const lifecycleWatches = lifecycle.watches ?? {};
  const lifecyclePersistence = lifecycle.persistentValue ?? {};
  const waitlistPipeline = waitlist.pipeline ?? {};
  const activation = studentValue.eligibleActivation ?? {};
  const discovery = studentValue.newToStudentDiscovery ?? {};
  const externalActions = studentValue.externalActions ?? {};
  const timelyAction = studentValue.timelyExternalAction ?? {};
  const leadTime = studentValue.discoveryLeadTime ?? {};
  const sourceFreshness = reliability.sourceFreshness ?? {};
  const accuracy = reliability.informationAccuracy ?? {};
  const knownOpenings = reliability.knownOpenings ?? {};
  const relevantWindow = independent.relevantWindowReturn ?? {};
  const studentValueMetrics = [
    {
      label: 'Eligible Activated',
      value: formatCountOf(activation.numerator, activation.denominator),
      detail: 'Student-reported useful decisions among relevance respondents',
    },
    {
      label: 'Found Relevant',
      value: studentValue.foundRelevant ?? 0,
      detail: 'Students reporting at least one relevant program',
    },
    {
      label: 'New Discovery',
      value: discovery.students ?? 0,
      detail: `${formatCountOf(discovery.programPairs, discovery.denominator)} answered relevant program pairs`,
    },
    {
      label: 'External Action',
      value: externalActions.students ?? 0,
      detail: `${externalActions.programPairs ?? 0} self-reported program pairs · ${externalActions.submissions ?? 0} submitted`,
    },
    {
      label: 'Timely Action',
      value: timelyAction.status === 'available'
        ? formatCountOf(timelyAction.programPairs, timelyAction.denominator)
        : 'N/A',
      detail: 'External actions before a verified deadline',
    },
    {
      label: 'Discovery Lead Time',
      value: leadTime.status === 'available' ? `${leadTime.median} days` : 'N/A',
      detail: leadTime.status === 'available'
        ? `${leadTime.count} observations · ${leadTime.min}-${leadTime.max} day range`
        : 'Requires a verified fixed deadline',
    },
  ];
  const journeyRows = [
    ['Viewed A Program', funnel.program_viewed ?? 0],
    ['Saved A Program', funnel.program_saved ?? 0],
    ['Enabled Alerts', funnel.alerts_enabled ?? 0],
    ['Visited An Official Source', funnel.official_source_clicked ?? 0],
  ];
  const combinedProgramInsights = mergeProgramInsights(metrics.topPrograms, studentValue.programEvidence);
  const relevanceBreakdown = (lifecycle.relevance ?? []).map((row) => ({
    label: formatDisplayLabel(row.value),
    students: row.students,
    records: row.programPairs,
  }));
  const applicationOutcomeBreakdown = (lifecycleApplications.outcomes ?? []).map((row) => ({
    label: applicationOutcomeOptions.find((option) => option.value === row.value)?.label ?? formatDisplayLabel(row.value),
    students: row.students,
    records: row.attempts,
  }));
  const explicitRelevancePairs = relevanceBreakdown.reduce((total, row) => total + Number(row.records || 0), 0);
  const applicationAttemptCount = applicationOutcomeBreakdown.reduce((total, row) => total + Number(row.records || 0), 0);

  return (
    <section className="maintainer-panel beta-metrics-panel" aria-label="Beta product metrics">
      <div className="maintainer-panel-heading">
        <div>
          <span>Beta Metrics</span>
          <h2>What Value Is ApplyFirst Creating?</h2>
        </div>
        <p>Current invite cohort plus the last {metrics.periodDays ?? 30} days of product evidence. Missing responses remain unknown.</p>
      </div>
      <BetaMetricSection title="Beta Intake" description="Waitlist interest reconciled with private invitations without storing raw email in analytics.">
        <dl className="beta-evidence-grid">
          <BetaEvidenceMetric metric={{
            label: 'Interested',
            value: waitlistPipeline.available ? waitlistPipeline.interested : 'N/A',
            detail: waitlistPipeline.available
              ? `${waitlist.total ?? 0} production waitlist submission${waitlist.total === 1 ? '' : 's'}`
              : 'Capture database is unavailable',
          }} />
          <BetaEvidenceMetric metric={{
            label: 'Invited From Waitlist',
            value: waitlistPipeline.available ? waitlistPipeline.invitedFromWaitlist : 'N/A',
            detail: `${invitations.invited ?? 0} total beta invite${invitations.invited === 1 ? '' : 's'} across all cohorts`,
          }} />
          <BetaEvidenceMetric metric={{
            label: 'Opened Access',
            value: waitlistPipeline.available ? waitlistPipeline.openedFromWaitlist : 'N/A',
            detail: `${invitations.opened ?? 0} of ${invitations.invited ?? 0} total invited students opened a workspace`,
          }} />
          <BetaEvidenceMetric metric={{
            label: 'Still Waiting',
            value: waitlistPipeline.available ? waitlistPipeline.stillWaiting : 'N/A',
            detail: 'Interested students without a sent or active invitation',
          }} />
        </dl>
      </BetaMetricSection>
      <BetaMetricSection title="Student Value" description="Useful decisions and observable next steps, not setup completion.">
        <dl className="beta-evidence-grid">
          {studentValueMetrics.map((metric) => <BetaEvidenceMetric metric={metric} key={metric.label} />)}
        </dl>
        <CohortOutcomeList rows={studentValue.testerSegments} />
      </BetaMetricSection>
      <BetaMetricSection
        title="Program Lifecycle"
        description="Relevance judgments, application events, and active watches are counted independently."
      >
        <dl className="beta-compact-metrics">
          <BetaEvidenceMetric metric={{
            label: 'Explicit Relevance',
            value: explicitRelevancePairs,
            detail: 'Student-program judgments; inferred application relevance excluded',
          }} />
          <BetaEvidenceMetric metric={{
            label: 'Application Attempts',
            value: applicationAttemptCount,
            detail: `${lifecycleApplications.repeatProgramPairs ?? 0} repeat-cycle program pair${lifecycleApplications.repeatProgramPairs === 1 ? '' : 's'}`,
          }} />
          <BetaEvidenceMetric metric={{
            label: 'Active Watches',
            value: lifecycleWatches.programPairs ?? 0,
            detail: `${lifecycleWatches.students ?? 0} student${lifecycleWatches.students === 1 ? '' : 's'} opted in`,
          }} />
        </dl>
        <div className="beta-metric-columns">
          <MetricBreakdownList title="Relevance" rows={relevanceBreakdown} emptyLabel="No explicit relevance responses yet." />
          <MetricBreakdownList title="Application Outcomes" rows={applicationOutcomeBreakdown} emptyLabel="No application attempts yet." />
        </div>
        <dl className="beta-compact-metrics">
          <BetaEvidenceMetric metric={{
            label: 'Applied + Watching',
            value: lifecyclePersistence.appliedAndWatching ?? 0,
            detail: 'Student-program pairs still monitored after an application',
          }} />
          <BetaEvidenceMetric metric={{
            label: 'Not Selected + Watching',
            value: lifecyclePersistence.notSelectedAndWatching ?? 0,
            detail: 'Non-selection did not end monitoring',
          }} />
          <BetaEvidenceMetric metric={{
            label: 'Future Cycle + Watching',
            value: lifecyclePersistence.futureCycleAndWatching ?? 0,
            detail: 'Explicit future-cycle fit with an active watch',
          }} />
          <BetaEvidenceMetric metric={{
            label: 'Named-Cycle Reapplications',
            value: lifecycleApplications.namedCycleReapplicationPairs ?? 0,
            detail: 'Pairs with attempts recorded in more than one named cycle',
          }} />
        </dl>
      </BetaMetricSection>

      <div className="beta-metric-columns">
        <BetaMetricSection title="Independent Usability" description="Whether students can get value without high-touch coaching.">
          <dl className="beta-compact-metrics">
            <BetaEvidenceMetric metric={{
              label: 'First Useful Decision',
              value: independent.timeToFirstUsefulDecision?.status === 'available'
                ? `${independent.timeToFirstUsefulDecision.median}h median`
                : 'N/A',
              detail: independent.timeToFirstUsefulDecision?.status === 'available'
                ? `${independent.timeToFirstUsefulDecision.count} students · ${independent.timeToFirstUsefulDecision.min}-${independent.timeToFirstUsefulDecision.max}h range`
                : 'No eligible decisions yet',
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Relevant-Window Return',
              value: relevantWindow.status === 'available'
                ? formatCountOf(relevantWindow.returnedStudents, relevantWindow.eligibleStudents)
                : 'N/A',
              detail: relevantWindow.status === 'available'
                ? `${relevantWindow.eligibleAlerts} mature alerts · ${relevantWindow.immatureAlerts} still observing`
                : 'No mature relevant alert window',
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Setup Completed',
              value: independent.setupCompleted30Days ?? 0,
              detail: 'Secondary onboarding diagnostic',
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Ordinary Return',
              value: independent.ordinaryReturn30Days ?? 0,
              detail: 'Secondary engagement diagnostic',
            }} />
          </dl>
          <MetricBreakdownList title="Support Used" rows={studentValue.supportLevels} emptyLabel="No support context recorded yet." />
        </BetaMetricSection>

        <BetaMetricSection title="Trust & Reliability" description="Whether students can depend on source data and alerts.">
          <dl className="beta-compact-metrics">
            <BetaEvidenceMetric metric={{
              label: 'Fresh Sources',
              value: formatCountOf(sourceFreshness.numerator, sourceFreshness.denominator),
              detail: `${sourceFreshness.due ?? 0} active or warmup sources due`,
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Audited Accuracy',
              value: accuracy.denominator ? formatCountOf(accuracy.numerator, accuracy.denominator) : 'N/A',
              detail: `${accuracy.auditedRecords ?? 0} audited records`,
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Confirmed Alert Accuracy',
              value: accuracy.byField?.alertCorrect?.denominator
                ? formatCountOf(accuracy.byField.alertCorrect.numerator, accuracy.byField.alertCorrect.denominator)
                : 'N/A',
              detail: 'Maintainer-confirmed alert audits',
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Known Openings Detected',
              value: knownOpenings.denominator ? formatCountOf(knownOpenings.numerator, knownOpenings.denominator) : 'N/A',
              detail: 'Maintainer-audited known openings',
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Incorrect Alert Reports',
              value: engagement.inaccurate?.events ?? 0,
              detail: `${engagement.inaccurate?.participants ?? 0} watcher${engagement.inaccurate?.participants === 1 ? '' : 's'} · ${reliability.deliveries?.sent ?? 0} sent deliveries`,
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Detection To Alert',
              value: reliability.notificationLatency?.all?.status === 'available'
                ? `${reliability.notificationLatency.all.median}h median`
                : 'N/A',
              detail: `${formatLatencyPath(reliability.notificationLatency?.automatic, 'auto')} · ${formatLatencyPath(reliability.notificationLatency?.manual, 'manual')}`,
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Correction Time',
              value: reliability.correctionTime?.status === 'available'
                ? `${reliability.correctionTime.median}h median`
                : 'N/A',
              detail: `${reliability.corrections?.resolved ?? 0} of ${reliability.corrections?.recorded ?? 0} correction records resolved`,
            }} />
            <BetaEvidenceMetric metric={{
              label: 'Delivery Failures',
              value: reliability.deliveries?.failed ?? 0,
              detail: `${reliability.deliveries?.total ?? 0} delivery attempts`,
            }} />
          </dl>
        </BetaMetricSection>
      </div>

      <BetaMetricSection title="Operational Burden" description="Human work required to keep the beta accurate and useful.">
        <dl className="beta-operations-strip">
          <BetaEvidenceMetric metric={{ label: 'Programs Monitored', value: operations.monitoredPrograms ?? 0, detail: 'Enabled official sources' }} />
          <BetaEvidenceMetric metric={{ label: 'Active Watchers', value: operations.activeWatchers ?? 0, detail: `${operations.watchedPrograms ?? 0} watched programs` }} />
          <BetaEvidenceMetric metric={{ label: 'Manual Alert Review', value: formatCountOf(reliability.alertCandidates?.manualReview, reliability.alertCandidates?.total), detail: `${reliability.alertCandidates?.automatic ?? 0} automatic · ${reliability.alertCandidates?.total ?? 0} total` }} />
          <BetaEvidenceMetric metric={{ label: 'Failed Checks', value: reliability.failedChecks ?? 0, detail: 'Sources requiring intervention' }} />
          <BetaEvidenceMetric metric={{ label: 'URL Review Queue', value: reliability.pendingDiscoveryReview ?? 0, detail: 'Discovery candidates awaiting review' }} />
          <BetaEvidenceMetric metric={{
            label: 'Human Time / 7d',
            value: operations.time7Days?.status === 'available' ? formatMinutes(operations.time7Days.total) : 'N/A',
            detail: operations.time7Days?.status === 'available'
              ? `${operations.time7Days.entryCount} manually logged entr${operations.time7Days.entryCount === 1 ? 'y' : 'ies'}`
              : 'No time entries logged for this period',
          }} />
        </dl>
      </BetaMetricSection>

      {combinedProgramInsights.length ? (
        <BetaMetricSection title="Program Insights" description="Behavior and student-reported value by program.">
          <div className="beta-program-insights">
            {combinedProgramInsights.slice(0, 8).map((program) => (
              <article key={program.programId}>
                <strong>{getBetaMetricProgramName(program.programId)}</strong>
                <span>{program.uniqueViewers ?? program.views ?? 0} views · {program.saves ?? 0} saves · {program.sourceClicks ?? 0} source visits</span>
                <span>{program.relevantStudents ?? 0} relevant · {program.newDiscoveryStudents ?? 0} new discoveries · {program.externalActionStudents ?? 0} external actions · {program.submissions ?? 0} submitted</span>
              </article>
            ))}
          </div>
        </BetaMetricSection>
      ) : null}

      <details className="beta-metrics-details">
        <summary>Product Diagnostics</summary>
        <div className="beta-metrics-detail-grid">
          <section>
            <h3>Student Journey</h3>
            {journeyRows.map(([label, value]) => (
              <p key={label}><strong>{value}</strong><span>{label}</span></p>
            ))}
          </section>
          <section>
            <h3>Secondary Signals</h3>
            <dl>
              <div><dt>Started Watching</dt><dd>{funnel.watch_started ?? 0}</dd></div>
              <div><dt>Saved Focus</dt><dd>{funnel.focus_saved ?? 0}</dd></div>
              <div><dt>Submitted An Update</dt><dd>{funnel.contribution_submitted ?? 0}</dd></div>
              <div><dt>Alert Marked Useful</dt><dd>{engagement.useful?.events ?? 0}</dd></div>
              <div><dt>Historical: Applied Earlier</dt><dd>{outcomes.applied_earlier ?? 0}</dd></div>
              <div><dt>Waitlist Demand</dt><dd>{metrics.waitlist?.uniqueEmails ?? '-'}</dd></div>
            </dl>
          </section>
        </div>
        <BetaSegmentationDetails
          studentSegments={studentValue.segments}
          opportunityCategories={studentValue.opportunityCategories}
          waitlistSegments={metrics.waitlist?.segments}
        />
      </details>
      <MetricBreakdownList title="Friction Categories" rows={studentValue.frictionCategories} emptyLabel="No friction has been categorized yet." />
      <BetaEvidenceEntryForms onRecordAudit={onRecordAudit} onRecordTime={onRecordTime} />
      {participants && (participants.total ?? participants.participants?.length ?? 0) > 0 ? (
        <BetaParticipantActivityPanel
          payload={participants}
          loading={participantsLoading}
          onPageChange={onParticipantPageChange}
          onSegmentChange={onParticipantSegmentChange}
        />
      ) : null}
    </section>
  );
}

function BetaMetricSection({ title, description, children }) {
  return (
    <section className="beta-metric-section">
      <div className="beta-metric-section-heading">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function BetaEvidenceMetric({ metric }) {
  return (
    <div className="beta-evidence-metric">
      <dt>{metric.label}</dt>
      <dd>
        <strong>{metric.value}</strong>
        <span>{metric.detail}</span>
      </dd>
    </div>
  );
}

function MetricBreakdownList({ title, rows = [], emptyLabel }) {
  return (
    <section className="beta-breakdown-list">
      <h4>{title}</h4>
      {rows.length ? rows.map((row) => (
        <p key={row.label}>
          <span>{formatDisplayLabel(row.label)}</span>
          <strong>{row.students} student{row.students === 1 ? '' : 's'} · {row.records} record{row.records === 1 ? '' : 's'}</strong>
        </p>
      )) : <p>{emptyLabel}</p>}
    </section>
  );
}

function CohortOutcomeList({ rows = [] }) {
  if (!rows.length) return null;

  return (
    <section className="beta-cohort-outcomes">
      <h4>Value By Tester Group</h4>
      <div>
        {rows.map((row) => (
          <article key={row.testerSegment}>
            <strong>{testerSegmentOptions.find((option) => option.value === row.testerSegment)?.label ?? formatDisplayLabel(row.testerSegment)}</strong>
            <span>{row.students} student{row.students === 1 ? '' : 's'}</span>
            <p>{row.eligibleActivated} activated · {row.foundRelevant} found relevant · {row.newDiscoveryStudents} new discovery · {row.externalActionStudents} external action</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BetaSegmentationDetails({ studentSegments = [], opportunityCategories = [], waitlistSegments = {} }) {
  const classRoleRows = studentSegments.slice(0, 8).map((row) => ({
    label: `${row.classYear} / ${row.roleTrack}`,
    value: `${row.students} student${row.students === 1 ? '' : 's'} · ${row.records} decision${row.records === 1 ? '' : 's'}`,
  }));
  const categoryRows = opportunityCategories.slice(0, 8).map((row) => ({
    label: row.label,
    value: `${row.relevantStudents} relevant · ${row.externalActionStudents} external action`,
  }));
  const waitlistRows = [
    ...(waitlistSegments?.classYears ?? []).slice(0, 4).map((row) => ({ label: row.label, value: `${row.students} signup${row.students === 1 ? '' : 's'}` })),
    ...(waitlistSegments?.interests ?? []).slice(0, 4).map((row) => ({ label: row.label, value: `${row.students} signup${row.students === 1 ? '' : 's'}` })),
  ];

  return (
    <div className="beta-segment-diagnostics">
      <SimpleMetricRows title="Class Year / Role" rows={classRoleRows} emptyLabel="No voluntary profile segments yet." />
      <SimpleMetricRows title="Opportunity Categories" rows={categoryRows} emptyLabel="No category decisions yet." />
      <SimpleMetricRows title="Waitlist Context" rows={waitlistRows} emptyLabel="Waitlist segments are unavailable." />
    </div>
  );
}

function SimpleMetricRows({ title, rows, emptyLabel }) {
  return (
    <section>
      <h4>{title}</h4>
      {rows.length ? rows.map((row, index) => (
        <p key={`${row.label}-${index}`}><span>{row.label}</span><strong>{row.value}</strong></p>
      )) : <p><span>{emptyLabel}</span></p>}
    </section>
  );
}

function mergeProgramInsights(eventRows = [], evidenceRows = []) {
  const rowsByProgram = new Map();

  for (const row of eventRows ?? []) rowsByProgram.set(row.programId, { ...row });
  for (const row of evidenceRows ?? []) {
    rowsByProgram.set(row.programId, { ...(rowsByProgram.get(row.programId) ?? {}), ...row });
  }

  return [...rowsByProgram.values()].sort(
    (left, right) =>
      (right.externalActionStudents ?? 0) - (left.externalActionStudents ?? 0) ||
      (right.relevantStudents ?? 0) - (left.relevantStudents ?? 0) ||
      (right.saves ?? 0) - (left.saves ?? 0) ||
      (right.uniqueViewers ?? right.views ?? 0) - (left.uniqueViewers ?? left.views ?? 0),
  );
}

function formatCountOf(value = 0, total = 0) {
  return total ? `${value} of ${total}` : 'N/A';
}

function formatMinutes(value = 0) {
  if (!value) return '0h';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
}

function formatLatencyPath(metric, label) {
  return metric?.status === 'available'
    ? `${metric.median}h ${label} (${metric.count})`
    : `${label} N/A`;
}

function BetaEvidenceEntryForms({ onRecordAudit, onRecordTime }) {
  const [auditDraft, setAuditDraft] = useState({
    programId: '',
    auditType: 'known_opening',
    eventAt: '',
    verifiedDeadlineAt: '',
    detected: '',
    detectedAt: '',
    alertCandidateId: '',
    statusCorrect: '',
    deadlineCorrect: '',
    eligibilityCorrect: '',
    urlCorrect: '',
    freshnessCorrect: '',
    alertCorrect: '',
    evidenceUrl: '',
    evidenceNote: '',
  });
  const [timeDraft, setTimeDraft] = useState({
    category: 'monitoring_review',
    minutes: '',
    periodDate: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [auditState, setAuditState] = useState('idle');
  const [timeState, setTimeState] = useState('idle');
  const updateAudit = (field, value) => setAuditDraft((current) => ({ ...current, [field]: value }));
  const updateTime = (field, value) => setTimeDraft((current) => ({ ...current, [field]: value }));
  const toNullableBoolean = (value) => value === '' ? null : value === 'true';

  const submitAudit = async (event) => {
    event.preventDefault();
    setAuditState('saving');
    try {
      const payload = {
        ...auditDraft,
        detected: toNullableBoolean(auditDraft.detected),
        statusCorrect: toNullableBoolean(auditDraft.statusCorrect),
        deadlineCorrect: toNullableBoolean(auditDraft.deadlineCorrect),
        eligibilityCorrect: toNullableBoolean(auditDraft.eligibilityCorrect),
        urlCorrect: toNullableBoolean(auditDraft.urlCorrect),
        freshnessCorrect: toNullableBoolean(auditDraft.freshnessCorrect),
        alertCorrect: toNullableBoolean(auditDraft.alertCorrect),
      };
      if (auditDraft.auditType === 'correction') {
        payload.reportedAt = auditDraft.eventAt;
        payload.resolvedAt = auditDraft.verifiedDeadlineAt;
        payload.eventAt = '';
        payload.verifiedDeadlineAt = '';
      }
      await onRecordAudit(payload);
      setAuditState('saved');
    } catch {
      setAuditState('error');
    }
  };

  const submitTime = async (event) => {
    event.preventDefault();
    setTimeState('saving');
    try {
      await onRecordTime({ ...timeDraft, minutes: Number(timeDraft.minutes) });
      setTimeDraft((current) => ({ ...current, minutes: '', note: '' }));
      setTimeState('saved');
    } catch {
      setTimeState('error');
    }
  };

  return (
    <details className="beta-evidence-entry">
      <summary>Record Manual Beta Evidence</summary>
      <p>Use this only for verified monitoring audits or approximate maintainer time.</p>
      <div className="beta-evidence-entry-grid">
        <form onSubmit={submitAudit}>
          <h4>Monitoring Audit</h4>
          <label>
            <span>Program ID</span>
            <input required list="beta-audit-programs" value={auditDraft.programId} onChange={(event) => updateAudit('programId', event.target.value)} />
            <datalist id="beta-audit-programs">
              {opportunities.map((opportunity) => <option value={opportunity.id} key={opportunity.id}>{opportunity.name}</option>)}
            </datalist>
          </label>
          <label>
            <span>Audit Type</span>
            <select value={auditDraft.auditType} onChange={(event) => updateAudit('auditType', event.target.value)}>
              <option value="known_opening">Known Opening</option>
              <option value="information_accuracy">Information Accuracy</option>
              <option value="correction">Correction</option>
            </select>
          </label>
          {auditDraft.auditType === 'known_opening' ? (
            <>
              <label><span>Verified Opening</span><input type="datetime-local" value={auditDraft.eventAt} onChange={(event) => updateAudit('eventAt', event.target.value)} /></label>
              <label><span>Verified Deadline</span><input type="datetime-local" value={auditDraft.verifiedDeadlineAt} onChange={(event) => updateAudit('verifiedDeadlineAt', event.target.value)} /></label>
              <BooleanAuditSelect label="Did ApplyFirst Detect It?" value={auditDraft.detected} onChange={(value) => updateAudit('detected', value)} />
              {auditDraft.detected === 'true' ? (
                <>
                  <label><span>First Verified Detection</span><input type="datetime-local" value={auditDraft.detectedAt} onChange={(event) => updateAudit('detectedAt', event.target.value)} /></label>
                  <label><span>Alert Candidate ID</span><input value={auditDraft.alertCandidateId} onChange={(event) => updateAudit('alertCandidateId', event.target.value)} /></label>
                </>
              ) : null}
            </>
          ) : null}
          {auditDraft.auditType === 'information_accuracy' ? (
            <div className="beta-audit-accuracy-grid">
              <BooleanAuditSelect label="Status Correct" value={auditDraft.statusCorrect} onChange={(value) => updateAudit('statusCorrect', value)} />
              <BooleanAuditSelect label="Deadline Correct" value={auditDraft.deadlineCorrect} onChange={(value) => updateAudit('deadlineCorrect', value)} />
              <BooleanAuditSelect label="Eligibility Correct" value={auditDraft.eligibilityCorrect} onChange={(value) => updateAudit('eligibilityCorrect', value)} />
              <BooleanAuditSelect label="URL Correct" value={auditDraft.urlCorrect} onChange={(value) => updateAudit('urlCorrect', value)} />
              <BooleanAuditSelect label="Freshness Correct" value={auditDraft.freshnessCorrect} onChange={(value) => updateAudit('freshnessCorrect', value)} />
              <BooleanAuditSelect label="Alert Correct" value={auditDraft.alertCorrect} onChange={(value) => updateAudit('alertCorrect', value)} />
            </div>
          ) : null}
          {auditDraft.auditType === 'correction' ? (
            <>
              <label><span>Reported</span><input type="datetime-local" value={auditDraft.eventAt} onChange={(event) => updateAudit('eventAt', event.target.value)} /></label>
              <label><span>Resolved</span><input type="datetime-local" value={auditDraft.verifiedDeadlineAt} onChange={(event) => updateAudit('verifiedDeadlineAt', event.target.value)} /></label>
            </>
          ) : null}
          <label><span>Evidence URL</span><input type="url" value={auditDraft.evidenceUrl} onChange={(event) => updateAudit('evidenceUrl', event.target.value)} /></label>
          <label><span>Short Note</span><textarea value={auditDraft.evidenceNote} onChange={(event) => updateAudit('evidenceNote', event.target.value)} /></label>
          <button type="submit" disabled={auditState === 'saving'}>{auditState === 'saving' ? 'Saving...' : 'Save Audit'}</button>
          {auditState === 'saved' ? <small>Audit saved.</small> : auditState === 'error' ? <small>Audit could not be saved.</small> : null}
        </form>
        <form onSubmit={submitTime}>
          <h4>Human Time</h4>
          <label>
            <span>Work Type</span>
            <select value={timeDraft.category} onChange={(event) => updateTime('category', event.target.value)}>
              <option value="monitoring_review">Monitoring / Review</option>
              <option value="data_correction">Correcting Data</option>
              <option value="user_support">Supporting Students</option>
            </select>
          </label>
          <label><span>Minutes</span><input required min="1" max="1440" type="number" value={timeDraft.minutes} onChange={(event) => updateTime('minutes', event.target.value)} /></label>
          <label><span>Date</span><input required type="date" value={timeDraft.periodDate} onChange={(event) => updateTime('periodDate', event.target.value)} /></label>
          <label><span>Optional Note</span><textarea value={timeDraft.note} onChange={(event) => updateTime('note', event.target.value)} /></label>
          <button type="submit" disabled={timeState === 'saving'}>{timeState === 'saving' ? 'Saving...' : 'Save Time'}</button>
          {timeState === 'saved' ? <small>Time saved.</small> : timeState === 'error' ? <small>Time could not be saved.</small> : null}
        </form>
      </div>
    </details>
  );
}

function BooleanAuditSelect({ label, value, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not Audited</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}

function getBetaMetricProgramName(programId) {
  const opportunity = opportunities.find((item) => item.id === programId);

  if (opportunity) {
    return getOpportunityDisplayTitle(opportunity);
  }

  const acronyms = new Set(['ai', 'hrt', 'mlh', 'nasa', 'nsf', 'pm', 'swe', 'vc']);

  return String(programId || '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const normalizedWord = word.toLowerCase();

      return acronyms.has(normalizedWord)
        ? normalizedWord.toUpperCase()
        : `${normalizedWord.charAt(0).toUpperCase()}${normalizedWord.slice(1)}`;
    })
    .join(' ');
}

function BetaParticipantActivityPanel({ payload, loading, onPageChange, onSegmentChange }) {
  const participantRows = payload.participants ?? [];
  const firstVisible = participantRows.length ? payload.offset + 1 : 0;
  const lastVisible = payload.offset + participantRows.length;

  return (
    <details className="beta-participant-details">
      <summary>
        <span>View Participant Activity</span>
        <small>{payload.total ?? participantRows.length} workspace{(payload.total ?? participantRows.length) === 1 ? '' : 's'}</small>
      </summary>
      <div className="beta-participant-intro">
        <p>Match each masked code to the private invite registry. Full codes and student identities are not stored here.</p>
        <span>Showing {firstVisible}-{lastVisible} of {payload.total ?? participantRows.length} workspaces.</span>
      </div>
      {participantRows.length ? (
        <div className="beta-participant-table-wrap">
          <table className="beta-participant-table">
            <thead>
              <tr>
                <th scope="col">Invite</th>
                <th scope="col">Tester Group</th>
                <th scope="col">Last Active</th>
                <th scope="col">Activity</th>
                <th scope="col">Programs</th>
                <th scope="col">Setup</th>
                <th scope="col">Value</th>
                <th scope="col">Support</th>
              </tr>
            </thead>
            <tbody>
              {participantRows.map((participant) => {
                const hasActivity =
                  participant.programViews > 0 ||
                  participant.programsSaved > 0 ||
                  participant.programsWatched > 0 ||
                  participant.focusCompleted ||
                  participant.alertsEnabled ||
                  participant.sourceClicks > 0 ||
                  participant.contributions > 0;
                return (
                  <tr key={participant.workspaceId}>
                    <td>
                      <strong>{participant.codeLabel}</strong>
                      <span>{hasActivity ? 'Explored' : 'Opened only'}</span>
                    </td>
                    <td>
                      <label className="beta-participant-segment">
                        <span className="sr-only">Tester group for {participant.codeLabel}</span>
                        <select
                          value={participant.testerSegment || 'unknown'}
                          onChange={(event) => onSegmentChange(participant.workspaceId, event.target.value)}
                          disabled={loading}
                        >
                          {testerSegmentOptions.map((option) => (
                            <option value={option.value} key={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td>
                      <strong>{formatDateTime(participant.latestActivityAt)}</strong>
                      <span>{participant.activeDays} active day{participant.activeDays === 1 ? '' : 's'}</span>
                    </td>
                    <td>
                      <strong>{participant.sessions} session{participant.sessions === 1 ? '' : 's'}</strong>
                      <span>{participant.programViews} program view{participant.programViews === 1 ? '' : 's'}</span>
                    </td>
                    <td>
                      <strong>{participant.programsSaved} ever saved · {participant.programsWatched} ever watched</strong>
                      <span>{participant.sourceClicks} official source click{participant.sourceClicks === 1 ? '' : 's'}</span>
                    </td>
                    <td>
                      <strong>{participant.focusCompleted ? 'Focus set' : 'Focus not set'}</strong>
                      <span>{participant.alertsEnabled ? 'Alerts enabled' : 'Alerts not enabled'}</span>
                    </td>
                    <td>
                      <strong>{participant.eligibleActivated ? 'Eligible activated' : 'No eligible decision yet'}</strong>
                      <span>{participant.relevantPrograms ?? 0} relevant · {participant.newDiscoveries ?? 0} newly discovered</span>
                      <span>{participant.relevantWindowEligible ? (participant.relevantWindowReturned ? 'Returned after a relevant alert' : 'No return after mature alert yet') : 'Relevant-window return: N/A'}</span>
                    </td>
                    <td>
                      <strong>{participant.latestSupportLevel ? formatDisplayLabel(participant.latestSupportLevel) : 'Not recorded'}</strong>
                      <span>{participant.externalActions ?? 0} external action{participant.externalActions === 1 ? '' : 's'} · {formatDisplayLabel(participant.latestActionState || 'none')}</span>
                      <span>Legacy check-in: {formatBetaOutcome(participant.latestOutcome)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="maintainer-empty">No student workspaces have been opened yet.</p>
      )}
      {payload.offset > 0 || payload.hasMore ? (
        <div className="beta-participant-pagination" aria-label="Participant activity pages">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(0, payload.offset - payload.limit))}
            disabled={loading || payload.offset === 0}
          >
            Previous
          </button>
          <span>{loading ? 'Loading...' : `${firstVisible}-${lastVisible} of ${payload.total}`}</span>
          <button
            type="button"
            onClick={() => onPageChange(payload.offset + payload.limit)}
            disabled={loading || !payload.hasMore}
          >
            Next
          </button>
        </div>
      ) : null}
    </details>
  );
}

function formatBetaOutcome(outcome) {
  const outcomeLabels = {
    found_relevant_program: 'Found A Relevant Program',
    applied_earlier: 'Applied Earlier',
    not_yet: 'Not Yet',
  };

  return outcomeLabels[outcome] || 'No Outcome Yet';
}

function formatPercent(value, total) {
  if (!total) {
    return '0%';
  }

  return `${Math.round((value / total) * 100)}%`;
}

function MaintainerReviewSummary({ status, readinessCount, discoveryCount, alertCount, lastRefreshedAt }) {
  const actionTotal = readinessCount + discoveryCount + alertCount;
  const primaryStatus = actionTotal
    ? `${actionTotal} Item${actionTotal === 1 ? '' : 's'} Need Review`
    : 'Nothing Needs Review';
  const primaryDetail = actionTotal
    ? 'Resolve these before sending student alerts.'
    : 'Source monitoring continues in the background.';
  const primaryTasks = [
    {
      label: 'Source Checks',
      value: readinessCount,
      action: readinessCount ? 'Review Sources' : 'Clear',
      detail: readinessCount ? 'Check failed or uncertain sources.' : 'No source issues.',
      tone: readinessCount ? 'attention' : 'calm',
    },
    {
      label: 'New URLs',
      value: discoveryCount,
      action: discoveryCount ? 'Compare URLs' : 'Clear',
      detail: discoveryCount ? 'Accept or reject discovered pages.' : 'No URLs to review.',
      tone: discoveryCount ? 'attention' : 'calm',
    },
    {
      label: 'Alerts',
      value: alertCount,
      action: alertCount ? 'Preview And Send' : 'Clear',
      detail: alertCount ? 'Check recipients before sending.' : 'No alerts to review.',
      tone: alertCount ? 'attention' : 'calm',
    },
  ];

  return (
    <section className="maintainer-summary-panel" aria-label="Maintainer review summary">
      <div className="maintainer-summary-heading">
        <div>
          <span>Review Summary</span>
          <h2>{primaryStatus}</h2>
          <p>{primaryDetail}</p>
        </div>
        <time dateTime={lastRefreshedAt || undefined}>
          {lastRefreshedAt ? `Updated ${formatDateTime(lastRefreshedAt)}` : 'Live state pending'}
        </time>
      </div>
      <div className="maintainer-primary-tasks">
        {primaryTasks.map((task) => (
          <article className={`maintainer-task-card ${task.tone}`} key={task.label}>
            <strong>{task.value}</strong>
            <div>
              <span>{task.label}</span>
              <h3>{task.action}</h3>
              <p>{task.detail}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="maintainer-system-row" aria-label="Worker status">
        <MaintainerMetric label="Active Watches" value={status?.activeWatchRequests ?? status?.watchRequests ?? '-'} />
        <MaintainerMetric label="Monitored Sources" value={status?.officialSources ?? '-'} />
        <MaintainerMetric label="Checks Due" value={status?.dueSources ?? '-'} />
        <MaintainerMetric label="Alert Deliveries" value={status?.alertDeliveries ?? '-'} />
      </div>
    </section>
  );
}

function DiscoveryCandidateReviewPanel({ candidates, loading, onReviewCandidate }) {
  return (
    <section className="maintainer-panel maintainer-candidate-review-panel">
      <div className="maintainer-panel-heading">
        <div>
          <span>URL Review</span>
          <h2>{candidates.length} URL{candidates.length === 1 ? ' Needs' : 's Need'} Review</h2>
        </div>
        <p>Compare both pages. Accept only an official, current source.</p>
      </div>
      <div className="maintainer-card-list">
        {candidates.length ? (
          candidates.map((candidate) => (
            <article className="maintainer-candidate-card" key={candidate.id}>
              <div className="maintainer-card-header">
                <div>
                  <span>{formatDisplayLabel(candidate.confidence)}</span>
                  <h3>{candidate.programName || candidate.program_id}</h3>
                  <p>{candidate.title || 'Untitled candidate'}</p>
                </div>
                <div className="candidate-link-row">
                  <a href={candidate.candidate_url} target="_blank" rel="noreferrer">
                    Candidate
                  </a>
                  {candidate.currentOfficialUrl ? (
                    <a href={candidate.currentOfficialUrl} target="_blank" rel="noreferrer">
                      Current
                    </a>
                  ) : null}
                </div>
              </div>
              <dl className="candidate-source-compare">
                <div>
                  <dt>Candidate Host</dt>
                  <dd>{getDisplayHost(candidate.candidate_url)}</dd>
                </div>
                <div>
                  <dt>Current Host</dt>
                  <dd>{getDisplayHost(candidate.currentOfficialUrl)}</dd>
                </div>
                <div>
                  <dt>Query</dt>
                  <dd>{candidate.discovery_query || '-'}</dd>
                </div>
              </dl>
              <p className="maintainer-card-note">{candidate.reason || 'Needs maintainer review.'}</p>
              {candidate.snippet ? <blockquote>{stripHtml(candidate.snippet)}</blockquote> : null}
              <div className="candidate-decision-row">
                <ul className="candidate-review-checklist" aria-label="Review checks before accepting">
                  <li>Official owner</li>
                  <li>Current cycle</li>
                  <li>Audience matches</li>
                </ul>
                <div className="maintainer-actions">
                  <button type="button" onClick={() => onReviewCandidate(candidate, 'accepted')} disabled={loading}>
                    Accept & Queue Check
                  </button>
                  <button type="button" onClick={() => onReviewCandidate(candidate, 'rejected')} disabled={loading}>
                    Reject URL
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="maintainer-empty">No pending discovery candidates.</p>
        )}
      </div>
    </section>
  );
}

function MaintainerEmptyState() {
  const steps = [
    'Enter the Worker admin token.',
    'Press Enter or select Load Queue.',
    'Resolve the flagged sources, URLs, and alerts.',
  ];

  return (
    <section className="maintainer-panel maintainer-empty-state" aria-label="Maintainer start state">
      <div>
        <span>Start Here</span>
        <h2>Load The Review Queue.</h2>
        <p>ApplyFirst will load the items that need a maintainer decision.</p>
      </div>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}

function AlertCandidateActionResult({ result, onDismiss }) {
  const deliveries = result.deliveries ?? [];
  const previewDeliveries = deliveries.slice(0, 3);
  const hiddenDeliveryCount = Math.max(deliveries.length - previewDeliveries.length, 0);

  return (
    <section className={`alert-action-result ${result.tone}`} aria-label="Alert action result">
      <div className="alert-action-result-heading">
        <strong>{result.title}</strong>
        <button type="button" onClick={onDismiss} aria-label="Hide alert action result" title="Hide result">
          x
        </button>
      </div>
      <p>{result.detail}</p>
      {previewDeliveries.length ? (
        <ul>
          {previewDeliveries.map((delivery, index) => (
            <li key={`${delivery.destination}-${delivery.status}-${index}`}>
              <span>{formatDisplayLabel(delivery.status)}</span>
              <em>{delivery.channel || 'email'} / {delivery.destination || 'recipient hidden'}</em>
              {delivery.errorMessage ? <small>{delivery.errorMessage}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {hiddenDeliveryCount ? <p>{hiddenDeliveryCount} more delivery result{hiddenDeliveryCount === 1 ? '' : 's'} hidden.</p> : null}
      <time className="alert-action-result-time" dateTime={result.generatedAt}>
        Previewed {formatDateTime(result.generatedAt)}
      </time>
    </section>
  );
}

function MonitoringReadinessQueue({ queue, onCheckSource, onFindUrl, readinessActions, loading, canLoad }) {
  const groups = queue.groups ?? [];
  const attentionGroup = groups.find((group) => group.key === 'attention');
  const attentionItems = attentionGroup?.items ?? [];
  const trackingGroups = groups.filter((group) => group.key !== 'attention');
  const trackingCount = trackingGroups.reduce((total, group) => total + (group.items?.length ?? 0), 0);

  return (
    <section className="maintainer-panel monitoring-readiness-panel" aria-label="Monitoring readiness queue">
      <div className="maintainer-panel-heading readiness-heading">
        <div>
          <span>Review Queue</span>
          <h2>{queue.needsAttention ?? 0} Program{queue.needsAttention === 1 ? ' Needs' : 's Need'} Review</h2>
        </div>
        <p>Resolve these source or URL issues. Routine tracking is listed below.</p>
      </div>
      {attentionItems.length ? (
        <div className="readiness-action-list">
          {attentionItems.map((item) => (
            <ReadinessItemCard
              item={item}
              key={item.programId}
              onCheckSource={onCheckSource}
              onFindUrl={onFindUrl}
              activeAction={readinessActions[item.programId] ?? ''}
              loading={loading}
              canLoad={canLoad}
            />
          ))}
        </div>
      ) : (
        <div className="maintainer-clear-state">
          <strong>No source issues need review.</strong>
          <span>Tracking continues in the background.</span>
        </div>
      )}
      {trackingGroups.length ? (
        <details className="readiness-tracking-details">
          <summary>View Tracking Status <span>{trackingCount}</span></summary>
          <div className="readiness-groups">
        {trackingGroups.map((group) => (
          <section className="readiness-group" key={group.key}>
            <div className="readiness-group-heading">
              <div>
                <span>{group.label}</span>
                <strong>{group.items?.length ?? 0}</strong>
              </div>
              <p>{getReadinessGroupDescription(group.key)}</p>
            </div>
            <div className="readiness-item-list">
              {group.items?.length ? (
                group.items
                  .slice(0, 4)
                  .map((item) => (
                    <ReadinessItemCard
                      item={item}
                      key={item.programId}
                      onCheckSource={onCheckSource}
                      onFindUrl={onFindUrl}
                      activeAction={readinessActions[item.programId] ?? ''}
                      loading={loading}
                      canLoad={canLoad}
                    />
                  ))
              ) : (
                <p className="maintainer-empty">Nothing in this group.</p>
              )}
            </div>
          </section>
        ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function ReadinessItemCard({ item, onCheckSource, onFindUrl, activeAction, loading, canLoad }) {
  const isCheckingSource = activeAction === 'source';
  const isFindingUrl = activeAction === 'url';
  const hasLocalAction = Boolean(activeAction);

  return (
    <article className={`readiness-item-card source-state-${getSourceStateTone(item.state)}${hasLocalAction ? ' is-busy' : ''}`}>
      <div className="readiness-item-header">
        <div>
          <span>{item.state}</span>
          <h3>{item.programName}</h3>
        </div>
        <a href={item.url} target="_blank" rel="noreferrer">
          Source
        </a>
      </div>
      <p>{item.action}</p>
      <div className="readiness-item-footer">
        <dl>
          <div>
            <dt>Watchers</dt>
            <dd>{item.activeWatchCount ?? 0}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{formatDisplayLabel(item.schedulePhase || '-')}</dd>
          </div>
          <div>
            <dt>Next</dt>
            <dd>{formatDateTime(item.nextCheckAt)}</dd>
          </div>
        </dl>
        <div className="readiness-item-actions">
          <button type="button" onClick={() => onCheckSource(item.programId)} disabled={!canLoad || loading || hasLocalAction}>
            {isCheckingSource ? 'Checking...' : 'Check Source'}
          </button>
          <button type="button" onClick={() => onFindUrl(item.programId)} disabled={!canLoad || loading || hasLocalAction}>
            {isFindingUrl ? 'Finding...' : 'Find URL'}
          </button>
        </div>
      </div>
    </article>
  );
}

function getReadinessGroupDescription(key) {
  switch (key) {
    case 'attention':
      return 'Needs action: review alerts, accept exact source URLs, or resolve unclear sources.';
    case 'ready':
      return 'Tracking: open or deadline signals worth watching, but not necessarily blocked.';
    case 'closed':
      return 'Tracking: safe to keep watching, but not alert-worthy right now.';
    default:
      return 'Tracking: healthy monitored records waiting for their useful window.';
  }
}

function MaintainerMetric({ label, value }) {
  return (
    <span className="maintainer-metric">
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function ReviewHistoryPanel({ history, events: providedEvents }) {
  const [activeHistoryFilter, setActiveHistoryFilter] = useState('all');
  const [showExpandedHistory, setShowExpandedHistory] = useState(false);
  const allEvents = providedEvents ?? buildReviewHistoryEvents(history);
  const attentionCount = allEvents.filter((event) => event.needsAttention).length;
  const latestEvent = allEvents[0];
  const filters = [
    { id: 'all', label: 'All', count: allEvents.length },
    { id: 'attention', label: 'Needs Review', count: attentionCount },
    { id: 'source', label: 'Sources', count: allEvents.filter((event) => event.category === 'source').length },
    { id: 'alert', label: 'Alerts', count: allEvents.filter((event) => event.category === 'alert').length },
  ];
  const filteredEvents = filterReviewHistoryEvents(allEvents, activeHistoryFilter);
  const compactHistory = filteredEvents.length > 5;
  const visibleHistoryCount = compactHistory && !showExpandedHistory ? 4 : 12;
  const events = filteredEvents.slice(0, visibleHistoryCount);
  const hiddenHistoryCount = Math.max(filteredEvents.length - events.length, 0);

  return (
    <section className="maintainer-panel review-history-panel" aria-label="Maintainer review history">
      <div className="maintainer-panel-heading review-history-heading">
        <div>
          <span>Audit Trail</span>
          <h2>Recent Maintainer Activity</h2>
        </div>
        <p>Review the latest search runs, source checks, URL decisions, and alert attempts in one timeline.</p>
      </div>

      <div className="review-history-toolbar">
        <div className="review-history-kpis" aria-label="Review history summary">
          <span>
            <strong>{allEvents.length}</strong>
            Recent Events
          </span>
          <span className={attentionCount ? 'needs-attention' : ''}>
            <strong>{attentionCount}</strong>
            Need Review
          </span>
          <span>
            <strong>{latestEvent ? formatDateTime(latestEvent.timestamp) : '-'}</strong>
            Latest
          </span>
        </div>
        <div className="review-history-filters" role="group" aria-label="Filter audit trail">
          {filters.map((filter) => (
            <button
              className={activeHistoryFilter === filter.id ? 'active' : ''}
              type="button"
              key={filter.id}
              onClick={() => setActiveHistoryFilter(filter.id)}
            >
              {filter.label}
              <span>{filter.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="review-history-list">
        {events.length ? (
          <>
            {events.map((event) => (
              <article className={`history-event ${event.kind} ${event.tone}`} key={event.id}>
                <span className="history-event-marker" aria-hidden="true" />
                <div className="history-event-body">
                  <div className="history-event-topline">
                    <span>{event.type}</span>
                    <time dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time>
                  </div>
                  <strong>{event.title}</strong>
                  <p>{event.description}</p>
                  {event.meta.length ? (
                    <div className="history-event-meta">
                      {event.meta.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {hiddenHistoryCount ? (
              <button className="review-history-toggle" type="button" onClick={() => setShowExpandedHistory(true)}>
                Show {hiddenHistoryCount} More Recent Event{hiddenHistoryCount === 1 ? '' : 's'}
              </button>
            ) : showExpandedHistory && compactHistory ? (
              <button className="review-history-toggle" type="button" onClick={() => setShowExpandedHistory(false)}>
                Show Fewer Events
              </button>
            ) : null}
          </>
        ) : (
          <p className="maintainer-empty">
            {activeHistoryFilter === 'attention'
              ? 'No recent events need review.'
              : 'No review history yet. Run search, review a URL, or check a source to start the audit trail.'}
          </p>
        )}
      </div>
    </section>
  );
}

function buildReviewHistoryEvents(history) {
  const searchRuns = (history.searchRuns ?? []).map((run) => ({
    id: `search-${run.id}`,
    kind: 'history-event-search',
    category: 'search',
    tone: run.status === 'completed' && !Number(run.errorCount || 0) ? 'neutral' : 'attention',
    needsAttention: run.status !== 'completed' || Number(run.errorCount || 0) > 0,
    type: 'Search Run',
    title: `${formatDisplayLabel(run.provider)} ${run.dryRun ? 'Dry Run' : 'Search'}`,
    description: `${run.searchedPrograms} program${run.searchedPrograms === 1 ? '' : 's'}, ${run.searchedQueries} quer${run.searchedQueries === 1 ? 'y' : 'ies'}, ${run.keptCandidates} kept, ${run.ignoredResults} ignored.`,
    meta: [
      formatDisplayLabel(run.status),
      run.force ? 'Forced' : '',
      run.programNames?.length ? run.programNames.join(', ') : '',
    ].filter(Boolean),
    timestamp: run.createdAt,
  }));

  const reviewedUrls = (history.reviewedUrls ?? []).map((candidate) => ({
    id: `url-${candidate.id}`,
    kind: candidate.status === 'accepted' ? 'history-event-accepted' : 'history-event-review',
    category: 'url',
    tone: candidate.status === 'accepted' ? 'success' : 'neutral',
    needsAttention: false,
    type: 'URL Decision',
    title: candidate.programName || candidate.programId || 'Discovered URL',
    description: candidate.reviewNote || candidate.reason || 'Reviewed discovered URL candidate.',
    meta: [formatDisplayLabel(candidate.status), getDisplayHost(candidate.candidateUrl)].filter(Boolean),
    timestamp: candidate.reviewedAt || candidate.updatedAt,
  }));

  const sourceChecks = (history.sourceChecks ?? []).map((check) => ({
    id: `check-${check.id}`,
    kind: check.newAlertCandidate || check.changed ? 'history-event-source-active' : 'history-event-source',
    category: 'source',
    tone: getSourceCheckNeedsAttention(check) ? 'attention' : 'neutral',
    needsAttention: getSourceCheckNeedsAttention(check),
    type: 'Source Check',
    title: check.programName || check.programId || 'Program source',
    description: check.note ? summarizeSentence(check.note, 150) : check.reviewDecision || 'Source checked.',
    meta: [
      formatDisplayLabel(check.result),
      check.reviewDecision,
      check.changed ? 'Changed' : 'No Material Change',
    ].filter(Boolean),
    timestamp: check.createdAt,
  }));

  const alertDeliveries = (history.alertDeliveries ?? []).map((delivery) => ({
    id: `delivery-${delivery.id}`,
    kind: delivery.status === 'sent' ? 'history-event-delivery-sent' : 'history-event-delivery',
    category: 'alert',
    tone: delivery.status === 'sent' ? 'success' : 'attention',
    needsAttention: !['sent', 'queued', 'already_sent', 'ready'].includes(String(delivery.status || '').toLowerCase()),
    type: 'Alert Attempt',
    title: delivery.programName || delivery.programId || 'Tracked program',
    description: delivery.errorMessage || `${formatDisplayLabel(delivery.channel)} alert to ${delivery.destination || 'masked destination'}.`,
    meta: [formatDisplayLabel(delivery.status), delivery.destination].filter(Boolean),
    timestamp: delivery.sentAt || delivery.createdAt,
  }));

  return [...searchRuns, ...reviewedUrls, ...sourceChecks, ...alertDeliveries].sort(
    (first, second) => getTimestamp(second.timestamp) - getTimestamp(first.timestamp),
  );
}

function filterReviewHistoryEvents(events, filter) {
  switch (filter) {
    case 'attention':
      return events.filter((event) => event.needsAttention);
    case 'source':
    case 'alert':
      return events.filter((event) => event.category === filter);
    default:
      return events;
  }
}

function getSourceCheckNeedsAttention(check) {
  const reviewDecision = String(check.reviewDecision || '').toLowerCase();
  const result = String(check.result || '').toLowerCase();
  const suggestedStatus = String(check.suggestedStatus || '').toLowerCase();

  return (
    Boolean(check.newAlertCandidate) ||
    Boolean(check.changed) ||
    reviewDecision.includes('manual') ||
    result.includes('needs') ||
    suggestedStatus.includes('review')
  );
}

function getTimestamp(value) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function summarizeSentence(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value || '';
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function DiscoverySearchSummary({ result }) {
  const programs = result.results ?? [];
  const keptCount = programs.reduce((total, program) => total + (program.candidates?.length ?? 0), 0);
  const ignoredCount = programs.reduce(
    (total, program) => total + (program.queries ?? []).reduce((queryTotal, query) => queryTotal + (query.ignored ?? 0), 0),
    0,
  );

  return (
    <section className="discovery-search-summary" aria-label="Discovery search result summary">
      <div className="discovery-summary-heading">
        <span>{result.provider}</span>
        <strong>{result.searchedQueries} Queries Reviewed</strong>
        <p>
          Found {result.foundResults} results, saved {result.savedCandidates ?? 0}, updated{' '}
          {result.updatedCandidates ?? 0}.
        </p>
      </div>
      <div className="discovery-summary-metrics">
        <MaintainerMetric label="Kept" value={keptCount} />
        <MaintainerMetric label="Ignored" value={ignoredCount} />
        <MaintainerMetric label="Errors" value={result.errorCount ?? 0} />
      </div>
      {programs.length ? (
        <div className="discovery-program-audit-list">
          {programs.map((program) => (
            <article className="discovery-program-audit" key={program.programId}>
              <div className="discovery-program-heading">
                <div>
                  <span>{program.programId}</span>
                  <h3>{program.programName}</h3>
                </div>
                <strong>{program.candidates?.length ?? 0} Kept</strong>
              </div>
              {program.candidates?.length ? (
                <ul className="discovery-kept-list" aria-label={`${program.programName} kept candidates`}>
                  {program.candidates.map((candidate) => (
                    <li key={`${program.programId}-${candidate.url}`}>
                      <div>
                        <a href={candidate.url} target="_blank" rel="noreferrer">
                          {candidate.title || candidate.url}
                        </a>
                        <span>{formatDisplayLabel(candidate.confidence)}</span>
                      </div>
                      <p>{candidate.reason || 'Needs maintainer review.'}</p>
                      {candidate.matchType || candidate.signals?.length ? (
                        <em>{[candidate.matchType, ...(candidate.signals ?? [])].filter(Boolean).join(' / ')}</em>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="discovery-query-audit-list" aria-label={`${program.programName} query audit`}>
                {(program.queries ?? []).map((query) => (
                  <li key={`${program.programId}-${query.query}`}>
                    <div>
                      <strong>{query.query}</strong>
                      <span>
                        {query.kept ?? 0} kept / {query.ignored ?? 0} ignored
                      </span>
                    </div>
                    {query.error ? <p className="source-check-error">Error: {query.error}</p> : null}
                    {query.ignoredSamples?.length ? (
                      <ul className="discovery-ignored-list">
                        {query.ignoredSamples.map((sample) => (
                          <li key={`${query.query}-${sample.url || sample.title || sample.filter}`}>
                            <span>{formatDisplayLabel(sample.filter)}</span>
                            <p>{sample.reason}</p>
                            {sample.title ? <em>{sample.title}</em> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <p>No programs were searched.</p>
      )}
    </section>
  );
}

function SourceRunSummary({ result }) {
  const checks = result.checks ?? [];

  return (
    <section className="source-run-summary" aria-label="Source dry run summary">
      <div className="source-run-metrics" aria-label="Source dry run metrics">
        <MaintainerMetric label="Checked" value={result.checked ?? checks.length} />
        <MaintainerMetric label="Manual Review" value={result.manualReview ?? '-'} />
        <MaintainerMetric label="Alert Candidates" value={result.alertCandidates ?? '-'} />
        <MaintainerMetric label="Writes Skipped" value={result.writesSkipped ? 'Yes' : 'No'} />
      </div>
      <div className="source-check-list">
        {checks.length ? (
          checks.map((check) => (
            <article className={`source-check-card source-state-${getSourceStateTone(check.sourceState)}`} key={check.programId}>
              <div className="source-check-card-heading">
                <div>
                  <span>{check.programId}</span>
                  <h3>{check.name || check.programId}</h3>
                </div>
                <strong>{check.sourceState || formatDisplayLabel(check.status || check.reviewDecision)}</strong>
              </div>
              <p>{check.sourceAction || 'Review the official source before deciding whether to update this record.'}</p>
              <dl>
                <div>
                  <dt>Result</dt>
                  <dd>{check.result || '-'}</dd>
                </div>
                <div>
                  <dt>Decision</dt>
                  <dd>{check.reviewDecision || '-'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{formatDisplayLabel(check.status || '-')}</dd>
                </div>
                <div>
                  <dt>Next Check</dt>
                  <dd>{formatDateTime(check.nextCheckAt)}</dd>
                </div>
              </dl>
              {check.detectedSignal ? <em>Signal: {check.detectedSignal}</em> : null}
              {check.error ? <em className="source-check-error">Error: {check.error}</em> : null}
              {check.url ? (
                <a href={check.url} target="_blank" rel="noreferrer">
                  Open Official Source
                </a>
              ) : null}
            </article>
          ))
        ) : (
          <p className="maintainer-empty">No source checks returned.</p>
        )}
      </div>
    </section>
  );
}

async function fetchMaintainerJson({ workerBaseUrl, adminToken, path, method = 'GET', body }) {
  if (!workerBaseUrl) {
    throw new Error('Set VITE_WATCH_ENDPOINT before using the maintainer console.');
  }

  if (!adminToken.trim()) {
    throw new Error('Paste the Worker admin token for this session.');
  }

  const headers = {
    Authorization: `Bearer ${adminToken.trim()}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${workerBaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Worker returned HTTP ${response.status}.`);
  }

  return payload;
}

function parseProgramIds(value) {
  return String(value ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSourceStateTone(sourceState) {
  const normalized = String(sourceState ?? '').toLowerCase();

  if (normalized.includes('open') && !normalized.includes('old')) {
    return 'open';
  }

  if (normalized.includes('closed') || normalized.includes('old') || normalized.includes('monitor')) {
    return 'monitor';
  }

  if (normalized.includes('exact') || normalized.includes('deadline') || normalized.includes('warmup')) {
    return 'watch';
  }

  if (normalized.includes('error') || normalized.includes('review')) {
    return 'review';
  }

  return 'neutral';
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getWorkerBaseUrl(endpoint) {
  const value = String(endpoint ?? '').trim().replace(/\/+$/, '');

  if (!value) {
    return '';
  }

  return value.endsWith('/watch') ? value.slice(0, -6) : value;
}

function stripHtml(value) {
  return cleanText(String(value ?? '').replace(/<[^>]+>/g, ' ')).slice(0, 320);
}

function VerificationQueuePanel({ queueItems, onSelect }) {
  const queuePreview = queueItems.slice(0, 6);

  return (
    <section className="verification-queue-panel" id="verification" aria-label="Source review queue">
      <div className="queue-heading">
        <div className="panel-heading">
          <span>Source Review</span>
          <h2>What to Confirm Before Real Alerts</h2>
        </div>
        <p>
          Prioritized by underclassmen fit, recommendation value, source coverage, and missing official-cycle
          details. These are the records to check before sending public notifications.
        </p>
      </div>
      <div className="verification-queue-list" role="list">
        {queuePreview.map(({ opportunity, priority, readiness }) => (
          <article className="verification-queue-item" key={opportunity.id} role="listitem">
            <div>
              <span className={`queue-priority queue-${priority.label.toLowerCase().replaceAll(' ', '-')}`}>
                {priority.label}
              </span>
              <h3>{opportunity.name}</h3>
              <p>{opportunity.organization}</p>
            </div>
            <dl>
              <div>
                <dt>Blockers</dt>
                <dd>{readiness.missing.length ? readiness.missing.join(', ') : 'Ready for Monitoring'}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{priority.reason}</dd>
              </div>
            </dl>
            <button type="button" onClick={() => onSelect(opportunity.id)}>
              Review record
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AlertSetupPanel({
  alertPrefs,
  setAlertPrefs,
  onFocusChange,
  matchCount,
  alertMatches,
  savedOpportunities,
  watchIntentOpportunities,
  alertStrategy,
  betaAlertSetup,
  onBetaAlertSetupSave,
  onAddSuggestedProgram,
  waitlistIntent,
  alertEndpoint,
  watchEndpoint,
  accessCode,
}) {
  const getPreferenceCardClassName = (value) =>
    `alert-preference-card${isPreferenceUnset(value) ? ' is-missing' : ' is-complete'}`;

  const updatePref = (key, value) => {
    onFocusChange();
    setAlertPrefs((currentPrefs) => ({
      ...currentPrefs,
      [key]: value,
    }));
  };

  return (
    <section className="alert-setup-panel">
      <section className="focus-section focus-required-section" aria-label="Required focus setup">
        <div className="focus-section-heading">
          <div>
            <span>Step 1</span>
            <h2>Tell ApplyFirst What To Match</h2>
          </div>
        </div>
        {waitlistIntent ? <p className="preference-source-note">Pre-filled from your waitlist. Edit anytime.</p> : null}
        <div className="alert-preference-layout">
          <article className={getPreferenceCardClassName(alertPrefs.classYear)}>
            <div className="preference-card-heading">
              <span>Class Year <span className="preference-required-mark" aria-label="required field">*</span></span>
            </div>
            <FilterSelect
              label="Class Year"
              value={alertPrefs.classYear}
              onChange={(value) => updatePref('classYear', value)}
              options={filterOptions.classYears}
              placeholder="Choose Class Year"
              includeAll={false}
            />
          </article>
          <article className={getPreferenceCardClassName(alertPrefs.roleTrack)}>
            <div className="preference-card-heading">
              <span>Role Interest <span className="preference-required-mark" aria-label="required field">*</span></span>
            </div>
            <FilterSelect
              label="Role Interest"
              value={alertPrefs.roleTrack}
              onChange={(value) => updatePref('roleTrack', value)}
              options={filterOptions.roleTracks}
              placeholder="Choose Role Interest"
              includeAll={false}
            />
          </article>
          <article className={getPreferenceCardClassName(alertPrefs.sendTiming)}>
            <div className="preference-card-heading">
              <span>Alert Timing <span className="preference-required-mark" aria-label="required field">*</span></span>
            </div>
            <FilterSelect
              label="Timing Preference"
              value={alertPrefs.sendTiming}
              onChange={(value) => updatePref('sendTiming', value)}
              options={Object.keys(sendTimingLabels)}
              labels={sendTimingLabels}
              placeholder="Choose Timing"
              includeAll={false}
            />
          </article>
        </div>
      </section>
      <BetaAlertSystem
        alertPrefs={alertPrefs}
        alertStrategy={alertStrategy}
        matches={alertMatches}
        savedOpportunities={savedOpportunities}
        watchIntentOpportunities={watchIntentOpportunities}
        betaAlertSetup={betaAlertSetup}
        onSave={onBetaAlertSetupSave}
        onAddSuggestedProgram={onAddSuggestedProgram}
        waitlistIntent={waitlistIntent}
        captureEndpoint={alertEndpoint}
        watchEndpoint={watchEndpoint}
      />
    </section>
  );
}

function BetaAlertSystem({
  alertPrefs,
  alertStrategy,
  matches,
  savedOpportunities,
  watchIntentOpportunities = [],
  betaAlertSetup,
  onSave,
  onAddSuggestedProgram,
  waitlistIntent,
  captureEndpoint = '',
  watchEndpoint = '',
}) {
  const textAlertsAvailable = textAlertsEnabled;
  const [email, setEmail] = useState(waitlistIntent?.email ?? betaAlertSetup?.email ?? '');
  const [phoneNumber, setPhoneNumber] = useState(betaAlertSetup?.phoneNumber ?? '');
  const [contactMethod, setContactMethod] = useState(betaAlertSetup?.contactMethod ?? 'email');
  const [submitState, setSubmitState] = useState('idle');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const effectiveContactMethod = textAlertsAvailable ? contactMethod : 'email';

  useEffect(() => {
    if (waitlistIntent?.email && !email) {
      setEmail(waitlistIntent.email);
    }
  }, [email, waitlistIntent]);

  const requiredFields = [
    { label: 'Class Year', value: alertPrefs.classYear },
    { label: 'Role Track', value: alertPrefs.roleTrack },
    { label: 'Alert Timing', value: alertPrefs.sendTiming },
  ];
  const missingSetupFields = requiredFields
    .filter((field) => isPreferenceUnset(field.value))
    .map((field) => field.label);
  const hasIncompleteSetup = missingSetupFields.length > 0;
  const hasPreviewFocus = ![alertPrefs.classYear, alertPrefs.roleTrack].some(isPreferenceUnset);
  const hasEmail = Boolean(email.trim());
  const hasPhone = Boolean(phoneNumber.trim());
  const hasContact = effectiveContactMethod === 'phone' ? hasPhone : hasEmail;
  const missingSetupSummary =
    missingSetupFields.length > 1
      ? `${missingSetupFields.slice(0, -1).join(', ')} and ${missingSetupFields.at(-1)}`
      : missingSetupFields[0];
  const alertReadyMatches = matches.filter((item) => getMonitoringReadiness(item).alertable);
  const watchedPrograms = uniqueOpportunitiesById(watchIntentOpportunities);
  const watchedPreview = watchedPrograms.slice(0, 6);
  const watchedProgramIds = new Set(watchedPrograms.map((item) => item.id));
  const suggestedMatches = hasPreviewFocus
    ? alertReadyMatches.filter((item) => !watchedProgramIds.has(item.id)).slice(0, 3)
    : [];
  const hasWatchedPrograms = watchedPrograms.length > 0;
  const watchedAlertReadyCount = watchedPrograms.filter((item) => getMonitoringReadiness(item).alertable).length;
  const watchedNeedsSourceCheck = watchedPrograms.length - watchedAlertReadyCount;
  const currentWatchSetup = {
    classYear: alertPrefs.classYear,
    roleTrack: alertPrefs.roleTrack,
    priority: alertPrefs.priority || 'all',
    sendTiming: alertPrefs.sendTiming,
    email: email.trim(),
    phoneNumber: phoneNumber.trim(),
    contactMethod,
    watchedProgramIds: watchedPrograms.map((item) => item.id),
  };
  const hasUnsavedWatchSetupChanges =
    Boolean(betaAlertSetup) && !watchSetupMatches(betaAlertSetup, currentWatchSetup);
  const isSavedWatchSetupCurrent = Boolean(betaAlertSetup) && !hasUnsavedWatchSetupChanges;
  const needsTurnstile = Boolean(captureEndpoint && email.trim() && !turnstileToken);
  const setupActionMessage = hasIncompleteSetup
    ? `Choose ${missingSetupSummary} first.`
      : !hasContact
      ? effectiveContactMethod === 'phone'
        ? 'Add a phone number to receive text alerts.'
        : 'Add an email to receive opening alerts.'
      : !hasWatchedPrograms
        ? 'Choose at least one program to watch first.'
      : needsTurnstile
        ? 'Complete the verification before starting alerts.'
      : isSavedWatchSetupCurrent
        ? ''
        : betaAlertSetup
          ? ''
          : '';
  const setupButtonLabel =
    submitState === 'submitting'
      ? 'Saving...'
      : isSavedWatchSetupCurrent
        ? 'Alert Setup Saved'
        : betaAlertSetup
          ? 'Update Alert Setup'
          : 'Start Alerts';
  const setupButtonClassName = isSavedWatchSetupCurrent
    ? 'is-saved'
    : betaAlertSetup && hasUnsavedWatchSetupChanges
      ? 'is-dirty'
      : '';
  const setupButtonDisabled =
    hasIncompleteSetup || !hasContact || !hasWatchedPrograms || needsTurnstile || submitState === 'submitting' || isSavedWatchSetupCurrent;
  const shouldShowSetupStatus = setupButtonDisabled && !isSavedWatchSetupCurrent;

  const createSetupPayload = (captureStatus) => ({
    classYear: alertPrefs.classYear,
    roleTrack: alertPrefs.roleTrack,
    priority: alertPrefs.priority || 'all',
    sendTiming: alertPrefs.sendTiming,
    email: email.trim(),
    phoneNumber: phoneNumber.trim(),
    contactMethod: effectiveContactMethod,
    matchCount: matches.length,
    alertReadyCount: watchedAlertReadyCount,
    savedCount: savedOpportunities.length,
    needsSourceCheck: watchedNeedsSourceCheck,
    matchingProgramIds: matches.map((item) => item.id),
    alertReadyProgramIds: alertReadyMatches.map((item) => item.id),
    savedProgramIds: savedOpportunities.map((item) => item.id),
    watchedProgramIds: watchedPrograms.map((item) => item.id),
    watchedPrograms: watchedPrograms.map((item) => ({
      id: item.id,
      name: item.name,
      organization: item.organization,
      url: item.previousUrl || item.url,
      readiness: getMonitoringReadiness(item).status,
      reason: 'Selected for alerts',
    })),
    captureStatus,
  });

  const saveSetup = async () => {
    const hasRemoteEndpoint = Boolean((captureEndpoint && email.trim()) || watchEndpoint);
    const payload = createSetupPayload(hasRemoteEndpoint ? 'Submitting' : 'Saved Locally');
    const prioritySummary =
      payload.priority === 'all' ? 'All Recommendations' : priorityLabels[payload.priority] ?? payload.priority;
    const preferenceSummary = `${payload.classYear} / ${payload.roleTrack} / ${prioritySummary} / ${sendTimingLabels[payload.sendTiming] ?? payload.sendTiming}`;
    const watchedProgramNames = payload.watchedPrograms.map((program) => program.name).filter(Boolean);
    const notificationConsentText =
      'I agree to receive ApplyFirst beta opening alerts by my selected contact method for programs I choose to watch. Message and data rates may apply for text alerts. I can unsubscribe or opt out.';

    if (hasRemoteEndpoint) {
      if (captureEndpoint && payload.email && !turnstileToken) {
        setSubmitState('verificationRequired');
        return;
      }

      setSubmitState('submitting');
      try {
        const requests = [];

        if (captureEndpoint && payload.email) {
          requests.push(
            postJson(captureEndpoint, {
              source: 'applyfirst-beta-email-alert',
              email: payload.email,
              classYear: payload.classYear,
              interest: payload.roleTrack,
              school: '',
              note: `Beta email alert setup. Watching: ${watchedProgramNames.join(', ') || 'No programs yet'}. Alert-ready: ${payload.alertReadyCount}. Needs source check: ${payload.needsSourceCheck}.`,
              preferenceSummary,
              notificationMode: 'Beta Email Alerts',
              savedAt: new Date().toISOString(),
              turnstileToken,
            }),
          );
        }

        if (watchEndpoint) {
          requests.push(
            postJson(watchEndpoint, {
              accessCode,
              source: 'applyfirst-watch-request',
              email: payload.email,
              classYear: payload.classYear,
              roleTrack: payload.roleTrack,
              priority: payload.priority,
              sendTiming: payload.sendTiming,
              phoneNumber: payload.phoneNumber,
              contactMethod: payload.contactMethod,
              preferenceSummary,
              notificationMode: 'Beta Watch Request',
              notificationConsentAt: new Date().toISOString(),
              notificationConsentText,
              matchCount: payload.matchCount,
              alertReadyCount: payload.alertReadyCount,
              savedCount: payload.savedCount,
              needsSourceCheck: payload.needsSourceCheck,
              matchingProgramIds: payload.matchingProgramIds,
              alertReadyProgramIds: payload.alertReadyProgramIds,
              savedProgramIds: payload.savedProgramIds,
              watchedProgramIds: payload.watchedProgramIds,
              watchedPrograms: payload.watchedPrograms,
              requestedAt: new Date().toISOString(),
            }),
          );
        }

        await Promise.all(requests);
        setTurnstileResetKey((current) => current + 1);
        onSave(createSetupPayload(watchEndpoint ? 'Opening Alerts Submitted' : 'Email Alerts Submitted'));
        setSubmitState('submitted');
        return;
      } catch {
        setTurnstileResetKey((current) => current + 1);
        onSave(createSetupPayload('Saved Locally After Endpoint Issue'));
        setSubmitState('localFallback');
        return;
      }
    }

    onSave(payload);
    setSubmitState('savedLocal');
  };

  return (
    <section className="beta-alert-system" id="watch-plan" aria-label="Opening alert setup">
      <div className="watch-plan-header">
        <div className="beta-alert-copy">
          <span>Step 2</span>
          <h3>Choose Alert Delivery</h3>
          <p>
            {hasPreviewFocus
              ? 'Pick how you want to receive reviewed opening alerts.'
              : 'Finish your focus fields first, then add contact info.'}
          </p>
        </div>
        {shouldShowSetupStatus ? (
          <div className="setup-status-pill needs-action" aria-label="Alert setup status">
            <strong>Still Needed</strong>
            <span>{setupActionMessage}</span>
          </div>
        ) : null}
      </div>

      <div className="beta-alert-actions">
        <div className="contact-method-control" role="group" aria-label="Alert delivery method">
          <button
            className={contactMethod === 'email' ? 'active' : ''}
            type="button"
            onClick={() => setContactMethod('email')}
          >
            Email
          </button>
          <button
            className={effectiveContactMethod === 'phone' ? 'active' : 'unavailable'}
            type="button"
            onClick={() => {
              if (textAlertsAvailable) {
                setContactMethod('phone');
              }
            }}
            disabled={!textAlertsAvailable}
            aria-disabled={!textAlertsAvailable}
            title="Text alerts are not available for this beta yet."
          >
            Text <span>Soon</span>
          </button>
        </div>
        {effectiveContactMethod === 'phone' ? (
          <label>
            <span>Phone For Text Alerts</span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+1 555 123 4567"
            />
          </label>
        ) : (
          <label>
            <span>Email For Opening Alerts</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
        )}
        <button
          className={setupButtonClassName}
          type="button"
          onClick={saveSetup}
          disabled={setupButtonDisabled}
          title={shouldShowSetupStatus ? setupActionMessage : undefined}
        >
          {setupButtonLabel}
        </button>
        {captureEndpoint && email.trim() ? (
          <TurnstileVerification action="waitlist" onTokenChange={setTurnstileToken} resetKey={turnstileResetKey} />
        ) : null}
      </div>

      {betaAlertSetup ? <WatchSetupReceipt setup={betaAlertSetup} /> : null}

      <section className="alert-preview-panel" aria-label="Alert setup preview">
        <aside className="alert-preview-sidebar">
          <span>Step 3</span>
          <strong>Review Alert Preview</strong>
          <p>Confirm setup before ApplyFirst starts watching.</p>
          <dl className="alert-preview-stats" aria-label="Alert setup summary">
            <div>
              <dt>Selected</dt>
              <dd>
                {watchedPreview.length
                  ? `${watchedPreview.length} ${watchedPreview.length === 1 ? 'Program' : 'Programs'}`
                  : hasPreviewFocus
                    ? 'None Yet'
                    : 'Pending'}
              </dd>
            </div>
            <div>
              <dt>Ready</dt>
              <dd>{hasWatchedPrograms ? `${watchedAlertReadyCount}/${watchedPreview.length}` : 'Pending'}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>{hasPreviewFocus ? alertStrategy.timingLabel : 'Choose Timing'}</dd>
            </div>
          </dl>
        </aside>
        <div className="alert-preview-main">
          <BetaAlertFeed
            watchedPrograms={watchedPreview}
            suggestedPrograms={suggestedMatches}
            hasSavedSetup={Boolean(betaAlertSetup)}
            hasPreviewFocus={hasPreviewFocus}
            onAddSuggestedProgram={onAddSuggestedProgram}
          />
        </div>
      </section>
    </section>
  );
}

function WatchSetupReceipt({ setup }) {
  const contactLabel = setup.contactMethod === 'phone' ? 'Text Alerts' : 'Email Alerts';
  const savedDate = setup.savedAt ? formatDateTime(setup.savedAt) : 'Saved';

  return (
    <section className="watch-setup-receipt" aria-label="Saved alert setup receipt">
      <div>
        <span>Alert Setup</span>
        <strong>{setup.captureStatus ?? 'Alert Setup Saved'}</strong>
        <p>{contactLabel} / {savedDate}</p>
      </div>
    </section>
  );
}

function watchSetupMatches(savedSetup, currentSetup) {
  return (
    JSON.stringify(normalizeWatchSetupForComparison(savedSetup)) ===
    JSON.stringify(normalizeWatchSetupForComparison(currentSetup))
  );
}

function normalizeWatchSetupForComparison(setup = {}) {
  const contactMethod = setup.contactMethod || 'email';
  const watchedProgramIds = [...new Set(setup.watchedProgramIds ?? [])].filter(Boolean).sort();

  return {
    classYear: setup.classYear || '',
    roleTrack: setup.roleTrack || '',
    priority: setup.priority || 'all',
    sendTiming: setup.sendTiming || '',
    contactMethod,
    contact:
      contactMethod === 'phone'
        ? String(setup.phoneNumber ?? '').trim()
        : String(setup.email ?? '').trim().toLowerCase(),
    watchedProgramIds,
  };
}

function BetaAlertFeed({ watchedPrograms, suggestedPrograms, hasSavedSetup, hasPreviewFocus, onAddSuggestedProgram }) {
  const feedItems = watchedPrograms.slice(0, 3).map((program) => {
    const readiness = getMonitoringReadiness(program);

    return {
      id: program.id,
      kind: hasSavedSetup ? 'Active' : 'Selected',
      name: program.name,
      organization: program.organization,
      status: readiness.alertable ? 'Ready' : 'Needs check',
      timing: program.openDate,
    };
  });
  const suggestedItems = suggestedPrograms.slice(0, 3).map((program) => ({
    id: program.id,
    name: program.name,
    organization: program.organization,
    status: 'Suggested',
    timing: program.openDate,
  }));

  return (
    <section className="beta-alert-feed" aria-label="Selected alert programs">
      <div className="alert-program-table">
        <div className="alert-program-table-heading">
          <span>Programs to Watch</span>
        </div>
        <div className="alert-program-groups">
          <section className="alert-program-section selected" aria-label="Selected programs for alerts">
            <div className="alert-program-section-heading">
              <span>Selected</span>
              <strong>{feedItems.length ? `${feedItems.length} ${feedItems.length === 1 ? 'Program' : 'Programs'}` : 'None Yet'}</strong>
            </div>
            {feedItems.length ? (
              <div className="alert-program-list" role="list">
                {feedItems.map((item) => (
                  <article className="alert-program-row selected" key={item.id} role="listitem">
                    <div>
                      <strong>{item.name}</strong>
                      <em>{item.organization}</em>
                    </div>
                    <small>{item.timing}</small>
                    <span className="alert-program-status">{item.status}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="beta-alert-feed-empty">
                {hasPreviewFocus
                  ? 'Save one program to start your watchlist preview.'
                  : 'Set focus fields to preview alert-ready matches.'}
              </p>
            )}
          </section>
          {suggestedItems.length ? (
            <section className="alert-program-section suggested" aria-label="Suggested programs to save">
              <div className="alert-program-section-heading">
                <span>Suggested Matches</span>
                <strong>{suggestedItems.length} {suggestedItems.length === 1 ? 'Match' : 'Matches'}</strong>
              </div>
              <div className="alert-program-list" role="list">
                {suggestedItems.map((item) => (
                  <article className="alert-program-row suggested" key={item.id} role="listitem">
                    <div>
                      <strong>{item.name}</strong>
                      <em>{item.organization}</em>
                    </div>
                    <small>{item.timing}</small>
                    <span className="alert-program-status">{item.status}</span>
                    <button
                      className="alert-program-add"
                      type="button"
                      onClick={() => onAddSuggestedProgram?.(item.id)}
                      aria-label={`Add ${item.name} to alerts`}
                    >
                      Add
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function BetaOutcomeCheckIn({ outcome, onChange }) {
  const options = [
    { value: 'found_relevant_program', label: 'Found A Relevant Program' },
    { value: 'applied_earlier', label: 'Applied Earlier' },
    { value: 'not_yet', label: 'Not Yet' },
  ];

  return (
    <section className="beta-outcome-check-in" aria-label="ApplyFirst beta progress check-in">
      <div>
        <span>Beta Check-In</span>
        <h2>What Has ApplyFirst Helped You Do?</h2>
        <p>One answer helps us improve discovery and opening alerts.</p>
      </div>
      <div className="beta-outcome-options" role="group" aria-label="Choose your current ApplyFirst outcome">
        {options.map((option) => (
          <button
            className={outcome === option.value ? 'active' : ''}
            type="button"
            key={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={outcome === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
      {outcome ? <small>Saved. You can update this as your recruiting season changes.</small> : null}
    </section>
  );
}

function ContributeView({ contributions, opportunities, captureEndpoint = '', onSubmit }) {
  const [programDraft, setProgramDraft] = useState(() => createProgramSubmissionDraft());
  const [feedbackDraft, setFeedbackDraft] = useState(() => createFeedbackDraft(opportunities));
  const [programSubmitState, setProgramSubmitState] = useState('idle');
  const [feedbackSubmitState, setFeedbackSubmitState] = useState('idle');
  const [programTurnstileToken, setProgramTurnstileToken] = useState('');
  const [feedbackTurnstileToken, setFeedbackTurnstileToken] = useState('');
  const [programTurnstileResetKey, setProgramTurnstileResetKey] = useState(0);
  const [feedbackTurnstileResetKey, setFeedbackTurnstileResetKey] = useState(0);

  const updateProgramDraft = (field, value) => {
    setProgramDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const updateFeedbackDraft = (field, value) => {
    setFeedbackDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const submitProgram = async (event) => {
    event.preventDefault();
    if (captureEndpoint && !programTurnstileToken) {
      setProgramSubmitState('verificationRequired');
      return;
    }
    setProgramSubmitState('submitting');
    const result = await onSubmit('program', programDraft, { turnstileToken: programTurnstileToken });
    setProgramSubmitState(result);
    setProgramTurnstileResetKey((current) => current + 1);
    setProgramDraft(createProgramSubmissionDraft());
  };

  const submitFeedback = async (event) => {
    event.preventDefault();
    if (captureEndpoint && !feedbackTurnstileToken) {
      setFeedbackSubmitState('verificationRequired');
      return;
    }
    setFeedbackSubmitState('submitting');
    const result = await onSubmit('feedback', feedbackDraft, { turnstileToken: feedbackTurnstileToken });
    setFeedbackSubmitState(result);
    setFeedbackTurnstileResetKey((current) => current + 1);
    setFeedbackDraft(createFeedbackDraft(opportunities));
  };

  return (
    <section className="contribute-view" aria-label="ApplyFirst contribution center">
      <section className="contribute-hero">
        <div>
          <span>Suggest Updates</span>
          <h1 className="page-hero-title">Suggest a Program or Fix.</h1>
          <p>
            <span>Suggest missing programs, flag stale details, or request future alerts.</span>
            <span>Every submission is reviewed before library changes.</span>
          </p>
        </div>
      </section>

      <section className="contribute-grid">
        <form className="contribution-card contribution-form" onSubmit={submitProgram}>
          <div className="panel-heading">
            <span>Submit Program</span>
            <h2>Add an Opportunity to Track</h2>
          </div>
          <label>
            <span>Program Name <span className="preference-required-mark" aria-label="required field">*</span></span>
            <input
              value={programDraft.name}
              onChange={(event) => updateProgramDraft('name', event.target.value)}
              placeholder="Program, fellowship, scholarship, event..."
              required
            />
          </label>
          <label>
            <span>Official Link <span className="preference-required-mark" aria-label="required field">*</span></span>
            <input
              type="url"
              value={programDraft.url}
              onChange={(event) => updateProgramDraft('url', event.target.value)}
              placeholder="https://..."
              required
            />
          </label>
          <label>
            <span>Best Fit <span className="preference-required-mark" aria-label="required field">*</span></span>
            <select value={programDraft.track} onChange={(event) => updateProgramDraft('track', event.target.value)} required>
              <option value="">Choose Best Fit</option>
              <option>Software Engineering</option>
              <option>Product Management</option>
              <option>Design</option>
              <option>Quant / Finance</option>
              <option>Access & Prep</option>
              <option>Scholarship / Funding</option>
              <option>Not Sure Yet</option>
            </select>
          </label>
          <label>
            <span>Why Should ApplyFirst Watch It? <span className="preference-required-mark" aria-label="required field">*</span></span>
            <textarea
              value={programDraft.reason}
              onChange={(event) => updateProgramDraft('reason', event.target.value)}
              placeholder="Who is it useful for, when does it usually open, or why does it matter?"
              required
            />
          </label>
          {captureEndpoint ? (
            <TurnstileVerification
              action="contribution"
              onTokenChange={setProgramTurnstileToken}
              resetKey={programTurnstileResetKey}
            />
          ) : null}
          <button type="submit" disabled={programSubmitState === 'submitting' || (captureEndpoint && !programTurnstileToken)}>
            {programSubmitState === 'submitting' ? 'Saving...' : 'Save Submission'}
          </button>
          <SubmissionHelper state={programSubmitState} captureEndpoint={captureEndpoint} />
        </form>

        <form className="contribution-card contribution-form" onSubmit={submitFeedback}>
          <div className="panel-heading">
            <span>Report Update</span>
            <h2>Flag Stale or Confusing Info</h2>
          </div>
          <label>
            <span>Related Program</span>
            <select value={feedbackDraft.programId} onChange={(event) => updateFeedbackDraft('programId', event.target.value)}>
              <option value="">General Feedback</option>
              {opportunities.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>
                  {opportunity.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Issue Type <span className="preference-required-mark" aria-label="required field">*</span></span>
            <select value={feedbackDraft.issueType} onChange={(event) => updateFeedbackDraft('issueType', event.target.value)} required>
              <option value="">Choose Issue Type</option>
              {feedbackIssueTypes.map((issueType) => (
                <option key={issueType}>{issueType}</option>
              ))}
            </select>
          </label>
          <label>
            <span>What Should Be Fixed? <span className="preference-required-mark" aria-label="required field">*</span></span>
            <textarea
              value={feedbackDraft.note}
              onChange={(event) => updateFeedbackDraft('note', event.target.value)}
              placeholder="Share the source, correction, what felt unclear, or what you expected to happen."
              required
            />
          </label>
          {captureEndpoint ? (
            <TurnstileVerification
              action="contribution"
              onTokenChange={setFeedbackTurnstileToken}
              resetKey={feedbackTurnstileResetKey}
            />
          ) : null}
          <button type="submit" disabled={feedbackSubmitState === 'submitting' || (captureEndpoint && !feedbackTurnstileToken)}>
            {feedbackSubmitState === 'submitting' ? 'Saving...' : 'Save Feedback'}
          </button>
          <SubmissionHelper state={feedbackSubmitState} captureEndpoint={captureEndpoint} />
        </form>

      </section>
    </section>
  );
}

function createProgramSubmissionDraft() {
  return {
    name: '',
    url: '',
    track: '',
    reason: '',
  };
}

function SubmissionHelper({ state, captureEndpoint }) {
  if (state === 'submitted') {
    return <p className="form-helper">Submitted for Review.</p>;
  }

  if (state === 'localFallback') {
    return <p className="form-helper">Saved here for now. We may ask you to submit again later.</p>;
  }

  if (state === 'verificationRequired') {
    return <p className="form-helper form-error">Complete the verification before submitting.</p>;
  }

  if (!captureEndpoint) {
    return <p className="form-helper">Saved in this browser for now.</p>;
  }

  return null;
}

function createFeedbackDraft() {
  return {
    programId: '',
    issueType: '',
    note: '',
  };
}

function WaitlistPanel({
  context = 'setup',
  alertPrefs,
  alertStrategy,
  waitlistIntent,
  captureEndpoint = '',
  onSave,
  onReset,
}) {
  const [draft, setDraft] = useState(() => createWaitlistDraft(alertPrefs));
  const [submitState, setSubmitState] = useState('idle');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const isLandingContext = context === 'landing';
  const isSetupContext = !isLandingContext;

  useEffect(() => {
    if (!waitlistIntent) {
      setDraft(createWaitlistDraft(alertPrefs));
    }
  }, [alertPrefs, waitlistIntent]);

  const preferenceSummary = [
    isPreferenceUnset(alertPrefs.classYear)
      ? 'Class Year Not Selected'
      : formatDisplayLabel(alertPrefs.classYear === 'all' ? 'All class years' : alertPrefs.classYear),
    isPreferenceUnset(alertPrefs.roleTrack)
      ? 'Role Interest Not Selected'
      : alertPrefs.roleTrack === 'all'
        ? 'All Role Tracks'
        : alertPrefs.roleTrack,
    isPreferenceUnset(alertPrefs.priority) || alertPrefs.priority === 'all'
      ? 'All Recommendations'
      : priorityLabels[alertPrefs.priority] ?? alertPrefs.priority,
    isPreferenceUnset(alertPrefs.sendTiming) ? 'Timing Not Selected' : sendTimingLabels[alertPrefs.sendTiming],
  ].join(' / ');
  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };
  const saveDraft = async (event) => {
    event.preventDefault();
    const payload = {
      ...draft,
      preferenceSummary,
      notificationMode: alertStrategy.modeLabel,
    };

    if (captureEndpoint) {
      if (!turnstileToken) {
        setSubmitState('verificationRequired');
        return;
      }

      setSubmitState('submitting');
      try {
        const response = await fetch(captureEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'applyfirst-waitlist',
            ...payload,
            turnstileToken,
          }),
        });

        if (!response.ok) {
          throw new Error('Waitlist endpoint returned an error.');
        }

        onSave({
          ...payload,
          captureStatus: 'Submitted to Waitlist Endpoint',
        });
        setTurnstileResetKey((current) => current + 1);
        setSubmitState('submitted');
        return;
      } catch {
        setTurnstileResetKey((current) => current + 1);
        onSave({
          ...payload,
          captureStatus: 'Saved Locally After Endpoint Issue',
        });
        setSubmitState('localFallback');
        return;
      }
    }

    onSave({
      ...payload,
      captureStatus: 'Saved Locally',
    });
    setSubmitState('savedLocal');
  };

  return (
    <section
      className={`waitlist-panel ${isSetupContext ? 'updates-waitlist-panel' : ''}`}
      id="waitlist"
      aria-label="ApplyFirst waitlist"
    >
      <div className="waitlist-copy">
        <span>{isLandingContext ? 'Early Access' : 'Optional Contact'}</span>
        <h3>
          {waitlistIntent
            ? isLandingContext
              ? 'You Are on the List'
              : 'Your Contact Preference Is Saved'
            : isLandingContext
              ? 'Join the ApplyFirst Waitlist'
              : 'Get Beta Follow-Up'}
        </h3>
        {!isLandingContext ? (
          <p>
            This is optional. Add an email only if you want ApplyFirst to reach out when live reminders or beta testing
            are ready.
          </p>
        ) : null}
      </div>
      {waitlistIntent ? (
        <div className="waitlist-saved">
          <strong>{waitlistIntent.email || 'No Email Added'}</strong>
          <span>{waitlistIntent.savedAt ? `Saved ${waitlistIntent.savedAt.slice(0, 10)}` : 'Saved Locally'}</span>
          <em>{waitlistIntent.captureStatus ?? 'Saved Locally'}</em>
          <p>{waitlistIntent.note || 'No Notes Added.'}</p>
          <button type="button" onClick={onReset}>Reset My Focus</button>
        </div>
      ) : (
        <form className="waitlist-form" onSubmit={saveDraft}>
          <label>
            <span>{isLandingContext ? 'Email for future updates' : 'Email'}</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => updateDraft('email', event.target.value)}
              placeholder="you@example.com"
              required={isLandingContext}
            />
          </label>
          {isLandingContext ? (
            <>
              <label>
                <span>Class year</span>
                <input
                  value={draft.classYear}
                  onChange={(event) => updateDraft('classYear', event.target.value)}
                  placeholder="Freshman, sophomore, junior..."
                />
              </label>
              <label>
                <span>Primary interest</span>
                <input
                  value={draft.interest}
                  onChange={(event) => updateDraft('interest', event.target.value)}
                  placeholder="SWE, PM, quant, fellowships..."
                />
              </label>
              <label>
                <span>School</span>
                <input
                  value={draft.school}
                  onChange={(event) => updateDraft('school', event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </>
          ) : null}
          <label className="waitlist-note">
            <span>{isLandingContext ? 'Anything specific to watch?' : 'What should ApplyFirst watch for you?'}</span>
            <textarea
              value={draft.note}
              onChange={(event) => updateDraft('note', event.target.value)}
              placeholder={isLandingContext ? '' : 'Example: freshman SWE discovery programs, conference funding, PM fellowships...'}
            />
          </label>
          {captureEndpoint && (!isLandingContext || draft.email.trim()) ? (
            <TurnstileVerification action="waitlist" onTokenChange={setTurnstileToken} resetKey={turnstileResetKey} />
          ) : null}
          <button type="submit" disabled={submitState === 'submitting' || (captureEndpoint && !turnstileToken)}>
            {submitState === 'submitting' ? 'Saving...' : isLandingContext ? 'Join Waitlist' : 'Save Contact Preference'}
          </button>
          {submitState === 'localFallback' ? (
            <p className="form-helper">Saved here for now. We may ask you to submit again later.</p>
          ) : null}
          {submitState === 'verificationRequired' ? (
            <p className="form-helper form-error">Complete the verification before joining.</p>
          ) : null}
          {!captureEndpoint ? (
            <p className="form-helper">
              {isLandingContext ? 'Saved in this browser for now.' : 'Saved in this browser for now.'}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}

function createWaitlistDraft(alertPrefs) {
  return {
    email: '',
    classYear: '',
    interest: '',
    school: '',
    note: '',
  };
}

function ReadinessPanel({ readinessPercent, recordCount, verifiedCount, target }) {
  const mvpComplete = recordCount >= target;
  const readinessItems = [
    { label: 'Curated Program Library', complete: true },
    { label: 'Filters for Class Year and Role', complete: true },
    { label: 'Saved Program List', complete: true },
    { label: `${target}+ programs included`, complete: recordCount >= target },
    { label: 'Official-page checks underway', complete: verifiedCount >= target },
  ];

  return (
    <section className="readiness-panel">
      <div className="panel-heading">
        <span>Preview Coverage</span>
        <h2>{mvpComplete ? 'Useful Starting Library' : 'Library Still Growing'}</h2>
      </div>
      <div className="readiness-meter" aria-label={`Phase 1 record target is ${readinessPercent}% complete`}>
        <span style={{ width: `${readinessPercent}%` }} />
      </div>
      <p>
        {recordCount}/{target} records, {verifiedCount} confirmed.{' '}
        {mvpComplete
          ? 'Enough programs are included to explore, compare, and start saving next steps.'
          : 'The app is usable now, and more programs can be added as the library grows.'}
      </p>
      <ul>
        {readinessItems.map((item) => (
          <li className={item.complete ? 'complete' : ''} key={item.label}>
            <span aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FilterStack({
  showInternalTools,
  category,
  setCategory,
  roleTrack,
  setRoleTrack,
  priority,
  setPriority,
  verification,
  setVerification,
  timing,
  setTiming,
  status,
  setStatus,
  resetFilters,
}) {
  return (
    <section className="filter-stack">
      <div className="panel-heading">
        <span>Filters</span>
        <h2>Find Programs That Fit You</h2>
      </div>
      <FilterSelect
        label="Role track"
        value={roleTrack}
        onChange={setRoleTrack}
        options={filterOptions.roleTracks}
      />
      <FilterSelect
        label="Recommendation"
        value={priority}
        onChange={setPriority}
        options={Object.keys(libraryPriorityLabels)}
        labels={libraryPriorityLabels}
      />
      {showInternalTools ? (
        <FilterSelect
          label="Confirmation"
          value={verification}
          onChange={setVerification}
          options={filterOptions.verification}
          labels={verificationLabels}
        />
      ) : null}
      <FilterSelect label="Opportunity Type" value={category} onChange={setCategory} options={filterOptions.categories} />
      <FilterSelect label="Timing" value={timing} onChange={setTiming} options={filterOptions.timing} />
      <FilterSelect label="Status" value={status} onChange={setStatus} options={filterOptions.status} labels={statusLabels} />
      <button className="plain-button" type="button" onClick={resetFilters}>
        Reset Filters
      </button>
    </section>
  );
}

function FilterSelect({ label, value, onChange, options, labels = {}, placeholder = '', includeAll = true }) {
  const selectId = `filter-${label.toLowerCase().replaceAll(' ', '-').replaceAll('/', '').replaceAll('&', 'and')}`;

  return (
    <label className="select-control">
      <span id={`${selectId}-label`}>{label}</span>
      <select
        aria-labelledby={`${selectId}-label`}
        className={placeholder && !value ? 'needs-choice' : ''}
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {includeAll ? <option value="all">All</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {formatDisplayLabel(labels[option] ?? option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function getProgramBoardState(evidence = {}, attempts = []) {
  const applicationCount = attempts?.length || (evidence.actionState === 'submitted' ? 1 : 0);
  return {
    scope: 'active',
    label: applicationCount ? (applicationCount === 1 ? 'Applied' : `Applied ${applicationCount}x`) : '',
  };
}

function OpportunityRecord({ opportunity, selected, saved, progress, onSelect, onSave }) {
  const tracks = getOpportunityTracks(opportunity);
  const monitorSignal = getMonitorSignal(opportunity);
  const primaryTrack = tracks[0];
  const isConfirmed = getVerificationState(opportunity) === 'verified';
  const timingSignal = getRecordTimingSignal(opportunity, monitorSignal);
  const displayTitle = getOpportunityDisplayTitle(opportunity);
  const displaySubtitle = getOpportunityDisplaySubtitle(opportunity);

  return (
    <article className={`opportunity-record${selected ? ' selected' : ''}`} role="listitem">
      <button className="record-main" type="button" onClick={onSelect}>
        <div className="record-title">
          <div className="record-status-row">
            <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
            {progress?.label ? (
              <span className={`record-progress record-progress-${progress.scope}`}>{progress.label}</span>
            ) : null}
          </div>
          <h3>
            <span>{displayTitle}</span>
            {isConfirmed ? (
              <span className="record-confirmed" aria-label="Confirmed by official source" title="Confirmed by official source">
                <VerifiedIcon />
              </span>
            ) : null}
          </h3>
          <p>{displaySubtitle}</p>
        </div>
        <div className="record-summary">
          <span>{primaryTrack}</span>
          <span>{opportunity.classYears.join(', ')}</span>
          <span>{opportunity.timing}</span>
        </div>
        <p className="record-timing-signal">{timingSignal}</p>
      </button>
      <div className="record-side">
        <div className="record-icons">
          <button
            className={`bookmark-button${saved ? ' saved' : ''}`}
            type="button"
            onClick={onSave}
            aria-label={saved ? 'Remove from saved programs' : 'Save program'}
            title={saved ? 'Remove from saved programs' : 'Save program'}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>
      </div>
    </article>
  );
}

function OpportunityDetail({
  opportunity,
  saved,
  watched,
  onSave,
  onToggleWatch,
  justSaved,
  onOfficialSourceClick,
  onImproveLibrary,
  programEvidence,
  applicationAttempts,
  applicationMutationState,
  onProgramEvidenceSave,
  onMarkApplied,
  onApplicationOutcomeChange,
  onVerificationSave,
  onVerificationReset,
  sourceCheckEntries,
  onSourceCheckSave,
  showInternalTools,
}) {
  if (!opportunity) {
    return (
      <section className="detail-panel empty">
        <h2>No matches yet</h2>
        <p>Clear a filter or search another term to bring records back.</p>
      </section>
    );
  }

  const tracks = getOpportunityTracks(opportunity);
  const monitorSignal = getMonitorSignal(opportunity);
  const verificationState = getVerificationState(opportunity);
  const sourceUpdatePlan = getSourceUpdatePlan(opportunity);
  const sourceStatusTone =
    verificationState === 'verified'
      ? 'verified'
      : verificationState === 'watchOnly'
        ? 'watch'
        : 'review';
  const programHighlights = [
    { label: 'Class Year', value: opportunity.classYears?.join(', ') || 'Not Listed Yet' },
    { label: 'Format', value: getProgramFormatText(opportunity) },
    { label: 'Duration', value: getProgramLengthText(opportunity) },
    { label: 'Pay / Funding', value: opportunity.funding },
    { label: 'Focus', value: tracks.join(' + ') },
  ].filter((detail) => {
    const normalizedValue = cleanText(detail.value).toLowerCase();
    return normalizedValue && !['not listed yet', 'varies by posting'].includes(normalizedValue);
  });
  const eligibilityDetail = getEligibilityDetailText(opportunity);
  const sourceActionLabel =
    opportunity.actionLabel ||
    (['open', 'deadlineSoon'].includes(opportunity.status) || monitorSignal.actionLabel === 'Apply Now'
      ? 'Apply Now'
      : 'View Official Source');
  const displayTitle = getOpportunityDisplayTitle(opportunity);
  const displaySubtitle = getOpportunityDisplaySubtitle(opportunity);
  const displayMetadata = [...new Set([
    displaySubtitle,
    displaySubtitle !== opportunity.category ? opportunity.category : '',
  ].filter(Boolean))];
  const compactSourceNote = verificationState === 'watchOnly'
    ? 'Check the official source for the latest application window.'
    : 'Confirm the details on the official page before applying.';

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div className="detail-status-strip">
          <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
        </div>
        <h2 className="detail-title-line">
          <span>{displayTitle}</span>
          {verificationState === 'verified' ? (
            <span className="detail-verified-mark" title="Official source confirmed" aria-label="Official source confirmed">
              <VerifiedIcon />
            </span>
          ) : null}
        </h2>
        <p className="detail-header-meta">
          {displayMetadata.map((item) => <span key={item}>{item}</span>)}
        </p>
      </div>
      <div className="detail-actions">
        <a
          className="detail-primary-link"
          href={opportunity.applicationUrl || opportunity.url}
          target="_blank"
          rel="noreferrer"
          onClick={onOfficialSourceClick}
        >
          {sourceActionLabel}
        </a>
        <button
          className={`detail-bookmark${saved ? ' saved' : ''}`}
          type="button"
          onClick={onSave}
          aria-label={saved ? 'Remove from saved programs' : 'Save program'}
          title={saved ? 'Remove from saved programs' : 'Save program'}
        >
          <BookmarkIcon filled={saved} />
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          className={`detail-watch-action${watched ? ' active' : ''}`}
          type="button"
          onClick={onToggleWatch}
          aria-pressed={watched}
        >
          {watched ? 'Watching' : 'Watch'}
        </button>
      </div>
      {verificationState !== 'verified' ? (
        <div className={`detail-source-trust detail-source-trust-${sourceStatusTone}`} aria-label="Source trust">
          <strong>{verificationState === 'watchOnly' ? 'Dates Not Confirmed' : 'Details Need Confirmation'}</strong>
          <span>{compactSourceNote}</span>
        </div>
      ) : null}
      {justSaved ? (
        <section className="save-next-step" aria-label="Saved program next step">
          <div>
            <span>Saved</span>
            <strong>{watched ? 'Saved and Watching' : 'Saved to Your Library'}</strong>
            <p>{watched ? 'ApplyFirst will keep monitoring this program.' : 'Watch it separately if you want opening alerts.'}</p>
          </div>
          {!watched ? <button type="button" onClick={onToggleWatch}>Watch Program</button> : null}
        </section>
      ) : null}
      <ProgramSummaryBar details={programHighlights} />
      <section className="detail-overview-section" aria-label="Program description">
        <div className="detail-overview-copy">
          <span>About The Program</span>
          {getProgramDescriptionParts(opportunity).map((part) => (
            <p key={part}>{part}</p>
          ))}
          <DetailAboutList items={opportunity.aboutHighlights} />
        </div>
      </section>
      <section className="detail-eligibility-section" aria-label="Eligibility">
        <span>Eligibility</span>
        <p><FormattedDetailValue value={eligibilityDetail} /></p>
      </section>
      <ProgramProgressPanel
        saved={saved}
        watched={watched}
        attempts={applicationAttempts}
        mutationState={applicationMutationState}
        applicationSaving={applicationMutationState?.[opportunity.id] === 'saving'}
        onMarkApplied={onMarkApplied}
        onOutcomeChange={onApplicationOutcomeChange}
      />
      <ProgramDecisionCheckIn
        key={opportunity.id}
        evidence={programEvidence}
        hasApplied={applicationAttempts.length > 0}
        onSave={onProgramEvidenceSave}
      />
      <button className="detail-feedback-link" type="button" onClick={onImproveLibrary}>
        Suggest An Update
      </button>
      {showInternalTools ? <div className="source-note">
        <h3>Source Note</h3>
        <p>{opportunity.sourceNote}</p>
        {opportunity.detailBasis ? <p>Basis: {opportunity.detailBasis}</p> : null}
      </div> : null}
      {showInternalTools ? (
        <section className="internal-tools-stack" aria-label="Internal monitoring tools">
          <div className="internal-tools-heading">
            <span>Internal Tools</span>
            <p>Maintainer-only workflow for verification, source checks, and future alert operations.</p>
          </div>
          <SourceUpdatePlan plan={sourceUpdatePlan} />
          <SourceCheckAssistant
            opportunity={opportunity}
            onLog={onSourceCheckSave}
            onApplySuggestion={onVerificationSave}
          />
          <SourceCheckLog
            opportunity={opportunity}
            entries={sourceCheckEntries}
            onSave={onSourceCheckSave}
          />
          <VerificationEditor
            opportunity={opportunity}
            onSave={onVerificationSave}
            onReset={onVerificationReset}
          />
        </section>
      ) : null}
      {showInternalTools ? (
        <div className="tag-list" aria-label="Maintainer tags">
          {opportunity.tags.map((tag) => (
            <span key={tag}>{formatDisplayLabel(tag)}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProgramProgressPanel({
  saved,
  watched,
  attempts = [],
  mutationState = {},
  applicationSaving,
  onMarkApplied,
  onOutcomeChange,
}) {
  return (
    <section className="program-progress-panel" aria-label="Your program activity">
      <div className="program-progress-heading">
        <div>
          <span>Your Activity</span>
          <strong>Program Status</strong>
        </div>
        <button
          type="button"
          onClick={() => onMarkApplied({ allowDuplicate: attempts.length > 0 })}
          disabled={applicationSaving}
        >
          {applicationSaving ? 'Saving...' : attempts.length ? 'Add Another Application' : 'Mark Applied'}
        </button>
      </div>
      <div className="program-state-summary" aria-label="Saved and watch status">
        <span className={saved ? 'active' : ''}>{saved ? 'Saved' : 'Not Saved'}</span>
        <span className={watched ? 'active' : ''}>{watched ? 'Watching' : 'Not Watching'}</span>
        <span className={attempts.length ? 'active' : ''}>
          {attempts.length ? `${attempts.length} ${attempts.length === 1 ? 'Application' : 'Applications'}` : 'No Application Yet'}
        </span>
      </div>
      {attempts.length ? (
        <div className="application-history" aria-label="Application history">
          <div className="application-history-heading">
            <strong>Application History</strong>
            <span>Private to your beta workspace</span>
          </div>
          {attempts.map((attempt) => (
            <article className="application-attempt" key={attempt.id}>
              <div>
                <strong>Applied {formatDateTime(attempt.appliedAt)}</strong>
                {attempt.cycleLabel ? <span>{attempt.cycleLabel}</span> : null}
              </div>
              <label>
                <span className="sr-only">Application outcome</span>
                <select
                  value={attempt.outcome || 'pending'}
                  onChange={(event) => onOutcomeChange(attempt.id, event.target.value)}
                  disabled={mutationState[attempt.id] === 'saving'}
                >
                  {applicationOutcomeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProgramDecisionCheckIn({ evidence, hasApplied, onSave }) {
  const hasExplicitResponse = evidence?.relevanceSource === 'explicit';
  const [showInferredEditor, setShowInferredEditor] = useState(false);
  const [editing, setEditing] = useState(!hasExplicitResponse);
  const [draft, setDraft] = useState(() => ({
    relevance: hasExplicitResponse ? evidence?.relevance ?? '' : '',
    priorAwareness: hasExplicitResponse ? evidence?.priorAwareness ?? '' : '',
    eligibilityUnclearReason: hasExplicitResponse ? evidence?.eligibilityUnclearReason ?? '' : '',
  }));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty || editing) return;
    setDraft({
      relevance: hasExplicitResponse ? evidence?.relevance ?? '' : '',
      priorAwareness: hasExplicitResponse ? evidence?.priorAwareness ?? '' : '',
      eligibilityUnclearReason: hasExplicitResponse ? evidence?.eligibilityUnclearReason ?? '' : '',
    });
  }, [dirty, editing, evidence?.updatedAt, hasExplicitResponse]);

  if (hasApplied && !hasExplicitResponse && !showInferredEditor) {
    return (
      <section className="program-decision-check-in program-decision-summary" aria-label="Inferred program relevance">
        <div>
          <small>Relevance</small>
          <strong>Inferred from application</strong>
        </div>
        <button type="button" onClick={() => setShowInferredEditor(true)}>Add Your Answer</button>
      </section>
    );
  }

  const selectedOption = programRelevanceOptions.find((option) => option.value === draft.relevance);
  const showAwareness = ['this_cycle', 'future_cycle'].includes(draft.relevance);
  const showEligibilityReason = draft.relevance === 'eligibility_unclear';
  const updateEvidence = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
  };
  const selectRelevance = (value) => {
    setDraft((current) => ({
      ...current,
      relevance: value,
      priorAwareness: ['this_cycle', 'future_cycle'].includes(value) ? current.priorAwareness : '',
      eligibilityUnclearReason: value === 'eligibility_unclear' ? current.eligibilityUnclearReason : '',
    }));
    setDirty(true);
  };
  const saveDecision = async () => {
    const saved = await onSave?.(draft);
    if (saved !== false) {
      setDirty(false);
      setEditing(false);
    }
  };

  if (hasExplicitResponse && !editing) {
    return (
      <section className="program-decision-check-in program-decision-summary" aria-label="Program relevance">
        <div>
          <small>Your Relevance Check</small>
          <strong>{selectedOption?.label || 'Response Saved'}</strong>
        </div>
        <button type="button" onClick={() => setEditing(true)}>Edit</button>
      </section>
    );
  }

  return (
    <section className="program-decision-check-in" aria-label="Program relevance">
      <header className="program-decision-heading">
        <div>
          <small>Optional Check-In</small>
          <strong>Is this opportunity relevant to you?</strong>
          <p>Help ApplyFirst understand which programs are useful to students like you.</p>
        </div>
        {hasExplicitResponse ? <button type="button" onClick={() => setEditing(false)}>Cancel</button> : null}
      </header>
      <div className="program-decision-body">
        <fieldset className="program-decision-primary-question">
          <legend className="sr-only">Is this opportunity relevant to you?</legend>
          <div className="program-decision-options">
            {programRelevanceOptions.map((option) => (
              <button
                className={draft.relevance === option.value ? 'active' : ''}
                type="button"
                key={option.value}
                onClick={() => selectRelevance(option.value)}
                aria-pressed={draft.relevance === option.value}
                disabled={evidence?.saveState === 'saving'}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        {draft.relevance && (showAwareness || showEligibilityReason) ? (
          <div className="program-decision-followup">
            {showAwareness ? (
              <fieldset>
                <legend>Did you know about this opportunity before ApplyFirst?</legend>
                <div className="program-decision-options compact">
                  {[
                    ['no', 'No, this is new to me'],
                    ['yes', 'Yes'],
                    ['unsure', 'Not sure'],
                  ].map(([value, label]) => (
                    <button
                      className={draft.priorAwareness === value ? 'active' : ''}
                      type="button"
                      key={value}
                      onClick={() => updateEvidence('priorAwareness', value)}
                      aria-pressed={draft.priorAwareness === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {showEligibilityReason ? (
              <label>
                <span>What is unclear?</span>
                <select
                  value={draft.eligibilityUnclearReason}
                  onChange={(event) => updateEvidence('eligibilityUnclearReason', event.target.value)}
                >
                  <option value="">Choose One</option>
                  {eligibilityUnclearOptions.map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
        {draft.relevance ? (
          <div className="program-decision-save">
            <button type="button" onClick={saveDecision} disabled={!dirty || evidence?.saveState === 'saving'}>
              {evidence?.saveState === 'saving' ? 'Saving...' : 'Save Response'}
            </button>
            <span>No application details or private notes are collected here.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProgramSummaryBar({ details }) {
  return (
    <dl className="detail-summary-bar" aria-label="Program highlights">
      {details.map((detail) => (
        <div className={`detail-summary-item${detail.label === 'Focus' ? ' detail-summary-focus' : ''}`} key={detail.label}>
          <dt>{detail.label}</dt>
          <dd><FormattedDetailValue value={detail.value} /></dd>
        </div>
      ))}
    </dl>
  );
}

function FormattedDetailValue({ value }) {
  const lines = String(value ?? '').split('\n').map((line) => formatDisplayLabel(cleanText(line))).filter(Boolean);

  if (lines.length <= 1) {
    return lines[0] ?? '';
  }

  return (
    <span className="detail-value-lines">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}

function DetailAboutList({ items }) {
  const cleanItems = Array.isArray(items)
    ? items.map((item) => cleanText(item)).filter(Boolean)
    : [];

  if (!cleanItems.length) {
    return null;
  }

  return (
    <ul className="detail-about-list">
      {cleanItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function getProgramDescriptionParts(opportunity) {
  const primaryDescription =
    cleanText(opportunity.description || opportunity.why) ||
    `${opportunity.name} is tracked because it may be useful for early-career students.`;
  const experienceDescription = cleanText(opportunity.experienceSummary);

  return uniqueList([primaryDescription, experienceDescription]);
}

function getEligibilityDetailText(opportunity) {
  const classYearText = opportunity.classYears?.join(', ');
  const eligibilityText = cleanText(opportunity.eligibilitySummary);
  const normalizedClassYearText = cleanText(classYearText).toLowerCase();
  const normalizedEligibilityText = eligibilityText.toLowerCase();

  if (
    eligibilityText &&
    classYearText &&
    !normalizedEligibilityText.includes(normalizedClassYearText) &&
    !normalizedEligibilityText.includes('first- or second-year') &&
    !normalizedEligibilityText.includes('first-year') &&
    !normalizedEligibilityText.includes('sophomore')
  ) {
    return `${classYearText}. ${eligibilityText}`;
  }

  return eligibilityText || classYearText || 'Not Listed Yet';
}

function getProgramFormatText(opportunity) {
  return cleanText(opportunity.location);
}

function getProgramLengthText(opportunity) {
  const searchableText = [
    opportunity.sourceNote,
    opportunity.description,
    opportunity.eligibilitySummary,
    opportunity.experienceSummary,
    opportunity.why,
    opportunity.prep,
    opportunity.openDate,
    opportunity.deadline,
    opportunity.location,
    opportunity.category,
  ]
    .filter(Boolean)
    .join(' ');
  const exactDuration = searchableText.match(/\b(\d+)\s*[- ]?\s*(week|weeks|day|days|month|months)\b/i);

  if (exactDuration) {
    const amount = exactDuration[1];
    const unit = exactDuration[2].toLowerCase();
    const normalizedUnit = unit.startsWith('week')
      ? amount === '1'
        ? 'Week'
        : 'Weeks'
      : unit.startsWith('day')
        ? amount === '1'
          ? 'Day'
          : 'Days'
        : amount === '1'
          ? 'Month'
          : 'Months';

    return `${amount} ${normalizedUnit}`;
  }

  return '';
}

function getRecordTimingSignal(opportunity, monitorSignal) {
  const openDate = formatRecordTimingText(opportunity.openDate);
  const deadline = formatRecordTimingText(opportunity.deadline);

  if (monitorSignal.alertReadiness === 'deadlineSoon') {
    return `Deadline - ${deadline || openDate}`;
  }

  if (monitorSignal.alertReadiness === 'openNow') {
    return `Open - ${openDate}`;
  }

  if (monitorSignal.alertReadiness === 'opensSoon') {
    return `Watch - ${openDate}`;
  }

  if (monitorSignal.alertReadiness === 'verify') {
    return 'Verify current-cycle timing';
  }

  if (monitorSignal.alertReadiness === 'watching') {
    return `Watch - ${openDate || opportunity.timing}`;
  }

  return `Prepare for ${opportunity.timing}`;
}

function formatRecordTimingText(value) {
  let text = cleanText(value);

  if (!text) {
    return '';
  }

  const firstClause = text.split(';')[0]?.trim();
  if (firstClause) {
    text = firstClause;
  }

  if (text.length > 72 && text.includes(' in ')) {
    text = text.split(' in ')[0].trim();
  }

  if (text.length > 72 && text.includes(' by ')) {
    text = text.split(' by ')[0].trim();
  }

  if (text.length > 82) {
    text = `${text.slice(0, 79).trim()}...`;
  }

  return text;
}

function getOpportunityListingProfile(opportunity, tracks, monitorSignal, readiness) {
  return {
    summary: getOpportunityListingSummary(opportunity, tracks, monitorSignal),
    fitSummary: getOpportunityFitSummary(opportunity, tracks),
    description: getOpportunityDescription(opportunity, monitorSignal, readiness),
    eligibilityNote: getEligibilityNote(opportunity, readiness),
    experienceItems: getProgramExperienceItems(opportunity, tracks),
    requirementItems: getApplicationRequirementItems(opportunity, tracks),
    prepNote: getStudentPrepNote(opportunity),
    watchCadence: getWatchCadenceText(opportunity),
    sourceWatchSignal: getSourceWatchSignal(opportunity, monitorSignal, readiness),
  };
}

function getOpportunityListingSummary(opportunity, tracks, monitorSignal) {
  const category = formatDisplayLabel(opportunity.category);
  const trackText = formatTrackList(tracks).toLowerCase();
  const audience = getSummaryAudienceText(opportunity.classYears);
  const timing =
    monitorSignal.alertReadiness === 'openNow'
      ? 'open or showing an application signal now'
      : monitorSignal.alertReadiness === 'deadlineSoon'
        ? 'close enough to review now'
        : monitorSignal.alertReadiness === 'opensSoon'
          ? 'worth preparing for before the window opens'
          : monitorSignal.alertReadiness === 'verify'
            ? 'worth tracking, but needs current-cycle confirmation'
            : 'worth keeping on your radar';

  return `${category} for ${audience} interested in ${trackText}; ${timing}.`;
}

function getOpportunityFitSummary(opportunity, tracks) {
  return `${getCompactAudienceText(opportunity.classYears)} / ${formatTrackList(tracks)}`;
}

function getOpportunityDescription(opportunity, monitorSignal, readiness) {
  const category = formatDisplayLabel(opportunity.category).toLowerCase();
  const article = /^[aeiou]/i.test(category) ? 'an' : 'a';
  const audience = formatAudienceText(opportunity.classYears);
  const openingContext =
    monitorSignal.alertReadiness === 'openNow'
      ? 'The timing is the important part: confirm the official page is live before relying on alerts or applying.'
      : monitorSignal.alertReadiness === 'deadlineSoon'
        ? 'The timing is the important part: confirm the deadline and decide quickly whether it fits your plan.'
        : readiness.alertable
          ? 'ApplyFirst has enough source context to monitor this for reviewed beta alerts.'
          : 'ApplyFirst is tracking this because the opportunity is useful, but some current-cycle details still need source confirmation.';

  return [
    `${opportunity.name} is ${article} ${category} from ${opportunity.organization} for ${audience}.`,
    openingContext,
  ];
}

function getCompactAudienceText(classYears) {
  if (classYears.includes('All class years')) {
    return 'All Class Years';
  }

  return classYears.join(' + ');
}

function getSummaryAudienceText(classYears) {
  if (classYears.includes('All class years')) {
    return 'students across class years';
  }

  if (classYears.length === 1) {
    return `${classYears[0].toLowerCase()} students`;
  }

  return `${classYears.slice(0, -1).map((year) => `${year.toLowerCase()} students`).join(', ')} and ${classYears.at(-1).toLowerCase()} students`;
}

function formatAudienceText(classYears) {
  if (classYears.includes('All class years')) {
    return 'students across class years';
  }

  if (classYears.length === 1) {
    return `${classYears[0].toLowerCase()} students`;
  }

  return `${classYears.slice(0, -1).map((year) => year.toLowerCase()).join(', ')} and ${classYears.at(-1).toLowerCase()} students`;
}

function formatTrackList(tracks) {
  if (tracks.length <= 1) {
    return tracks[0] ?? 'Access & Prep';
  }

  return `${tracks.slice(0, -1).join(', ')} + ${tracks.at(-1)}`;
}

function getEligibilityNote(opportunity, readiness) {
  if (readiness.missing.includes('Official verification')) {
    return 'Confirm current-cycle eligibility on the official page before applying.';
  }

  if (opportunity.classYears.includes('All class years')) {
    return 'Eligibility may vary by posting, cohort, major, or location.';
  }

  return 'Confirm major, enrollment, work authorization, and any cohort-specific requirements on the official page.';
}

function getProgramExperienceItems(opportunity, tracks) {
  const categoryItems = getCategoryExperienceItems(opportunity.category);
  const trackItem = getTrackExperienceItem(tracks[0]);

  return uniqueList([...categoryItems, trackItem]).slice(0, 3);
}

function getCategoryExperienceItems(category) {
  switch (category) {
    case 'Discovery Program':
      return ['Explore a company, industry, or role before larger recruiting cycles.', 'Use the experience to decide whether the field is worth pursuing.'];
    case 'Winternship':
      return ['Use winter break for a structured short program.', 'Get early exposure without committing a full summer.'];
    case 'Fellowship':
      return ['Complete mentored project, research, open-source, or community work.', 'Build experience that can substitute for a traditional internship signal.'];
    case 'Startup / VC Fellowship':
      return ['Apply into a startup, founder, investor, or portfolio-company network.', 'Use the experience to test whether venture-backed company environments fit you.'];
    case 'Full-Time Alternative':
      return ['Build career proof through apprenticeship, fellowship, or alternative full-time pipeline work.', 'Use the program to move from skill-building into employment-ready experience.'];
    case 'Scholarship / Funding':
      return ['Receive funding support from a company or major nonprofit sponsor.', 'Use the award, mentor access, or sponsor community as an early-career signal.'];
    case 'Conference / Travel Funding':
      return ['Access events, talks, recruiters, research communities, or travel funding.', 'Use the experience to meet people and discover paths that are hard to find from school alone.'];
    case 'Community / Prep Program':
      return ['Join structured prep, mentorship, community, course, or resource support.', 'Use the program to build readiness and find hidden deadlines earlier.'];
    default:
      return ['Explore a career path and build a clearer story for future applications.', 'Use the program as an early signal before larger recruiting cycles.'];
  }
}

function getTrackExperienceItem(track) {
  switch (track) {
    case 'Software Engineering':
      return 'Most relevant for students building projects, GitHub proof, technical confidence, or software interview stories.';
    case 'Product Management':
      return 'Most relevant for students exploring users, product judgment, prioritization, and cross-functional work.';
    case 'Design':
      return 'Most relevant for students building UX research, interface design, portfolio, or product-validation proof.';
    case 'Quant / Finance':
      return 'Most relevant for students testing interest in markets, math-heavy problem solving, finance, or trading technology.';
    default:
      return 'Most relevant for students who need access, funding, mentorship, community, or structured preparation.';
  }
}

function getApplicationRequirementItems(opportunity, tracks) {
  const items = ['Current resume or student profile.', 'Official-page eligibility check before applying.'];

  if (tracks.includes('Software Engineering')) {
    items.push('Project, GitHub, portfolio, or technical work sample if requested.');
  }

  if (tracks.includes('Product Management')) {
    items.push('Short product, user-problem, or leadership story if requested.');
  }

  if (tracks.includes('Design')) {
    items.push('Portfolio, case study, UX research, or visual/product design sample if requested.');
  }

  if (tracks.includes('Quant / Finance')) {
    items.push('Math, finance, markets, or problem-solving interest statement if requested.');
  }

  if (tracks.includes('Access & Prep')) {
    items.push('Short goals statement, transcript, recommendation, or proof of enrollment when required.');
  }

  if (opportunity.confidence === 'needsReview' || opportunity.status === 'verifyManually') {
    items.push('Current-cycle application page confirmation.');
  }

  return uniqueList(items).slice(0, 4);
}

function getStudentPrepNote(opportunity) {
  return cleanText(opportunity.prep)
    .replace(/before sharing/gi, 'before applying')
    .replace(/before sending public alerts/gi, 'before relying on alerts');
}

function getWatchCadenceText(opportunity) {
  if (opportunity.timing === 'Rolling') {
    return 'Rolling or multi-cycle; monitor regularly through the year.';
  }

  return `Seasonal ${opportunity.timing.toLowerCase()} cycle; monitor in the months before the expected opening.`;
}

function getSourceWatchSignal(opportunity, monitorSignal, readiness) {
  if (monitorSignal.alertReadiness === 'openNow') {
    return 'ApplyFirst watches for application links, open-status language, and deadline changes before sending alerts.';
  }

  if (monitorSignal.alertReadiness === 'deadlineSoon') {
    return 'ApplyFirst watches for deadline movement, closing notices, and updated cycle pages.';
  }

  if (monitorSignal.alertReadiness === 'verify' || !readiness.alertable) {
    return 'ApplyFirst is still checking whether the official source has a current-cycle page, deadline, or application link.';
  }

  return 'ApplyFirst watches the official source for opening windows, deadline updates, and application page changes.';
}

function uniqueList(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function uniqueOpportunitiesById(items) {
  const seenIds = new Set();

  return items.filter((item) => {
    if (!item || seenIds.has(item.id)) {
      return false;
    }

    seenIds.add(item.id);
    return true;
  });
}

function getStudentSourceStatus(opportunity, verificationState, readiness) {
  const lastChecked = opportunity.lastChecked ? `Last checked ${opportunity.lastChecked}.` : 'No recent source check is saved yet.';

  if (verificationState === 'verified' && readiness.alertable) {
    return {
      tone: 'confirmed',
      label: 'Source Confirmed',
      summary: 'Alert Ready',
      description: `${lastChecked} ApplyFirst has enough official timing context to watch this program for reviewed opening alerts.`,
    };
  }

  if (verificationState === 'verified') {
    return {
      tone: 'confirmed',
      label: 'Source Confirmed',
      summary: 'Good To Compare',
      description: `${lastChecked} Use this record to compare fit and timing, then open the official page before applying.`,
    };
  }

  if (verificationState === 'watchOnly') {
    return {
      tone: 'watch',
      label: 'Prep Source',
      summary: 'Useful For Planning',
      description: `${lastChecked} Save it if it fits, but treat opening dates as planning guidance until the next official check.`,
    };
  }

  return {
    tone: 'review',
    label: 'Needs Source Check',
    summary: 'Verify Before Relying',
    description: 'ApplyFirst should confirm the current-cycle official page, opening window, or deadline before students depend on this timing.',
  };
}

function SourceUpdatePlan({ plan }) {
  return (
    <section className="source-update-plan">
      <div className="source-update-heading">
        <h3>Source Update Plan</h3>
        <span>{plan.checkCadence}</span>
      </div>
      <dl>
        <div>
          <dt>Watched Page</dt>
          <dd>{plan.watchedPage}</dd>
        </div>
        <div>
          <dt>Next Check</dt>
          <dd>{plan.nextCheck}</dd>
        </div>
        <div>
          <dt>Alert Trigger</dt>
          <dd>{plan.alertTrigger}</dd>
        </div>
      </dl>
      <ul>
        {plan.changeSignals.map((signal) => (
          <li key={signal}>{signal}</li>
        ))}
      </ul>
    </section>
  );
}

function SourceCheckAssistant({ opportunity, onLog, onApplySuggestion }) {
  const [sourceText, setSourceText] = useState('');
  const [analysis, setAnalysis] = useState(() => createSourceAnalysis(opportunity, ''));
  const reviewDecision = getSourceReviewDecision(analysis);

  useEffect(() => {
    setSourceText('');
    setAnalysis(createSourceAnalysis(opportunity, ''));
  }, [opportunity]);

  const analyzeText = () => {
    setAnalysis(createSourceAnalysis(opportunity, sourceText));
  };

  const logSuggestion = () => {
    onLog(opportunity.id, {
      checkedDate: new Date().toISOString().slice(0, 10),
      result: analysis.result,
      note: analysis.note,
      suggestedStatus: analysis.suggestedStatus,
      suggestedConfidence: analysis.suggestedConfidence,
      reviewDecision: reviewDecision.label,
      sourceExcerpt: sourceText.trim().slice(0, 500),
    });
  };

  const applySuggestion = () => {
    onApplySuggestion(opportunity.id, {
      url: opportunity.url ?? '',
      previousUrl: opportunity.previousUrl ?? '',
      openDate: analysis.openWindow || opportunity.openDate,
      deadline: analysis.deadline || opportunity.deadline,
      lastChecked: new Date().toISOString().slice(0, 10),
      confidence: analysis.suggestedConfidence,
      status: analysis.suggestedStatus,
      sourceNote: analysis.note,
    });
  };

  return (
    <section className="source-check-assistant" aria-label="Source monitoring assistant">
      <div className="source-check-heading">
        <div>
          <h3>Monitoring Assistant</h3>
          <p>Paste text from the official page. The assistant suggests what changed before you confirm the record.</p>
        </div>
        <span>{analysis.confidenceLabel}</span>
      </div>
      <label className="source-assistant-field">
        <span>Official Page Text</span>
        <textarea
          value={sourceText}
          onChange={(event) => setSourceText(event.target.value)}
          placeholder="Paste application status, dates, eligibility, or page text here..."
        />
      </label>
      <div className="assistant-result-grid" aria-label="Suggested source interpretation">
        <span>
          <strong>{analysis.result}</strong>
          Suggested result
        </span>
        <span>
          <strong>{statusLabels[analysis.suggestedStatus]}</strong>
          Suggested status
        </span>
        <span>
          <strong>{confidenceLabels[analysis.suggestedConfidence]}</strong>
          Suggested confidence
        </span>
      </div>
      <p className="assistant-note">{analysis.note}</p>
      <section className={`assistant-review-decision assistant-review-${reviewDecision.tone}`} aria-label="Maintainer review decision">
        <div>
          <span>Review Decision</span>
          <strong>{reviewDecision.label}</strong>
        </div>
        <p>{reviewDecision.description}</p>
        <em>{reviewDecision.nextStep}</em>
      </section>
      <div className="assistant-actions">
        <button type="button" onClick={analyzeText}>
          Analyze Text
        </button>
        <button type="button" onClick={logSuggestion}>
          Log Suggestion
        </button>
        <button type="button" onClick={applySuggestion}>
          Apply Local Fields
        </button>
      </div>
    </section>
  );
}

function getAlertStrategy(alertPrefs, matches, alertableCount) {
  const modeLabel = notificationModeLabels[alertPrefs.notificationMode] ?? notificationModeLabels.waitlist;
  const timingLabel = sendTimingLabels[alertPrefs.sendTiming] ?? 'Timing Not Selected';
  const heldCount = Math.max(matches.length - alertableCount, 0);
  const channelCopy =
    alertPrefs.notificationMode === 'local'
      ? 'This stays in your browser for now.'
    : alertPrefs.notificationMode === 'saved'
        ? 'Saved-program reminders can come later after accounts or email consent exist.'
    : 'Beta email alerts can send for high-confidence openings while uncertain signals stay in review.';
  const timingCopy =
    alertPrefs.sendTiming === 'openOnly'
      ? 'program openings'
      : alertPrefs.sendTiming === 'prepOpenDeadline'
        ? 'prep windows, openings, and confirmed deadlines'
        : alertPrefs.sendTiming === 'openAndDeadline'
          ? 'program openings and confirmed deadlines'
          : 'the timing you choose';

  return {
    modeLabel,
    timingLabel,
    sendSummary: `${alertableCount} ${alertableCount === 1 ? 'program is' : 'programs are'} confirmed enough for ${timingCopy}`,
    holdSummary: `${heldCount} ${heldCount === 1 ? 'program still needs' : 'programs still need'} an official check`,
    trustCopy: `${channelCopy} ${
      alertPrefs.sendTiming
        ? `Your timing choice is ${timingLabel.toLowerCase()}, and unconfirmed programs stay out of alerts.`
        : 'Choose a timing preference before treating this as your alert setup.'
    }`,
  };
}

function SourceCheckLog({ opportunity, entries, onSave }) {
  const [draft, setDraft] = useState(() => createSourceCheckDraft());

  useEffect(() => {
    setDraft(createSourceCheckDraft());
  }, [opportunity.id]);

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const saveEntry = (event) => {
    event.preventDefault();
    onSave(opportunity.id, draft);
    setDraft(createSourceCheckDraft());
  };

  return (
    <section className="source-check-log">
      <div className="source-check-heading">
        <div>
          <h3>Source Check Log</h3>
          <p>Record manual checks before deciding whether to update the source fields.</p>
        </div>
        <span>{entries.length} saved</span>
      </div>
      <form className="source-check-form" onSubmit={saveEntry}>
        <label>
          <span>Checked Date</span>
          <input type="date" value={draft.checkedDate} onChange={(event) => updateDraft('checkedDate', event.target.value)} />
        </label>
        <label>
          <span>Result</span>
          <select value={draft.result} onChange={(event) => updateDraft('result', event.target.value)}>
            <option value="No Material Change">No Material Change</option>
            <option value="Application Opened">Application Opened</option>
            <option value="Dates Updated">Dates Updated</option>
            <option value="Eligibility Changed">Eligibility Changed</option>
            <option value="Needs Follow-Up">Needs Follow-Up</option>
          </select>
        </label>
        <label className="source-check-note">
          <span>Check Note</span>
          <textarea value={draft.note} onChange={(event) => updateDraft('note', event.target.value)} />
        </label>
        <button type="submit">Add Source Check</button>
      </form>
      {entries.length ? (
        <div className="source-check-entries" role="list">
          {entries.map((entry) => (
            <article key={entry.id} role="listitem">
              <span>{entry.checkedDate}</span>
              <strong>{entry.result}</strong>
              {entry.reviewDecision ? <em>{entry.reviewDecision}</em> : null}
              <p>{entry.note || 'No Note Added.'}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="source-check-empty">No Source Checks Logged Yet.</p>
      )}
    </section>
  );
}

function createSourceCheckDraft() {
  return {
    checkedDate: new Date().toISOString().slice(0, 10),
    result: 'No Material Change',
    note: '',
  };
}

function VerificationEditor({ opportunity, onSave, onReset }) {
  const [draft, setDraft] = useState(() => createVerificationDraft(opportunity));

  useEffect(() => {
    setDraft(createVerificationDraft(opportunity));
  }, [opportunity]);

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const saveDraft = (event) => {
    event.preventDefault();
    onSave(opportunity.id, draft);
  };

  return (
    <form className="verification-editor" onSubmit={saveDraft}>
      <div className="verification-editor-heading">
        <div>
          <h3>Verification Edit</h3>
          <p>
            Save local source updates after checking the official page. This changes your prototype view only.
          </p>
        </div>
        {opportunity.hasLocalVerificationEdit ? <span>Local Edit Saved</span> : <span>Base Record</span>}
      </div>
      <div className="verification-form-grid">
        <label>
          <span>Official URL</span>
          <input value={draft.url} onChange={(event) => updateDraft('url', event.target.value)} />
        </label>
        <label>
          <span>Previous URL</span>
          <input value={draft.previousUrl} onChange={(event) => updateDraft('previousUrl', event.target.value)} />
        </label>
        <label>
          <span>Open Window</span>
          <input value={draft.openDate} onChange={(event) => updateDraft('openDate', event.target.value)} />
        </label>
        <label>
          <span>Deadline</span>
          <input value={draft.deadline} onChange={(event) => updateDraft('deadline', event.target.value)} />
        </label>
        <label>
          <span>Last Checked</span>
          <input type="date" value={draft.lastChecked} onChange={(event) => updateDraft('lastChecked', event.target.value)} />
        </label>
        <label>
          <span>Confidence</span>
          <select value={draft.confidence} onChange={(event) => updateDraft('confidence', event.target.value)}>
            {Object.keys(confidenceLabels).map((confidence) => (
              <option key={confidence} value={confidence}>
                {confidenceLabels[confidence]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>
            {Object.keys(statusLabels).map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {statusLabels[statusOption]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="verification-note-field">
        <span>Source Note</span>
        <textarea value={draft.sourceNote} onChange={(event) => updateDraft('sourceNote', event.target.value)} />
      </label>
      <div className="verification-editor-actions">
        <button type="submit">Save Local Verification</button>
        {opportunity.hasLocalVerificationEdit ? (
          <button type="button" onClick={() => onReset(opportunity.id)}>
            Reset local edit
          </button>
        ) : null}
      </div>
    </form>
  );
}

function createVerificationDraft(opportunity) {
  return {
    url: opportunity.url ?? '',
    previousUrl: opportunity.previousUrl ?? '',
    openDate: opportunity.openDate ?? '',
    deadline: opportunity.deadline ?? '',
    lastChecked: opportunity.lastChecked ?? '',
    confidence: opportunity.confidence ?? 'needsReview',
    status: opportunity.status ?? 'verifyManually',
    sourceNote: opportunity.sourceNote ?? '',
  };
}

function BookmarkIcon({ filled }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
      <path d="M4 2.5C4 1.7 4.7 1 5.5 1h5c.8 0 1.5.7 1.5 1.5V15l-4-2.4L4 15V2.5Z" />
      {!filled ? <path className="bookmark-cutout" d="M5.5 2.4h5c.1 0 .2.1.2.2v10L8 11 5.3 12.6v-10c0-.1.1-.2.2-.2Z" /> : null}
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
      <path d="M8 1.3 9.6 2.6l2.1-.2.6 2 1.8 1.1-.8 1.9.8 1.9-1.8 1.1-.6 2-2.1-.2L8 13.5l-1.6-1.3-2.1.2-.6-2-1.8-1.1.8-1.9-.8-1.9 1.8-1.1.6-2 2.1.2L8 1.3Z" />
      <path className="verified-icon-check" d="M7.1 9.7 4.9 7.5l.9-.9 1.3 1.3 3.1-3.3.9.8-4 4.3Z" />
    </svg>
  );
}

function StatusItem({ label, value, tone = 'neutral' }) {
  const accessibleText = label ? `${label}: ${value}` : value;
  return (
    <span className={`status-item status-item-${tone}`} aria-label={accessibleText} title={accessibleText}>
      <strong>{value}</strong>
    </span>
  );
}

function formatDisplayLabel(value) {
  const labelMap = {
    'Software engineering': 'Software Engineering',
    'Product engineering': 'Product Engineering',
    'Open source': 'Open Source',
    'Big tech': 'Big Tech',
    'Insight program': 'Insight Program',
    'Women in tech': 'Women in Tech',
    'Diversity in tech': 'Diversity in Tech',
    'Production engineering': 'Production Engineering',
    'Civic tech': 'Civic Tech',
    'Public interest tech': 'Public Interest Tech',
    'Virtual experience': 'Virtual Experience',
    'Career exploration': 'Career Exploration',
    'AI projects': 'AI Projects',
    'Nontraditional backgrounds': 'Nontraditional Backgrounds',
    'Early-career': 'Early-Career',
    'Project building': 'Project Building',
    'Professional development': 'Professional Development',
    'Interview prep': 'Interview Prep',
    'Technical training': 'Technical Training',
    'Python basics': 'Python Basics',
    'Portfolio project': 'Portfolio Project',
    'Career prep': 'Career Prep',
    'Internship matching': 'Internship Matching',
    'Underrepresented students': 'Underrepresented Students',
    'Computer science': 'Computer Science',
    'Career exposure': 'Career Exposure',
    'Research conference': 'Research Conference',
    'CS research': 'CS Research',
    'Women in computing': 'Women in Computing',
    'Career events': 'Career Events',
    'Black CS students': 'Black CS Students',
    'Latinx CS students': 'Latinx CS Students',
    'Career fairs': 'Career Fairs',
    'Graduate school prep': 'Graduate School Prep',
    'Women in STEM': 'Women in STEM',
    'Discovery Program': 'Discovery Program',
    'Conference / Travel Funding': 'Conference / Travel Funding',
    'Startup / VC Fellowship': 'Startup / VC Fellowship',
    'Full-Time Alternative': 'Full-Time Alternative',
    'Scholarship / Funding': 'Scholarship / Funding',
    'Community / Prep Program': 'Community / Prep Program',
    'All class years': 'All Class Years',
    'Paid program': 'Paid Program',
    'Paid placement': 'Paid Placement',
    'Paid fellowship': 'Paid Fellowship',
    'Travel support': 'Travel Support',
    'Host-site dependent': 'Host-Site Dependent',
    'Scholarship': 'Scholarship',
    'Stipend': 'Stipend',
    'Free': 'Free',
    'Varies': 'Varies',
    high: 'High',
    medium: 'Medium',
    needs_review: 'Needs Review',
    pending_review: 'Pending Review',
    accepted: 'Accepted',
    rejected: 'Rejected',
    source_change: 'Source Change',
    deadline: 'Deadline',
  };

  return labelMap[value] ?? value;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getDisplayHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || '-';
  } catch {
    return '-';
  }
}

function Shortlist({ items, onSelect }) {
  return (
    <section className="shortlist">
      <div className="panel-heading">
        <span>Saved</span>
        <h2>{items.length ? `${items.length} Saved` : 'Saved Programs'}</h2>
      </div>
      {items.length ? (
        items.map((item) => {
          const signal = getMonitorSignal(item);

          return (
            <button key={item.id} type="button" onClick={() => onSelect(item.id)}>
              <span>{item.name}</span>
              <em>{signal.actionLabel}</em>
              <small>{item.openDate}</small>
            </button>
          );
        })
      ) : (
        <p>Bookmark programs to compare next steps and opening windows.</p>
      )}
    </section>
  );
}

function EmptyState({ onReset }) {
  return (
    <div className="empty-state">
      <h3>No Opportunities Match Those Filters.</h3>
      <p>Try a broader class year, opportunity type, or status.</p>
      <button type="button" onClick={onReset}>
        Clear Filters
      </button>
    </div>
  );
}

const rootElement = document.getElementById('root');
const appRoot = rootElement._applyFirstRoot ?? createRoot(rootElement);

rootElement._applyFirstRoot = appRoot;
appRoot.render(<App />);
