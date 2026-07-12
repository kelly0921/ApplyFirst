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

const savedStorageKey = 'applyfirst-shortlist';
const alertStorageKey = 'applyfirst-alert-preview';
const verificationStorageKey = 'applyfirst-verification-edits';
const sourceCheckLogStorageKey = 'applyfirst-source-check-log';
const waitlistStorageKey = 'applyfirst-waitlist-intent';
const accessStorageKey = 'applyfirst-beta-access';
const inviteCodes = ['APPLYFIRST', 'APPLYFIRST2026', 'EARLYACCESS'];
const phaseOneTarget = 25;
const defaultAlertPrefs = {
  classYear: 'Freshman',
  roleTrack: 'Software Engineering',
  priority: 'high',
  notificationMode: 'waitlist',
  sendTiming: 'openAndDeadline',
};

const notificationModeLabels = {
  local: 'Local Preview',
  waitlist: 'Email Waitlist',
  saved: 'Saved Program Reminders',
};

const sendTimingLabels = {
  openOnly: 'Openings Only',
  openAndDeadline: 'Openings & Deadlines',
  prepOpenDeadline: 'Prep, Openings & Deadlines',
};

const trustPolicyItems = [
  {
    label: 'Confirmed',
    text: 'Official page supports the important timing and eligibility claims.',
  },
  {
    label: 'Prep Only',
    text: 'Useful for planning, but not enough for outbound alerts.',
  },
  {
    label: 'Needs Confirmation',
    text: 'Missing official-cycle proof, so it waits before alerts.',
  },
];

function App() {
  const [activeView, setActiveView] = useState('monitor');
  const [hasAccess, setHasAccess] = useState(() => {
    try {
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
      return JSON.parse(window.localStorage.getItem(verificationStorageKey)) ?? {};
    } catch {
      return {};
    }
  });
  const [sourceCheckLog, setSourceCheckLog] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(sourceCheckLogStorageKey)) ?? {};
    } catch {
      return {};
    }
  });
  const [alertPrefs, setAlertPrefs] = useState(() => {
    try {
      return {
        ...defaultAlertPrefs,
        ...(JSON.parse(window.localStorage.getItem(alertStorageKey)) ?? {}),
      };
    } catch {
      return defaultAlertPrefs;
    }
  });
  const [waitlistIntent, setWaitlistIntent] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(waitlistStorageKey)) ?? null;
    } catch {
      return null;
    }
  });
  const [savedIds, setSavedIds] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(savedStorageKey)) ?? [];
    } catch {
      return [];
    }
  });

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
        (priority === 'all' || getMonitorSignal(opportunity).priority === priority) &&
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
          (alertPrefs.classYear === 'all' || opportunity.classYears.includes(alertPrefs.classYear)) &&
          (alertPrefs.roleTrack === 'all' || tracks.includes(alertPrefs.roleTrack)) &&
          (alertPrefs.priority === 'all' || signal.priority === alertPrefs.priority)
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

  useEffect(() => {
    window.localStorage.setItem(savedStorageKey, JSON.stringify(savedIds));
  }, [savedIds]);

  useEffect(() => {
    window.localStorage.setItem(alertStorageKey, JSON.stringify(alertPrefs));
  }, [alertPrefs]);

  useEffect(() => {
    window.localStorage.setItem(verificationStorageKey, JSON.stringify(verificationEdits));
  }, [verificationEdits]);

  useEffect(() => {
    window.localStorage.setItem(sourceCheckLogStorageKey, JSON.stringify(sourceCheckLog));
  }, [sourceCheckLog]);

  useEffect(() => {
    if (waitlistIntent) {
      window.localStorage.setItem(waitlistStorageKey, JSON.stringify(waitlistIntent));
    } else {
      window.localStorage.removeItem(waitlistStorageKey);
    }
  }, [waitlistIntent]);

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
  };

  const toggleSaved = (id) => {
    setSavedIds((currentIds) =>
      currentIds.includes(id) ? currentIds.filter((savedId) => savedId !== id) : [...currentIds, id],
    );
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
    setWaitlistIntent({
      ...intent,
      savedAt: new Date().toISOString(),
    });
  };

  const resetWaitlistIntent = () => {
    setWaitlistIntent(null);
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
        onWaitlistSave={saveWaitlistIntent}
        onWaitlistReset={resetWaitlistIntent}
        onGrantAccess={grantAccess}
      />
    );
  }

  return (
    <div className="app-shell">
      <Header
        activeView={activeView}
        onViewChange={setActiveView}
        savedCount={savedIds.length}
        showInternalTools={showInternalTools}
        onReturnToLanding={returnToLanding}
      />
      <main className="workspace">
        {activeView === 'alerts' ? (
          <section className="settings-view" aria-label="Alert settings">
            <section className="alert-hero" aria-label="ApplyFirst alert overview">
              <div>
                <span>Stay ready</span>
                <h1>Save the programs you want updates for.</h1>
                <p>
                  Tell ApplyFirst your class year, role interests, and timing preferences. This public prototype saves
                  your setup locally so you can prepare with more confidence while the live notification flow takes
                  shape.
                </p>
              </div>
            </section>
            <div className="settings-note">
              <strong>Preview mode</strong>
              <p>
                Your alert settings stay in this browser for now, so you can shape what you want ApplyFirst to watch.
              </p>
            </div>
            <AlertSetupPanel
              alertPrefs={alertPrefs}
              setAlertPrefs={setAlertPrefs}
              matchCount={alertPreviewMatches.length}
              savedOpportunities={savedOpportunities}
              onSavedSelect={(id) => {
                setSelectedId(id);
                setActiveView('monitor');
              }}
              alertStrategy={alertStrategy}
              waitlistIntent={waitlistIntent}
              onWaitlistSave={saveWaitlistIntent}
              onWaitlistReset={resetWaitlistIntent}
            />
            <TrustPolicyPanel />
          </section>
        ) : (
          <>
            <section className="monitor-hero" aria-label="ApplyFirst overview">
              <div>
                <span>Student-first</span>
                <h1>Discover career-launch programs in one place.</h1>
                <p>
                  Browse curated underclassmen-friendly programs, save what matters, and see what is confirmed so your
                  next step feels easier to choose.
                </p>
              </div>
              <div className="hero-facts" aria-label="Current library status">
                <span>
                  <strong>{opportunityRecords.length}</strong>
                  Programs
                </span>
                <span>
                  <strong>{verifiedCount}</strong>
                  Confirmed
                </span>
                <span>
                  <strong>{savedIds.length}</strong>
                  Saved
                </span>
              </div>
            </section>

            <section className="command-strip" aria-label="Opportunity search command center">
              <label className="global-search">
                <span>Search programs</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search program, role, timing, or source..."
                />
              </label>
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
            </section>

            {showInternalTools ? <VerificationQueuePanel queueItems={verificationQueueItems} onSelect={focusOpportunity} /> : null}

            <section className="recommendation-guide" aria-label="Recommendation guide">
              <strong>Recommendation guide</strong>
              <span>Recommended: strongest fit</span>
              <span>Watch List: worth tracking</span>
              <span>Foundation: prep and access</span>
            </section>

            <section className="product-grid" id="library" aria-label="Opportunity library">
              <aside className="left-rail">
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
                <ReadinessPanel
                  readinessPercent={readinessPercent}
                  recordCount={opportunityRecords.length}
                  verifiedCount={verifiedCount}
                  target={phaseOneTarget}
                />
                <ReviewModeControl
                  enabled={showInternalTools}
                  onToggle={() => setShowInternalTools((current) => !current)}
                />
              </aside>

              <section className="results-board">
                <div className="board-toolbar">
                  <div>
                    <span>Program queue</span>
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
                        onSelect={() => setSelectedId(opportunity.id)}
                        onSave={() => toggleSaved(opportunity.id)}
                      />
                    ))
                  ) : (
                    <EmptyState onReset={resetFilters} />
                  )}
                </div>
              </section>

              <aside className="right-rail">
                <OpportunityDetail
                  opportunity={selectedOpportunity}
                  saved={selectedOpportunity ? savedIds.includes(selectedOpportunity.id) : false}
                  onSave={() => selectedOpportunity && toggleSaved(selectedOpportunity.id)}
                  onVerificationSave={saveVerificationEdit}
                  onVerificationReset={resetVerificationEdit}
                  sourceCheckEntries={selectedOpportunity ? sourceCheckLog[selectedOpportunity.id] ?? [] : []}
                  onSourceCheckSave={addSourceCheckLogEntry}
                  showInternalTools={showInternalTools}
                />
                <Shortlist items={savedOpportunities} onSelect={setSelectedId} />
              </aside>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function LandingPage({ alertPrefs, alertStrategy, waitlistIntent, onWaitlistSave, onWaitlistReset, onGrantAccess }) {
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
            <em>Private beta</em>
          </span>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-label="ApplyFirst private beta">
          <div className="landing-copy">
            <span>Stop checking scattered lists manually</span>
            <h1>Apply Before the Crowd</h1>
            <p>
              ApplyFirst helps students find high-signal programs, track timing, and prepare before applications open.
            </p>
            <div className="landing-actions">
              <a className="button primary" href="#waitlist">
                Join the Waitlist
              </a>
            </div>
          </div>

          <aside className="landing-panel" aria-label="Private beta access">
            <span>Private beta</span>
            <h2>Early access for students who want to move first.</h2>
            <p>
              ApplyFirst is open to a small group first so the library, timing notes, and future alerts stay accurate
              before wider launch.
            </p>
            <div className="beta-panel-points" aria-label="Private beta priorities">
              <span>Accuracy first</span>
              <span>Student feedback</span>
              <span>No noisy alerts</span>
            </div>
            {showAccess ? (
              <form className="invite-form" onSubmit={submitInviteCode}>
                <label>
                  Invite Code
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    placeholder="Enter your code"
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
        <h2>Built around the messy part students already do manually.</h2>
        <p>One view for discovery, timing, saved programs, and source confidence.</p>
      </div>
      <div className="product-preview-layout">
        <figure className="product-preview-main">
          <img
            src={programsScreenshot}
            alt="ApplyFirst program library with search, filters, opportunity records, and a selected program detail panel."
          />
          <figcaption>
            <strong>Program library</strong>
            <span>One place to find, filter, and save high-signal student opportunities.</span>
          </figcaption>
        </figure>
        <div className="signal-stack" aria-label="ApplyFirst signal examples">
          <article>
            <span className="signal-icon">01</span>
            <div>
              <strong>Source check</strong>
              <p>Official page, prior URL, timing notes, and verification status stay together.</p>
            </div>
          </article>
          <article>
            <span className="signal-icon">02</span>
            <div>
              <strong>Timing signal</strong>
              <p>Opening windows, deadlines, and prep reminders become easier to watch.</p>
            </div>
          </article>
          <article>
            <span className="signal-icon">03</span>
            <div>
              <strong>Student action</strong>
              <p>Save programs now; future alerts only go out when signals are trustworthy.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function VisualBenefitSection() {
  const benefits = [
    {
      label: 'Before',
      title: 'Scattered Lists',
      items: ['GitHub repos', 'school links', 'old spreadsheets', 'official pages'],
    },
    {
      label: 'ApplyFirst',
      title: 'One Watchlist',
      items: ['program fit', 'timing notes', 'source status', 'next step'],
    },
    {
      label: 'Outcome',
      title: 'Apply Earlier',
      items: ['prepare ahead', 'catch openings', 'avoid stale links', 'move faster'],
    },
  ];

  return (
    <section className="visual-benefits" aria-label="ApplyFirst benefits">
      {benefits.map((benefit) => (
        <article key={benefit.label}>
          <span>{benefit.label}</span>
          <h2>{benefit.title}</h2>
          <div className="mini-chip-grid">
            {benefit.items.map((item) => (
              <em key={item}>{item}</em>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function CareerAgencySection() {
  const agencySignals = [
    {
      title: 'Learn the work',
      text: 'Try SWE, product, quant, research, finance tech, fellowships, and technical communities earlier.',
    },
    {
      title: 'Compare environments',
      text: 'Notice mentorship, ownership, product depth, company culture, and pace before choosing a path.',
    },
    {
      title: 'Build signal',
      text: 'Turn programs into experience, resume proof, references, peers, and a stronger recruiting story.',
    },
    {
      title: 'Choose with agency',
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
      text: 'Keep a focused watchlist.',
    },
    {
      label: '3',
      title: 'Prepare',
      text: 'Use timing notes early.',
    },
    {
      label: '4',
      title: 'Watch',
      text: 'Track verified openings.',
    },
  ];

  return (
    <section className="how-it-works" aria-label="How ApplyFirst works">
      <div className="how-it-works-copy">
        <span>How It Works</span>
        <h2>From scattered lists to a focused watchlist.</h2>
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
            Alerts
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

function TrustPolicyPanel() {
  return (
    <section className="trust-policy-panel" aria-label="Alert trust policy">
      <div className="trust-policy-copy">
        <span>Confirmation</span>
        <h2>Why some programs wait</h2>
        <p>
          ApplyFirst can help you prepare early, but official pages are still the source of truth. A program should only
          become a real alert when timing and eligibility are clear.
        </p>
      </div>
      <div className="trust-policy-grid">
        {trustPolicyItems.map((item) => (
          <span key={item.label}>
            <strong>{item.label}</strong>
            {item.text}
          </span>
        ))}
      </div>
    </section>
  );
}

function VerificationQueuePanel({ queueItems, onSelect }) {
  const queuePreview = queueItems.slice(0, 6);

  return (
    <section className="verification-queue-panel" id="verification" aria-label="Source review queue">
      <div className="queue-heading">
        <div className="panel-heading">
          <span>Source review</span>
          <h2>What to confirm before real alerts</h2>
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
                <dd>{readiness.missing.length ? readiness.missing.join(', ') : 'Ready for monitoring'}</dd>
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
  matchCount,
  savedOpportunities,
  onSavedSelect,
  alertStrategy,
  waitlistIntent,
  onWaitlistSave,
  onWaitlistReset,
}) {
  const updatePref = (key, value) => {
    setAlertPrefs((currentPrefs) => ({
      ...currentPrefs,
      [key]: value,
    }));
  };

  return (
    <section className="alert-setup-panel">
      <div className="alert-setup-intro">
        <div className="panel-heading">
          <span>Setup</span>
          <h2>Build your program watchlist</h2>
        </div>
        <p>
          These choices decide which programs show up in your alert preview. Unconfirmed records can still help you
          prepare, but future alerts should only come from confirmed program pages.
        </p>
      </div>
      <div className="alert-step-grid">
        <article className="alert-step-card">
          <span>1</span>
          <h3>About you</h3>
          <FilterSelect
            label="Class year"
            value={alertPrefs.classYear}
            onChange={(value) => updatePref('classYear', value)}
            options={filterOptions.classYears}
          />
          <FilterSelect
            label="Role interest"
            value={alertPrefs.roleTrack}
            onChange={(value) => updatePref('roleTrack', value)}
            options={filterOptions.roleTracks}
          />
        </article>
        <article className="alert-step-card">
          <span>2</span>
          <h3>Programs</h3>
          <FilterSelect
            label="Program group"
            value={alertPrefs.priority}
            onChange={(value) => updatePref('priority', value)}
            options={filterOptions.priorities}
            labels={priorityLabels}
          />
          <p>{matchCount} programs match this setup.</p>
        </article>
        <article className="alert-step-card">
          <span>3</span>
          <h3>Updates</h3>
          <FilterSelect
            label="Update option"
            value={alertPrefs.notificationMode}
            onChange={(value) => updatePref('notificationMode', value)}
            options={Object.keys(notificationModeLabels)}
            labels={notificationModeLabels}
          />
          <FilterSelect
            label="When to update"
            value={alertPrefs.sendTiming}
            onChange={(value) => updatePref('sendTiming', value)}
            options={Object.keys(sendTimingLabels)}
            labels={sendTimingLabels}
          />
        </article>
      </div>
      <div className="notification-strategy">
        <div>
          <span>Confirmed enough</span>
          <strong>{alertStrategy.sendSummary}</strong>
        </div>
        <div>
          <span>Still checking</span>
          <strong>{alertStrategy.holdSummary}</strong>
        </div>
        <p>{alertStrategy.trustCopy}</p>
      </div>
      <MonitoringWorkflowPanel matchCount={matchCount} alertStrategy={alertStrategy} />
      <SavedAlertPreview items={savedOpportunities} onSelect={onSavedSelect} />
      <WaitlistPanel
        alertPrefs={alertPrefs}
        alertStrategy={alertStrategy}
        waitlistIntent={waitlistIntent}
        onSave={onWaitlistSave}
        onReset={onWaitlistReset}
      />
    </section>
  );
}

function SavedAlertPreview({ items, onSelect }) {
  const alertReadyCount = items.filter((item) => getMonitoringReadiness(item).alertable).length;
  const needsCheckCount = Math.max(items.length - alertReadyCount, 0);

  return (
    <section className="saved-alert-preview" aria-label="Saved program alert preview">
      <div className="saved-alert-heading">
        <div>
          <span>Saved programs</span>
          <h3>{items.length ? `${items.length} saved for tracking` : 'No saved programs yet'}</h3>
        </div>
        {items.length ? (
          <strong>
            {alertReadyCount} ready / {needsCheckCount} checking
          </strong>
        ) : null}
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
                <em>{readiness.alertable ? 'Alert-ready later' : readiness.status}</em>
              </button>
            );
          })}
        </div>
      ) : (
        <p>
          Start on Programs and bookmark opportunities you would actually apply to. Saved programs become the most useful
          candidates for future reminders once official pages are verified.
        </p>
      )}
    </section>
  );
}

function MonitoringWorkflowPanel({ matchCount, alertStrategy }) {
  const workflowSteps = [
    {
      label: 'Save',
      title: 'Choose what matters',
      text: `${matchCount} programs match your current setup. Save the ones you would actually apply to or prepare for.`,
    },
    {
      label: 'Verify',
      title: 'Check official pages',
      text: 'ApplyFirst keeps unconfirmed programs out of future alerts until timing and eligibility are backed by official pages.',
    },
    {
      label: 'Watch',
      title: 'Track opening signals',
      text: 'Official-page checks look for apply links, opening windows, deadlines, eligibility changes, and closed-cycle language.',
    },
    {
      label: 'Notify',
      title: 'Send only when trustworthy',
      text: alertStrategy.sendSummary,
    },
  ];

  return (
    <section className="monitoring-workflow-panel" aria-label="How ApplyFirst monitoring works">
      <div className="monitoring-workflow-copy">
        <span>How monitoring works</span>
        <h3>From saved program to future alert</h3>
        <p>
          This prototype shows the workflow before live notifications exist: students choose what to watch, records get
          verified, and only confirmed timing should become alert-ready.
        </p>
      </div>
      <div className="monitoring-workflow-steps">
        {workflowSteps.map((step) => (
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

function WaitlistPanel({ context = 'setup', alertPrefs, alertStrategy, waitlistIntent, onSave, onReset }) {
  const [draft, setDraft] = useState(() => createWaitlistDraft(alertPrefs));
  const isLandingContext = context === 'landing';

  useEffect(() => {
    if (!waitlistIntent) {
      setDraft(createWaitlistDraft(alertPrefs));
    }
  }, [alertPrefs, waitlistIntent]);

  const preferenceSummary = [
    formatDisplayLabel(alertPrefs.classYear === 'all' ? 'All class years' : alertPrefs.classYear),
    alertPrefs.roleTrack === 'all' ? 'All Role Tracks' : alertPrefs.roleTrack,
    priorityLabels[alertPrefs.priority] ?? 'All Recommendations',
    sendTimingLabels[alertPrefs.sendTiming],
  ].join(' / ');
  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };
  const saveDraft = (event) => {
    event.preventDefault();
    onSave({
      ...draft,
      preferenceSummary,
      notificationMode: alertStrategy.modeLabel,
    });
  };

  return (
    <section className="waitlist-panel" id="waitlist" aria-label="ApplyFirst waitlist">
      <div className="waitlist-copy">
        <span>{isLandingContext ? 'Early access' : 'Save setup'}</span>
        <h3>
          {waitlistIntent
            ? isLandingContext
              ? 'You are on the list'
              : 'Your setup is saved locally'
            : isLandingContext
              ? 'Join the ApplyFirst Waitlist'
              : 'Save this alert setup'}
        </h3>
        {!isLandingContext ? (
          <p>
            Add optional contact context so this can become a real waitlist later. For now, ApplyFirst only saves this
            in your browser.
          </p>
        ) : null}
      </div>
      {!isLandingContext ? (
        <dl>
          <div>
            <dt>Watching</dt>
            <dd>{preferenceSummary}</dd>
          </div>
          <div>
            <dt>Saved as</dt>
            <dd>{alertStrategy.modeLabel}</dd>
          </div>
        </dl>
      ) : null}
      {waitlistIntent ? (
        <div className="waitlist-saved">
          <strong>{waitlistIntent.email || 'No email added'}</strong>
          <span>{waitlistIntent.savedAt ? `Saved ${waitlistIntent.savedAt.slice(0, 10)}` : 'Saved locally'}</span>
          <p>{waitlistIntent.note || 'No notes added.'}</p>
          <button type="button" onClick={onReset}>Reset preferences</button>
        </div>
      ) : (
        <form className="waitlist-form" onSubmit={saveDraft}>
          <label>
            <span>Email for future updates</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => updateDraft('email', event.target.value)}
              placeholder="you@example.com"
              required={isLandingContext}
            />
          </label>
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
          <label className="waitlist-note">
            <span>Anything specific to watch?</span>
            <textarea value={draft.note} onChange={(event) => updateDraft('note', event.target.value)} />
          </label>
          <button type="submit">{isLandingContext ? 'Join Waitlist' : 'Save Setup'}</button>
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
    { label: 'Curated program library', complete: true },
    { label: 'Filters for class year and role', complete: true },
    { label: 'Saved program list', complete: true },
    { label: `${target}+ programs included`, complete: recordCount >= target },
    { label: 'Official-page checks underway', complete: verifiedCount >= target },
  ];

  return (
    <section className="readiness-panel">
      <div className="panel-heading">
        <span>Preview coverage</span>
        <h2>{mvpComplete ? 'Useful starting library' : 'Library still growing'}</h2>
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
        <h2>Find programs that fit you</h2>
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
        options={filterOptions.priorities}
        labels={priorityLabels}
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

function FilterSelect({ label, value, onChange, options, labels = {} }) {
  const selectId = `filter-${label.toLowerCase().replaceAll(' ', '-').replaceAll('/', '').replaceAll('&', 'and')}`;

  return (
    <label className="select-control">
      <span id={`${selectId}-label`}>{label}</span>
      <select aria-labelledby={`${selectId}-label`} id={selectId} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
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
            aria-label={saved ? 'Remove from shortlist' : 'Add to shortlist'}
            title={saved ? 'Remove from shortlist' : 'Add to shortlist'}
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
          aria-label={saved ? 'Remove from shortlist' : 'Add to shortlist'}
          title={saved ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          <BookmarkIcon filled={saved} />
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      <section className="detail-next-step" aria-label="Recommended next step">
        <span>Recommended next step</span>
        <h3>{monitorSignal.actionLabel}</h3>
        <p>{monitorSignal.nextAction}</p>
        <strong>{opportunity.openDate}</strong>
      </section>
      <div className="detail-status-row" aria-label="Program status summary">
        <StatusItem value={monitorSignal.priorityLabel} tone={monitorSignal.priority} />
        <StatusItem value={monitorSignal.actionLabel} />
        <StatusItem
          value={verificationState === 'verified' ? 'Confirmed' : verificationState === 'watchOnly' ? 'Watch Only' : 'Needs Confirmation'}
          tone={verificationState}
        />
      </div>
      <DetailSection title="Why this matters">{opportunity.why}</DetailSection>
      <DetailSection title="How to prepare">{opportunity.prep}</DetailSection>
      <div className="metric-grid">
        <Metric label="Best for" value={opportunity.classYears.join(', ')} />
        <Metric label="Track" value={tracks.join(' + ')} />
        <Metric label="Timing" value={opportunity.timing} />
        <Metric label="Funding" value={opportunity.funding} />
      </div>
      <div className="tracker-fields">
        <h3>Useful details</h3>
        <dl>
          <div>
            <dt>Open date</dt>
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
                <dt>Source coverage</dt>
                <dd>{monitorSignal.sourceSignal.label}</dd>
              </div>
              <div>
                <dt>Last checked</dt>
                <dd>{opportunity.lastChecked || 'Needs confirmation pass'}</dd>
              </div>
              <div>
                <dt>Previous URL</dt>
                <dd>{opportunity.previousUrl || 'Not tracked yet'}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>
      {showInternalTools ? <div className="source-note">
        <h3>Source note</h3>
        <p>{opportunity.sourceNote}</p>
      </div> : null}
      {showInternalTools ? (
        <section className="internal-tools-stack" aria-label="Internal monitoring tools">
          <div className="internal-tools-heading">
            <span>Internal tools</span>
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
        <h3>Source update plan</h3>
        <span>{plan.checkCadence}</span>
      </div>
      <dl>
        <div>
          <dt>Watched page</dt>
          <dd>{plan.watchedPage}</dd>
        </div>
        <div>
          <dt>Next check</dt>
          <dd>{plan.nextCheck}</dd>
        </div>
        <div>
          <dt>Alert trigger</dt>
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
          <h3>Monitoring assistant</h3>
          <p>Paste text from the official page. The assistant suggests what changed before you confirm the record.</p>
        </div>
        <span>{analysis.confidenceLabel}</span>
      </div>
      <label className="source-assistant-field">
        <span>Official page text</span>
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
          <span>Review decision</span>
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
  const timingLabel = sendTimingLabels[alertPrefs.sendTiming] ?? sendTimingLabels.openAndDeadline;
  const heldCount = Math.max(matches.length - alertableCount, 0);
  const channelCopy =
    alertPrefs.notificationMode === 'local'
      ? 'This stays in your browser for now.'
    : alertPrefs.notificationMode === 'saved'
        ? 'Saved-program reminders can come later after accounts or email consent exist.'
        : 'Email alerts can come later after a real waitlist and confirmed rules exist.';
  const timingCopy =
    alertPrefs.sendTiming === 'openOnly'
      ? 'program openings'
      : alertPrefs.sendTiming === 'prepOpenDeadline'
        ? 'prep windows, openings, and confirmed deadlines'
        : 'program openings and confirmed deadlines';

  return {
    modeLabel,
    sendSummary: `${alertableCount} ${alertableCount === 1 ? 'program is' : 'programs are'} confirmed enough for ${timingCopy}`,
    holdSummary: `${heldCount} ${heldCount === 1 ? 'program still needs' : 'programs still need'} an official check`,
    trustCopy: `${channelCopy} Your timing choice is ${timingLabel.toLowerCase()}, and unconfirmed programs stay out of alerts.`,
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
          <h3>Source check log</h3>
          <p>Record manual checks before deciding whether to update the source fields.</p>
        </div>
        <span>{entries.length} saved</span>
      </div>
      <form className="source-check-form" onSubmit={saveEntry}>
        <label>
          <span>Checked date</span>
          <input type="date" value={draft.checkedDate} onChange={(event) => updateDraft('checkedDate', event.target.value)} />
        </label>
        <label>
          <span>Result</span>
          <select value={draft.result} onChange={(event) => updateDraft('result', event.target.value)}>
            <option value="No material change">No material change</option>
            <option value="Application opened">Application opened</option>
            <option value="Dates updated">Dates updated</option>
            <option value="Eligibility changed">Eligibility changed</option>
            <option value="Needs follow-up">Needs follow-up</option>
          </select>
        </label>
        <label className="source-check-note">
          <span>Check note</span>
          <textarea value={draft.note} onChange={(event) => updateDraft('note', event.target.value)} />
        </label>
        <button type="submit">Add source check</button>
      </form>
      {entries.length ? (
        <div className="source-check-entries" role="list">
          {entries.map((entry) => (
            <article key={entry.id} role="listitem">
              <span>{entry.checkedDate}</span>
              <strong>{entry.result}</strong>
              {entry.reviewDecision ? <em>{entry.reviewDecision}</em> : null}
              <p>{entry.note || 'No note added.'}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="source-check-empty">No source checks logged yet.</p>
      )}
    </section>
  );
}

function createSourceCheckDraft() {
  return {
    checkedDate: new Date().toISOString().slice(0, 10),
    result: 'No material change',
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
          <h3>Verification edit</h3>
          <p>
            Save local source updates after checking the official page. This changes your prototype view only.
          </p>
        </div>
        {opportunity.hasLocalVerificationEdit ? <span>Local edit saved</span> : <span>Base record</span>}
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
          <span>Open window</span>
          <input value={draft.openDate} onChange={(event) => updateDraft('openDate', event.target.value)} />
        </label>
        <label>
          <span>Deadline</span>
          <input value={draft.deadline} onChange={(event) => updateDraft('deadline', event.target.value)} />
        </label>
        <label>
          <span>Last checked</span>
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
        <span>Source note</span>
        <textarea value={draft.sourceNote} onChange={(event) => updateDraft('sourceNote', event.target.value)} />
      </label>
      <div className="verification-editor-actions">
        <button type="submit">Save local verification</button>
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
        <h2>{items.length ? `${items.length} saved` : 'Saved programs'}</h2>
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
      <h3>No opportunities match those filters.</h3>
      <p>Try a broader class year, category, or status.</p>
      <button type="button" onClick={onReset}>
        Clear filters
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
