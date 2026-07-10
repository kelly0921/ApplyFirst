import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
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

  const libraryStats = useMemo(
    () => [
      { label: 'Programs', value: String(opportunityRecords.length) },
      {
        label: 'Recommended',
        value: String(opportunityRecords.filter((item) => getMonitorSignal(item).priority === 'high').length),
      },
      {
        label: 'Confirmed',
        value: String(opportunityRecords.filter((item) => getVerificationState(item) === 'verified').length),
      },
      {
        label: 'Needs confirmation',
        value: String(opportunityRecords.filter((item) => getMonitorSignal(item).alertReadiness === 'verify').length),
      },
    ],
    [opportunityRecords],
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
  const actionCount = filtered.filter((item) =>
    ['open', 'expectedSoon', 'deadlineSoon'].includes(item.status),
  ).length;
  const verifyCount = filtered.filter((item) => item.status === 'verifyManually').length;
  const recommendedCount = filtered.filter((item) => getMonitorSignal(item).priority === 'high').length;
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

  return (
    <div className="app-shell">
      <Header savedCount={savedIds.length} showInternalTools={showInternalTools} />
      <main className="workspace">
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
          <div className="summary-grid" aria-label="Library summary">
            {libraryStats.map((stat) => (
              <span key={stat.label}>
                <strong>{stat.value}</strong>
                {stat.label}
              </span>
            ))}
          </div>
        </section>

        <section className="prototype-note" aria-label="Prototype notice">
          <strong>Public prototype</strong>
          <p>
            ApplyFirst is not a job board. It helps students find high-value career-launch programs, prepare
            before applications open, and avoid relying on programs that have not been confirmed yet.
          </p>
        </section>

        <TrustPolicyPanel />

        <section className="phase-two-strip" id="alerts" aria-label="Phase 2 alert setup preview">
          <AlertSetupPanel
            alertPrefs={alertPrefs}
            setAlertPrefs={setAlertPrefs}
            matchCount={alertPreviewMatches.length}
            alertableCount={alertablePreviewCount}
            alertStrategy={alertStrategy}
            waitlistIntent={waitlistIntent}
            onWaitlistSave={saveWaitlistIntent}
            onWaitlistReset={resetWaitlistIntent}
          />
        </section>

        {showInternalTools ? <VerificationQueuePanel queueItems={verificationQueueItems} onSelect={focusOpportunity} /> : null}

        <section className="recommendation-guide" aria-label="Recommendation guide">
          <strong>Recommendation guide</strong>
          <span>Recommended: strongest fit</span>
          <span>Watch List: worth tracking</span>
          <span>Foundation: prep and access</span>
        </section>

        <section className="insight-band" aria-label="Current program monitor view">
          <div className="view-controls">
            <span>Class-year view</span>
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
          <MetricTile label="In view" value={filtered.length} tone="blue" />
          <MetricTile label="Recommended" value={recommendedCount} tone="green" />
          <MetricTile label="Ready soon" value={actionCount} tone="green" />
          <MetricTile label="Needs confirmation" value={verifyCount} tone="rose" />
        </section>

        <section className="product-grid" id="library" aria-label="Opportunity library">
          <aside className="left-rail">
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
      </main>
    </div>
  );
}

function Header({ savedCount, showInternalTools }) {
  return (
    <header className="site-header">
      <a className="brand" href="#library" aria-label="ApplyFirst home">
        <span aria-hidden="true">AF</span>
        <span className="brand-copy">
          <strong>ApplyFirst</strong>
          <em>Track career-launch programs</em>
        </span>
      </a>
      <nav aria-label="Page links">
        <a href="#library">Monitor</a>
        <a href="#alerts">Alerts</a>
        <a href="#waitlist">Waitlist</a>
        {showInternalTools ? <a href="#verification">Source Review</a> : null}
        <span>{savedCount} saved</span>
        {showInternalTools ? <span>Maintainer Mode On</span> : null}
      </nav>
    </header>
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
        <span>Trust policy</span>
        <h2>No alerts from unconfirmed programs</h2>
        <p>
          ApplyFirst can help students prepare early, but official sources remain the source of truth. Alerts should
          only ship when a program has current timing, a checked official page, and clear eligibility context.
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
  alertableCount,
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
      <div className="panel-heading">
        <span>Alerts</span>
        <h2>Choose what to watch</h2>
      </div>
      <p>
        Pick the kinds of programs you care about. ApplyFirst will only use confirmed programs for future alerts,
        so anything uncertain waits before it can trigger a notification.
      </p>
      <div className="alert-controls">
        <FilterSelect
          label="Class year"
          value={alertPrefs.classYear}
          onChange={(value) => updatePref('classYear', value)}
          options={filterOptions.classYears}
        />
        <FilterSelect
          label="Role track"
          value={alertPrefs.roleTrack}
          onChange={(value) => updatePref('roleTrack', value)}
          options={filterOptions.roleTracks}
        />
        <FilterSelect
          label="Recommendation"
          value={alertPrefs.priority}
          onChange={(value) => updatePref('priority', value)}
          options={filterOptions.priorities}
          labels={priorityLabels}
        />
        <FilterSelect
          label="Alert mode"
          value={alertPrefs.notificationMode}
          onChange={(value) => updatePref('notificationMode', value)}
          options={Object.keys(notificationModeLabels)}
          labels={notificationModeLabels}
        />
        <FilterSelect
          label="Send timing"
          value={alertPrefs.sendTiming}
          onChange={(value) => updatePref('sendTiming', value)}
          options={Object.keys(sendTimingLabels)}
          labels={sendTimingLabels}
        />
      </div>
      <div className="alert-summary" aria-label="Alert preference summary">
        <span>
          <strong>{matchCount}</strong>
          Programs matching you
        </span>
        <span>
          <strong>{alertableCount}</strong>
          Ready for alerts
        </span>
        <span>
          <strong>{Math.max(matchCount - alertableCount, 0)}</strong>
          Needs confirmation
        </span>
      </div>
      <div className="notification-strategy">
        <div>
          <span>Future alerts</span>
          <strong>{alertStrategy.sendSummary}</strong>
        </div>
        <div>
          <span>Still reviewing</span>
          <strong>{alertStrategy.holdSummary}</strong>
        </div>
        <p>{alertStrategy.trustCopy}</p>
      </div>
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

function WaitlistPanel({ alertPrefs, alertStrategy, waitlistIntent, onSave, onReset }) {
  const [draft, setDraft] = useState(() => createWaitlistDraft(alertPrefs));

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
        <span>Alert waitlist</span>
        <h3>{waitlistIntent ? 'Alert preferences saved locally' : 'Join the alert waitlist'}</h3>
        <p>
          Choose what you want ApplyFirst to watch. This prototype keeps your preferences in this browser until a
          real waitlist or account system is connected.
        </p>
      </div>
      <dl>
        <div>
          <dt>Watching</dt>
          <dd>{preferenceSummary}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{alertStrategy.modeLabel} before live alerts</dd>
        </div>
      </dl>
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
            <span>Email</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => updateDraft('email', event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            <span>School / major</span>
            <input
              value={draft.context}
              onChange={(event) => updateDraft('context', event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="waitlist-note">
            <span>What should ApplyFirst watch?</span>
            <textarea value={draft.note} onChange={(event) => updateDraft('note', event.target.value)} />
          </label>
          <button type="submit">Join Waitlist</button>
        </form>
      )}
    </section>
  );
}

function createWaitlistDraft(alertPrefs) {
  return {
    email: '',
    context: '',
    note:
      alertPrefs.roleTrack === 'all'
        ? 'I want alerts for high-signal early-career programs.'
        : `I want alerts for ${alertPrefs.roleTrack} programs.`,
  };
}

function MetricTile({ label, value, tone }) {
  return (
    <div className={`metric-tile tile-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReadinessPanel({ readinessPercent, recordCount, verifiedCount, target }) {
  const mvpComplete = recordCount >= target;
  const readinessItems = [
    { label: 'Standalone app shell', complete: true },
    { label: 'Core filters', complete: true },
    { label: 'Persistent shortlist', complete: true },
    { label: `${target}+ curated records`, complete: recordCount >= target },
    { label: 'Confirmed program checks', complete: verifiedCount >= target },
  ];

  return (
    <section className="readiness-panel">
      <div className="panel-heading">
        <span>Prototype status</span>
        <h2>{mvpComplete ? 'Student preview ready' : 'Student preview in progress'}</h2>
      </div>
      <div className="readiness-meter" aria-label={`Phase 1 record target is ${readinessPercent}% complete`}>
        <span style={{ width: `${readinessPercent}%` }} />
      </div>
      <p>
        {recordCount}/{target} records, {verifiedCount} confirmed.{' '}
        {mvpComplete
          ? 'The app is usable as a public prototype; live alerts should wait until more programs are confirmed.'
          : 'The shell is usable; the seed set still needs expansion before Phase 1 is complete.'}
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
        <h2>Refine the monitor</h2>
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
          View source
        </a>
        <button
          className={`detail-bookmark${saved ? ' saved' : ''}`}
          type="button"
          onClick={onSave}
          aria-label={saved ? 'Remove from shortlist' : 'Add to shortlist'}
          title={saved ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          <BookmarkIcon filled={saved} />
          Shortlist
        </button>
      </div>
      <section className="detail-next-step" aria-label="Recommended next step">
        <span>Next step</span>
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
      <DetailSection title="Prep notes">{opportunity.prep}</DetailSection>
      <div className="metric-grid">
        <Metric label="Best for" value={opportunity.classYears.join(', ')} />
        <Metric label="Track" value={tracks.join(' + ')} />
        <Metric label="Timing" value={opportunity.timing} />
        <Metric label="Funding" value={opportunity.funding} />
      </div>
      <div className="tracker-fields">
        <h3>Program details</h3>
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

function getAlertStrategy(alertPrefs, matches, alertableCount) {
  const modeLabel = notificationModeLabels[alertPrefs.notificationMode] ?? notificationModeLabels.waitlist;
  const timingLabel = sendTimingLabels[alertPrefs.sendTiming] ?? sendTimingLabels.openAndDeadline;
  const heldCount = Math.max(matches.length - alertableCount, 0);
  const channelCopy =
    alertPrefs.notificationMode === 'local'
      ? 'This stays in your browser for now.'
      : alertPrefs.notificationMode === 'saved'
        ? 'Saved-program reminders would come after accounts or email consent exist.'
        : 'Join the waitlist first; email alerts come after confirmed alert rules exist.';
  const timingCopy =
    alertPrefs.sendTiming === 'openOnly'
      ? 'program openings'
      : alertPrefs.sendTiming === 'prepOpenDeadline'
        ? 'prep windows, openings, and confirmed deadlines'
        : 'program openings and confirmed deadlines';

  return {
    modeLabel,
    sendSummary: `${alertableCount} ${alertableCount === 1 ? 'program' : 'programs'} could qualify for ${timingCopy}`,
    holdSummary: `${heldCount} ${heldCount === 1 ? 'program needs' : 'programs need'} confirmation first`,
    trustCopy: `${modeLabel} / ${timingLabel}: ${channelCopy} Programs that are not confirmed stay out of alerts.`,
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
