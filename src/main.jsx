import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import programsScreenshot from '../docs/assets/screenshots/applyfirst-programs-desktop.png';
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
const inviteCodes = ['APPLYFIRST', 'APPLYFIRST2026', 'EARLYACCESS'];
const betaWorkspaceInviteCodePattern = /^AF-[A-Z0-9][A-Z0-9-]{4,58}[A-Z0-9]$/;
const phaseOneTarget = 25;
const waitlistEndpoint = import.meta.env.VITE_WAITLIST_ENDPOINT ?? '';
const contributionEndpoint = import.meta.env.VITE_CONTRIBUTION_ENDPOINT ?? '';
const alertEndpoint = import.meta.env.VITE_ALERT_ENDPOINT ?? waitlistEndpoint;
const watchEndpoint = import.meta.env.VITE_WATCH_ENDPOINT ?? '';
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

    return opportunities.some((opportunity) => opportunity.id === requestedProgram) ? requestedProgram : opportunities[0].id;
  } catch {
    return opportunities[0].id;
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
  const [savedOnly, setSavedOnly] = useState(false);
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
  const [watchIntentProgramIds, setWatchIntentProgramIds] = useState([]);
  const [lastSavedId, setLastSavedId] = useState(null);
  const [workspaceSyncState, setWorkspaceSyncState] = useState('idle');
  const lastWorkspaceSnapshotRef = useRef('');

  const opportunityRecords = useMemo(
    () =>
      opportunities.map((opportunity) => ({
        ...opportunity,
        ...(verificationEdits[opportunity.id] ?? {}),
        hasLocalVerificationEdit: Boolean(verificationEdits[opportunity.id]),
      })),
    [verificationEdits],
  );

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
        (!savedOnly || savedIds.includes(opportunity.id)) &&
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
  }, [category, classYear, opportunityRecords, priority, query, roleTrack, savedIds, savedOnly, showInternalTools, status, timing, verification]);

  const selectedOpportunity = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const savedOpportunities = opportunityRecords.filter((item) => savedIds.includes(item.id));
  const watchIntentOpportunities = opportunityRecords.filter((item) => watchIntentProgramIds.includes(item.id));
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
  };

  const createWorkspaceState = () => ({
    savedIds,
    watchIntentProgramIds,
    alertPrefs,
    betaAlertSetup,
    waitlistIntent,
    onboardingProgress,
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
    setSavedOnly(false);
  };

  const focusOpportunity = (id) => {
    resetFilters();
    setSelectedId(id);
    markOnboardingStep('browsed');
  };

  const selectOpportunity = (id) => {
    setSelectedId(id);
    markOnboardingStep('browsed');
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

    if (alreadySaved) {
      setWatchIntentProgramIds((currentIds) => currentIds.filter((programId) => programId !== id));
    }
  };

  const startAlertsForOpportunity = (id) => {
    const opportunity = opportunityRecords.find((item) => item.id === id);

    if (!opportunity) {
      setActiveView('alerts');
      return;
    }

    setSelectedId(id);
    setLastSavedId(id);
    markOnboardingStep('browsed');
    markOnboardingStep('saved');
    markOnboardingStep('focused');

    setSavedIds((currentIds) => (currentIds.includes(id) ? currentIds : [...currentIds, id]));
    setWatchIntentProgramIds((currentIds) => [id, ...currentIds.filter((programId) => programId !== id)].slice(0, 10));
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

  const addStudentContribution = async (type, draft) => {
    const contribution = {
      ...draft,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      savedAt: new Date().toISOString(),
      status: activeContributionEndpoint ? 'Submitting' : 'Saved Locally',
    };

    if (activeContributionEndpoint) {
      try {
        const response = await fetch(activeContributionEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'applyfirst-contribution',
            ...contribution,
          }),
        });

        if (!response.ok) {
          throw new Error('Contribution endpoint returned an error.');
        }

        setStudentContributions((currentContributions) =>
          [{ ...contribution, status: 'Submitted for Review' }, ...currentContributions].slice(0, 12),
        );
        markOnboardingStep('improved');
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
    if (normalizedAccessCode && previousAccessCode !== normalizedAccessCode) {
      setSavedIds([]);
      setWatchIntentProgramIds([]);
      setAlertPrefs({ ...defaultAlertPrefs });
      setBetaAlertSetup(null);
      setWaitlistIntent(null);
      setOnboardingProgress({ ...defaultOnboardingProgress });
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
                    <dt>{savedIds.length}</dt>
                    <dd>Saved By You</dd>
                  </div>
                  <div>
                    <dt>{alertableCount}</dt>
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
                savedCount={savedIds.length}
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
                    <span>{savedOnly ? 'Saved Programs' : 'Library Results'}</span>
                    <strong>{filtered.length} {filtered.length === 1 ? 'program' : 'programs'}</strong>
                  </div>
                  <div className="board-toolbar-actions">
                    <div className="result-view-switch" aria-label="Program list view">
                      <button
                        className={!savedOnly ? 'active' : ''}
                        type="button"
                        aria-pressed={!savedOnly}
                        onClick={() => setSavedOnly(false)}
                      >
                        All
                      </button>
                      <button
                        className={savedOnly ? 'active' : ''}
                        type="button"
                        aria-pressed={savedOnly}
                        onClick={() => setSavedOnly(true)}
                        disabled={!savedIds.length && !savedOnly}
                      >
                        Saved
                        <span>{savedIds.length}</span>
                      </button>
                    </div>
                    <button type="button" onClick={resetFilters}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="record-table" role="list">
                  {filtered.length ? (
                    filtered.map((opportunity) => (
                        <OpportunityRecord
                          key={opportunity.id}
                          opportunity={opportunity}
                          selected={selectedId === opportunity.id}
                          saved={savedIds.includes(opportunity.id)}
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
                  onSave={() => selectedOpportunity && toggleSaved(selectedOpportunity.id)}
                  justSaved={Boolean(
                    selectedOpportunity && selectedOpportunity.id === lastSavedId && savedIds.includes(selectedOpportunity.id),
                  )}
                  onFocusSetup={() => selectedOpportunity && startAlertsForOpportunity(selectedOpportunity.id)}
                  onImproveLibrary={() => setActiveView('contribute')}
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
            <span>For Early Programs Students Usually Find Too Late</span>
            <h1 className="landing-headline page-hero-title">
              <span className="landing-headline-text headline-highlight">Apply Before The Crowd</span>
            </h1>
            <p>
              Save high-signal programs, watch timing, and get reviewed opening alerts before deadlines get crowded.
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
        <figure className="product-preview-main">
          <img
            src={programsScreenshot}
            alt="ApplyFirst program library with search, filters, opportunity records, and a selected program detail panel."
          />
          <figcaption>
            <strong>Program Library</strong>
            <span>One place to find, filter, and save high-signal student opportunities.</span>
          </figcaption>
        </figure>
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
        <span>Beta Library Examples</span>
        <p>Programs students usually hear about too late.</p>
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
      title: 'Learn Earlier',
      text: 'Explore SWE, product, quant, research, and civic tech before recruiting gets crowded.',
    },
    {
      title: 'Compare Fit',
      text: 'See how mentorship, ownership, culture, and pace differ across programs and companies.',
    },
    {
      title: 'Build Proof',
      text: 'Turn early programs into projects, resume signal, references, peers, and clearer stories.',
    },
    {
      title: 'Choose Better',
      text: 'The goal is not only getting picked; it is learning which roles and companies you want.',
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
  const [searchResult, setSearchResult] = useState(null);
  const [sourceRunResult, setSourceRunResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [readinessActionByProgramId, setReadinessActionByProgramId] = useState({});
  const [alertActionByCandidateId, setAlertActionByCandidateId] = useState({});
  const [alertResultByCandidateId, setAlertResultByCandidateId] = useState({});
  const [showAllAlertCandidates, setShowAllAlertCandidates] = useState(false);
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
  const reviewNeedsAttention = reviewEvents.filter((event) => event.needsAttention).length;
  const readinessAttentionTotal = readinessQueue?.needsAttention ?? 0;

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
      const [statusPayload, readinessPayload, historyPayload, discoveryPayload, alertPayload] = await Promise.all([
        callAdminEndpoint('/watch/status'),
        callAdminEndpoint('/watch/readiness'),
        callAdminEndpoint('/watch/history'),
        callAdminEndpoint('/watch/discovery/candidates?status=pending_review'),
        callAdminEndpoint('/watch/candidates'),
      ]);

      setStatus(statusPayload);
      setReadinessQueue(readinessPayload);
      setReviewHistory(historyPayload);
      setDiscoveryCandidates(discoveryPayload.candidates ?? []);
      setAlertCandidates(alertPayload.candidates ?? []);
      setAlertCandidateTotal(alertPayload.totalPending ?? alertPayload.candidates?.length ?? 0);
      setLastRefreshedAt(new Date().toISOString());
      if (!quiet) {
        setActionMessage('Review queues refreshed.');
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
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

  return (
    <section className="maintainer-review-view" aria-label="ApplyFirst maintainer review">
      <section className="maintainer-hero">
        <div>
          <span>Maintainer Review</span>
          <h1 className="page-hero-title">Review Signals Before They Reach Students.</h1>
          <p>
            Use this beta console to review discovered source URLs, inspect alert candidates, and keep high-risk
            actions behind a maintainer decision.
          </p>
        </div>
        <div className="maintainer-access-card">
          <span>Admin Session</span>
          <label>
            <span>Worker Admin Token</span>
            <input
              type="password"
              value={adminToken}
              onChange={(event) => onAdminTokenChange(event.target.value)}
              placeholder="Paste token for this session"
              autoComplete="off"
            />
          </label>
          <p>{workerBaseUrl ? `Connected to ${workerBaseUrl}` : 'Set VITE_WATCH_ENDPOINT to enable live review.'}</p>
          {lastRefreshedAt ? <p>Last refreshed {formatDateTime(lastRefreshedAt)}</p> : null}
          <button type="button" onClick={loadQueues} disabled={!canLoad || loading}>
            {loading ? 'Loading...' : 'Load Queues'}
          </button>
        </div>
      </section>

      {errorMessage ? <p className="maintainer-message error">{errorMessage}</p> : null}
      {actionMessage ? <p className="maintainer-message">{actionMessage}</p> : null}

      <section className="maintainer-status-grid" aria-label="Worker status">
        <MaintainerMetric label="Active Watches" value={status?.activeWatchRequests ?? status?.watchRequests ?? '-'} />
        <MaintainerMetric label="Unsubscribed" value={status?.unsubscribedWatchRequests ?? '-'} />
        <MaintainerMetric label="Pending Source Alerts" value={status?.pendingCandidates ?? '-'} />
        <MaintainerMetric label="Discovery Candidates" value={status?.pendingDiscoveryCandidates ?? discoveryCandidates.length} />
      </section>

      <MaintainerWorkflowStrip
        readinessCount={readinessAttentionTotal}
        discoveryCount={discoveryCandidates.length}
        alertCount={pendingAlertTotal}
        sourceRunCount={sourceRunResult?.checked ?? 0}
        reviewCount={reviewNeedsAttention}
      />

      {!status ? (
        <MaintainerEmptyState canLoad={canLoad} />
      ) : (
        <>
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

          <section className="maintainer-ops-grid">
            <section className="maintainer-panel source-run-panel maintainer-utility-panel">
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

            <section className="maintainer-panel maintainer-source-url-panel">
              <div className="maintainer-panel-heading">
                <div>
                  <span>Source URLs</span>
                  <h2>Find Updated Pages</h2>
                </div>
                <p>Search official pages for specific programs, then review saved candidates below.</p>
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

              <div className="maintainer-subpanel-heading">
                <div>
                  <span>Review Candidates</span>
                  <h2>{discoveryCandidates.length} Candidate{discoveryCandidates.length === 1 ? '' : 's'}</h2>
                </div>
                <p>Accept only official or organization-owned pages. Rejected items stay in D1 for audit.</p>
              </div>
              <div className="maintainer-card-list">
                {discoveryCandidates.length ? (
                  discoveryCandidates.map((candidate) => (
                    <article className="maintainer-candidate-card" key={candidate.id}>
                      <div>
                        <span>{formatDisplayLabel(candidate.confidence)}</span>
                        <h3>{candidate.programName || candidate.program_id}</h3>
                        <p>{candidate.title || 'Untitled candidate'}</p>
                        <div className="candidate-link-row">
                          <a href={candidate.candidate_url} target="_blank" rel="noreferrer">
                            Open Candidate Source
                          </a>
                          {candidate.currentOfficialUrl ? (
                            <a href={candidate.currentOfficialUrl} target="_blank" rel="noreferrer">
                              Current Source
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
                      <p>{candidate.reason || 'Needs maintainer review.'}</p>
                      {candidate.snippet ? <blockquote>{stripHtml(candidate.snippet)}</blockquote> : null}
                      <ul className="candidate-review-checklist" aria-label="Review checks before accepting">
                        <li>Official or organization-owned page</li>
                        <li>Current-cycle application, deadline, or program page</li>
                        <li>Program name and student audience match</li>
                      </ul>
                      <div className="maintainer-actions">
                        <button type="button" onClick={() => reviewDiscoveryCandidate(candidate, 'accepted')} disabled={loading}>
                          Accept & Queue Check
                        </button>
                        <button type="button" onClick={() => reviewDiscoveryCandidate(candidate, 'rejected')} disabled={loading}>
                          Reject URL
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="maintainer-empty">No pending discovery candidates.</p>
                )}
              </div>
            </section>
          </section>

          <section className="maintainer-panel">
            <div className="maintainer-panel-heading">
              <div>
                <span>Alert Review</span>
                <h2>{pendingAlertTotal} Pending Alert{pendingAlertTotal === 1 ? '' : 's'}</h2>
              </div>
              <p>Preview recipients first. Send only after the official source and alert copy are trustworthy.</p>
            </div>
            {pendingAlertTotal > alertCandidates.length ? (
              <p className="maintainer-queue-note">
                Showing the newest {alertCandidates.length} loaded alerts. Use the Worker API for deeper paging when the queue grows.
              </p>
            ) : null}
            <div className="maintainer-card-list maintainer-alert-list">
              {alertCandidates.length ? (
                visibleAlertCandidates.map((candidate) => {
                  const activeAction = alertActionByCandidateId[candidate.id];
                  const actionResult = alertResultByCandidateId[candidate.id];
                  const isDryRunning = activeAction === 'dryRun';
                  const isSending = activeAction === 'send';

                  return (
                    <article className={`maintainer-candidate-card ${activeAction ? 'is-busy' : ''}`} key={candidate.id}>
                      <div>
                        <span>{formatDisplayLabel(candidate.candidateType)}</span>
                        <h3>{candidate.programName || candidate.program_id}</h3>
                        <p>{candidate.summary || candidate.title}</p>
                        {candidate.url ? (
                          <a href={candidate.url} target="_blank" rel="noreferrer">
                            Open Official Source
                          </a>
                        ) : null}
                      </div>
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
                })
              ) : (
                <p className="maintainer-empty">No pending alert candidates.</p>
              )}
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

          {reviewHistory ? <ReviewHistoryPanel history={reviewHistory} events={reviewEvents} /> : null}
        </>
      )}
    </section>
  );
}

function MaintainerEmptyState({ canLoad }) {
  const steps = [
    'Paste the Worker admin token.',
    'Load queues from the watch worker.',
    'Review source gaps, URL candidates, alerts, and recent activity.',
  ];

  return (
    <section className="maintainer-panel maintainer-empty-state" aria-label="Maintainer start state">
      <div>
        <span>Start Here</span>
        <h2>Load Review Queues.</h2>
        <p>
          Maintainer tasks appear after ApplyFirst loads the worker status, readiness queue, URL candidates, pending alerts, and audit history.
        </p>
      </div>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>{canLoad ? 'Ready to load.' : 'Add the admin token to begin.'}</p>
    </section>
  );
}

function MaintainerWorkflowStrip({ readinessCount, discoveryCount, alertCount, sourceRunCount, reviewCount }) {
  const steps = [
    {
      label: 'Review Queue',
      value: readinessCount,
      detail: readinessCount ? 'Fix records that can affect alerts.' : 'No urgent readiness gaps.',
      tone: readinessCount ? 'attention' : 'calm',
    },
    {
      label: 'Source URLs',
      value: discoveryCount,
      detail: discoveryCount ? 'Accept or reject discovered pages.' : 'No pending URL candidates.',
      tone: discoveryCount ? 'attention' : 'calm',
    },
    {
      label: 'Alert Review',
      value: alertCount,
      detail: alertCount ? 'Preview recipients before sending.' : 'No alerts waiting.',
      tone: alertCount ? 'attention' : 'calm',
    },
    {
      label: 'Source Checks',
      value: sourceRunCount,
      detail: sourceRunCount ? 'Latest dry run results are below.' : 'Run targeted checks when needed.',
      tone: sourceRunCount ? 'active' : 'calm',
    },
    {
      label: 'Audit Trail',
      value: reviewCount,
      detail: reviewCount ? 'Recent events need review.' : 'Recent activity is clean.',
      tone: reviewCount ? 'attention' : 'calm',
    },
  ];

  return (
    <section className="maintainer-workflow-strip" aria-label="Maintainer workflow summary">
      {steps.map((step) => (
        <article className={`maintainer-workflow-card ${step.tone}`} key={step.label}>
          <div>
            <span>{step.label}</span>
            <strong>{step.value}</strong>
          </div>
          <p>{step.detail}</p>
        </article>
      ))}
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

  return (
    <section className="maintainer-panel monitoring-readiness-panel" aria-label="Monitoring readiness queue">
      <div className="maintainer-panel-heading readiness-heading">
        <div>
          <span>Review Queue</span>
          <h2>{queue.needsAttention ?? 0} Program{queue.needsAttention === 1 ? '' : 's'} Need Attention</h2>
        </div>
        <p>Fix source, timing, and alert-risk issues before students rely on alerts.</p>
      </div>
      <div className="readiness-groups">
        {groups.map((group) => (
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
                  .slice(0, 6)
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
    </section>
  );
}

function ReadinessItemCard({ item, onCheckSource, onFindUrl, activeAction, loading, canLoad }) {
  const isCheckingSource = activeAction === 'source';
  const isFindingUrl = activeAction === 'url';
  const hasLocalAction = Boolean(activeAction);

  return (
    <article className={`readiness-item-card source-state-${getSourceStateTone(item.state)}${hasLocalAction ? ' is-busy' : ''}`}>
      <div className="readiness-item-main">
        <div>
          <span>{item.state}</span>
          <h3>{item.programName}</h3>
          <p>{item.action}</p>
        </div>
        <a href={item.url} target="_blank" rel="noreferrer">
          Source
        </a>
      </div>
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
          <dt>Next Check</dt>
          <dd>{formatDateTime(item.nextCheckAt)}</dd>
        </div>
      </dl>
      <div className="readiness-item-actions">
        <button type="button" onClick={() => onCheckSource(item.programId)} disabled={!canLoad || loading || hasLocalAction}>
          {isCheckingSource ? 'Checking...' : 'Check This Source'}
        </button>
        <button type="button" onClick={() => onFindUrl(item.programId)} disabled={!canLoad || loading || hasLocalAction}>
          {isFindingUrl ? 'Finding...' : 'Find URL for This'}
        </button>
      </div>
    </article>
  );
}

function getReadinessGroupDescription(key) {
  switch (key) {
    case 'attention':
      return 'Fix these first: review alerts, accept exact source URLs, or resolve unclear sources.';
    case 'ready':
      return 'Programs with open or deadline signals that may affect watched students.';
    case 'closed':
      return 'Safe to keep watching, but not alert-worthy right now.';
    default:
      return 'Healthy monitored records waiting for their useful window.';
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
  const [email, setEmail] = useState(waitlistIntent?.email ?? betaAlertSetup?.email ?? '');
  const [phoneNumber, setPhoneNumber] = useState(betaAlertSetup?.phoneNumber ?? '');
  const [contactMethod, setContactMethod] = useState(betaAlertSetup?.contactMethod ?? 'email');
  const [submitState, setSubmitState] = useState('idle');

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
  const hasContact = contactMethod === 'phone' ? hasPhone : hasEmail;
  const missingSetupSummary =
    missingSetupFields.length > 1
      ? `${missingSetupFields.slice(0, -1).join(', ')} and ${missingSetupFields.at(-1)}`
      : missingSetupFields[0];
  const alertReadyMatches = matches.filter((item) => getMonitoringReadiness(item).alertable);
  const savedProgramIds = new Set(savedOpportunities.map((item) => item.id));
  const watchedPrograms = uniqueOpportunitiesById([...watchIntentOpportunities, ...savedOpportunities]);
  const watchedPreview = watchedPrograms.slice(0, 6);
  const watchedProgramIds = new Set(watchedPreview.map((item) => item.id));
  const suggestedMatches = hasPreviewFocus
    ? alertReadyMatches.filter((item) => !watchedProgramIds.has(item.id)).slice(0, 3)
    : [];
  const hasWatchedPrograms = watchedPreview.length > 0;
  const watchedAlertReadyCount = watchedPreview.filter((item) => getMonitoringReadiness(item).alertable).length;
  const watchedNeedsSourceCheck = watchedPreview.length - watchedAlertReadyCount;
  const currentWatchSetup = {
    classYear: alertPrefs.classYear,
    roleTrack: alertPrefs.roleTrack,
    priority: alertPrefs.priority || 'all',
    sendTiming: alertPrefs.sendTiming,
    email: email.trim(),
    phoneNumber: phoneNumber.trim(),
    contactMethod,
    watchedProgramIds: watchedPreview.map((item) => item.id),
  };
  const hasUnsavedWatchSetupChanges =
    Boolean(betaAlertSetup) && !watchSetupMatches(betaAlertSetup, currentWatchSetup);
  const isSavedWatchSetupCurrent = Boolean(betaAlertSetup) && !hasUnsavedWatchSetupChanges;
  const setupActionMessage = hasIncompleteSetup
    ? `Choose ${missingSetupSummary} first.`
      : !hasContact
      ? contactMethod === 'phone'
        ? 'Add a phone number to receive text alerts.'
        : 'Add an email to receive opening alerts.'
      : !hasWatchedPrograms
        ? 'Save a program or set My Focus from a listing first.'
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
    hasIncompleteSetup || !hasContact || !hasWatchedPrograms || submitState === 'submitting' || isSavedWatchSetupCurrent;
  const shouldShowSetupStatus = setupButtonDisabled && !isSavedWatchSetupCurrent;

  const createSetupPayload = (captureStatus) => ({
    classYear: alertPrefs.classYear,
    roleTrack: alertPrefs.roleTrack,
    priority: alertPrefs.priority || 'all',
    sendTiming: alertPrefs.sendTiming,
    email: email.trim(),
    phoneNumber: phoneNumber.trim(),
    contactMethod,
    matchCount: matches.length,
    alertReadyCount: watchedAlertReadyCount,
    savedCount: savedOpportunities.length,
    needsSourceCheck: watchedNeedsSourceCheck,
    matchingProgramIds: matches.map((item) => item.id),
    alertReadyProgramIds: alertReadyMatches.map((item) => item.id),
    savedProgramIds: savedOpportunities.map((item) => item.id),
    watchedProgramIds: watchedPreview.map((item) => item.id),
    watchedPrograms: watchedPreview.map((item) => ({
      id: item.id,
      name: item.name,
      organization: item.organization,
      url: item.previousUrl || item.url,
      readiness: getMonitoringReadiness(item).status,
      reason: watchIntentOpportunities.some((watchIntent) => watchIntent.id === item.id)
        ? 'Selected for alerts'
        : savedProgramIds.has(item.id)
          ? 'Saved by student'
          : 'Matches focus setup',
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
      'I agree to receive ApplyFirst beta opening alerts for programs I choose to watch. I can unsubscribe from any alert email.';

    if (hasRemoteEndpoint) {
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
            }),
          );
        }

        if (watchEndpoint) {
          requests.push(
            postJson(watchEndpoint, {
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
        onSave(createSetupPayload(watchEndpoint ? 'Opening Alerts Submitted' : 'Email Alerts Submitted'));
        setSubmitState('submitted');
        return;
      } catch {
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
            className={contactMethod === 'phone' ? 'active' : ''}
            type="button"
            onClick={() => setContactMethod('phone')}
          >
            Text
          </button>
        </div>
        {contactMethod === 'phone' ? (
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

function ContributeView({ contributions, opportunities, captureEndpoint = '', onSubmit }) {
  const [programDraft, setProgramDraft] = useState(() => createProgramSubmissionDraft());
  const [feedbackDraft, setFeedbackDraft] = useState(() => createFeedbackDraft(opportunities));
  const [programSubmitState, setProgramSubmitState] = useState('idle');
  const [feedbackSubmitState, setFeedbackSubmitState] = useState('idle');

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
    setProgramSubmitState('submitting');
    const result = await onSubmit('program', programDraft);
    setProgramSubmitState(result);
    setProgramDraft(createProgramSubmissionDraft());
  };

  const submitFeedback = async (event) => {
    event.preventDefault();
    setFeedbackSubmitState('submitting');
    const result = await onSubmit('feedback', feedbackDraft);
    setFeedbackSubmitState(result);
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
          <button type="submit" disabled={programSubmitState === 'submitting'}>
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
          <button type="submit" disabled={feedbackSubmitState === 'submitting'}>
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
      setSubmitState('submitting');
      try {
        const response = await fetch(captureEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'applyfirst-waitlist',
            ...payload,
          }),
        });

        if (!response.ok) {
          throw new Error('Waitlist endpoint returned an error.');
        }

        onSave({
          ...payload,
          captureStatus: 'Submitted to Waitlist Endpoint',
        });
        setSubmitState('submitted');
        return;
      } catch {
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
          <button type="submit" disabled={submitState === 'submitting'}>
            {submitState === 'submitting' ? 'Saving...' : isLandingContext ? 'Join Waitlist' : 'Save Contact Preference'}
          </button>
          {submitState === 'localFallback' ? (
            <p className="form-helper">Saved here for now. We may ask you to submit again later.</p>
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

function OpportunityRecord({ opportunity, selected, saved, onSelect, onSave }) {
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
          <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
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
  onSave,
  justSaved,
  onFocusSetup,
  onImproveLibrary,
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
  const sourceStatusLabel =
    verificationState === 'verified'
      ? 'Source Confirmed'
      : verificationState === 'watchOnly'
        ? 'Prep Source'
        : 'Needs Source Check';
  const sourceStatusTone =
    verificationState === 'verified'
      ? 'verified'
      : verificationState === 'watchOnly'
        ? 'watch'
        : 'review';
  const programDetails = [
    { label: 'Eligibility', value: getEligibilityDetailText(opportunity) },
    { label: 'Format / Location', value: getProgramFormatText(opportunity) },
    { label: 'Length', value: getProgramLengthText(opportunity) },
    { label: 'Opportunity Type', value: opportunity.category },
    { label: 'Funding / Pay', value: opportunity.funding || 'Not Listed Yet' },
    { label: 'Role Area', value: tracks.join(' + ') },
  ].filter((detail) => Boolean(detail.value));
  const timingDetails = [
    { label: 'Current Status', value: statusLabels[opportunity.status] },
    { label: 'Opening Window', value: opportunity.openDate },
    { label: 'Deadline', value: opportunity.deadline },
    { label: 'Cycle Notes', value: opportunity.timing },
  ];
  const sourceSummary = getStudentSourceSummary(opportunity, verificationState, sourceStatusLabel);
  const sourceActionLabel =
    ['open', 'deadlineSoon'].includes(opportunity.status) || monitorSignal.actionLabel === 'Apply Now'
      ? 'Apply Now'
      : 'View Official Source';
  const displayTitle = getOpportunityDisplayTitle(opportunity);
  const displaySubtitle = getOpportunityDisplaySubtitle(opportunity);

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div className="detail-status-strip">
          <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
        </div>
        <h2>{displayTitle}</h2>
        <p>{displaySubtitle}</p>
      </div>
      <div className="detail-actions">
        <a className="detail-primary-link" href={opportunity.url} target="_blank" rel="noreferrer">
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
        <button className="detail-watch-action" type="button" onClick={onFocusSetup}>
          Watch This Program
        </button>
      </div>
      {justSaved ? (
        <section className="save-next-step" aria-label="Saved program next step">
          <div>
            <span>Saved</span>
            <strong>Next: Start Watching</strong>
            <p>Add your focus once so ApplyFirst knows which openings to track for beta alerts.</p>
          </div>
          <button type="button" onClick={onFocusSetup}>
            Set Focus
          </button>
        </section>
      ) : null}
      <section className="detail-overview-section" aria-label="Program description">
        <div className="detail-overview-copy">
          <span>About The Program</span>
          {getProgramDescriptionParts(opportunity).map((part) => (
            <p key={part}>{part}</p>
          ))}
          <DetailAboutList items={opportunity.aboutHighlights} />
        </div>
        <div className="detail-listing-heading">
          <span>At A Glance</span>
        </div>
        <DetailFactGrid details={programDetails} />
      </section>
      <DetailListingSection title="Timing" details={timingDetails} />
      <section className={`student-source-summary student-source-summary-${sourceStatusTone}`} aria-label="Source trust">
        <div>
          <span>Source</span>
          <strong>
            {verificationState === 'verified' ? <VerifiedIcon /> : null}
            {sourceSummary.title}
          </strong>
        </div>
        <p>{sourceSummary.note}</p>
        <small>{sourceSummary.meta}</small>
      </section>
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

function DetailListingSection({ title, details }) {
  return (
    <section className="detail-listing-section" aria-label={title}>
      <div className="detail-listing-heading">
        <span>{title}</span>
      </div>
      <DetailFactGrid details={details} />
    </section>
  );
}

function DetailFactGrid({ details }) {
  return (
    <dl className="detail-listing-grid">
      {details.map((detail) => (
        <div className={cleanText(detail.value).length > 76 ? 'wide' : ''} key={detail.label}>
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
  return cleanText(opportunity.location) || 'Not Listed Yet';
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

  switch (opportunity.category) {
    case 'Discovery Program':
      return opportunity.timing === 'Rolling'
        ? 'Discovery Timeline Varies'
        : `${opportunity.timing} Discovery Program; Exact Length Varies`;
    case 'Winternship':
      return 'Short Winter Program; Exact Length Varies';
    case 'Community / Prep Program':
      return 'Prep Timeline Varies';
    case 'Scholarship / Funding':
      return 'Sponsor Award Timeline Varies';
    case 'Conference / Travel Funding':
      return 'Event Or Award Timeline Varies';
    case 'Full-Time Alternative':
      return opportunity.timing === 'Rolling' ? 'Alternative Path Timeline Varies' : `${opportunity.timing} Alternative Path`;
    default:
      if (opportunity.category === 'Fellowship') {
        return opportunity.timing === 'Rolling' ? 'Cohort Dependent; Exact Length Not Listed' : `${opportunity.timing} Fellowship; Exact Length Not Listed`;
      }

      if (opportunity.category === 'Startup / VC Fellowship') {
        return opportunity.timing === 'Rolling' ? 'Portfolio Timeline Varies' : `${opportunity.timing} Startup Fellowship; Exact Length Varies`;
      }

      return opportunity.timing === 'Rolling' ? 'Cohort Or Posting Dependent' : 'Not Listed Yet';
  }
}

function getPublicSourceNote(opportunity) {
  let sourceNote = cleanText(opportunity.sourceNote);

  if (!sourceNote) {
    return 'Open the official page before applying. ApplyFirst uses source checks to decide what can trigger beta alerts.';
  }

  sourceNote = sourceNote.split(/\bExcerpt:/i)[0].trim();

  return sourceNote
    .replace(/before sending public alerts/gi, 'before students rely on alerts')
    .replace(/before alerts/gi, 'before students rely on alerts')
    .replace(/before sharing/gi, 'before applying')
    .replace(/Review before students rely on alerts\.?/gi, 'Review the official page before applying.');
}

function getStudentSourceSummary(opportunity, verificationState, sourceStatusLabel) {
  const lastCheckedText = opportunity.lastChecked ? `Last checked ${opportunity.lastChecked}.` : 'Needs a current source check.';
  const publicNote = getPublicSourceNote(opportunity);

  if (verificationState === 'verified') {
    return {
      title: sourceStatusLabel,
      note: publicNote,
      meta: lastCheckedText,
    };
  }

  if (verificationState === 'watchOnly') {
    return {
      title: sourceStatusLabel,
      note: 'Useful for prep, but ApplyFirst should confirm current-cycle dates before sending opening alerts.',
      meta: lastCheckedText,
    };
  }

  return {
    title: 'Needs Confirmation',
    note: 'Check the official page before applying. ApplyFirst will not send beta alerts from this record until the current source is reviewed.',
    meta: lastCheckedText,
  };
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
