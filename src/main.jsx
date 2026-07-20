import React, { useEffect, useMemo, useState } from 'react';
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
  { id: 'All class years', label: 'All years' },
];

const appViews = ['monitor', 'alerts', 'contribute'];

const savedStorageKey = 'applyfirst-shortlist';
const alertStorageKey = 'applyfirst-alert-preview';
const verificationStorageKey = 'applyfirst-verification-edits';
const sourceCheckLogStorageKey = 'applyfirst-source-check-log';
const waitlistStorageKey = 'applyfirst-waitlist-intent';
const contributionStorageKey = 'applyfirst-student-contributions';
const accessStorageKey = 'applyfirst-beta-access';
const onboardingStorageKey = 'applyfirst-onboarding-progress';
const betaAlertSetupStorageKey = 'applyfirst-beta-alert-setup';
const inviteCodes = ['APPLYFIRST', 'APPLYFIRST2026', 'EARLYACCESS'];
const phaseOneTarget = 25;
const waitlistEndpoint = import.meta.env.VITE_WAITLIST_ENDPOINT ?? '';
const contributionEndpoint = import.meta.env.VITE_CONTRIBUTION_ENDPOINT ?? '';
const alertEndpoint = import.meta.env.VITE_ALERT_ENDPOINT ?? waitlistEndpoint;
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
  'Confusing Label or Category',
  'Duplicate Program',
  'Other Feedback',
];

const betaReadyExamples = [
  'NASA Internships',
  'Outreachy',
  'MLH Fellowship',
  'Coding it Forward Fellowship',
  'CodePath Career-Ready Courses',
  'SEO Tech Developer',
];

function App() {
  const cleanCaptureMode = isCleanCaptureMode();
  const activeWaitlistEndpoint = cleanCaptureMode ? '' : waitlistEndpoint;
  const activeContributionEndpoint = cleanCaptureMode ? '' : contributionEndpoint;
  const activeAlertEndpoint = cleanCaptureMode ? '' : alertEndpoint;
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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [roleTrack, setRoleTrack] = useState('all');
  const [priority, setPriority] = useState('all');
  const [verification, setVerification] = useState('all');
  const [classYear, setClassYear] = useState('all');
  const [timing, setTiming] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState(opportunities[0].id);
  const [showInternalTools, setShowInternalTools] = useState(false);
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
  const [lastSavedId, setLastSavedId] = useState(null);

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
  }, [category, classYear, opportunityRecords, priority, query, roleTrack, showInternalTools, status, timing, verification]);

  const selectedOpportunity = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const savedOpportunities = opportunityRecords.filter((item) => savedIds.includes(item.id));
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
  };

  const focusOpportunity = (id) => {
    resetFilters();
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

  const grantAccess = () => {
    try {
      window.localStorage.setItem(accessStorageKey, 'granted');
    } catch {
      // Access still works for the current session if local storage is unavailable.
    }
    setHasAccess(true);
    setActiveView('monitor');
  };

  const returnToLanding = () => {
    try {
      window.localStorage.removeItem(accessStorageKey);
    } catch {
      // Returning to the landing page still works for the current session if local storage is unavailable.
    }
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
          savedCount={savedIds.length}
          showInternalTools={showInternalTools}
          onReturnToLanding={returnToLanding}
        />
      )}
      <main className="workspace">
        {activeView === 'alerts' ? (
          <section className="settings-view student-alerts-view" aria-label="My Focus settings">
            <section className="alert-hero" aria-label="ApplyFirst alert overview">
              <div>
                <span>My Focus</span>
                <h1>Set Your Focus.</h1>
                <p>Choose what ApplyFirst should watch first.</p>
              </div>
              <div className="alert-hero-card" aria-label="Beta alert status">
                <span>Private Beta</span>
                <strong>Reviewed Alerts, Not Noise.</strong>
                <p>Every beta alert is reviewed before sending.</p>
              </div>
            </section>
              <AlertSetupPanel
                alertPrefs={alertPrefs}
                setAlertPrefs={setAlertPrefs}
                onFocusChange={() => markOnboardingStep('focused')}
                matchCount={alertPreviewMatches.length}
              alertMatches={alertPreviewMatches}
              savedOpportunities={savedOpportunities}
              onSavedSelect={(id) => {
                setSelectedId(id);
                setActiveView('monitor');
              }}
              alertStrategy={alertStrategy}
              betaAlertSetup={betaAlertSetup}
              onBetaAlertSetupSave={saveBetaAlertSetup}
              waitlistIntent={waitlistIntent}
              alertEndpoint={activeAlertEndpoint}
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
                <h1>
                  <span className="headline-line">Find Early Programs</span>
                  <span className="headline-line headline-highlight">Before They Get Crowded.</span>
                </h1>
                <p>Compare early programs, fellowships, funding, communities, and timing in one place.</p>
                <label className="global-search hero-search">
                  <span className="sr-only">Search Programs</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
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
                    <span>Library Results</span>
                    <strong>{filtered.length} programs</strong>
                  </div>
                  <button type="button" onClick={resetFilters}>
                    Clear
                  </button>
                </div>
                <div className="record-table" role="list">
                  {filtered.length ? (
                    filtered.map((opportunity) => (
                      <OpportunityRecord
                        key={opportunity.id}
                        opportunity={opportunity}
                        selected={selectedOpportunity?.id === opportunity.id}
                        saved={savedIds.includes(opportunity.id)}
                        onSelect={() => {
                          setSelectedId(opportunity.id);
                          markOnboardingStep('browsed');
                        }}
                        onSave={() => toggleSaved(opportunity.id)}
                      />
                    ))
                  ) : (
                    <EmptyState onReset={resetFilters} />
                  )}
                </div>
              </section>

              <aside className="opportunity-detail-column">
                <OpportunityDetail
                  opportunity={selectedOpportunity}
                  saved={selectedOpportunity ? savedIds.includes(selectedOpportunity.id) : false}
                  onSave={() => selectedOpportunity && toggleSaved(selectedOpportunity.id)}
                  justSaved={Boolean(
                    selectedOpportunity && selectedOpportunity.id === lastSavedId && savedIds.includes(selectedOpportunity.id),
                  )}
                  onFocusSetup={() => setActiveView('alerts')}
                  onImproveLibrary={() => setActiveView('contribute')}
                  onVerificationSave={saveVerificationEdit}
                  onVerificationReset={resetVerificationEdit}
                  sourceCheckEntries={selectedOpportunity ? sourceCheckLog[selectedOpportunity.id] ?? [] : []}
                  onSourceCheckSave={addSourceCheckLogEntry}
                  showInternalTools={showInternalTools}
                />
              </aside>
            </section>

            <section className="library-support-row" aria-label="Saved Programs and Beta Coverage">
              <Shortlist items={savedOpportunities} onSelect={setSelectedId} />
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
  const [showAccess, setShowAccess] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [accessError, setAccessError] = useState('');

  const submitInviteCode = (event) => {
    event.preventDefault();
    const normalizedCode = inviteCode.trim().toUpperCase();

    if (inviteCodes.includes(normalizedCode)) {
      setAccessError('');
      onGrantAccess();
      return;
    }

    setAccessError('This invite code does not look active yet.');
  };

  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <div className="brand" aria-label="ApplyFirst">
          <ApplyFirstMark />
          <span className="brand-copy">
            <strong>ApplyFirst</strong>
            <em>Private Beta</em>
          </span>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-label="ApplyFirst private beta">
          <div className="landing-copy">
            <span>Stop Checking Scattered Lists Manually</span>
            <h1 className="landing-headline">
              <span className="landing-headline-text headline-highlight">Apply Before The Crowd</span>
            </h1>
            <p>
              ApplyFirst helps students find high-signal programs, track timing, and prepare before applications open.
            </p>
                <div className="beta-status-note" aria-label="Private beta status">
                  <strong>Beta Focus</strong>
                  <span>Library, saved programs, My Focus, reviewed beta email alerts, and feedback are ready to test.</span>
                </div>
            <div className="landing-actions">
              <a className="button primary" href="#waitlist">
                Join the Waitlist
              </a>
            </div>
          </div>

          <aside className="landing-panel" aria-label="Private Beta Access">
            <span>Private Beta</span>
            <h2>Early Access for Students Who Want to Move First.</h2>
            <p>
              ApplyFirst is open to a small group first so the library, timing notes, and future alerts stay accurate
              before wider launch.
            </p>
            <div className="beta-panel-points" aria-label="Private Beta Priorities">
              <span>Accuracy First</span>
              <span>Student Feedback</span>
              <span>No Noisy Alerts</span>
            </div>
            <p className="beta-panel-note">
              Beta email alerts are reviewed before sending while ApplyFirst tests the library and timing model.
            </p>
            {showAccess ? (
              <form className="invite-form" onSubmit={submitInviteCode}>
                <label>
                  Invite Code
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    placeholder="Enter invite code"
                    autoComplete="off"
                  />
                </label>
                {accessError ? <p className="form-error">{accessError}</p> : null}
                <button type="submit">Open ApplyFirst</button>
              </form>
            ) : (
              <div className="access-code-callout">
                <button className="text-button" type="button" onClick={() => setShowAccess(true)}>
                  Enter Invite Code
                </button>
              </div>
            )}
          </aside>
        </section>

        <HowItWorksSection />

        <ProductPreviewSection />

        <CareerAgencySection />

        <VisualBenefitSection />

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
        <h2>Built Around the Messy Part Students Already Do Manually.</h2>
        <p>One view for discovery, timing, saved programs, and source confidence.</p>
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
        <span>Good Starting Points</span>
        <p>Explore programs with enough source context to compare timing, fit, and next steps.</p>
      </div>
      <div className="beta-example-list">
        {betaReadyExamples.map((program) => (
          <em key={program}>{program}</em>
        ))}
      </div>
    </section>
  );
}

function VisualBenefitSection() {
  const benefits = [
    {
      label: 'Before',
      title: 'Scattered Lists',
      tone: 'before',
      items: ['GitHub Repos', 'School Links', 'Old Spreadsheets', 'Official Pages'],
    },
    {
      label: 'ApplyFirst',
      title: 'One Watchlist',
      tone: 'applyfirst',
      items: ['Program Fit', 'Timing Notes', 'Source Status', 'Next Step'],
    },
    {
      label: 'Outcome',
      title: 'Apply Earlier',
      tone: 'outcome',
      items: ['Prepare Ahead', 'Catch Openings', 'Avoid Stale Links', 'Move Faster'],
    },
  ];

  return (
    <section className="visual-benefits" aria-label="ApplyFirst benefits">
      <div className="visual-benefits-heading">
        <span>What Changes</span>
        <h2>Less Checking. Earlier Action.</h2>
      </div>
      <div className="visual-benefit-flow">
        {benefits.map((benefit) => (
          <article className={`visual-benefit-card visual-benefit-${benefit.tone}`} key={benefit.label}>
            <div className="visual-benefit-title">
              <span>{benefit.label}</span>
              <h3>{benefit.title}</h3>
            </div>
            <ul>
              {benefit.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function CareerAgencySection() {
  const agencySignals = [
    {
      title: 'Learn the Work',
      text: 'Try SWE, product, quant, research, finance tech, fellowships, and technical communities earlier.',
    },
    {
      title: 'Compare Environments',
      text: 'Notice mentorship, ownership, product depth, company culture, and pace before choosing a path.',
    },
    {
      title: 'Build Signal',
      text: 'Turn programs into experience, resume proof, references, peers, and a stronger recruiting story.',
    },
    {
      title: 'Choose With Agency',
      text: 'The goal is not only getting picked; it is learning which companies and roles you want to pick.',
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
      title: 'Discover',
      text: 'Find high-signal programs.',
    },
    {
      label: '2',
      title: 'Save',
      text: 'Keep a personal saved list.',
    },
    {
      label: '3',
      title: 'Prepare',
      text: 'Use timing notes early.',
    },
    {
      label: '4',
      title: 'Monitor',
      text: 'Track verified openings.',
    },
  ];

  return (
    <section className="how-it-works" aria-label="How ApplyFirst works">
      <div className="how-it-works-copy">
        <span>How It Works</span>
        <h2>Discover. Save. Prepare. Monitor.</h2>
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
      text: 'Search or click a card.',
      actionLabel: 'Search',
      onAction: onBrowse,
    },
    {
      id: 'saved',
      label: '2',
      title: 'Save One',
      text: savedCount ? `${savedCount} saved.` : 'Click bookmark.',
      actionLabel: savedCount ? 'Saved' : 'Bookmark',
    },
    {
      id: 'focused',
      label: '3',
      title: 'Set My Focus',
      text: progress.focused ? 'Focus saved.' : 'Choose year, role, timing.',
      actionLabel: 'Choose',
      onAction: onFocusSetup,
    },
    {
      id: 'alerted',
      label: '4',
      title: 'Join Alerts',
      text: 'Add email.',
      actionLabel: 'Add Email',
      onAction: onFocusSetup,
    },
    {
      id: 'improved',
      label: '5',
      title: 'Suggest Updates',
      text: 'Report stale info.',
      actionLabel: 'Report',
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
        <h2>Quick Start</h2>
        <p>Complete these once to test the core flow.</p>
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

function Header({ activeView, onViewChange, savedCount, showInternalTools, onReturnToLanding }) {
  return (
    <header className="site-header">
      <button className="brand" type="button" onClick={() => onViewChange('monitor')} aria-label="ApplyFirst home">
        <ApplyFirstMark />
        <span className="brand-copy">
          <strong>ApplyFirst</strong>
          <em>Track career-launch programs</em>
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
        </div>
        <div className="nav-status" aria-label="Workspace status">
          <span>{savedCount} Saved</span>
          {showInternalTools ? <span className="internal-status">Maintainer</span> : null}
          <button type="button" onClick={onReturnToLanding}>
            Landing
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
  onSavedSelect,
  alertStrategy,
  betaAlertSetup,
  onBetaAlertSetupSave,
  waitlistIntent,
  alertEndpoint,
}) {
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
            <span>Required Setup</span>
            <h2>Choose What to Watch.</h2>
          </div>
          <p>
            Choose Class Year, Role Track, and Alert Timing. ApplyFirst uses this to preview matching programs and
            reviewed beta alerts.
          </p>
        </div>
        {waitlistIntent ? <p className="preference-source-note">Pre-filled from your waitlist. Edit anytime.</p> : null}
        <div className="alert-preference-layout">
          <article className="alert-preference-card">
            <span>Required</span>
            <h3>Class Year</h3>
            <p>Match programs to your student stage.</p>
            <FilterSelect
              label="Class Year"
              value={alertPrefs.classYear}
              onChange={(value) => updatePref('classYear', value)}
              options={filterOptions.classYears}
              placeholder="Choose Class Year"
              includeAll={false}
            />
          </article>
          <article className="alert-preference-card">
            <span>Required</span>
            <h3>Role Track</h3>
            <p>Choose the path you want watched first.</p>
            <FilterSelect
              label="Role Interest"
              value={alertPrefs.roleTrack}
              onChange={(value) => updatePref('roleTrack', value)}
              options={filterOptions.roleTracks}
              placeholder="Choose Role Interest"
              includeAll={false}
            />
          </article>
          <article className="alert-preference-card">
            <span>Required</span>
            <h3>Alert Timing</h3>
            <p>Decide which moments should reach you.</p>
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
        betaAlertSetup={betaAlertSetup}
        onSave={onBetaAlertSetupSave}
        waitlistIntent={waitlistIntent}
        captureEndpoint={alertEndpoint}
      />
      <SavedAlertPreview items={savedOpportunities} onSelect={onSavedSelect} />
    </section>
  );
}

function SavedAlertPreview({ items, onSelect }) {
  const alertReadyCount = items.filter((item) => getMonitoringReadiness(item).alertable).length;

  return (
    <section className="saved-alert-preview" aria-label="Saved program alert preview">
      <div className="saved-alert-heading">
        <div>
          <span>Saved Programs</span>
          <h3>{items.length ? `${items.length} Programs in Your Watchlist` : 'No Saved Programs Yet'}</h3>
        </div>
        {items.length ? <strong>{alertReadyCount} With Confirmed Timing</strong> : null}
      </div>
      {items.length ? (
        <div className="saved-alert-list" role="list">
          {items.slice(0, 4).map((item) => {
            const signal = getMonitorSignal(item);
            const readiness = getMonitoringReadiness(item);

            return (
              <button key={item.id} type="button" onClick={() => onSelect(item.id)} role="listitem">
                <span>{item.name}</span>
                <strong>{signal.actionLabel}</strong>
                <em>{readiness.alertable ? 'Official Timing Found' : 'Timing Needs a Source Check'}</em>
              </button>
            );
          })}
        </div>
      ) : (
        <p>
          Start on Programs and bookmark opportunities you would actually apply to. Saved programs become your personal
          watchlist for future reminders.
        </p>
      )}
    </section>
  );
}

function BetaAlertSystem({
  alertPrefs,
  alertStrategy,
  matches,
  savedOpportunities,
  betaAlertSetup,
  onSave,
  waitlistIntent,
  captureEndpoint = '',
}) {
  const [email, setEmail] = useState(waitlistIntent?.email ?? betaAlertSetup?.email ?? '');
  const [submitState, setSubmitState] = useState('idle');

  useEffect(() => {
    if (waitlistIntent?.email && !email) {
      setEmail(waitlistIntent.email);
    }
  }, [email, waitlistIntent]);

  const requiredFields = [alertPrefs.classYear, alertPrefs.roleTrack, alertPrefs.sendTiming];
  const hasIncompleteSetup = requiredFields.some(isPreferenceUnset);
  const hasPreviewFocus = ![alertPrefs.classYear, alertPrefs.roleTrack].some(isPreferenceUnset);
  const hasEmail = Boolean(email.trim());
  const alertReadyMatches = matches.filter((item) => getMonitoringReadiness(item).alertable);
  const needsSourceCheck = hasPreviewFocus ? matches.length - alertReadyMatches.length : 0;
  const previewPrograms = hasPreviewFocus ? alertReadyMatches.slice(0, 4) : [];
  const savedProgramIds = new Set(savedOpportunities.map((item) => item.id));
  const watchedPreview = hasPreviewFocus
    ? [
        ...savedOpportunities.slice(0, 3),
        ...alertReadyMatches.filter((item) => !savedProgramIds.has(item.id)).slice(0, 3),
      ].slice(0, 5)
    : [];

  const createSetupPayload = (captureStatus) => ({
    classYear: alertPrefs.classYear,
    roleTrack: alertPrefs.roleTrack,
    priority: alertPrefs.priority || 'all',
    sendTiming: alertPrefs.sendTiming,
    email: email.trim(),
    matchCount: matches.length,
    alertReadyCount: alertReadyMatches.length,
    savedCount: savedOpportunities.length,
    watchedPrograms: watchedPreview.map((item) => item.name),
    captureStatus,
  });

  const saveSetup = async () => {
    const payload = createSetupPayload(captureEndpoint ? 'Submitting' : 'Saved Locally');
    const prioritySummary =
      payload.priority === 'all' ? 'All Opportunity Types' : priorityLabels[payload.priority] ?? payload.priority;

    if (captureEndpoint) {
      setSubmitState('submitting');
      try {
        const response = await fetch(captureEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'applyfirst-beta-email-alert',
            email: payload.email,
            classYear: payload.classYear,
            interest: payload.roleTrack,
            school: '',
            note: `Beta email alert setup. Watching: ${payload.watchedPrograms.join(', ') || 'No programs yet'}. Alert-ready: ${payload.alertReadyCount}. Needs source check: ${needsSourceCheck}.`,
            preferenceSummary: `${payload.classYear} / ${payload.roleTrack} / ${prioritySummary} / ${sendTimingLabels[payload.sendTiming] ?? payload.sendTiming}`,
            notificationMode: 'Beta Email Alerts',
            savedAt: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error('Alert endpoint returned an error.');
        }

        onSave(createSetupPayload('Submitted for Beta Email Alerts'));
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
    <section className="beta-alert-system" aria-label="Beta alert setup">
      <div className="beta-alert-copy">
        <span>Preview</span>
        <h3>What ApplyFirst Would Watch</h3>
        <p>
          {hasPreviewFocus
            ? 'These numbers update from your focus setup.'
            : 'Choose Class Year and Role Track to unlock the preview.'}
        </p>
      </div>
      <div className="beta-alert-metrics" aria-label="Beta alert readiness">
        <span>
          <strong>{hasPreviewFocus ? matches.length : '-'}</strong>
          Matches
        </span>
        <span>
          <strong>{hasPreviewFocus ? alertReadyMatches.length : '-'}</strong>
          Alert-Ready
        </span>
        <span>
          <strong>{hasPreviewFocus ? needsSourceCheck : '-'}</strong>
          Needs Check
        </span>
      </div>
      <div className="beta-alert-preview">
        <div>
          <span>Watchlist Preview</span>
          <strong>
            {watchedPreview.length
              ? watchedPreview.map((item) => item.name).join(', ')
              : !hasPreviewFocus
                ? 'Choose focus fields to preview matches.'
                : 'No reviewed alert matches yet.'}
          </strong>
        </div>
        <div>
          <span>Send Timing</span>
          <strong>
            {hasPreviewFocus
              ? alertStrategy.sendSummary
              : 'Choose focus to preview timing.'}
          </strong>
        </div>
        <div>
          <span>Ready Examples</span>
          <strong>
            {previewPrograms.length
              ? previewPrograms.map((item) => item.name).join(', ')
              : hasPreviewFocus
                ? 'No confirmed timing matches for this focus yet.'
                : 'Appears after focus is selected.'}
          </strong>
        </div>
      </div>
      <div className="beta-alert-actions">
        <label>
          <span>Join Beta Email Alerts</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <button
          type="button"
          onClick={saveSetup}
          disabled={hasIncompleteSetup || !hasEmail || submitState === 'submitting'}
          title={
            hasIncompleteSetup
              ? 'Choose Class Year, Role Track, and Alert Timing first.'
              : !hasEmail
                ? 'Add your email first.'
                : 'Join beta alerts.'
          }
        >
          {submitState === 'submitting' ? 'Joining...' : 'Join Beta Alerts'}
        </button>
        {betaAlertSetup ? (
          <p>{`${betaAlertSetup.captureStatus ?? 'Saved'} on ${betaAlertSetup.savedAt.slice(0, 10)} with ${betaAlertSetup.alertReadyCount} alert-ready programs.`}</p>
        ) : null}
      </div>
      <BetaAlertFeed
        alertStrategy={alertStrategy}
        watchedPrograms={watchedPreview}
        needsSourceCheck={needsSourceCheck}
        hasSavedSetup={Boolean(betaAlertSetup)}
        hasPreviewFocus={hasPreviewFocus}
      />
    </section>
  );
}

function BetaAlertFeed({ alertStrategy, watchedPrograms, needsSourceCheck, hasSavedSetup, hasPreviewFocus }) {
  const feedItems = watchedPrograms.slice(0, 3).map((program) => {
    const readiness = getMonitoringReadiness(program);
    const signal = getMonitorSignal(program);

    return {
      id: program.id,
      name: program.name,
      organization: program.organization,
      status: readiness.alertable ? 'Ready for Alerts' : 'Needs Timing Check',
      message: readiness.alertable
        ? `${signal.actionLabel}: ${signal.nextAction}`
        : 'ApplyFirst would hold this until timing is confirmed from an official source.',
      timing: program.openDate,
    };
  });

  return (
    <section className="beta-alert-feed" aria-label="Beta alert feed preview">
      <div className="beta-alert-feed-heading">
        <span>Alert Preview</span>
        <strong>{hasSavedSetup ? 'Your Saved Alert Setup' : 'Before You Save'}</strong>
      </div>
      {feedItems.length ? (
        <div className="beta-alert-feed-list" role="list">
          {feedItems.map((item) => (
            <article key={item.id} role="listitem">
              <span>{item.status}</span>
              <strong>{item.name}</strong>
              <em>{item.organization}</em>
              <p>{item.message}</p>
              <small>{item.timing}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="beta-alert-feed-empty">
          {hasPreviewFocus
            ? 'Save programs or choose a narrower focus to generate example alerts.'
            : 'Choose focus fields to preview example alerts.'}
        </p>
      )}
      <div className="beta-alert-feed-note">
        <strong>{hasPreviewFocus ? alertStrategy.timingLabel : 'Choose Focus'}</strong>
        <span>
          {hasPreviewFocus
            ? `${needsSourceCheck} matching programs need an official timing check before ApplyFirst would alert you.`
            : 'Alert previews appear after there is enough focus context.'}
        </span>
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
          <h1>Suggest a Program or Fix.</h1>
          <p>
            Suggest a missing program, flag stale information, or tell us which opportunities would be worth alerts
            later. Every submission is reviewed before it changes the library.
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
            <span>Program Name</span>
            <input
              value={programDraft.name}
              onChange={(event) => updateProgramDraft('name', event.target.value)}
              placeholder="Program, fellowship, scholarship, event..."
              required
            />
          </label>
          <label>
            <span>Official Link</span>
            <input
              type="url"
              value={programDraft.url}
              onChange={(event) => updateProgramDraft('url', event.target.value)}
              placeholder="https://..."
              required
            />
          </label>
          <label>
            <span>Best Fit</span>
            <select value={programDraft.track} onChange={(event) => updateProgramDraft('track', event.target.value)}>
              <option>Software Engineering</option>
              <option>Product Management</option>
              <option>Quant / Finance</option>
              <option>Access & Prep</option>
              <option>Scholarship / Funding</option>
              <option>Not Sure Yet</option>
            </select>
          </label>
          <label>
            <span>Why Should ApplyFirst Watch It?</span>
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
            <span>Issue Type</span>
            <select value={feedbackDraft.issueType} onChange={(event) => updateFeedbackDraft('issueType', event.target.value)}>
              {feedbackIssueTypes.map((issueType) => (
                <option key={issueType}>{issueType}</option>
              ))}
            </select>
          </label>
          <label>
            <span>What Should Be Fixed?</span>
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
    track: 'Software Engineering',
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

function createFeedbackDraft(opportunities) {
  return {
    programId: opportunities[0]?.id ?? '',
    issueType: feedbackIssueTypes[0],
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
      ? 'All Opportunity Types'
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
        label="Opportunity Type"
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
      <FilterSelect label="Category" value={category} onChange={setCategory} options={filterOptions.categories} />
      <FilterSelect label="Timing" value={timing} onChange={setTiming} options={filterOptions.timing} />
      <FilterSelect label="Status" value={status} onChange={setStatus} options={filterOptions.status} labels={statusLabels} />
      <button className="plain-button" type="button" onClick={resetFilters}>
        Reset filters
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

  return (
    <article className={`opportunity-record${selected ? ' selected' : ''}`} role="listitem">
      <button className="record-main" type="button" onClick={onSelect}>
        <div className="record-title">
          <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
          <h3>{opportunity.name}</h3>
          <p>{opportunity.organization}</p>
        </div>
        <div className="record-summary">
          <span>{primaryTrack}</span>
          <span>{opportunity.classYears.join(', ')}</span>
          <span>{opportunity.timing}</span>
          {isConfirmed ? (
            <span className="record-confirmed" title="Confirmed by official source">
              Confirmed
            </span>
          ) : null}
        </div>
      </button>
      <div className="record-side">
        <span className={`priority-chip priority-${monitorSignal.priority}`}>{monitorSignal.priorityLabel}</span>
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
  const readiness = getMonitoringReadiness(opportunity);
  const sourceUpdatePlan = getSourceUpdatePlan(opportunity);

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
        <h2>{opportunity.name}</h2>
        <p>{opportunity.organization}</p>
      </div>
      <div className="detail-actions">
        <a href={opportunity.url} target="_blank" rel="noreferrer">
          Official page
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
      </div>
      {justSaved ? (
        <section className="save-next-step" aria-label="Saved program next step">
          <div>
            <span>Saved</span>
            <strong>Next: Set My Focus</strong>
            <p>ApplyFirst can use your class year, interest, and timing to make the library feel more personal.</p>
          </div>
          <button type="button" onClick={onFocusSetup}>
            Set My Focus
          </button>
        </section>
      ) : null}
      <section className="detail-next-step" aria-label="Recommended Next Step">
        <span>Recommended Next Step</span>
        <h3>{monitorSignal.actionLabel}</h3>
        <p>{monitorSignal.nextAction}</p>
        <strong>{opportunity.openDate}</strong>
      </section>
      <div className="detail-status-row" aria-label="Program status summary">
        <StatusItem value={monitorSignal.priorityLabel} tone={monitorSignal.priority} />
        <StatusItem value={monitorSignal.actionLabel} />
        <StatusItem
          value={verificationState === 'verified' ? 'Confirmed' : verificationState === 'watchOnly' ? 'Prep Only' : 'Needs Confirmation'}
          tone={verificationState}
        />
      </div>
      <DetailSection title="Why this matters">{opportunity.why}</DetailSection>
      <DetailSection title="How to prepare">{opportunity.prep}</DetailSection>
      <button className="detail-feedback-link" type="button" onClick={onImproveLibrary}>
        See something missing or stale?
      </button>
      <div className="metric-grid">
        <Metric label="Best for" value={opportunity.classYears.join(', ')} />
        <Metric label="Track" value={tracks.join(' + ')} />
        <Metric label="Timing" value={opportunity.timing} />
        <Metric label="Funding" value={opportunity.funding} />
      </div>
      <div className="tracker-fields">
        <h3>Useful Details</h3>
        <dl>
          <div>
            <dt>Open Date</dt>
            <dd>{opportunity.openDate}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{formatDisplayLabel(opportunity.category)}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>{opportunity.deadline}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{opportunity.location}</dd>
          </div>
          {showInternalTools ? (
            <>
              <div>
                <dt>Confidence</dt>
                <dd>{confidenceLabels[opportunity.confidence]}</dd>
              </div>
              <div>
                <dt>Source Coverage</dt>
                <dd>{monitorSignal.sourceSignal.label}</dd>
              </div>
              <div>
                <dt>Last Checked</dt>
                <dd>{opportunity.lastChecked || 'Needs Confirmation Pass'}</dd>
              </div>
              <div>
                <dt>Previous URL</dt>
                <dd>{opportunity.previousUrl || 'Not Tracked Yet'}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>
      {showInternalTools ? <div className="source-note">
        <h3>Source Note</h3>
        <p>{opportunity.sourceNote}</p>
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

function Metric({ label, value }) {
  return (
    <span>
      <strong>{formatDisplayLabel(value)}</strong>
      {label}
    </span>
  );
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
    : 'Beta email alerts can be captured now, then reviewed before sending while signal rules improve.';
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
    'Conference funding': 'Conference Funding',
    'Externship / insight series': 'Externship / Insight Series',
    'Internship-matching fellowship': 'Internship-Matching Fellowship',
    'Conference funding': 'Conference Funding',
    'Technical community': 'Technical Community',
    'Training program': 'Training Program',
    'Special program / resource': 'Special Program / Resource',
    'All class years': 'All Class Years',
    'Paid internship': 'Paid Internship',
    'Paid fellowship': 'Paid Fellowship',
    'Travel support': 'Travel Support',
    'Host-site dependent': 'Host-Site Dependent',
    'Scholarship': 'Scholarship',
    'Stipend': 'Stipend',
    'Free': 'Free',
    'Varies': 'Varies',
  };

  return labelMap[value] ?? value;
}

function DetailSection({ title, children }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
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
      <p>Try a broader class year, category, or status.</p>
      <button type="button" onClick={onReset}>
        Clear filters
      </button>
    </div>
  );
}

const rootElement = document.getElementById('root');
const appRoot = rootElement._applyFirstRoot ?? createRoot(rootElement);

rootElement._applyFirstRoot = appRoot;
appRoot.render(<App />);
